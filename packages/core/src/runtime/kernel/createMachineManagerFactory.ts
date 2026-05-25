import type {
  DispatchContext,
  DispatchHook,
  LiteFsmPlugin,
  ManagerActionMeta,
  ManagerTransitionEvents,
  NormalizedPlugin,
} from "../../plugin";
import { getNormalizedPlugin, isLiteFsmPluginValue } from "../../plugin";
import type {
  AnyEvent,
  DehydrateOptions,
  MachineManagerRuntimeSnapshot,
  MachineManagerSnapshot,
  MachinesState,
  MachineStore,
  ManagerAction,
  ManagerCommitAction,
  MiddlewareApi,
  Reducer,
  TransitionSubscriber,
} from "../../types";
import type {
  IMachineManager,
  MachineDependencies,
  MachineEvents,
  MachineManagerOptions,
  ManagerFromPlugins,
} from "../../interfaces";
import { assertSnapshotEnvelope, type SnapshotEnvelope } from "../../hydration";
import { assertUserAction } from "../../managerNormalize";
import { compose, deepFreeze, HYDRATE_ACTION_TYPE, IS_DEV, LiteFsmError, VOID_REDUCER_ERROR } from "../../utils";
import { createPluginRegistry, type DispatchHookPhase } from "./registry";
import {
  compileStorageTemplates,
  type CompiledStorageTemplate,
  type ManagerRuntimeContext,
  type RuntimeStorageEntry,
  STORAGE_ACTION_DROP,
  type StorageDispatchContext,
  type StorageRuntime,
} from "./storage";

export type RuntimePreset = {
  readonly name: string;
  readonly defaultStorageKind: string;
  readonly plugins: readonly NormalizedPlugin[];
};

export type MachineManagerFactory = {
  <S extends MachineStore, P extends AnyEvent = MachineEvents<S>>(config: S): ManagerFromPlugins<S, P, readonly []>;
  <
    S extends MachineStore,
    P extends AnyEvent = MachineEvents<S>,
    const Plugins extends readonly LiteFsmPlugin<any, any, any>[] = readonly [],
  >(
    config: S,
    opts: MachineManagerOptions<S, P, Plugins>,
  ): ManagerFromPlugins<S, P, Plugins>;
};

type RuntimeBucket = {
  readonly runtime: StorageRuntime;
  readonly templates: CompiledStorageTemplate[];
  state: unknown;
};

type Action = ManagerAction<AnyEvent>;
type RootState = Record<string, unknown>;
type DehydrateRuntimeOptions = DehydrateOptions<MachineStore> | undefined;
type RuntimeHydratePlan = {
  bucket: RuntimeBucket;
  machines: Record<string, unknown>;
  storageSnapshot?: unknown;
  hasStorageSnapshot: boolean;
};

const groupTemplatesByRuntime = (
  templates: readonly CompiledStorageTemplate[],
  registeredRuntimes: readonly RuntimeStorageEntry[],
): RuntimeBucket[] => {
  const buckets = new Map<string, RuntimeBucket>();

  for (const { kind, runtime } of registeredRuntimes) {
    buckets.set(kind, { runtime, templates: [], state: undefined });
  }

  for (const template of templates) {
    buckets.get(template.kind)?.templates.push(template);
  }

  return [...buckets.values()];
};

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const assertKnownStorageKind = (
  kind: string,
  bucketsByKind: Map<string, RuntimeBucket>,
  context: "dehydrate" | "hydrate",
) => {
  const bucket = bucketsByKind.get(kind);
  if (bucket) return bucket;

  throw new LiteFsmError("LITE_FSM_UNKNOWN_STORAGE_KIND", `[lite-fsm] ${context}: unknown storage kind '${kind}'.`);
};

const assertStorageSnapshotRuntime = (
  kind: string,
  bucket: RuntimeBucket,
  context: "dehydrate" | "hydrate",
): NonNullable<StorageRuntime["snapshot"]> => {
  if (bucket.runtime.snapshot) return bucket.runtime.snapshot;

  throw new LiteFsmError(
    "LITE_FSM_UNSUPPORTED_STORAGE_SNAPSHOT",
    `[lite-fsm] ${context}: storage runtime '${kind}' does not support snapshots.`,
  );
};

const assertManagerPluginValue = (value: unknown): LiteFsmPlugin => {
  if (isLiteFsmPluginValue(value)) return value;

  throw new LiteFsmError(
    "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    "[lite-fsm] invalid plugin definition: MachineManager plugins must be values returned by definePlugin().create(...).",
  );
};

export const createMachineManagerFactory = (preset: RuntimePreset): MachineManagerFactory => {
  return function createMachineManager<
    S extends MachineStore,
    P extends AnyEvent = MachineEvents<S>,
    const Plugins extends readonly LiteFsmPlugin<any, any, any>[] = readonly [],
  >(config: S, opts?: MachineManagerOptions<S, P, Plugins>): ManagerFromPlugins<S, P, Plugins> {
    type RuntimeEvents = ManagerTransitionEvents<P, Plugins>;
    type RuntimeMeta = ManagerActionMeta<Plugins>;
    type RuntimeAction = ManagerAction<RuntimeEvents, RuntimeMeta>;

    const pluginRegistry = createPluginRegistry({ defaultStorageKind: preset.defaultStorageKind });
    for (const plugin of preset.plugins) {
      pluginRegistry.addPlugin(plugin);
    }
    const runtimeOptions = opts as ({ readonly plugins?: readonly unknown[] } & typeof opts) | undefined;
    for (const plugin of runtimeOptions?.plugins ?? []) {
      pluginRegistry.addPlugin(getNormalizedPlugin(assertManagerPluginValue(plugin)));
    }
    pluginRegistry.assertDefaultStorageRegistered();
    pluginRegistry.assertStorageRouteResolversRegistered();

    const machineKeys = Object.keys(config);
    const templates = compileStorageTemplates(
      config,
      machineKeys,
      pluginRegistry.storage,
      pluginRegistry.defaultStorageKind,
    );
    const buckets = groupTemplatesByRuntime(templates, pluginRegistry.listStorageRuntimes());
    const bucketsByKind = new Map(buckets.map((bucket) => [bucket.runtime.kind, bucket]));
    const templateKindByKey = new Map(templates.map((template) => [template.key, template.kind]));

    let state = {} as MachinesState<S>;
    let subscribers: Array<TransitionSubscriber<S, RuntimeEvents, RuntimeMeta>> = [];
    let userDeps = {} as MachineDependencies<S, Plugins>;
    let activeDispatch: StorageDispatchContext | null = null;
    let runningDispatchHook = false;

    const getState = () => state;
    const invokeSubscribers = (
      prev: MachinesState<S>,
      current: MachinesState<S>,
      action: ManagerCommitAction<S, RuntimeAction>,
    ) => {
      for (const subscriber of subscribers) subscriber(prev, current, action);
    };

    const onTransition: IMachineManager<S, RuntimeEvents, RuntimeMeta>["onTransition"] = (cb) => {
      subscribers.push(cb);
      return () => {
        subscribers = subscribers.filter((subscriber) => subscriber !== cb);
      };
    };

    const managerContext: ManagerRuntimeContext = {
      config: config as MachineStore,
      options: opts,
      schemaVersion: opts?.schemaVersion,
      routing: pluginRegistry.routing,
      getState: () => getState() as MachinesState<MachineStore>,
      transition: (action, options) => transition(action as RuntimeAction, options) as ManagerAction<AnyEvent>,
      onTransition: (cb) => onTransition(cb as TransitionSubscriber<S, RuntimeEvents, RuntimeMeta>),
      getDependencies: () => userDeps as Record<string, unknown>,
      createScopedDeps: (baseDeps, ctx) => pluginRegistry.createScopedDeps(baseDeps, ctx),
    };

    for (const bucket of buckets) {
      bucket.state = bucket.runtime.createRuntimeState({ templates: bucket.templates, manager: managerContext });
    }

    state = Object.fromEntries(
      templates.map((template) => {
        const bucket = bucketsByKind.get(template.kind);
        return [
          template.key,
          bucket?.runtime.createPublicInitialState({
            template,
            state: bucket.state,
          }),
        ];
      }),
    ) as MachinesState<S>;

    const createDispatch = (action: Action, options: unknown): StorageDispatchContext => ({
      options,
      runtime: new Map(),
      originalAction: action,
      preparedAction: action,
      action,
      skipDelivery: false,
      route: pluginRegistry.routing.resolveRoute(action),
      prevState: state as RootState,
      nextState: state as RootState,
      nextCalled: false,
      dropped: false,
      touched: new Set<string>(),
      reportError(error) {
        opts?.onError?.(error);
      },
    });

    const setDispatchAction = (dispatch: StorageDispatchContext, action: Action, committedPrevState?: RootState) => {
      dispatch.action = action;
      dispatch.committedAction = action;
      dispatch.route = pluginRegistry.routing.resolveRoute(action);
      if (committedPrevState && !dispatch.committedPrevState) dispatch.committedPrevState = committedPrevState;
    };

    const prepareAction = (action: Action, options: unknown, dispatch: StorageDispatchContext) => {
      let prepared = action;
      for (const bucket of buckets) {
        if (!bucket.runtime.prepareAction) continue;
        const result = bucket.runtime.prepareAction({
          action: prepared,
          options,
          state: bucket.state,
          manager: managerContext,
          dispatch,
        });
        if (result === STORAGE_ACTION_DROP) return STORAGE_ACTION_DROP;
        prepared = result;
        dispatch.preparedAction = prepared;
        dispatch.route = pluginRegistry.routing.resolveRoute(prepared);
      }
      return prepared;
    };

    const reduceStorageRuntimes = (action: Action, dispatch: StorageDispatchContext): MachinesState<S> => {
      for (const bucket of buckets) {
        for (const template of bucket.templates) {
          if (!bucket.runtime.acceptsEvent({ template, action, state: bucket.state, dispatch })) continue;
          const result = bucket.runtime.reduce({
            template,
            action,
            state: bucket.state,
            manager: managerContext,
            dispatch,
          });
          if (result !== false) dispatch.touched.add(bucket.runtime.kind);
        }
      }
      return dispatch.nextState as MachinesState<S>;
    };

    const runActionInterceptors = (dispatch: StorageDispatchContext) => {
      for (const interceptor of pluginRegistry.listActionInterceptors()) {
        const result = interceptor(dispatch as DispatchContext);
        if (result?.action !== undefined) {
          setDispatchAction(dispatch, result.action);
        }
        if (result?.skipDelivery === true) {
          dispatch.skipDelivery = true;
        }
        if (result?.stopInterceptors === true) return;
      }
    };

    const runDispatchHooks = (phase: DispatchHookPhase, dispatch: StorageDispatchContext) => {
      for (const hook of pluginRegistry.listDispatchHooks(phase)) {
        runningDispatchHook = true;
        try {
          (hook as DispatchHook)(dispatch as DispatchContext);
        } finally {
          runningDispatchHook = false;
        }
      }
    };

    let rootReducer: Reducer<MachinesState<S>, RuntimeAction> = (prev, action) => {
      state = prev;
      const dispatch = activeDispatch!;
      dispatch.nextState = prev as RootState;
      return reduceStorageRuntimes(action as Action, dispatch);
    };

    const replaceReducer: IMachineManager<S, RuntimeEvents, RuntimeMeta>["replaceReducer"] = (cb) => {
      rootReducer = cb(rootReducer);
    };

    const commitTouchedRuntimes = (dispatch: StorageDispatchContext) => {
      for (const bucket of buckets) {
        if (!dispatch.touched.has(bucket.runtime.kind)) continue;
        bucket.runtime.commit({ state: bucket.state, manager: managerContext, dispatch });
      }
    };

    const runStorageReactions = (action: Action, dispatch: StorageDispatchContext) => {
      for (const bucket of buckets) {
        if (!dispatch.touched.has(bucket.runtime.kind) || !bucket.runtime.reactions) continue;
        bucket.runtime.reactions.run({ action, state: bucket.state, manager: managerContext, dispatch });
      }
    };

    const runStorageEffects = (dispatch: StorageDispatchContext) => {
      for (const bucket of buckets) {
        if (!dispatch.touched.has(bucket.runtime.kind) || !bucket.runtime.effects) continue;
        for (const invocation of bucket.runtime.effects.resolveInvocations({
          state: bucket.state,
          manager: managerContext,
          dispatch,
        })) {
          bucket.runtime.effects.invoke({ invocation, state: bucket.state, manager: managerContext, dispatch });
        }
      }
    };

    const coreTransition = (action: RuntimeAction): RuntimeAction => {
      const dispatch = activeDispatch!;
      if (dispatch.nextCalled) {
        throw new Error("[lite-fsm] middleware called next() more than once for a single transition.");
      }
      dispatch.nextCalled = true;

      const prevState = state;
      dispatch.prevState = prevState as RootState;
      dispatch.nextState = prevState as RootState;
      for (const bucket of buckets) {
        if (!bucket.runtime.beginReduce) continue;
        const result = bucket.runtime.beginReduce({
          action: action as Action,
          state: bucket.state,
          manager: managerContext,
          dispatch,
        });
        if (result !== false) dispatch.touched.add(bucket.runtime.kind);
      }
      if (dispatch.dropped) return action;

      setDispatchAction(dispatch, (dispatch.committedAction ?? action) as Action, prevState as RootState);
      runActionInterceptors(dispatch);
      runDispatchHooks("beforeReduce", dispatch);

      if (dispatch.skipDelivery) {
        dispatch.nextState = prevState as RootState;
      } else {
        const nextState = rootReducer(prevState, dispatch.action as RuntimeAction);
        if (nextState === undefined) throw new Error(VOID_REDUCER_ERROR);
        dispatch.nextState = nextState as RootState;
      }

      runDispatchHooks("afterReduce", dispatch);
      runDispatchHooks("beforeCommit", dispatch);
      commitTouchedRuntimes(dispatch);
      state = dispatch.nextState as MachinesState<S>;
      /* v8 ignore next */
      if (IS_DEV) deepFreeze(state);
      runDispatchHooks("beforeSubscribers", dispatch);
      runStorageReactions(dispatch.action, dispatch);
      invokeSubscribers(prevState, state, dispatch.action as RuntimeAction);
      return dispatch.action as RuntimeAction;
    };

    const condition = (predicate: (action: RuntimeAction) => boolean) => {
      for (const bucket of buckets) {
        if (!bucket.runtime.effects?.condition) continue;
        return bucket.runtime.effects.condition({
          predicate: predicate as (action: ManagerAction<AnyEvent>) => boolean,
          state: bucket.state,
          manager: managerContext,
        });
      }
      return Promise.resolve(false);
    };

    const middlewareList = opts?.middleware;
    const wrappedTransition = (() => {
      if (!middlewareList?.length) return coreTransition;

      const api: MiddlewareApi<MachinesState<S>, RuntimeEvents, RuntimeMeta> = {
        getState,
        transition: (action) => transition(action),
        replaceReducer,
        onTransition,
        condition,
      };
      return compose(...middlewareList.map((middleware) => middleware(api)))(coreTransition);
    })();

    const unsupportedSnapshot = (): never => {
      throw new Error("[lite-fsm] snapshot is not supported by the configured storage runtimes.");
    };

    const buildRuntimeDehydrateOptions = (
      options: DehydrateRuntimeOptions,
      machineKeys: readonly string[] | undefined,
    ): DehydrateRuntimeOptions => {
      if (!options) return undefined;
      if (options.machines === undefined) return options;
      return { ...options, machines: (machineKeys ?? []) as never };
    };

    const getDehydrateStorageKinds = (options: DehydrateRuntimeOptions): Set<string> => {
      const requested = options?.storage;
      if (requested === undefined) {
        return new Set(buckets.filter((bucket) => bucket.runtime.snapshot).map((bucket) => bucket.runtime.kind));
      }

      const kinds = new Set<string>();
      for (const kind of requested) {
        const bucket = assertKnownStorageKind(kind, bucketsByKind, "dehydrate");
        assertStorageSnapshotRuntime(kind, bucket, "dehydrate");
        kinds.add(kind);
      }
      return kinds;
    };

    const getMachineDehydrateKinds = (
      options: DehydrateRuntimeOptions,
      keysByKind: Map<string, string[]>,
    ): Set<string> => {
      const requestedKeys = options?.machines as readonly string[] | undefined;
      if (!requestedKeys) {
        return new Set(
          buckets
            .filter((bucket) => bucket.runtime.snapshot && bucket.templates.length > 0)
            .map((bucket) => bucket.runtime.kind),
        );
      }

      const kinds = new Set<string>();
      for (const key of requestedKeys) {
        if (!hasOwn(config, key)) {
          throw new LiteFsmError(
            "LITE_FSM_INVALID_HYDRATION_ENVELOPE",
            `[lite-fsm] dehydrate: unknown machine key '${key}'.`,
          );
        }

        const kind = templateKindByKey.get(key)!;
        const bucket = bucketsByKind.get(kind)!;
        assertStorageSnapshotRuntime(kind, bucket, "dehydrate");
        kinds.add(kind);
        const keys = keysByKind.get(kind) ?? [];
        keys.push(key);
        keysByKind.set(kind, keys);
      }
      return kinds;
    };

    const dehydrateWithStorage = (options: DehydrateRuntimeOptions): MachineManagerSnapshot<S> => {
      const keysByKind = new Map<string, string[]>();
      const machineKinds = getMachineDehydrateKinds(options, keysByKind);
      const storageKinds = getDehydrateStorageKinds(options);
      const callKinds = new Set([...machineKinds, ...storageKinds]);

      if (callKinds.size === 0 && !buckets.some((bucket) => bucket.runtime.snapshot)) {
        return unsupportedSnapshot();
      }

      const machinesEnvelope: Record<string, unknown> = {};
      const storageEnvelope: Record<string, unknown> = {};

      for (const bucket of buckets) {
        const kind = bucket.runtime.kind;
        if (!callKinds.has(kind)) continue;
        const snapshotRuntime = assertStorageSnapshotRuntime(kind, bucket, "dehydrate");
        const result = snapshotRuntime.dehydrate({
          state: bucket.state,
          manager: managerContext,
          rootState: state as RootState,
          options: buildRuntimeDehydrateOptions(options, keysByKind.get(kind)),
        });

        if (result.machines !== undefined) {
          Object.assign(machinesEnvelope, result.machines);
        }
        if (storageKinds.has(kind) && hasOwn(result, "storage") && result.storage !== undefined) {
          storageEnvelope[kind] = result.storage;
        }
      }

      const snapshot: MachineManagerSnapshot<S> = {
        schemaVersion: opts?.schemaVersion,
        machines: machinesEnvelope as MachineManagerSnapshot<S>["machines"],
      };
      if (Object.keys(storageEnvelope).length > 0) snapshot.storage = storageEnvelope;
      return snapshot;
    };

    const ensureHydratePlan = (plans: Map<string, RuntimeHydratePlan>, kind: string): RuntimeHydratePlan => {
      const existing = plans.get(kind);
      if (existing) return existing;

      const bucket = assertKnownStorageKind(kind, bucketsByKind, "hydrate");
      assertStorageSnapshotRuntime(kind, bucket, "hydrate");
      const created: RuntimeHydratePlan = {
        bucket,
        machines: {},
        hasStorageSnapshot: false,
      };
      plans.set(kind, created);
      return created;
    };

    const selectUnknownMachineBucket = (): RuntimeBucket => {
      const defaultBucket = bucketsByKind.get(pluginRegistry.defaultStorageKind);
      if (defaultBucket?.runtime.snapshot) return defaultBucket;
      const firstSnapshotBucket = buckets.find((bucket) => bucket.runtime.snapshot);
      if (firstSnapshotBucket) return firstSnapshotBucket;
      return unsupportedSnapshot();
    };

    const buildHydratePlans = (envelope: SnapshotEnvelope): RuntimeHydratePlan[] => {
      const plans = new Map<string, RuntimeHydratePlan>();
      let unknownMachinePlan: RuntimeHydratePlan | undefined;

      for (const [key, value] of Object.entries(envelope.machines)) {
        const kind = templateKindByKey.get(key);
        if (!kind) {
          const bucket = unknownMachinePlan?.bucket ?? selectUnknownMachineBucket();
          unknownMachinePlan = ensureHydratePlan(plans, bucket.runtime.kind);
          unknownMachinePlan.machines[key] = value;
          continue;
        }

        ensureHydratePlan(plans, kind).machines[key] = value;
      }

      for (const [kind, value] of Object.entries(envelope.storage ?? {})) {
        const plan = ensureHydratePlan(plans, kind);
        plan.storageSnapshot = value;
        plan.hasStorageSnapshot = true;
      }

      return buckets
        .map((bucket) => plans.get(bucket.runtime.kind))
        .filter((plan): plan is RuntimeHydratePlan => Boolean(plan));
    };

    const hydrateWithStorage = (
      snapshot: MachineManagerSnapshot<S>,
      strategy: "replace" | "merge",
      mode: "preview" | "commit" | "init",
      baseState: MachinesState<S>,
      source: "hydrate" | "opts.snapshot",
    ) => {
      const envelope = assertSnapshotEnvelope(snapshot);
      let nextState = baseState as RootState;
      let changed = false;
      const plans = buildHydratePlans(envelope);

      if (plans.length === 0 && !buckets.some((bucket) => bucket.runtime.snapshot)) {
        return unsupportedSnapshot();
      }

      for (const plan of plans) {
        const storageSnapshot = plan.hasStorageSnapshot
          ? { [plan.bucket.runtime.kind]: plan.storageSnapshot }
          : undefined;
        const runtimeSnapshot: MachineManagerSnapshot<S> = {
          schemaVersion: envelope.schemaVersion,
          machines: plan.machines as MachineManagerSnapshot<S>["machines"],
          ...(storageSnapshot ? { storage: storageSnapshot } : {}),
        };
        const result = plan.bucket.runtime.snapshot!.hydrate({
          state: plan.bucket.state,
          manager: managerContext,
          snapshot: runtimeSnapshot,
          baseState: nextState,
          strategy,
          source,
          mode,
        });
        if (!result.changed) continue;
        nextState = result.nextState;
        changed = true;
      }

      return { nextState, changed };
    };

    if (opts?.snapshot) {
      state = hydrateWithStorage(opts.snapshot, "replace", "init", state, "opts.snapshot")
        .nextState as MachinesState<S>;
    }

    /* v8 ignore next */
    if (IS_DEV) deepFreeze(state);

    function transition(action: RuntimeAction, options?: unknown): RuntimeAction {
      if (runningDispatchHook) {
        throw new Error("[lite-fsm] transition cannot be called from a dispatch hook.");
      }

      assertUserAction(action);
      const dispatch = createDispatch(action as Action, options);
      const prepared = prepareAction(action as Action, options, dispatch);
      if (prepared === STORAGE_ACTION_DROP) return action;

      const parentDispatch = activeDispatch;
      activeDispatch = dispatch;
      let committed: RuntimeAction;
      try {
        committed = wrappedTransition(prepared as RuntimeAction);
      } finally {
        activeDispatch = parentDispatch;
      }

      if (!dispatch.committedAction) return committed;

      runDispatchHooks("beforeEffects", dispatch);
      runStorageEffects(dispatch);
      runDispatchHooks("afterEffects", dispatch);

      return dispatch.action as RuntimeAction;
    }

    const manager: IMachineManager<S, RuntimeEvents, RuntimeMeta, Plugins> = {
      getState,
      getSnapshot: () =>
        ({
          schemaVersion: opts?.schemaVersion,
          machines: { ...state },
        }) as MachineManagerRuntimeSnapshot<S>,
      getHydratedState: (snapshot, { strategy = "merge", baseState = state } = {}) =>
        hydrateWithStorage(snapshot, strategy, "preview", baseState, "hydrate").nextState as MachinesState<S>,
      hydrate(snapshot: MachineManagerSnapshot<S>, { strategy = "merge" } = {}) {
        const prevState = state;
        const result = hydrateWithStorage(snapshot, strategy, "commit", prevState, "hydrate");
        if (!result.changed) return;
        state = result.nextState as MachinesState<S>;
        /* v8 ignore next */
        if (IS_DEV) deepFreeze(state);
        invokeSubscribers(prevState, state, { type: HYDRATE_ACTION_TYPE, payload: { strategy, snapshot } });
      },
      dehydrate: ((dehydrateOptions: unknown) =>
        dehydrateWithStorage(dehydrateOptions as DehydrateRuntimeOptions)) as unknown as IMachineManager<
        S,
        RuntimeEvents,
        RuntimeMeta
      >["dehydrate"],
      transition,
      setDependencies(
        deps:
          | MachineDependencies<S, Plugins>
          | ((deps: MachineDependencies<S, Plugins>) => MachineDependencies<S, Plugins>),
      ) {
        userDeps =
          typeof deps === "function"
            ? (deps as (current: MachineDependencies<S, Plugins>) => MachineDependencies<S, Plugins>)(userDeps)
            : deps;
      },
      onTransition,
      replaceReducer,
    };

    return pluginRegistry.attachManagerExtensions(
      manager as unknown as Record<string, unknown>,
      managerContext,
    ) as ManagerFromPlugins<S, P, Plugins>;
  };
};
