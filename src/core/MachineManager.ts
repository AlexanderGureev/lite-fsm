import { IMachineManager, MachineDependencies, MachineEvents, MachineManagerOptions } from "./interfaces";
import { CreateMachine } from "./Machine";
import {
  AnyEvent,
  AnyRecord,
  DehydrateOptions,
  HydratePreviewOptions,
  HydrateStrategy,
  MachineConfig,
  MachineManagerRuntimeSnapshot,
  MachineManagerSnapshot,
  MachinesState,
  MachineStore,
  ManagerCommitAction,
  Middleware,
  StateType,
  TransitionSubscriber,
  UnknownMachineKeyContext,
} from "./types";
import {
  compose,
  deepFreeze,
  HYDRATE_ACTION_TYPE,
  IS_DEV,
  isSystemAction,
  VOID_REDUCER_ERROR,
  VOID_REDUCER_MIDDLEWARE_MARKER,
} from "./utils";

const supportsVoidReducer = (middleware: unknown) =>
  typeof middleware === "function" && VOID_REDUCER_MIDDLEWARE_MARKER in middleware;

type RuntimeConfig<P extends AnyEvent> = MachineConfig<Record<string, unknown>, AnyRecord, P, AnyRecord>;
type RuntimeState = StateType<Record<string, unknown>, AnyRecord>;
type SnapshotEnvelope = { schemaVersion?: number; machines: Record<string, unknown> };
type MachineKey<S extends MachineStore> = Extract<keyof S, string>;
type ApplySnapshotOptions = { notifySchemaMismatch?: boolean; notifyUnknownMachineKey?: boolean };

const hasOwn = <T extends object>(obj: T, key: PropertyKey): key is keyof T =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const assertSnapshotEnvelope = (snapshot: unknown): SnapshotEnvelope => {
  if (!isObjectRecord(snapshot)) {
    throw new Error("[lite-fsm] hydrate: snapshot must be an object envelope.");
  }

  const machines = snapshot.machines;

  if (!isObjectRecord(machines)) {
    throw new Error("[lite-fsm] hydrate: snapshot.machines must be an object.");
  }

  return {
    schemaVersion: typeof snapshot.schemaVersion === "number" ? snapshot.schemaVersion : undefined,
    machines,
  };
};

const assertUserAction = (action: AnyEvent) => {
  if (isSystemAction(action)) {
    throw new Error(`[lite-fsm] reserved system action '${action.type}' cannot be dispatched.`);
  }
};

export const MachineManager = <S extends MachineStore, P extends AnyEvent = MachineEvents<S>>(
  config: S,
  opts?: MachineManagerOptions<S, P>,
): IMachineManager<S, P> => {
  let deps = {} as MachineDependencies<S>;
  let subs: Array<TransitionSubscriber<S, P>> = [];
  let transition: (_action: P) => P;
  const allowVoidReducer = Boolean(opts?.middleware?.some(supportsVoidReducer));
  const schemaVersion = opts?.schemaVersion;
  const machineKeys = Object.keys(config) as Array<MachineKey<S>>;

  const machines = machineKeys.reduce(
    (acc, name) => {
      return {
        ...acc,
        [name]: CreateMachine(config[name] as RuntimeConfig<P>, { allowVoidReducer: () => allowVoidReducer }),
      };
    },
    {} as {
      [key in keyof S]: ReturnType<typeof CreateMachine<Record<string, unknown>, AnyRecord, string, P, AnyRecord>>;
    },
  );

  let state = machineKeys.reduce((acc, name) => {
    return {
      ...acc,
      [name]: {
        state: config[name].initialState,
        context: config[name].initialContext,
      },
    };
  }, {} as MachinesState<S>);

  let rootReducer = (prevState: MachinesState<S>, action: P) => {
    const newState: Partial<MachinesState<S>> = {};

    for (const name of machineKeys) {
      const m = machines[name];
      const s = prevState[name];
      const nextState = m.transition(s as RuntimeState, action);
      newState[name] = nextState as MachinesState<S>[typeof name];
    }

    return {
      ...prevState,
      ...newState,
    };
  };

  const getState = () => state;

  const getSnapshot = (): MachineManagerRuntimeSnapshot<S> => ({
    schemaVersion,
    machines: { ...state } as MachineManagerRuntimeSnapshot<S>["machines"],
  });

  const onTransition = (cb: TransitionSubscriber<S, P>) => {
    subs.push(cb);
    return () => {
      subs = subs.filter((c) => c !== cb);
    };
  };

  const invokeSubscribers = (
    prevState: MachinesState<S>,
    currentState: MachinesState<S>,
    action: ManagerCommitAction<S, P>,
  ) => {
    subs.forEach((s) => s(prevState, currentState, action));
  };

  const applySnapshot = (
    prev: MachinesState<S>,
    incoming: MachineManagerSnapshot<S>,
    strategy: HydrateStrategy,
    context: UnknownMachineKeyContext,
    applyOpts: ApplySnapshotOptions = {},
  ): MachinesState<S> => {
    const envelope = assertSnapshotEnvelope(incoming);
    const notifySchemaMismatch = applyOpts.notifySchemaMismatch ?? true;
    const notifyUnknownMachineKey = applyOpts.notifyUnknownMachineKey ?? true;

    if (notifySchemaMismatch && envelope.schemaVersion !== schemaVersion) {
      opts?.onSchemaVersionMismatch?.(envelope.schemaVersion, schemaVersion);
    }

    let next: MachinesState<S> | undefined;

    for (const name of Object.keys(envelope.machines)) {
      if (!hasOwn(config, name)) {
        /* v8 ignore next 3 */
        if (notifyUnknownMachineKey && IS_DEV) {
          console.warn(`[lite-fsm] hydrate: unknown machine key '${name}', skipped.`);
        }
        if (notifyUnknownMachineKey) {
          opts?.onUnknownMachineKey?.(name, context);
        }
        continue;
      }

      const key = name as MachineKey<S>;
      const prevSlice = prev[key];
      const incomingSlice = envelope.machines[name];
      const hydrateHook = config[key].hydrate as
        | ((prev: MachinesState<S>[typeof key], snapshot: unknown, meta: { strategy: HydrateStrategy }) => MachinesState<S>[typeof key])
        | undefined;
      const nextSlice = hydrateHook ? hydrateHook(prevSlice, incomingSlice, { strategy }) : incomingSlice;

      if (nextSlice === prevSlice) continue;

      next = next ?? { ...prev };
      next[key] = nextSlice as MachinesState<S>[typeof key];
    }

    return next ?? prev;
  };

  const getHydratedState = (
    snapshot: MachineManagerSnapshot<S>,
    { strategy = "merge", baseState = state }: HydratePreviewOptions<S> = {},
  ) =>
    applySnapshot(baseState, snapshot, strategy, "hydrate", {
      notifySchemaMismatch: false,
      notifyUnknownMachineKey: false,
    });

  if (opts?.snapshot) {
    state = applySnapshot(state, opts.snapshot, "replace", "opts.snapshot");
  }

  /* v8 ignore next */
  if (IS_DEV) deepFreeze(state);

  const replaceReducer = (
    cb: (
      reducer: (state: MachinesState<S>, action: P) => MachinesState<S>,
    ) => (state: MachinesState<S>, action: P) => MachinesState<S>,
  ) => {
    rootReducer = cb(rootReducer);
  };

  const _transition = (action: P) => {
    assertUserAction(action);

    const prevState = state;
    const nextState = rootReducer(prevState, action);

    if (nextState === undefined) {
      throw new Error(VOID_REDUCER_ERROR);
    }

    state = nextState;
    /* v8 ignore next */
    if (IS_DEV) deepFreeze(state);
    invokeSubscribers(prevState, state, action);

    return action;
  };

  const condition = (predicate: (a: P) => boolean) =>
    new Promise<boolean>((resolve, reject) => {
      const unsubscribe = onTransition((_prevState, _currentState, action) => {
        if (isSystemAction(action)) return;

        try {
          if (predicate(action)) {
            unsubscribe();
            resolve(true);
          }
        } catch (err) {
          unsubscribe();
          reject(err);
        }
      });
    });

  const invokeEffects = (prevState: MachinesState<S>, currentState: MachinesState<S>, action: P) => {
    for (const name of machineKeys) {
      const m = machines[name];
      const prev = prevState[name];
      const current = currentState[name];

      m.invokeEffect(prev.state, current.state, {
        ...(deps as AnyRecord),
        transition,
        action,
        condition,
      }).catch((err) => {
        opts?.onError?.(err);
      });
    }
  };

  const createWrappedTransition = (funcs?: Array<Middleware<MachinesState<S>, P>>): ((action: P) => P) => {
    if (!funcs?.length) return _transition;

    const f = funcs.map((m) =>
      m({
        getState,
        transition: (action: P) => transition(action),
        replaceReducer,
        onTransition,
        condition,
      }),
    );

    return compose(...f)(_transition);
  };

  const wrappedTransition = createWrappedTransition(opts?.middleware);

  transition = (action: P) => {
    assertUserAction(action);

    const prevState = state;
    const newAction = wrappedTransition(action);
    const currentState = state;
    invokeEffects(prevState, currentState, newAction);
    return newAction;
  };

  const setDependencies = (d: MachineDependencies<S> | ((deps: MachineDependencies<S>) => MachineDependencies<S>)) => {
    if (typeof d === "function") {
      deps = (d as (deps: MachineDependencies<S>) => MachineDependencies<S>)(deps as MachineDependencies<S>);
      return;
    }

    deps = d;
  };

  const hydrate = (snapshot: MachineManagerSnapshot<S>, { strategy = "merge" }: { strategy?: HydrateStrategy } = {}) => {
    const prevState = state;
    const nextState = applySnapshot(prevState, snapshot, strategy, "hydrate");

    if (nextState === prevState) return;

    state = nextState;
    /* v8 ignore next */
    if (IS_DEV) deepFreeze(state);
    invokeSubscribers(prevState, state, {
      type: HYDRATE_ACTION_TYPE,
      payload: { strategy, snapshot },
    });
  };

  const dehydrate = (dehydrateOpts?: DehydrateOptions<S>): MachineManagerSnapshot<S> => {
    const keys = dehydrateOpts?.machines ?? machineKeys;

    if (dehydrateOpts?.machines) {
      for (const key of dehydrateOpts.machines) {
        if (!hasOwn(config, key)) {
          throw new Error(`[lite-fsm] dehydrate: unknown machine key '${String(key)}'.`);
        }
      }
    }

    const dehydrated = {} as MachineManagerSnapshot<S>["machines"];

    for (const key of keys) {
      const hook = config[key].dehydrate as ((state: MachinesState<S>[typeof key]) => unknown) | undefined;
      dehydrated[key] = (hook ? hook(state[key]) : state[key]) as MachineManagerSnapshot<S>["machines"][typeof key];
    }

    return { schemaVersion, machines: dehydrated };
  };

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
