// Standalone-машина: фабрика `Machine` (pure) и stateful `createMachine`/`defineMachine`.
// Actor template запрещён (только внутри `MachineManager`).

import { isActorTemplateConfig, resolveTransitionTarget } from "./actor";
import {
  AnyEvent,
  AnyRecord,
  DefaultActorSnapshot,
  DefaultDeps,
  MachineConfig,
  MachineEffect,
  Middleware,
  StateName,
  StateType,
  Subscriber,
  TransitionNextState,
} from "./types";
import {
  compose,
  deepFreeze,
  IS_DEV,
  LiteFsmError,
  supportsVoidReducer,
  VOID_REDUCER_ERROR,
  WILDCARD,
} from "./utils";

type RuntimeOptions = {
  allowVoidReducer?: () => boolean;
  // true только в `MachineManager`-е.
  allowActorTemplate?: boolean;
};

// Pure-фабрика без state и subscribers. Используется и `MachineManager`-ом для domain/actor templates.
export const CreateMachine = <
  C extends object,
  T extends AnyRecord,
  E extends string = string,
  P extends AnyEvent = AnyEvent & { type: E },
  D extends AnyRecord = {},
  Snapshot = string extends keyof C
    ? StateType<C, T>
    : "__INIT" extends keyof C
      ? DefaultActorSnapshot<C, T>
      : StateType<C, T>,
>(
  cfg: MachineConfig<C, T, P, D, Snapshot>,
  runtimeOptions: RuntimeOptions = {},
) => {
  const isActorTemplate = isActorTemplateConfig(cfg);

  return {
    config: cfg.config,
    transition: (s: StateType<C, T>, action: P): StateType<C, T> => {
      if (isActorTemplate && !runtimeOptions.allowActorTemplate) {
        throw new LiteFsmError(
          "LITE_FSM_STANDALONE_ACTOR_TEMPLATE",
          "[lite-fsm] actor templates can only be used inside MachineManager.",
        );
      }

      const graph = cfg.config as Record<string, Record<string, unknown> | undefined>;
      const nextState = resolveTransitionTarget(graph, s.state, action.type, isActorTemplate);

      if (nextState === undefined) return s;

      if (cfg.reducer) {
        const reducerNextState = (nextState || s.state) as TransitionNextState<C>;
        const next = cfg.reducer(s, action, { nextState: reducerNextState, config: cfg.config });

        if (next === undefined) {
          if (runtimeOptions.allowVoidReducer?.()) return s;
          throw new Error(VOID_REDUCER_ERROR);
        }

        return next as StateType<C, T>;
      }

      const payload = "payload" in action ? (action.payload as object) : {};

      return {
        state: (nextState || s.state) as StateName<C>,
        context: { ...s.context, ...payload } as T,
      };
    },
    invokeEffect: async (
      prevState: StateName<C>,
      currentState: StateName<C>,
      deps: D & DefaultDeps<StateName<C> | "*", C, P>,
    ) => {
      if (!cfg.effects) return;
      const effects = cfg.effects as Partial<Record<StateName<C> | "*", MachineEffect<any, C, P, D>>>;

      if (prevState !== currentState && effects[currentState]) {
        const effect = effects[currentState] as MachineEffect<StateName<C>, C, P, D> | undefined;
        await effect?.(deps as Parameters<MachineEffect<StateName<C>, C, P, D>>[0]);
      } else if (effects[WILDCARD]) {
        const effect = effects[WILDCARD] as MachineEffect<"*", C, P, D> | undefined;
        await effect?.(deps as Parameters<MachineEffect<"*", C, P, D>>[0]);
      }
    },
  };
};

export const createMachine = <
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord,
  Snapshot = string extends keyof C
    ? StateType<C, T>
    : "__INIT" extends keyof C
      ? DefaultActorSnapshot<C, T>
      : StateType<C, T>,
>(
  cfg: MachineConfig<C, T, P, D, Snapshot>,
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
  create: <
    C extends object,
    T extends AnyRecord,
    Snapshot = string extends keyof C
      ? StateType<C, T>
      : "__INIT" extends keyof C
        ? DefaultActorSnapshot<C, T>
        : StateType<C, T>,
  >(
    cfg: MachineConfig<C, T, P, D, Snapshot>,
  ) => createMachine(cfg, opts),
});
