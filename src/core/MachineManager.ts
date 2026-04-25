import { IMachineManager, MachineDependencies, MachineEvents } from "./interfaces";
import { CreateMachine } from "./Machine";
import { AnyEvent, AnyRecord, MachineConfig, MachinesState, MachineStore, Middleware, StateType, TransitionSubscriber } from "./types";
import { compose, deepFreeze, IS_DEV, VOID_REDUCER_ERROR, VOID_REDUCER_MIDDLEWARE_MARKER } from "./utils";

const supportsVoidReducer = (middleware: unknown) =>
  Boolean((middleware as Record<string, unknown>)[VOID_REDUCER_MIDDLEWARE_MARKER]);

type RuntimeConfig<P extends AnyEvent> = MachineConfig<Record<string, unknown>, AnyRecord, P, AnyRecord>;
type RuntimeState = StateType<Record<string, unknown>, AnyRecord>;

export const MachineManager = <S extends MachineStore, P extends AnyEvent = MachineEvents<S>>(
  config: S,
  opts?: {
    onError?: (err: unknown) => void;
    middleware?: Middleware<MachinesState<S>, P>[];
  },
): IMachineManager<S, P> => {
  let deps = {} as MachineDependencies<S>;
  let subs: Array<TransitionSubscriber<S, P>> = [];
  let transition: (_action: P) => P;
  const allowVoidReducer = Boolean(opts?.middleware?.some(supportsVoidReducer));

  const machines = Object.keys(config).reduce(
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

  let state = Object.keys(config).reduce((acc, name) => {
    return {
      ...acc,
      [name]: {
        state: config[name].initialState,
        context: config[name].initialContext,
      },
    };
  }, {} as MachinesState<S>);

  /* v8 ignore next */
  if (IS_DEV) deepFreeze(state);

  let rootReducer = (prevState: MachinesState<S>, action: P) => {
    const newState: Partial<MachinesState<S>> = {};

    for (const name of Object.keys(machines) as Array<keyof S>) {
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

  const onTransition = (cb: TransitionSubscriber<S, P>) => {
    subs.push(cb);
    return () => {
      subs = subs.filter((c) => c !== cb);
    };
  };

  const invokeSubscribers = (prevState: MachinesState<S>, currentState: MachinesState<S>, action: P) => {
    subs.forEach((s) => s(prevState, currentState, action));
  };

  const replaceReducer = (
    cb: (
      reducer: (state: MachinesState<S>, action: P) => MachinesState<S>,
    ) => (state: MachinesState<S>, action: P) => MachinesState<S>,
  ) => {
    rootReducer = cb(rootReducer);
  };

  const _transition = (action: P) => {
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
    for (const name of Object.keys(machines) as Array<keyof S>) {
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

  return {
    getState,
    transition,
    setDependencies,
    onTransition,
    replaceReducer,
  };
};
