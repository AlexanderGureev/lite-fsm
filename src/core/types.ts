/* eslint-disable @typescript-eslint/ban-types -- ok */
export type SType = string | number | symbol;

export type WILDCARD = "*";
export type State<S extends SType> = Exclude<S, WILDCARD | number | symbol>;

export type StateType<C extends CFG<any, any, any>, T extends Record<string, any>> = {
  context: T;
  state: State<keyof C>;
};

export type Subscriber<
  C extends CFG<any, any, any>,
  T extends Record<string, any>,
  P extends FSMEvent<any, any> = any,
> = (prevState: StateType<C, T>, currentState: StateType<C, T>, action: P) => void;

export type MachinesState<
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
> = {
  [key in keyof S]: {
    state: State<keyof S[key]["config"]>;
    context: S[key]["initialContext"];
  };
};

export type TransitionSubscriber<
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
  P extends FSMEvent<any, any> = any,
> = (prevState: MachinesState<S>, currentState: MachinesState<S>, action: P) => void;

export type Reducer<S, P extends FSMEvent<any, any> = any> = (state: S, action: P) => S;

export type MiddlewareApi<S, P extends FSMEvent<any, any> = any> = {
  getState: () => S;
  transition: (action: P) => P;
  replaceReducer: (cb: (reducer: Reducer<S, P>) => Reducer<S, P>) => void;
  onTransition: (cb: (prevState: S, currentState: S, action: P) => void) => () => void;
  condition: (predicate: (a: P) => boolean) => Promise<boolean>;
};

export type Middleware<S = any, P extends FSMEvent<any, any> = { type: any; payload?: any }> = (
  api: MiddlewareApi<S, P>,
) => (next: (action: P) => P) => (action: P) => P;

export type MachineReducer<C extends CFG<C, P>, P extends FSMEvent<any, any>, T extends Record<string, any>> = (
  state: { state: State<keyof C>; context: T },
  payload: P,
  meta: { nextState: State<keyof C>; config: C },
) => { state: State<keyof C>; context: T } | void;

type KeysWithValsOfType<T, V> = keyof { [P in keyof T as T[P] extends V ? P : never]: P };

type Parse<T, E> = { [K in keyof T]: KeysWithValsOfType<T[K], E> };

type GetEvents<T> = T[keyof T] extends string ? T[keyof T] : never;

export type DefaultDeps<
  N extends keyof C | WILDCARD = any,
  C extends CFG<C, P> = any,
  P extends FSMEvent<any, any> = any,
> = {
  transition: (data: P) => void;
  action: WILDCARD extends N
    ? P
    : // extends делаем специально внутри Extract иначе ts начинает сильно тормозить при попытке вывести AppState в useSelector
      Extract<P, { type: GetEvents<Parse<C, N>> extends never ? P["type"] : GetEvents<Parse<C, N>> }>;
  condition: (predicate: (a: P) => boolean) => Promise<boolean>;
};

export type MachineEffect<
  N extends keyof C | WILDCARD = any,
  C extends CFG<C, P> = any,
  P extends FSMEvent<any, any> = any,
  D extends Record<string, any> = {},
> = (deps: D & DefaultDeps<N, C, P>) => Promise<void> | void;

export type MachineConfig<
  C extends CFG<C, P, keyof C | WILDCARD>,
  T extends Record<string, any>,
  P extends FSMEvent<any, any>,
  D extends Record<string, any> = {},
> = {
  config: C;
  initialState: State<keyof C>;
  initialContext: T;
  reducer?: MachineReducer<C, P, T>;
  effects?: {
    [key in keyof C | WILDCARD]?: MachineEffect<key, C, P, D>;
  };
};

export type CFG<R, P extends FSMEvent<any, any>, K extends keyof R = keyof R> = {
  [state in K]?: {
    [event in P["type"]]?: State<K> | null;
  } & { [key in Exclude<keyof R[state], P["type"]>]: never };
};

export type TypedCreateMachineFn<P extends FSMEvent<any, any> = any, D extends Record<string, any> = any> = <
  C extends CFG<C, P, keyof C | WILDCARD>,
  T extends Record<string, any>,
>(
  cfg: MachineConfig<C, T, P, D>,
) => MachineConfig<C, T, P, D>;

export type FSMEvent<Name extends string, Payload = undefined> = Payload extends undefined
  ? { type: Name }
  : {
      type: Name;
      payload: Payload;
    };

export type TypedCreateReducerFn<P extends FSMEvent<any, any> = any> = <
  C extends CFG<C, P>,
  T extends Record<string, any>,
>(
  reducer: MachineReducer<C, P, T>,
) => MachineReducer<C, P, T>;

export type TypedCreateConfigFn<P extends FSMEvent<any, any> = any> = <
  C extends CFG<C, P, keyof C | WILDCARD>,
  T extends Record<string, any>,
>(
  cfg: MachineConfig<C, T, P, any>["config"],
) => MachineConfig<C, T, P, any>["config"];

export type EffectType = "every" | "latest";

export type TypedCreateEffectFn<P extends FSMEvent<any, any> = any, D extends Record<string, any> = any> = <
  C extends CFG<C, P> = any,
  N extends keyof C | WILDCARD = any,
>(opts: {
  effect: MachineEffect<N, C, P, D>;
  type?: EffectType;
  cancelFn?: (deps: Parameters<MachineEffect<N, C, P, D>>[0]) => () => boolean;
}) => MachineEffect<N, C, P, D>;
