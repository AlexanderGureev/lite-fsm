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
import { assertUserAction } from "../../managerNormalize";
import { extractUserPlugins } from "../../pluginNormalize";
import { compose, deepFreeze, HYDRATE_ACTION_TYPE, IS_DEV, LiteFsmError, VOID_REDUCER_ERROR } from "../../utils";
import { createReadonlyActionView } from "./actionView";
import { createBucketRuntime, groupTemplatesByRuntime, initBucketState } from "./bucketRuntime";
import { assertPluginInterceptorResult } from "./callbackValidation";
import { createPluginRegistry, type DispatchHookPhase } from "./registry";
import { createSnapshotRuntime } from "./snapshot";
import {
  compileStorageTemplates,
  type ManagerRuntimeContext,
  type StorageDispatchLifecycleContext,
} from "./storage";
import { throwTransitionGuardError, type GuardedCallbackRunner, type TransitionGuardPhase } from "./transitionGuard";

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

type Action = ManagerAction<AnyEvent>;
type RootState = Record<string, unknown>;

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

    // Action и RuntimeAction совпадают по runtime, отличаются только generics:
    // helper-ы сосредотачивают identity-cast в одном месте, чтобы не размазывать
    // `as Action` / `as RuntimeAction` по всей фабрике.
    const widenAction = (action: RuntimeAction): Action => action as Action;
    const narrowAction = (action: Action): RuntimeAction => action as RuntimeAction;

    // === Plugin registry =====================================================

    const pluginRegistry = createPluginRegistry({ defaultStorageKind: preset.defaultStorageKind });
    for (const plugin of preset.plugins) pluginRegistry.addPlugin(plugin);
    for (const plugin of extractUserPlugins(opts)) {
      pluginRegistry.addPlugin(getNormalizedPlugin(assertManagerPluginValue(plugin)));
    }
    pluginRegistry.assertDefaultStorageRegistered();
    pluginRegistry.assertStorageRouteResolversRegistered();

    // === Bucket setup ========================================================

    const templates = compileStorageTemplates(
      config,
      Object.keys(config),
      pluginRegistry.storage,
      pluginRegistry.defaultStorageKind,
    );
    const buckets = groupTemplatesByRuntime(templates, pluginRegistry.listStorageRuntimes());
    const bucketsByKind = new Map(buckets.map((bucket) => [bucket.runtime.kind, bucket]));
    const templateKindByKey = new Map(templates.map((template) => [template.key, template.kind]));

    // === Mutable runtime state ===============================================

    let state = {} as MachinesState<S>;
    let subscribers: Array<TransitionSubscriber<S, RuntimeEvents, RuntimeMeta>> = [];
    let userDeps = {} as MachineDependencies<S, Plugins>;
    let activeDispatch: StorageDispatchLifecycleContext | null = null;
    let transitionGuardPhase: TransitionGuardPhase | null = null;

    const withTransitionGuard: GuardedCallbackRunner = (phase, run) => {
      const previousPhase = transitionGuardPhase;
      transitionGuardPhase = phase;
      try {
        return run();
      } finally {
        transitionGuardPhase = previousPhase;
      }
    };

    const requireActiveDispatch = (): StorageDispatchLifecycleContext => {
      /* v8 ignore next 6 -- защитный invariant: вызывается только из reducer/coreTransition внутри активного transition(). */
      if (!activeDispatch) {
        throw new LiteFsmError(
          "LITE_FSM_NO_ACTIVE_DISPATCH",
          "[lite-fsm] no active dispatch context; transition() must be called via MachineManager API.",
        );
      }
      return activeDispatch;
    };

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

    // === Manager context & bucket runtime ====================================
    // managerContext передаётся в storage runtimes и plugin manager extensions; bucketRuntime
    // зависит от него, поэтому строим в указанном порядке.

    const managerContext: ManagerRuntimeContext = {
      config: config as MachineStore,
      options: opts,
      schemaVersion: opts?.schemaVersion,
      routing: pluginRegistry.routing,
      getState: () => getState() as MachinesState<MachineStore>,
      transition: (action, options) => widenAction(transition(narrowAction(action), options)),
      onTransition: (cb) => onTransition(cb as TransitionSubscriber<S, RuntimeEvents, RuntimeMeta>),
      getDependencies: () => userDeps as Record<string, unknown>,
      createScopedDeps: (baseDeps, ctx) =>
        pluginRegistry.createScopedDeps(baseDeps, {
          ...ctx,
          event: createReadonlyActionView(ctx.event as Action),
        }),
    };

    const bucketRuntime = createBucketRuntime<S>(
      buckets,
      managerContext,
      pluginRegistry.routing.resolveRoute,
      pluginRegistry.defaultStorageKind,
      withTransitionGuard,
    );

    state = initBucketState<S>(buckets, bucketsByKind, templates, managerContext);

    const snapshotRuntime = createSnapshotRuntime<S>({
      config: config as MachineStore,
      buckets,
      bucketsByKind,
      templateKindByKey,
      defaultStorageKind: pluginRegistry.defaultStorageKind,
      managerContext,
      getState,
      getSchemaVersion: () => opts?.schemaVersion,
    });

    // === Dispatch context helpers ============================================

    const createDispatch = (action: Action, options: unknown): StorageDispatchLifecycleContext => {
      const runtime = new Map<string, unknown>();
      let lifecycle: StorageDispatchLifecycleContext;
      const publicDispatch = {
        get options() {
          return options;
        },
        get runtime() {
          return runtime;
        },
        get route() {
          return lifecycle.route;
        },
        get prevState() {
          return lifecycle.prevState;
        },
        get nextState() {
          return lifecycle.nextState;
        },
        set nextState(nextState: RootState) {
          lifecycle.nextState = nextState;
        },
        get skipDelivery() {
          return lifecycle.skipDelivery;
        },
        reportError(error: unknown) {
          opts?.onError?.(error);
        },
      };

      lifecycle = {
        originalAction: action,
        action,
        skipDelivery: false,
        route: pluginRegistry.routing.resolveRoute(action),
        prevState: state as RootState,
        nextState: state as RootState,
        nextCalled: false,
        outcome: { type: "active" },
        touched: new Set<string>(),
        dispatch: publicDispatch,
      };
      return lifecycle;
    };

    const setCurrentAction = (dispatch: StorageDispatchLifecycleContext, action: Action) => {
      dispatch.action = action;
      dispatch.route = pluginRegistry.routing.resolveRoute(action);
    };

    const createPluginDispatchContext = (dispatch: StorageDispatchLifecycleContext): DispatchContext => {
      const originalAction = createReadonlyActionView(dispatch.originalAction);
      const action = createReadonlyActionView(dispatch.action);

      return {
        get options() {
          return dispatch.dispatch.options;
        },
        get runtime() {
          return dispatch.dispatch.runtime;
        },
        originalAction,
        action,
        get skipDelivery() {
          return dispatch.skipDelivery;
        },
        reportError(error) {
          dispatch.dispatch.reportError(error);
        },
      };
    };

    const runActionInterceptors = (dispatch: StorageDispatchLifecycleContext) => {
      for (const { owner, intercept } of pluginRegistry.listActionInterceptors()) {
        const source = `plugin '${owner}' intercept`;
        const context = createPluginDispatchContext(dispatch);
        const result = assertPluginInterceptorResult(
          source,
          withTransitionGuard("plugin.intercept", () => intercept(context)),
        );
        if (result?.action !== undefined) setCurrentAction(dispatch, result.action);
        if (result?.skipDelivery === true) dispatch.skipDelivery = true;
        if (result?.stopInterceptors === true) return;
      }
    };

    const runDispatchHooks = (phase: DispatchHookPhase, dispatch: StorageDispatchLifecycleContext) => {
      const guardPhase: TransitionGuardPhase = `hook.${phase}`;
      for (const hook of pluginRegistry.listDispatchHooks(phase)) {
        withTransitionGuard(guardPhase, () => {
          (hook as DispatchHook)(createPluginDispatchContext(dispatch));
        });
      }
    };

    // === Reducer + middleware pipeline =======================================

    let rootReducer: Reducer<MachinesState<S>, RuntimeAction> = (prev, action) => {
      state = prev;
      const dispatch = requireActiveDispatch();
      dispatch.nextState = prev as RootState;
      return bucketRuntime.reduce(widenAction(action), dispatch);
    };

    const replaceReducer: IMachineManager<S, RuntimeEvents, RuntimeMeta>["replaceReducer"] = (cb) => {
      rootReducer = cb(rootReducer);
    };

    const coreTransition = (action: RuntimeAction): RuntimeAction => {
      const dispatch = requireActiveDispatch();
      if (dispatch.nextCalled) {
        throw new Error("[lite-fsm] middleware called next() more than once for a single transition.");
      }
      dispatch.nextCalled = true;

      const prevState = state;
      dispatch.prevState = prevState as RootState;
      dispatch.nextState = prevState as RootState;
      setCurrentAction(dispatch, widenAction(action));
      const beforeReduce = bucketRuntime.beforeReduce(widenAction(action), dispatch);
      if (beforeReduce.type === "drop") {
        dispatch.outcome = { type: "drop", action: dispatch.originalAction };
        return narrowAction(dispatch.originalAction);
      }

      setCurrentAction(dispatch, beforeReduce.action);
      runActionInterceptors(dispatch);
      runDispatchHooks("beforeReduce", dispatch);

      if (dispatch.skipDelivery) {
        dispatch.nextState = prevState as RootState;
      } else {
        const nextState = rootReducer(prevState, narrowAction(dispatch.action));
        if (nextState === undefined) throw new Error(VOID_REDUCER_ERROR);
        // replaceReducer может заменить root state без вызова storage reducer.
        // Такой replacement все равно должен пройти commit владельца default state.
        if (nextState !== prevState && dispatch.touched.size === 0) {
          dispatch.touched.add(pluginRegistry.defaultStorageKind);
        }
        dispatch.nextState = nextState as RootState;
      }

      runDispatchHooks("afterReduce", dispatch);
      runDispatchHooks("beforeCommit", dispatch);
      bucketRuntime.commit(dispatch);
      state = dispatch.nextState as MachinesState<S>;
      /* v8 ignore next */
      if (IS_DEV) deepFreeze(state);
      runDispatchHooks("beforeSubscribers", dispatch);
      bucketRuntime.runReactions(dispatch.action, dispatch);
      invokeSubscribers(prevState, state, narrowAction(dispatch.action));
      return narrowAction(dispatch.action);
    };

    const middlewareList = opts?.middleware;
    const wrappedTransition = (() => {
      if (!middlewareList?.length) return coreTransition;

      const api: MiddlewareApi<MachinesState<S>, RuntimeEvents, RuntimeMeta> = {
        getState,
        transition: (action) => transition(action),
        replaceReducer,
        onTransition,
        condition: (predicate) =>
          bucketRuntime.condition(predicate as (action: Action) => boolean),
      };
      return compose(...middlewareList.map((middleware) => middleware(api)))(coreTransition);
    })();

    if (opts?.snapshot) {
      state = snapshotRuntime.hydrate(opts.snapshot, "replace", "init", state, "opts.snapshot").nextState;
    }

    /* v8 ignore next */
    if (IS_DEV) deepFreeze(state);

    function transition(action: RuntimeAction, options?: unknown): RuntimeAction {
      if (transitionGuardPhase) throwTransitionGuardError(transitionGuardPhase);

      assertUserAction(action);
      const widened = widenAction(action);
      const dispatch = createDispatch(widened, options);
      const prepareOutcome = bucketRuntime.prepareAction(widened, options, dispatch);
      if (prepareOutcome.type === "drop") return action;
      setCurrentAction(dispatch, prepareOutcome.action);

      const parentDispatch = activeDispatch;
      activeDispatch = dispatch;
      let committed: RuntimeAction;
      try {
        committed = wrappedTransition(narrowAction(prepareOutcome.action));
      } finally {
        activeDispatch = parentDispatch;
      }

      if (dispatch.outcome.type === "drop") return narrowAction(dispatch.outcome.action);
      if (!dispatch.nextCalled) return committed;

      runDispatchHooks("beforeEffects", dispatch);
      bucketRuntime.runEffects(dispatch);
      runDispatchHooks("afterEffects", dispatch);

      return narrowAction(dispatch.action);
    }

    // === Public manager ======================================================

    const manager: IMachineManager<S, RuntimeEvents, RuntimeMeta, Plugins> = {
      getState,
      getSnapshot: () =>
        ({
          schemaVersion: opts?.schemaVersion,
          machines: { ...state },
        }) as MachineManagerRuntimeSnapshot<S>,
      getHydratedState: (snapshot, { strategy = "merge", baseState = state } = {}) =>
        snapshotRuntime.hydrate(snapshot, strategy, "preview", baseState, "hydrate").nextState,
      hydrate(snapshot: MachineManagerSnapshot<S>, { strategy = "merge" } = {}) {
        const prevState = state;
        const result = snapshotRuntime.hydrate(snapshot, strategy, "commit", prevState, "hydrate");
        if (!result.changed) return;
        state = result.nextState;
        /* v8 ignore next */
        if (IS_DEV) deepFreeze(state);
        invokeSubscribers(prevState, state, { type: HYDRATE_ACTION_TYPE, payload: { strategy, snapshot } });
      },
      dehydrate: ((options: unknown) =>
        snapshotRuntime.dehydrate(options as Parameters<typeof snapshotRuntime.dehydrate>[0])) as IMachineManager<
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
