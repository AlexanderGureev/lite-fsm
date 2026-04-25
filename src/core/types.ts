export type SType = string | number | symbol;

export type WILDCARD = "*";
export type State<S extends SType> = Exclude<S, WILDCARD | number | symbol>;

export type AnyRecord = Record<string, unknown>;
export type AnyEvent = { type: string; payload?: unknown };
export type StateName<C extends object> = State<keyof C & SType>;

type TransitionTarget<States extends SType> = State<States> | null;
type TransitionMap<States extends SType, P extends AnyEvent> = Partial<Record<P["type"], TransitionTarget<States>>>;
type StrictTransitionMap<Edges, States extends SType, P extends AnyEvent> = TransitionMap<States, P> & {
  [Event in Exclude<keyof Edges, P["type"]>]: never;
};

export type CFG<R extends object, P extends AnyEvent, K extends SType = keyof R & SType> = {
  [state in K]?: state extends keyof R ? StrictTransitionMap<R[state], K, P> : TransitionMap<K, P>;
};

export type StateType<C extends object, T extends AnyRecord> = {
  context: T;
  state: StateName<C>;
};

export type MachineState<C extends object, T extends AnyRecord> = StateType<C, T>;

export type Subscriber<C extends object, T extends AnyRecord, P extends AnyEvent = AnyEvent> = (
  prevState: StateType<C, T>,
  currentState: StateType<C, T>,
  action: P,
) => void;

export type Reducer<S, P extends AnyEvent = AnyEvent> = (state: S, action: P) => S;

export type MiddlewareApi<S, P extends AnyEvent = AnyEvent> = {
  getState: () => S;
  transition: (action: P) => P;
  replaceReducer: (cb: (reducer: Reducer<S, P>) => Reducer<S, P>) => void;
  onTransition: (cb: (prevState: S, currentState: S, action: P) => void) => () => void;
  condition: (predicate: (a: P) => boolean) => Promise<boolean>;
};

export type Middleware<S = unknown, P extends AnyEvent = AnyEvent> = (
  api: MiddlewareApi<S, P>,
) => (next: (action: P) => P) => (action: P) => P;

export type GenericMiddleware = <S, P extends AnyEvent>(
  api: MiddlewareApi<S, P>,
) => (next: (action: P) => P) => (action: P) => P;

export type VoidReducerMiddleware = GenericMiddleware & {
  __liteFsmAllowVoidReducer: true;
};

export type MachineReducer<C extends object, P extends AnyEvent, T extends AnyRecord> = (
  state: StateType<C, T>,
  payload: P,
  meta: { nextState: StateName<C>; config: C },
) => StateType<C, T> | void;

type EventKeysForTarget<Edges, Target extends SType> = {
  [Event in keyof Edges]: Edges[Event] extends Target ? Event : never;
}[keyof Edges];

export type IncomingEventTypes<C extends object, N extends SType> = {
  [Source in keyof C]: C[Source] extends object ? EventKeysForTarget<C[Source], N> : never;
}[keyof C] &
  string;

export type ActionForState<C extends object, N extends SType, P extends AnyEvent> = WILDCARD extends N
  ? P
  : Extract<P, { type: IncomingEventTypes<C, N> }>;

export type DefaultDeps<
  N extends SType = WILDCARD,
  C extends object = Record<string, never>,
  P extends AnyEvent = AnyEvent,
> = {
  transition: (data: P) => P;
  action: ActionForState<C, N, P>;
  condition: (predicate: (a: P) => boolean) => Promise<boolean>;
};

export type MachineEffect<
  N extends SType = WILDCARD,
  C extends object = Record<string, never>,
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
> = (deps: D & DefaultDeps<N, C, P>) => Promise<void> | void;

export type MachineConfig<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord = {},
> = {
  config: C;
  initialState: StateName<C>;
  initialContext: T;
  reducer?: MachineReducer<C, P, T>;
  effects?: {
    [key in StateName<C> | WILDCARD]?: MachineEffect<key, C, P, D>;
  };
};

type AnyMachineConfig = {
  config: object;
  initialState: string;
  initialContext: AnyRecord;
  reducer?: unknown;
  effects?: unknown;
};

export type MachineStore = Record<string, AnyMachineConfig>;

export type MachinesState<S extends MachineStore> = {
  [key in keyof S]: {
    state: StateName<S[key]["config"] & object>;
    context: S[key]["initialContext"];
  };
};

export type TransitionSubscriber<S extends MachineStore, P extends AnyEvent = AnyEvent> = (
  prevState: MachinesState<S>,
  currentState: MachinesState<S>,
  action: P,
) => void;

export type TypedCreateMachineFn<P extends AnyEvent = AnyEvent, D extends AnyRecord = {}> = <
  C extends object,
  T extends AnyRecord,
>(
  cfg: MachineConfig<C, T, P, D> & { config: C & CFG<C, P, StateName<C> | WILDCARD> },
) => MachineConfig<C, T, P, D>;

type IsAny<T> = 0 extends 1 & T ? true : false;
type NoPayload = { readonly __liteFsmNoPayload: never };

export type FSMEvent<Name extends string, Payload = NoPayload> = Name extends string
  ? IsAny<Payload> extends true
    ? { type: Name; payload: Payload }
    : [Payload] extends [NoPayload]
      ? { type: Name }
      : { type: Name; payload: Payload }
  : never;

export type TypedCreateReducerFn<P extends AnyEvent = AnyEvent> = <C extends object, T extends AnyRecord>(
  reducer: MachineReducer<C, P, T>,
) => MachineReducer<C, P, T>;

export type TypedCreateConfigFn<P extends AnyEvent = AnyEvent> = <C extends object>(
  cfg: C & CFG<C, P, StateName<C> | WILDCARD>,
) => C;

export type EffectType = "every" | "latest";

export type TypedCreateEffectFn<P extends AnyEvent = AnyEvent, D extends AnyRecord = {}> = <
  C extends object = Record<string, never>,
  N extends StateName<C> | WILDCARD = StateName<C> | WILDCARD,
>(opts: {
  effect: MachineEffect<N, C, P, D>;
  type?: EffectType;
  cancelFn?: (deps: Parameters<MachineEffect<N, C, P, D>>[0]) => () => boolean;
}) => MachineEffect<N, C, P, D>;
