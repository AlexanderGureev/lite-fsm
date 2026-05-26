import {
  type ActorIdentity,
  createActorMeta,
  EMPTY_ACTOR_RECORD,
  hasOwn,
  isActorTemplateConfig,
  isTerminal,
  type NormalizeOptions,
  type RoutingScope,
  type RuntimeActorSlice,
  SPAWN_ID_SEP,
  validateActorReducerOutput,
  validateActorTemplateConfig,
} from "../../actor";
import { createActorEffectsRuntime } from "../../actorEffects";
import {
  createDispatchContext,
  type DispatchContext,
  ensureRecord,
  reserveActorId,
  type SpawnIdConfig,
} from "../../dispatchContext";
import { applySnapshot as applySnapshotPure, type ApplySnapshotDeps, buildDehydratedEnvelope } from "../../hydration";
import { buildManagerIndexes, type ConfigHelpers, createConfigHelpers } from "../../managerIndexes";
import { createNormalizer } from "../../managerNormalize";
import { createRoutingResolver } from "../../managerRouting";
import {
  buildReplacementReconcilePlan,
  commitDispatchSidecar,
  commitReplacementSidecar,
  createSidecarState,
  resolveLiveActors,
  type SidecarValidationDeps,
} from "../../sidecar";
import type { MachineDependencies, MachineEvents, MachineManagerOptions } from "../../interfaces";
import { CreateMachine } from "../../Machine";
import type {
  AnyEvent,
  AnyRecord,
  DehydrateOptions,
  MachineConfig,
  MachineManagerSnapshot,
  MachinesState,
  MachineStore,
  ManagerAction,
  StateType,
} from "../../types";
import {
  deepFreeze,
  IS_DEV,
  LiteFsmError,
  supportsVoidReducer,
} from "../../utils";
import {
  createDispatchSlot,
  type DispatchSlot,
  STORAGE_ACTION_DROP,
  type CompiledStorageTemplate,
  type CreateRuntimeStateContext,
  type ManagerRuntimeContext,
  type ResolveEffectInvocationsContext,
  type ResolveIdentityContext,
  type StorageBeginReduceContext,
  type StorageCommitContext,
  type StorageDehydrateContext,
  type StorageDispatchContext,
  type StorageEffectInvocationContext,
  type StorageHydrateContext,
  type StorageHydrateResult,
  type StoragePrepareActionContext,
  type StoragePrepareActionResult,
  type StorageReduceContext,
} from "../kernel/storage";
import type { RouteConstraint } from "../kernel/routing";

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
type RootState<S extends MachineStore> = MachinesState<S>;
type ActorRecord = Record<string, RuntimeActorSlice>;
type Action<P extends AnyEvent> = ManagerAction<P>;

type InstanceDispatchState<S extends MachineStore, P extends AnyEvent> = {
  readonly ctx: DispatchContext<S, P>;
  reduced: boolean;
};

type InstanceEffectInvocation<S extends MachineStore, P extends AnyEvent> = {
  readonly prevState: RootState<S>;
  readonly currentState: RootState<S>;
  readonly action: Action<P>;
  readonly targets: DispatchContext<S, P>["effectsTargets"];
};

type InstanceRuntimeState<S extends MachineStore, P extends AnyEvent> = {
  readonly initialState: RootState<S>;
  prepareAction(ctx: StoragePrepareActionContext): StoragePrepareActionResult;
  beginReduce(ctx: StorageBeginReduceContext): void | false;
  acceptsEvent(): boolean;
  reduce(ctx: StorageReduceContext): void | false;
  commit(ctx: StorageCommitContext): void;
  condition(predicate: (action: Action<P>) => boolean): Promise<boolean>;
  resolveEffectInvocations(ctx: ResolveEffectInvocationsContext): InstanceEffectInvocation<S, P>[];
  invokeEffect(ctx: StorageEffectInvocationContext): void;
  dehydrate(ctx: StorageDehydrateContext): MachineManagerSnapshot<S>;
  hydrate(ctx: StorageHydrateContext): StorageHydrateResult;
  resolveIdentity(ctx: ResolveIdentityContext): ActorIdentity | undefined;
};

const INSTANCE_DISPATCH_KEY = "instance";

const toNormalizeOptions = (value: unknown): NormalizeOptions =>
  value && typeof value === "object" ? (value as NormalizeOptions) : {};

const getInstanceDispatch = <S extends MachineStore, P extends AnyEvent>(
  slot: DispatchSlot<InstanceDispatchState<S, P>>,
  dispatch: StorageDispatchContext,
  sidecarCounters: Parameters<typeof createDispatchContext<S, P>>[1],
): InstanceDispatchState<S, P> => {
  const existing = slot.get(dispatch);
  if (existing) return existing;

  const created: InstanceDispatchState<S, P> = {
    ctx: createDispatchContext<S, P>(toNormalizeOptions(dispatch.options), sidecarCounters),
    reduced: false,
  };
  slot.set(dispatch, created);
  return created;
};

// Двусторонняя синхронизация committed action между storage dispatch и instance ctx.
// Между beginReduce и reduce action interceptor мог перезаписать dispatch.committedAction —
// в этом случае instance ctx подхватывает значение из dispatch. Возвращает false, если
// applyPostNormalize ещё не выставил committed (sender disposed) и dispatch нужно дропнуть.
const syncCommittedAction = <S extends MachineStore, P extends AnyEvent>(
  dispatch: StorageDispatchContext,
  instanceCtx: DispatchContext<S, P>,
): boolean => {
  if (!instanceCtx.committed) return false;
  const committed = (dispatch.committedAction ?? instanceCtx.committed) as Action<P>;
  instanceCtx.committed = committed;
  instanceCtx.committedPrevState = dispatch.prevState as RootState<S>;
  dispatch.committedAction = committed as ManagerAction<AnyEvent>;
  dispatch.committedPrevState = dispatch.prevState;
  return true;
};

const isInstanceRuntimeState = <S extends MachineStore, P extends AnyEvent>(
  value: unknown,
): value is InstanceRuntimeState<S, P> =>
  Boolean(value && typeof value === "object" && "prepareAction" in value && "reduce" in value);

export const validateInstanceTemplate = ({ key, machine }: { key: string; machine: MachineStore[string] }) => {
  if (isActorTemplateConfig(machine)) {
    validateActorTemplateConfig(key, machine);
    return;
  }

  if (hasOwn(machine, "persistence")) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_ACTOR_CONFIG",
      `[lite-fsm] domain machine '${key}' cannot define actor persistence.`,
    );
  }
};

export const compileInstanceTemplate = ({
  key,
  storageKind,
}: {
  key: string;
  storageKind: string;
}): CompiledStorageTemplate => ({
  key,
  kind: storageKind,
});

export const createInstanceRuntimeState = <
  S extends MachineStore,
  P extends AnyEvent = MachineEvents<S>,
>({ manager, templates }: CreateRuntimeStateContext): InstanceRuntimeState<S, P> => {
  const runtimeManager = manager as ManagerRuntimeContext & {
    readonly config: S;
    readonly options: MachineManagerOptions<S, P> | undefined;
    transition(action: Action<P>, options?: unknown): Action<P>;
    onTransition(
      cb: (prevState: RootState<S>, currentState: RootState<S>, action: Action<P> | { type: string }) => void,
    ): () => void;
    getDependencies(): MachineDependencies<S>;
  };
  const config = runtimeManager.config;
  const opts = runtimeManager.options as MachineManagerOptions<S, P> | undefined;

  const originId = opts?.originId;
  if (originId !== undefined && (originId.length === 0 || originId.includes(SPAWN_ID_SEP))) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_OPTIONS",
      `[lite-fsm] originId must be a non-empty string without '${SPAWN_ID_SEP}'.`,
    );
  }

  const spawnIdConfig: SpawnIdConfig<P> = {
    originId,
    generateActorId: opts?.generateActorId,
    generateGroupId: opts?.generateGroupId,
  };

  const machineKeys = templates.map((template) => template.key) as Array<MachineKey<S>>;
  const actorTemplateKeys: Array<MachineKey<S>> = [];
  const domainKeys: Array<MachineKey<S>> = [];
  for (const name of machineKeys) {
    if (isActorTemplateConfig(config[name])) actorTemplateKeys.push(name);
    else domainKeys.push(name);
  }

  const snapshotActorTemplateKeys: Array<MachineKey<S>> = [];
  const runtimeActorTemplateKeys: Array<MachineKey<S>> = [];
  for (const key of actorTemplateKeys) {
    if (config[key].persistence === "snapshot") snapshotActorTemplateKeys.push(key);
    else runtimeActorTemplateKeys.push(key);
  }

  const allowVoidReducer = Boolean(opts?.middleware?.some(supportsVoidReducer));
  const schemaVersion = runtimeManager.schemaVersion;
  const { groupTagForTemplate, hasActorTransition, isPublicActorState }: ConfigHelpers = createConfigHelpers(config);
  const { domainReduceIndex, domainAlwaysReduce, actorReduceIndex, actorSpawnIndex } = buildManagerIndexes(
    config,
    actorTemplateKeys,
    domainKeys,
    groupTagForTemplate,
  );

  const hasConfiguredEffects = (name: MachineKey<S>) => Boolean((config[name] as RuntimeConfig).effects);
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

  const initialState = Object.fromEntries(
    machineKeys.map((name) => [
      name,
      actorTemplateKeys.includes(name)
        ? EMPTY_ACTOR_RECORD
        : { state: config[name].initialState, context: config[name].initialContext },
    ]),
  ) as RootState<S>;

  const sidecar = createSidecarState();
  const { normalizeAction, applyPostNormalize } = createNormalizer<S, P>({
    routing: runtimeManager.routing,
    sidecar,
  });
  const { resolveSpawnGroups, forEachRoutedIdentity } = createRoutingResolver<S, P>({
    sidecar,
    actorTemplateKeys,
    actorSpawnIndex,
    actorReduceIndex,
    spawnIdConfig,
  });

  const reduceDomainMachines = (prev: RootState<S>, action: Action<P>): RootState<S> => {
    let next = prev;
    const reduceOne = (name: string) => {
      const machine = machines[name];
      const prevSlice = prev[name] as RuntimeState;
      const nextSlice = machine.transition(prevSlice, action);
      if (nextSlice === prevSlice) return;
      next = next === prev ? ({ ...prev } as RootState<S>) : next;
      (next as Record<string, RuntimeState>)[name] = nextSlice;
    };

    for (const name of domainAlwaysReduce) reduceOne(name);
    for (const name of domainReduceIndex.get(action.type) ?? []) reduceOne(name);
    return next;
  };

  const spawnActors = (
    ctx: DispatchContext<S, P>,
    root: RootState<S>,
    action: Action<P>,
    scope: Exclude<RoutingScope, "actor">,
    targetSet: string[],
  ): RootState<S> => {
    let next = root;
    const spawnTemplatesByGroup = actorSpawnIndex.get(action.type);
    if (!spawnTemplatesByGroup) return next;

    const isActorIdTaken = (id: string): boolean =>
      sidecar.actorById.has(id) || ctx.pendingSpawned.some((actor) => actor.meta.actorId === id);

    for (const groupCtx of resolveSpawnGroups(scope, targetSet, ctx, action)) {
      for (const templateKey of spawnTemplatesByGroup.get(groupCtx.groupTag) ?? []) {
        const cfg = config[templateKey as MachineKey<S>] as RuntimeConfig;
        const meta = createActorMeta({
          actorId: reserveActorId(ctx, templateKey, groupCtx.groupTag, action, spawnIdConfig, isActorIdTaken),
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

  const reduceActor = (
    ctx: DispatchContext<S, P>,
    root: RootState<S>,
    identity: ActorIdentity,
    action: Action<P>,
  ): { root: RootState<S>; delivered: boolean } => {
    const record = root[identity.templateKey] as ActorRecord;
    const slice = record?.[identity.meta.actorId];
    if (!slice || !hasActorTransition(identity.templateKey, slice.state, action)) {
      return { root, delivered: false };
    }

    const ensured = ensureRecord(ctx, root, identity.templateKey);
    const machine = machines[identity.templateKey as MachineKey<S>];
    const nextSlice = machine.transition(slice as RuntimeState, action) as RuntimeActorSlice;
    /* v8 ignore next -- prod hot path skips dev-only reducer output validation. */
    if (IS_DEV)
      validateActorReducerOutput(identity.meta.actorId, identity.templateKey, nextSlice.state, isPublicActorState);
    ensured.record[identity.meta.actorId] = { ...nextSlice, meta: identity.meta };
    return { root: ensured.root, delivered: true };
  };

  const collapseTerminalActors = (ctx: DispatchContext<S, P>, root: RootState<S>): RootState<S> => {
    let next = root;
    const seen = new Set<string>();
    for (const identity of [...ctx.pendingSpawned, ...ctx.pendingDelivered]) {
      if (seen.has(identity.meta.actorId)) continue;
      seen.add(identity.meta.actorId);

      const record = next[identity.templateKey] as ActorRecord;
      const slice = record?.[identity.meta.actorId];
      if (!slice || !isTerminal(slice.state)) continue;

      const ensured = ensureRecord(ctx, next, identity.templateKey);
      delete ensured.record[identity.meta.actorId];
      next = ensured.root;
      ctx.pendingDeleted.push(identity);
    }
    return next;
  };

  // Instance actor pipeline маршрутизирует по actor/group/tag/unscoped. Plugin scope
  // обрабатывается в reduceRoot до этого хелпера: actor-логика для него не запускается,
  // и здесь plugin-route — индикатор внутренней регрессии, поэтому явный throw.
  const toInstanceRoute = (
    route: Exclude<RouteConstraint, { scope: "plugin" }>,
  ): { scope: RoutingScope; targetSet: string[] } => {
    /* v8 ignore next 6 -- защитный invariant: plugin scope отсеивается в reduceRoot до вызова. */
    if ((route as RouteConstraint).scope === "plugin") {
      throw new LiteFsmError(
        "LITE_FSM_UNROUTABLE_PLUGIN_ROUTE",
        `[lite-fsm] instance storage cannot deliver action routed via plugin meta key '${(route as { key: string }).key}'.`,
      );
    }
    return route;
  };

  const reduceRoot = (
    ctx: DispatchContext<S, P>,
    prev: RootState<S>,
    committed: Action<P>,
    route: RouteConstraint,
  ): RootState<S> => {
    let next = reduceDomainMachines(prev, committed);
    // Plugin route принадлежит plugin storage: domain машины принимают action независимо
    // от scope, actor-логика instance не подхватывает plugin-routed события.
    if (route.scope === "plugin") return next;

    const { scope, targetSet } = toInstanceRoute(route);

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

  const sidecarValidationDeps: SidecarValidationDeps = {
    actorTemplateKeys,
    groupTagForTemplate,
    isPublicActorState,
    originId,
  };

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
    prevState: RootState<S>,
    nextState: RootState<S>,
    ctx: DispatchContext<S, P>,
  ): string[] =>
    actorTemplateKeys.filter((templateKey) => {
      if (prevState[templateKey] === nextState[templateKey]) return false;
      return ctx.touchedActorRecords.get(templateKey) !== nextState[templateKey];
    });

  const reconcileReplacedActorRecords = (nextState: RootState<S>, changedTemplateKeys: readonly string[]): RootState<S> => {
    if (changedTemplateKeys.length === 0) return nextState;
    const plan = buildReplacementReconcilePlan(sidecar, sidecarValidationDeps, changedTemplateKeys, nextState);
    return commitReplacementSidecar(sidecar, plan, nextState);
  };

  const commitReducedState = (
    ctx: DispatchContext<S, P>,
    prevState: RootState<S>,
    nextState: RootState<S>,
  ): RootState<S> => {
    const replacedKeys = detectExternallyReplacedActorRecords(prevState, nextState, ctx);
    const reconciledState = reconcileReplacedActorRecords(nextState, replacedKeys);
    return commitDispatchSidecar(sidecar, ctx, reconciledState);
  };

  const effectsRefs = {
    transition: runtimeManager.transition as (action: Action<P>, opts?: NormalizeOptions) => Action<P>,
    userDeps: {} as AnyRecord,
  };
  const { condition, invokeEffects } = createActorEffectsRuntime<P>({
    sidecar,
    machines,
    domainKeys: domainEffectKeys as readonly string[],
    refs: effectsRefs,
    onTransition: runtimeManager.onTransition,
    createScopedDeps: runtimeManager.createScopedDeps,
    onError: opts?.onError,
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

  const instanceSlot = createDispatchSlot<InstanceDispatchState<S, P>>(INSTANCE_DISPATCH_KEY);

  const runtime: InstanceRuntimeState<S, P> = {
    initialState,
    prepareAction({ action, options, dispatch }) {
      const normalizeOptions = toNormalizeOptions(options);
      const ctx = createDispatchContext<S, P>(normalizeOptions, sidecar.counters);
      instanceSlot.set(dispatch, { ctx, reduced: false });
      const preNormalized = normalizeAction(action as Action<P>, normalizeOptions);
      if (preNormalized === STORAGE_ACTION_DROP) return STORAGE_ACTION_DROP;
      return preNormalized as Action<P>;
    },
    beginReduce({ action, dispatch }) {
      const instanceDispatch = getInstanceDispatch<S, P>(instanceSlot, dispatch, sidecar.counters);
      if (!instanceDispatch.ctx.committed) {
        applyPostNormalize(instanceDispatch.ctx, action as Action<P>);
      }
      if (!syncCommittedAction(dispatch, instanceDispatch.ctx)) {
        dispatch.dropped = true;
        return false;
      }
    },
    acceptsEvent() {
      return true;
    },
    reduce(ctx) {
      const { dispatch } = ctx;
      const instanceDispatch = getInstanceDispatch<S, P>(instanceSlot, dispatch, sidecar.counters);
      if (instanceDispatch.reduced) return false;
      instanceDispatch.reduced = true;

      if (!instanceDispatch.ctx.committed) {
        applyPostNormalize(instanceDispatch.ctx, ctx.action as Action<P>);
      }
      if (!syncCommittedAction(dispatch, instanceDispatch.ctx)) {
        dispatch.dropped = true;
        return false;
      }
      dispatch.nextState = reduceRoot(
        instanceDispatch.ctx,
        dispatch.nextState as RootState<S>,
        instanceDispatch.ctx.committed as Action<P>,
        dispatch.route,
      ) as Record<string, unknown>;
    },
    commit({ dispatch }) {
      const instanceDispatch = instanceSlot.get(dispatch);
      if (!instanceDispatch?.ctx.committed) return;

      dispatch.nextState = commitReducedState(
        instanceDispatch.ctx,
        dispatch.prevState as RootState<S>,
        dispatch.nextState as RootState<S>,
      ) as Record<string, unknown>;
      if (hasActorEffects) resolveEffectsTargets(instanceDispatch.ctx);
    },
    condition(predicate) {
      return condition(predicate);
    },
    resolveEffectInvocations({ manager, dispatch }) {
      const instanceDispatch = instanceSlot.get(dispatch);
      if (!hasAnyEffects || dispatch.skipDelivery || !instanceDispatch?.ctx.committed) return [];

      return [
        {
          prevState: instanceDispatch.ctx.committedPrevState!,
          currentState: manager.getState() as RootState<S>,
          action: instanceDispatch.ctx.committed,
          targets: instanceDispatch.ctx.effectsTargets,
        },
      ];
    },
    invokeEffect({ invocation, manager }) {
      const effectInvocation = invocation as InstanceEffectInvocation<S, P>;
      effectsRefs.userDeps = manager.getDependencies() as MachineDependencies<S> as AnyRecord;
      invokeEffects(
        effectInvocation.prevState,
        effectInvocation.currentState,
        effectInvocation.action,
        effectInvocation.targets,
      );
    },
    dehydrate({ rootState, options }) {
      return buildDehydratedEnvelope<S>(
        rootState as RootState<S>,
        config,
        sidecar,
        snapshotActorTemplateKeys,
        runtimeActorTemplateKeys,
        domainKeys,
        schemaVersion,
        options as DehydrateOptions<S> | undefined,
      );
    },
    hydrate({ snapshot, baseState, strategy, source, mode }) {
      const result = applySnapshotPure(
        baseState as RootState<S>,
        snapshot as MachineManagerSnapshot<S>,
        strategy,
        source,
        hydrationDeps,
        mode === "preview" ? "preview" : "commit",
      );
      if (mode === "preview") {
        return { nextState: result.nextState as Record<string, unknown>, changed: result.nextState !== baseState };
      }

      if (result.nextState === baseState) {
        return { nextState: baseState, changed: false };
      }

      const nextState = reconcileReplacedActorRecords(result.nextState, result.changedActorTemplateKeys);
      /* v8 ignore next */
      if (IS_DEV) deepFreeze(nextState);
      return { nextState: nextState as Record<string, unknown>, changed: true };
    },
    resolveIdentity({ action }) {
      const actorId = action.meta?.actorId;
      return typeof actorId === "string" ? sidecar.actorById.get(actorId) : undefined;
    },
  };

  return runtime;
};

export const asInstanceRuntimeState = <S extends MachineStore, P extends AnyEvent>(
  value: unknown,
): InstanceRuntimeState<S, P> => {
  if (!isInstanceRuntimeState<S, P>(value)) {
    throw new Error("[lite-fsm] invalid instance storage runtime state.");
  }
  return value;
};
