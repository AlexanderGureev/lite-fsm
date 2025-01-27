/* eslint-disable @typescript-eslint/ban-types -- ok */
import { IMachine } from "./interfaces";
import { CreateMachine } from "./Machine";
import { FSMEvent, MachineConfig, MachinesState, Middleware, TransitionSubscriber } from "./types";
import { compose } from "./utils";

export const MachineManager = <
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
  P extends FSMEvent<any, any> = any,
>(
  config: S,
  opts?: {
    onError?: (err: any) => void;
    middleware?: Middleware<MachinesState<S>, P>[];
  },
) => {
  let deps = {};
  let subs: Array<TransitionSubscriber<S>> = [];
  let transition = (_action: P): P => {
    throw new Error("transition called before initialization");
  };

  const machines = Object.keys(config).reduce(
    (acc, name) => {
      return {
        ...acc,
        [name]: CreateMachine(config[name]),
      };
    },
    {} as {
      [key in keyof S]: IMachine<any, any, any, any>;
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

  let rootReducer = (prevState: MachinesState<S>, action: P) => {
    const newState: {
      [key in keyof S]?: {
        state: keyof S[key]["config"];
        context: S[key]["initialContext"];
      };
    } = {};

    for (const name of Object.keys(machines) as Array<keyof S>) {
      const m = machines[name];
      const s = prevState[name];
      const nextState = m.transition(s, action);
      newState[name] = nextState;
    }

    return {
      ...prevState,
      ...newState,
    };
  };

  const getState = () => ({ ...state });

  const onTransition = (cb: TransitionSubscriber<S>) => {
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
    state = rootReducer(prevState, action);
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
        ...deps,
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

  const setDependencies = <D extends Record<string, any> = {}>(d: D | ((deps: D) => D)) => {
    deps = typeof d === "function" ? d(deps as D) : d;
  };

  return {
    getState,
    transition,
    setDependencies,
    onTransition,
    replaceReducer,
  };
};
