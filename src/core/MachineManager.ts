import {
  ActorIdentity,
  createActorMeta,
  EMPTY_ACTOR_RECORD,
  hasOwn,
  isActorTemplateConfig,
  isTerminal,
  NormalizeOptions,
  resolveRouting,
  RoutingScope,
  RuntimeActorSlice,
  validateActorReducerOutput,
  validateActorTemplateConfig,
} from "./actor";
import { createActorEffectsRuntime } from "./actorEffects";
import { createDispatchContext, type DispatchContext, ensureRecord, reserveActorId } from "./dispatchContext";
import {
  applySnapshot as applySnapshotPure,
  type ApplySnapshotDeps,
  type ApplySnapshotResult,
  buildDehydratedEnvelope,
} from "./hydration";
import { LATE_DISPATCH } from "./internal";
import { buildManagerIndexes, type ConfigHelpers, createConfigHelpers } from "./managerIndexes";
import { assertUserAction, createNormalizer } from "./managerNormalize";
import { createRoutingResolver } from "./managerRouting";
import {
  buildReplacementReconcilePlan,
  commitDispatchSidecar,
  commitReplacementSidecar,
  createSidecarState,
  resolveLiveActors,
  type SidecarValidationDeps,
} from "./sidecar";
import { IMachineManager, MachineDependencies, MachineEvents, MachineManagerOptions } from "./interfaces";
import { CreateMachine } from "./Machine";
import {
  AnyEvent,
  AnyRecord,
  DehydrateOptions,
  HydratePreviewOptions,
  HydrateStrategy,
  MachineConfig,
  MachineManagerDehydrateFn,
  MachineManagerRuntimeSnapshot,
  MachineManagerSnapshot,
  MachinesState,
  MachineStore,
  ManagerAction,
  ManagerCommitAction,
  MiddlewareApi,
  Reducer,
  StateType,
  TransitionSubscriber,
} from "./types";
import {
  compose,
  deepFreeze,
  HYDRATE_ACTION_TYPE,
  IS_DEV,
  LiteFsmError,
  supportsVoidReducer,
  VOID_REDUCER_ERROR,
} from "./utils";

type RuntimeConfig = {
  config: Record<string, unknown>;
  initialState: string;
  initialContext: AnyRecord;
  groupTag?: string;
  persistence?: unknown;
  hydrate?: unknown;
  dehydrate?: unknown;
  reducer?: unknown;
  effects?: unknown;
};
type RuntimeState = StateType<Record<string, unknown>, AnyRecord>;
type RuntimeMachine<P extends AnyEvent> = ReturnType<
  typeof CreateMachine<Record<string, unknown>, AnyRecord, string, P, AnyRecord>
>;
type MachineKey<S extends MachineStore> = Extract<keyof S, string>;

export const MachineManager = <S extends MachineStore, P extends AnyEvent = MachineEvents<S>>(
  config: S,
  opts?: MachineManagerOptions<S, P>,
): IMachineManager<S, P> => {
  type Action = ManagerAction<P>;
  type RootState = MachinesState<S>;
  type ActorRecord = Record<string, RuntimeActorSlice>;

  const machineKeys = Object.keys(config) as Array<MachineKey<S>>;
  const getActorRecord = (root: RootState, templateKey: string): ActorRecord => root[templateKey] as ActorRecord;

  const actorTemplateKeys = machineKeys.filter((name) => isActorTemplateConfig(config[name]));
  const domainKeys = machineKeys.filter((name) => !isActorTemplateConfig(config[name]));

  // Fail-fast config validation before deriving anything from `persistence` and before building indexes.
  for (const key of actorTemplateKeys) validateActorTemplateConfig(key, config[key]);
  for (const key of domainKeys) {
    if (hasOwn(config[key], "persistence")) {
      throw new LiteFsmError(
        "LITE_FSM_INVALID_ACTOR_CONFIG",
        `[lite-fsm] domain machine '${key}' cannot define actor persistence.`,
      );
    }
  }

  const snapshotActorTemplateKeys = actorTemplateKeys.filter((name) => config[name].persistence === "snapshot");
  const runtimeActorTemplateKeys = actorTemplateKeys.filter((name) => config[name].persistence !== "snapshot");
  const allowVoidReducer = Boolean(opts?.middleware?.some(supportsVoidReducer));
  const schemaVersion = opts?.schemaVersion;

  const { groupTagForTemplate, hasActorTransition, isPublicActorState }: ConfigHelpers = createConfigHelpers(config);

  const { domainReduceIndex, domainAlwaysReduce, actorReduceIndex, actorSpawnIndex } = buildManagerIndexes(
    config,
    actorTemplateKeys,
    domainKeys,
    groupTagForTemplate,
  );
  // Если effects нигде нет, не собираем targets на каждый tick.
  const hasConfiguredEffects = (name: string) => Boolean((config[name as MachineKey<S>] as RuntimeConfig).effects);
  const domainEffectKeys = domainKeys.filter(hasConfiguredEffects);
  const hasActorEffects = actorTemplateKeys.some(hasConfiguredEffects);
  const hasAnyEffects = domainEffectKeys.length > 0 || hasActorEffects;

  /* v8 ignore next -- prod-ветка покрывается build/smoke, а не unit-тестами. */
  if (IS_DEV) {
    for (const key of domainKeys) {
      if (config[key].groupTag) {
        console.warn(`[lite-fsm] groupTag on domain machine '${key}' is ignored.`);
      }
    }
  }

  const machines = Object.fromEntries(
    machineKeys.map((name) => [
      name,
      CreateMachine(config[name] as MachineConfig<any, AnyRecord, P, AnyRecord, any>, {
        allowActorTemplate: true,
        allowVoidReducer: () => allowVoidReducer,
      }),
    ]),
  ) as Record<string, RuntimeMachine<P>> & { [key in keyof S]: RuntimeMachine<P> };

  // === Mutable runtime state ==================================================

  // Forward ref на `transition` для actor effects runtime: заполняется ниже после wiring middleware.
  const effectsRefs = { transition: undefined as unknown as typeof transition, userDeps: {} as AnyRecord };
  let subs: Array<TransitionSubscriber<S, P>> = [];
  let state = Object.fromEntries(
    machineKeys.map((name) => [
      name,
      actorTemplateKeys.includes(name)
        ? EMPTY_ACTOR_RECORD
        : { state: config[name].initialState, context: config[name].initialContext },
    ]),
  ) as RootState;

  // Sidecar — источник правды для actor identity и routing; canonical meta живёт здесь.
  const sidecar = createSidecarState();

  // Текущий DispatchContext: transition() сохраняет parent на входе и восстанавливает в finally —
  // так reentrant transition (из subscriber/middleware/effect) видит свой ctx.
  let currentDispatchContext: DispatchContext<S, P> | null = null;

  const { normalizeAction, applyPostNormalize } = createNormalizer<S, P>({ sidecar });
  const { resolveSpawnGroups, forEachRoutedIdentity } = createRoutingResolver<S, P>({
    sidecar,
    actorTemplateKeys,
    actorSpawnIndex,
    actorReduceIndex,
  });

  // === Фазы core reducer (ФАЗА 4-7) ==========================================

  // ФАЗА 4: domain-машины видят committed action независимо от routing scope.
  const reduceDomainMachines = (prev: RootState, action: Action): RootState => {
    let next = prev;
    const reduceOne = (name: string) => {
      const m = machines[name];
      const prevSlice = prev[name] as RuntimeState;
      const nextSlice = m.transition(prevSlice, action);
      if (nextSlice === prevSlice) return;
      next = next === prev ? ({ ...prev } as RootState) : next;
      (next as Record<string, RuntimeState>)[name] = nextSlice;
    };
    // Индексы disjoint by construction, поэтому dedupe Set в hot path не нужен.
    for (const name of domainAlwaysReduce) reduceOne(name);
    for (const name of domainReduceIndex.get(action.type) ?? []) reduceOne(name);
    return next;
  };

  // ФАЗА 5: spawn новых акторов в target-группы по matching __INIT-edge. Sidecar обновится на ФАЗЕ 9.
  const spawnActors = (
    ctx: DispatchContext<S, P>,
    root: RootState,
    action: Action,
    scope: Exclude<RoutingScope, "actor">,
    targetSet: string[],
  ): RootState => {
    let next = root;
    const spawnTemplatesByGroup = actorSpawnIndex.get(action.type);
    if (!spawnTemplatesByGroup) return next;

    for (const groupCtx of resolveSpawnGroups(scope, targetSet, ctx, action)) {
      for (const templateKey of spawnTemplatesByGroup.get(groupCtx.groupTag) ?? []) {
        const cfg = config[templateKey as MachineKey<S>] as RuntimeConfig;
        const meta = createActorMeta({
          actorId: reserveActorId(ctx, templateKey),
          groupId: groupCtx.groupId,
          groupTag: groupCtx.groupTag,
        });
        const actor: ActorIdentity = { templateKey, meta };
        const slice: RuntimeActorSlice = {
          state: "__INIT",
          context: { ...cfg.initialContext },
          meta: actor.meta,
        };
        const ensured = ensureRecord(ctx, next, templateKey);
        ensured.record[actor.meta.actorId] = slice;
        next = ensured.root;
        ctx.pendingSpawned.push(actor);
      }
    }
    return next;
  };

  // ФАЗА 6: reduce одного routed-актора. delivered=true → актор попадёт в pendingDelivered (для ФАЗЫ 12).
  const reduceActor = (
    ctx: DispatchContext<S, P>,
    root: RootState,
    identity: ActorIdentity,
    action: Action,
  ): { root: RootState; delivered: boolean } => {
    const record = getActorRecord(root, identity.templateKey);
    const slice = record?.[identity.meta.actorId];
    if (!slice || !hasActorTransition(identity.templateKey, slice.state, action)) {
      return { root, delivered: false };
    }

    const ensured = ensureRecord(ctx, root, identity.templateKey);
    const machine = machines[identity.templateKey as MachineKey<S>];
    const nextSlice = machine.transition(slice as RuntimeState, action) as RuntimeActorSlice;
    /* v8 ignore next -- prod hot path skips dev-only reducer output validation. */
    if (IS_DEV) validateActorReducerOutput(identity.meta.actorId, identity.templateKey, nextSlice.state, isPublicActorState);
    ensured.record[identity.meta.actorId] = { ...nextSlice, meta: identity.meta };
    return { root: ensured.root, delivered: true };
  };

  // ФАЗА 7: удаляем slice'ы акторов в terminal-state из record; sidecar/bag cleanup — на ФАЗЕ 9.
  const collapseTerminalActors = (ctx: DispatchContext<S, P>, root: RootState): RootState => {
    let next = root;
    const seen = new Set<string>();
    for (const identity of [...ctx.pendingSpawned, ...ctx.pendingDelivered]) {
      if (seen.has(identity.meta.actorId)) continue;
      seen.add(identity.meta.actorId);

      const record = getActorRecord(next, identity.templateKey);
      const slice = record?.[identity.meta.actorId];
      if (!slice || !isTerminal(slice.state)) continue;

      const ensured = ensureRecord(ctx, next, identity.templateKey);
      delete ensured.record[identity.meta.actorId];
      next = ensured.root;
      ctx.pendingDeleted.push(identity);
    }
    return next;
  };

  // === Core root reducer (фазы 3-7) ==========================================
  // Чистая функция от root state. Sidecar НЕ трогает — это делает commit на ФАЗЕ 9.
  const coreRootReducer = (prev: RootState, committed: Action): RootState => {
    const ctx = currentDispatchContext!;

    const { scope, targetSet } = resolveRouting(committed.meta);
    let next = reduceDomainMachines(prev, committed);

    if (scope !== "actor") {
      next = spawnActors(ctx, next, committed, scope, targetSet);
    }

    forEachRoutedIdentity(scope, targetSet, ctx.pendingSpawned, committed, (identity) => {
      const reduced = reduceActor(ctx, next, identity, committed);
      next = reduced.root;
      if (reduced.delivered) ctx.pendingDelivered.push(identity);
    });

    return collapseTerminalActors(ctx, next);
  };

  let rootReducer: Reducer<RootState, Action> = coreRootReducer;
  const replaceReducer = (cb: (reducer: Reducer<RootState, Action>) => Reducer<RootState, Action>) => {
    rootReducer = cb(rootReducer);
  };

  // === Sidecar wiring (replacement reconcile + fast path commit) =============
  // Логика — в `./sidecar.ts`. Сюда передаём только per-manager validation deps.

  const sidecarValidationDeps: SidecarValidationDeps = {
    actorTemplateKeys,
    groupTagForTemplate,
    isPublicActorState,
  };

  // ФАЗА 10: live ActorRuntime для ФАЗЫ 12 effects. Terminal-collapsed уже отсутствуют в sidecar.
  const resolveEffectsTargets = (ctx: DispatchContext<S, P>) => {
    const targets: ReturnType<typeof resolveLiveActors> = [];
    const seen = new Set<string>();
    const push = (actors: ReturnType<typeof resolveLiveActors>) => {
      for (const actor of actors) {
        const id = actor.meta.actorId;
        if (seen.has(id)) continue;
        seen.add(id);
        targets.push(actor);
      }
    };
    push(resolveLiveActors(sidecar, ctx.pendingSpawned));
    push(resolveLiveActors(sidecar, ctx.pendingDelivered));
    ctx.effectsTargets = targets;
  };

  const detectExternallyReplacedActorRecords = (
    prevState: RootState,
    nextState: RootState,
    ctx: DispatchContext<S, P>,
  ): string[] =>
    actorTemplateKeys.filter((templateKey) => {
      if (prevState[templateKey] === nextState[templateKey]) return false;
      return ctx.touchedActorRecords.get(templateKey) !== nextState[templateKey];
    });

  const commitReducedState = (ctx: DispatchContext<S, P>, prevState: RootState, nextState: RootState): RootState => {
    const replacedActorTemplateKeys = detectExternallyReplacedActorRecords(prevState, nextState, ctx);
    const replacementPlan = replacedActorTemplateKeys.length
      ? buildReplacementReconcilePlan(sidecar, sidecarValidationDeps, replacedActorTemplateKeys, nextState)
      : undefined;

    const reconciledState = replacementPlan
      ? commitReplacementSidecar(sidecar, replacementPlan, nextState)
      : nextState;

    // ФАЗА 9: single root commit — state + sidecar.
    return commitDispatchSidecar(sidecar, ctx, reconciledState);
  };

  // === Subscribers ============================================================

  const onTransition = (cb: TransitionSubscriber<S, P>) => {
    subs.push(cb);
    return () => {
      subs = subs.filter((c) => c !== cb);
    };
  };

  const invokeSubscribers = (prevState: RootState, currentState: RootState, action: ManagerCommitAction<S, Action>) => {
    for (const sub of subs) sub(prevState, currentState, action);
  };

  // === Actor effects runtime ==================================================
  // condition() / bag / actor transition sugar / invokeEffects живут в actorEffects.ts.

  const { condition, invokeEffects } = createActorEffectsRuntime<P>({
    sidecar,
    machines,
    domainKeys: domainEffectKeys as readonly string[],
    refs: effectsRefs,
    onTransition,
    onError: opts?.onError,
  });

  // === Snapshot / hydrate / dehydrate =========================================

  const getState = () => state;

  const getSnapshot = (): MachineManagerRuntimeSnapshot<S> => ({
    schemaVersion,
    machines: { ...state } as MachineManagerRuntimeSnapshot<S>["machines"],
  });

  const hydrationDeps: ApplySnapshotDeps<S> = {
    config,
    snapshotActorTemplateKeys,
    runtimeActorTemplateKeys,
    schemaVersion,
    groupTagForTemplate,
    onSchemaVersionMismatch: opts?.onSchemaVersionMismatch,
    onUnknownMachineKey: opts?.onUnknownMachineKey,
  };

  const commitHydrationResult = (result: ApplySnapshotResult<S>, nextState: RootState): RootState => {
    if (result.changedActorTemplateKeys.length === 0) return nextState;
    const plan = buildReplacementReconcilePlan(
      sidecar,
      sidecarValidationDeps,
      result.changedActorTemplateKeys,
      nextState,
    );
    return commitReplacementSidecar(sidecar, plan, nextState);
  };

  const getHydratedState = (
    snapshot: MachineManagerSnapshot<S>,
    { strategy = "merge", baseState = state }: HydratePreviewOptions<S> = {},
  ) => applySnapshotPure(baseState, snapshot, strategy, "hydrate", hydrationDeps, "preview").nextState;

  const initialSnapshot = opts?.snapshot;
  if (initialSnapshot) {
    const result = applySnapshotPure(state, initialSnapshot, "replace", "opts.snapshot", hydrationDeps);
    state = commitHydrationResult(result, result.nextState);
  }

  /* v8 ignore next */
  if (IS_DEV) deepFreeze(state);

  const hydrate = (
    snapshot: MachineManagerSnapshot<S>,
    { strategy = "merge" }: { strategy?: HydrateStrategy } = {},
  ) => {
    const prevState = state;
    const result = applySnapshotPure(prevState, snapshot, strategy, "hydrate", hydrationDeps);
    const nextState = result.nextState;
    if (nextState === prevState) return;

    state = commitHydrationResult(result, nextState);
    /* v8 ignore next */
    if (IS_DEV) deepFreeze(state);
    invokeSubscribers(prevState, state, { type: HYDRATE_ACTION_TYPE, payload: { strategy, snapshot } });
  };

  const dehydrate = ((dehydrateOpts?: DehydrateOptions<S>) =>
    buildDehydratedEnvelope<S>(
      state,
      config,
      sidecar,
      snapshotActorTemplateKeys,
      runtimeActorTemplateKeys,
      domainKeys,
      schemaVersion,
      dehydrateOpts,
    )) as MachineManagerDehydrateFn<S>;

  // === Pipeline dispatch (фазы 0-12) =========================================

  // Gateway между middleware chain и commit'ом. Внутри — фазы 2-11.
  const _transition = (action: Action): Action => {
    const ctx = currentDispatchContext!;
    if (ctx.committed) {
      throw new Error("[lite-fsm] middleware called next() more than once for a single transition.");
    }

    const prevState = state;

    // ФАЗА 2: post-normalize committed action.
    applyPostNormalize(ctx, action);
    if (!ctx.committed) return action;
    ctx.committedPrevState = prevState;

    // ФАЗЫ 3-7 — внутри coreRootReducer. Throw отсюда не доходит до commit.
    const nextState = rootReducer(prevState, ctx.committed);
    if (nextState === undefined) throw new Error(VOID_REDUCER_ERROR);

    state = commitReducedState(ctx, prevState, nextState);

    // ФАЗА 10: effects targets для ФАЗЫ 12.
    if (hasActorEffects) resolveEffectsTargets(ctx);

    /* v8 ignore next */
    if (IS_DEV) deepFreeze(state);

    // ФАЗА 11: notify subscribers. Reentrant transition() поверх already-committed parent state.
    invokeSubscribers(prevState, state, ctx.committed);
    return ctx.committed;
  };

  const wrappedTransition = ((): ((action: Action) => Action) => {
    const middlewareList = opts?.middleware;
    if (!middlewareList?.length) return _transition;

    const api: MiddlewareApi<RootState, P> = {
      getState,
      transition: (action: Action) => transition(action),
      replaceReducer,
      onTransition,
      condition,
    };

    const enhancers = middlewareList.map((m) => m(api));
    return compose(...enhancers)(_transition);
  })();

  // Точка входа dispatch (фазы 0, 1, 12).
  function transition(action: Action, normalizeOpts: NormalizeOptions = {}): Action {
    assertUserAction(action);

    // ФАЗА 0: pre-normalize (sender, late dispatch, default routing).
    const preNormalized = normalizeAction(action, normalizeOpts);
    if (preNormalized === LATE_DISPATCH) return action;

    const parentCtx = currentDispatchContext;
    const ctx = createDispatchContext<S, P>(normalizeOpts, sidecar.counters);
    currentDispatchContext = ctx;

    // ФАЗА 1: middleware chain → _transition (фазы 2-11).
    let middlewareResult: Action;
    try {
      middlewareResult = wrappedTransition(preNormalized);
    } finally {
      currentDispatchContext = parentCtx;
    }

    if (!ctx.committed) return middlewareResult;

    // ФАЗА 12: effects per delivered/spawned + domain.
    if (hasAnyEffects) invokeEffects(ctx.committedPrevState!, state, ctx.committed, ctx.effectsTargets);
    return ctx.committed;
  }

  const setDependencies = (d: MachineDependencies<S> | ((deps: MachineDependencies<S>) => MachineDependencies<S>)) => {
    const prev = effectsRefs.userDeps as MachineDependencies<S>;
    const next = typeof d === "function" ? (d as (deps: MachineDependencies<S>) => MachineDependencies<S>)(prev) : d;
    effectsRefs.userDeps = next as AnyRecord;
  };

  // Заполняем forward ref после declaration (см. effectsRefs выше).
  effectsRefs.transition = transition;

  return {
    getState,
    getSnapshot,
    getHydratedState,
    hydrate,
    dehydrate,
    transition,
    setDependencies,
    onTransition,
    replaceReducer,
  };
};
