/* eslint-disable @typescript-eslint/ban-types -- ok*/

import {
  CFG,
  DefaultDeps,
  FSMEvent,
  MachineConfig,
  Middleware,
  State,
  StateType,
  Subscriber,
  WILDCARD as WTYPE,
} from "./types";
import { compose, WILDCARD } from "./utils";

export const CreateMachine = <
  C extends CFG<C, P, keyof C | WTYPE>,
  T extends Record<string, any>,
  E extends string,
  P extends FSMEvent<E, any> = any,
  D extends Record<string, any> = {},
>(
  cfg: MachineConfig<C, T, P, D>,
) => {
  return {
    config: cfg.config,
    transition: (s: { state: State<keyof C>; context: T }, action: P) => {
      const _next = cfg.config[s.state]?.[action.type];
      const nextState = _next !== undefined ? _next : cfg.config[WILDCARD]?.[action.type];

      if (nextState === undefined) return s;

      if (cfg.reducer) {
        return cfg.reducer(s, action, { nextState: nextState || s.state, config: cfg.config });
      }

      const payload = "payload" in action ? action.payload : {};

      return {
        state: nextState || s.state,
        context: { ...s.context, ...payload },
      };
    },
    invokeEffect: async (prevState: State<keyof C>, currentState: State<keyof C>, deps: D & DefaultDeps<any, C, P>) => {
      if (!cfg.effects) return;

      if (prevState !== currentState && cfg.effects[currentState]) {
        await cfg.effects[currentState]?.(deps);
      } else if (cfg.effects[WILDCARD]) {
        await cfg.effects[WILDCARD]?.(deps);
      }
    },
  };
};

export const createMachine = <
  C extends CFG<C, P, keyof C | WTYPE>,
  T extends Record<string, any>,
  P extends FSMEvent<any, any>,
  D extends Record<string, any>,
>(
  cfg: MachineConfig<C, T, P, D>,
  opts: {
    onError?: (err: any) => void;
    dependencies?: D;
  } = {},
) => {
  const machine = CreateMachine(cfg);
  let transition: (_action: P) => P;
  let _middleware: Middleware<StateType<C, T>, P>[] = [];

  let subs: Array<Subscriber<C, T, P>> = [];

  let state: StateType<C, T> = {
    context: cfg.initialContext,
    state: cfg.initialState,
  };

  let rootReducer = (prevState: StateType<C, T>, action: P) => {
    const nextState = machine.transition(prevState, action)!;
    return nextState;
  };

  const replaceReducer = (
    cb: (
      reducer: (state: StateType<C, T>, action: P) => StateType<C, T>,
    ) => (state: StateType<C, T>, action: P) => StateType<C, T>,
  ) => {
    rootReducer = cb(rootReducer);
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

  const invokeEffects = (prevState: StateType<C, T>, currentState: StateType<C, T>, action: P) => {
    machine
      .invokeEffect(prevState.state, currentState.state, {
        ...(opts.dependencies as D),
        transition,
        action,
        condition,
      })
      .catch((err) => {
        opts?.onError?.(err);
      });
  };

  const onTransition = (cb: Subscriber<C, T, P>) => {
    subs.push(cb);
    return () => {
      subs = subs.filter((c) => c !== cb);
    };
  };

  const invokeSubscribers: Subscriber<C, T, P> = (prevState, currentState, action) => {
    subs.forEach((s) => s(prevState, currentState, action));
  };

  const _transition = (action: P) => {
    const prevState = state;
    state = rootReducer(prevState, action);
    invokeSubscribers(prevState, state, action);

    return action;
  };

  const createWrappedTransition = (funcs?: Array<Middleware<StateType<C, T>, P>>): ((action: P) => P) => {
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

  let wrappedTransition = createWrappedTransition(_middleware);

  transition = (action: P) => {
    const prevState = state;
    const newAction = wrappedTransition(action);
    const currentState = state;
    invokeEffects(prevState, currentState, newAction);
    return newAction;
  };

  const getState = () => ({ ...state });
  const addMiddleware = (...middleware: Middleware<StateType<C, T>, P>[]) => {
    _middleware = [..._middleware, ...middleware];
    wrappedTransition = createWrappedTransition(_middleware);
  };

  return { transition, getState, onTransition, addMiddleware };
};

export const defineMachine = <P extends FSMEvent<any, any> = any, D extends Record<string, any> = {}>(
  opts: {
    onError?: (err: any) => void;
    dependencies?: D;
  } = {},
) => ({
  create: <C extends CFG<C, P, keyof C | WTYPE>, T extends Record<string, any>>(cfg: MachineConfig<C, T, P, D>) =>
    createMachine(cfg, opts),
});

// type Events = FSMEvent<"DO_INIT"> | FSMEvent<"__DEBUG">;
// type Dependencies = {
//   services: {
//     logger: { log: typeof console.log };
//   };
// };

// const config = {
//   IDLE: {
//     DO_INIT: "READY",
//   },
//   READY: {},
// } as const;

// const initialContext = { a: 1 };

// const reducer: MachineReducer<typeof config, Events, typeof initialContext> = (s, action, opts) => {
//   return s;
// };

// const READY: MachineEffect<"READY", typeof config, Events, Dependencies> = async ({
//   action,
//   condition,
//   transition,
//   services,
// }) => {
//   action.type;
//   services.logger.log("test 123");
// };

// const m = defineMachine<Events, Dependencies>({
//   onError: () => {},
//   dependencies: {
//     services: {
//       logger: {
//         log: console.log,
//       },
//     },
//   },
// }).create({
//   config,
//   initialState: "IDLE",
//   initialContext,
//   reducer,
//   effects: {
//     READY,
//   },
// });

// // m.addMiddleware(immerMiddleware);

// m.onTransition((prev, next, action) => {
//   console.log("[on transition]", { prev, next, action });
// });
// m.transition({ type: "DO_INIT" });
