import {
  AnyEvent,
  AnyRecord,
  CFG,
  DefaultDeps,
  MachineConfig,
  MachineEffect,
  Middleware,
  StateName,
  StateType,
  Subscriber,
} from "./types";
import { compose, deepFreeze, IS_DEV, VOID_REDUCER_ERROR, VOID_REDUCER_MIDDLEWARE_MARKER, WILDCARD } from "./utils";

type RuntimeOptions = {
  allowVoidReducer?: () => boolean;
};

const supportsVoidReducer = (middleware: unknown) =>
  Boolean((middleware as Record<string, unknown>)[VOID_REDUCER_MIDDLEWARE_MARKER]);

export const CreateMachine = <
  C extends object,
  T extends AnyRecord,
  E extends string = string,
  P extends AnyEvent = AnyEvent & { type: E },
  D extends AnyRecord = {},
>(
  cfg: MachineConfig<C, T, P, D>,
  runtimeOptions: RuntimeOptions = {},
) => {
  return {
    config: cfg.config,
    transition: (s: StateType<C, T>, action: P): StateType<C, T> => {
      const graph = cfg.config as C & CFG<C, P, StateName<C> | "*">;
      const actionType = action.type as P["type"];
      const _next = graph[s.state]?.[actionType];
      const nextState = _next !== undefined ? _next : graph[WILDCARD]?.[actionType];

      if (nextState === undefined) return s;

      if (cfg.reducer) {
        const next = cfg.reducer(s, action, { nextState: nextState || s.state, config: cfg.config });

        if (next === undefined) {
          if (runtimeOptions.allowVoidReducer?.()) return s;
          throw new Error(VOID_REDUCER_ERROR);
        }

        return next;
      }

      const payload = "payload" in action ? (action.payload as object) : {};

      return {
        state: nextState || s.state,
        context: { ...s.context, ...payload } as T,
      };
    },
    invokeEffect: async (
      prevState: StateName<C>,
      currentState: StateName<C>,
      deps: D & DefaultDeps<StateName<C> | "*", C, P>,
    ) => {
      if (!cfg.effects) return;

      if (prevState !== currentState && cfg.effects[currentState]) {
        const effect = cfg.effects[currentState] as MachineEffect<StateName<C>, C, P, D> | undefined;
        await effect?.(deps as Parameters<MachineEffect<StateName<C>, C, P, D>>[0]);
      } else if (cfg.effects[WILDCARD]) {
        const effect = cfg.effects[WILDCARD] as MachineEffect<"*", C, P, D> | undefined;
        await effect?.(deps);
      }
    },
  };
};

export const createMachine = <
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord,
>(
  cfg: MachineConfig<C, T, P, D>,
  opts: {
    onError?: (err: unknown) => void;
    dependencies?: D;
  } = {},
) => {
  let transition: (_action: P) => P;
  let _middleware: Middleware<StateType<C, T>, P>[] = [];
  let allowVoidReducer = false;

  const syncVoidReducerSupport = (middleware?: Array<Middleware<StateType<C, T>, P>>) => {
    allowVoidReducer = Boolean(middleware?.some(supportsVoidReducer));
  };

  const machine = CreateMachine(cfg, { allowVoidReducer: () => allowVoidReducer });

  let subs: Array<Subscriber<C, T, P>> = [];

  let state: StateType<C, T> = {
    context: cfg.initialContext,
    state: cfg.initialState,
  };

  /* v8 ignore next */
  if (IS_DEV) deepFreeze(state);

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

  const createWrappedTransition = (funcs?: Array<Middleware<StateType<C, T>, P>>): ((action: P) => P) => {
    syncVoidReducerSupport(funcs);

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

  const getState = () => state;
  const addMiddleware = (...middleware: Middleware<StateType<C, T>, P>[]) => {
    _middleware = [..._middleware, ...middleware];
    wrappedTransition = createWrappedTransition(_middleware);
  };

  return { transition, getState, onTransition, addMiddleware };
};

export const defineMachine = <P extends AnyEvent = AnyEvent, D extends AnyRecord = {}>(
  opts: {
    onError?: (err: unknown) => void;
    dependencies?: D;
  } = {},
) => ({
  create: <C extends object, T extends AnyRecord>(cfg: MachineConfig<C, T, P, D>) =>
    createMachine(cfg, opts),
});
