export type SType = string | number | symbol;

export type WILDCARD = "*";
export type State<S extends SType> = Exclude<S, WILDCARD | number | symbol>;

export type AnyRecord = Record<string, unknown>;
export type AnyEvent = { type: string; payload?: unknown };
export type StateName<C extends object> = State<keyof C & SType>;

export type FSMEventMeta = {
  actorId?: string | string[];
  groupId?: string | string[];
  groupTag?: string | string[];
  senderActorId?: string;
  senderGroupId?: string;
  senderGroupTag?: string;
};

export type ManagerAction<P extends AnyEvent> = P & { meta?: FSMEventMeta };

export type ActorMeta = {
  actorId: string;
  groupId: string;
  groupTag: string;
};

export type Self = ActorMeta;

export type ActorTerminalState = "__RESOLVED" | "__REJECTED" | "__CANCELLED";
export type ActorSystemState = "__INIT" | ActorTerminalState;
export type ActorPublicState<C extends object> = Exclude<StateName<C>, ActorSystemState>;

export type DomainTransitionTarget<States extends SType> = State<States> | null;
export type ActorTransitionTarget<States extends SType> = Exclude<State<States>, "__INIT"> | ActorTerminalState | null;
type HasLiteralInit<C extends object> = string extends keyof C ? false : "__INIT" extends keyof C ? true : false;
export type TransitionTargetForConfig<C extends object, States extends SType> =
  HasLiteralInit<C> extends true ? ActorTransitionTarget<States> : DomainTransitionTarget<States>;
export type TransitionNextState<C extends object> =
  HasLiteralInit<C> extends true ? ActorPublicState<C> | ActorTerminalState : StateName<C>;

type TransitionMap<C extends object, States extends SType, P extends AnyEvent> = Partial<
  Record<P["type"], TransitionTargetForConfig<C, States>>
>;
type StrictTransitionMap<Root extends object, Edges, States extends SType, P extends AnyEvent> = TransitionMap<
  Root,
  States,
  P
> & {
  [Event in Exclude<keyof Edges, P["type"]>]: never;
};

// `K` — ключи в mapped type (попадают в completions как имена source state).
// `KTargets` — states для target value (не попадают как имена ключей). Разделение
// позволяет добавить `"__INIT"` в подсказку ключей, не засоряя completions для
// target значений (TS буквально перебирает литералы из выражения типа).
export type CFG<R extends object, P extends AnyEvent, K extends SType = keyof R & SType, KTargets extends SType = K> = {
  [state in K]?: state extends keyof R ? StrictTransitionMap<R, R[state], KTargets, P> : TransitionMap<R, KTargets, P>;
};

export type StateType<C extends object, T extends AnyRecord> = {
  context: T;
  state: StateName<C>;
};

export type MachineState<C extends object, T extends AnyRecord> = StateType<C, T>;
export type PublicActorSlice<C extends object, T extends AnyRecord> = {
  state: ActorPublicState<C>;
  context: T;
  meta: Readonly<ActorMeta>;
};
export type ActorPersistence = "runtime" | "snapshot";
export type ActorDataSlice<C extends object, T extends AnyRecord> = {
  state: ActorPublicState<C>;
  context: T;
};
export type DefaultActorSnapshot<C extends object, T extends AnyRecord> = ActorDataSlice<C, T>;
export type ActorSnapshotEntry<Snapshot> = {
  snapshot: Snapshot;
  meta: Readonly<ActorMeta>;
};
export type ActorHydrateHook<C extends object, T extends AnyRecord, Snapshot> = (
  prev: ActorDataSlice<C, T> | undefined,
  snapshot: Snapshot,
  meta: HydrateMeta,
) => ActorDataSlice<C, T>;
export type ActorDehydrateHook<C extends object, T extends AnyRecord, Snapshot> = (
  slice: ActorDataSlice<C, T>,
) => Snapshot;
export type ActorTemplateSnapshot<C extends object, T extends AnyRecord> = Record<
  string,
  ActorSnapshotEntry<DefaultActorSnapshot<C, T>>
>;
export type MachineReducerState<C extends object, T extends AnyRecord> =
  HasLiteralInit<C> extends true ? { state: ActorPublicState<C> | ActorTerminalState; context: T } : StateType<C, T>;
export type MachineReducerInputState<C extends object, T extends AnyRecord> =
  HasLiteralInit<C> extends true ? { state: StateName<C> | ActorTerminalState; context: T } : StateType<C, T>;

export type HydrateStrategy = "replace" | "merge";
export type HydrateOptions = { strategy?: HydrateStrategy };
export type HydratePreviewOptions<S extends MachineStore> = HydrateOptions & {
  baseState?: MachinesState<S>;
};
export type HydrateMeta = { strategy: HydrateStrategy };

export type Subscriber<C extends object, T extends AnyRecord, P extends AnyEvent = AnyEvent> = (
  prevState: StateType<C, T>,
  currentState: StateType<C, T>,
  action: P,
) => void;

export type Reducer<S, P extends AnyEvent = AnyEvent> = (state: S, action: P) => S;

export type UnknownMachineKeyContext = "hydrate" | "opts.snapshot";

export type HydrateAction<S extends MachineStore> = {
  type: "@@lite-fsm/HYDRATE";
  payload: {
    strategy: HydrateStrategy;
    snapshot: MachineManagerSnapshot<S>;
  };
};

export type ManagerCommitAction<S extends MachineStore, P extends AnyEvent = AnyEvent> = P | HydrateAction<S>;

export type MiddlewareApi<S, P extends AnyEvent = AnyEvent> = {
  getState: () => S;
  transition: (action: ManagerAction<P>) => ManagerAction<P>;
  replaceReducer: (cb: (reducer: Reducer<S, ManagerAction<P>>) => Reducer<S, ManagerAction<P>>) => void;
  onTransition: (
    cb: (prevState: S, currentState: S, action: ManagerCommitAction<MachineStore, AnyEvent>) => void,
  ) => () => void;
  condition: (predicate: (a: ManagerAction<P>) => boolean) => Promise<boolean>;
};

export type Middleware<S = unknown, P extends AnyEvent = AnyEvent> = (
  api: MiddlewareApi<S, P>,
) => (next: (action: ManagerAction<P>) => ManagerAction<P>) => (action: ManagerAction<P>) => ManagerAction<P>;

export type GenericMiddleware = <S, P extends AnyEvent>(
  api: MiddlewareApi<S, P>,
) => (next: (action: P) => P) => (action: P) => P;

export type VoidReducerMiddleware = GenericMiddleware & {
  __liteFsmAllowVoidReducer: true;
};

export type MachineReducer<C extends object, P extends AnyEvent, T extends AnyRecord> = (
  state: MachineReducerInputState<C, T>,
  payload: ManagerAction<P>,
  meta: { nextState: TransitionNextState<C>; config: C },
) => MachineReducerState<C, T> | void;

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

type PlainAction<P extends AnyEvent> = P & { meta?: never };

export type ActorTransition<P extends AnyEvent> = {
  (action: ManagerAction<P>): ManagerAction<P>;
  unscoped: (action: PlainAction<P>) => ManagerAction<P>;
  actor: (id: string | string[], action: PlainAction<P>) => ManagerAction<P>;
  group: (id: string | string[], action: PlainAction<P>) => ManagerAction<P>;
  tag: (id: string | string[], action: PlainAction<P>) => ManagerAction<P>;
};

export type DefaultDeps<
  N extends SType = WILDCARD,
  C extends object = Record<string, never>,
  P extends AnyEvent = AnyEvent,
> = {
  transition: (data: P) => P;
  action: ActionForState<C, N, P>;
  condition: (predicate: (a: P) => boolean) => Promise<boolean>;
};

export type ActorActionForState<C extends object, N extends SType, P extends AnyEvent> = ManagerAction<
  ActionForState<C, N, P>
>;

export type ActorDefaultDeps<N extends SType, C extends object, P extends AnyEvent> = Omit<
  DefaultDeps<N, C, P>,
  "action" | "transition" | "condition"
> & {
  transition: ActorTransition<P>;
  action: ActorActionForState<C, N, P>;
  condition: (predicate: (a: ManagerAction<P>) => boolean) => Promise<boolean>;
  self: Self;
};

export type MachineEffect<
  N extends SType = WILDCARD,
  C extends object = Record<string, never>,
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
> = (
  deps: D & (HasLiteralInit<C> extends true ? ActorDefaultDeps<N, C, P> : DefaultDeps<N, C, P>),
) => Promise<void> | void;

export type EffectStateName<C extends object> =
  HasLiteralInit<C> extends true ? ActorPublicState<C> | WILDCARD : StateName<C> | WILDCARD;

type BaseMachineConfig<C extends object, T extends AnyRecord, P extends AnyEvent, D extends AnyRecord> = {
  config: C;
  initialState: StateName<C>;
  initialContext: T;
  reducer?: MachineReducer<C, P, T>;
  effects?: {
    [key in EffectStateName<C>]?: MachineEffect<key, C, P, D>;
  };
};

type DomainPersistenceConfig<C extends object, T extends AnyRecord, Snapshot> = {
  hydrate?: (prev: StateType<C, T>, snapshot: Snapshot, meta: HydrateMeta) => StateType<C, T>;
  dehydrate?: (state: StateType<C, T>) => Snapshot;
};

type ActorSnapshotHooks<C extends object, T extends AnyRecord, Snapshot> = {
  hydrate?: ActorHydrateHook<C, T, Snapshot>;
  dehydrate?: ActorDehydrateHook<C, T, Snapshot>;
};

type ActorPersistenceConfig<C extends object, T extends AnyRecord, Snapshot> = {
  persistence?: ActorPersistence;
  groupTag?: string;
} & ActorSnapshotHooks<C, T, Snapshot> &
  (
    | {
        persistence?: "runtime";
        hydrate?: never;
        dehydrate?: never;
      }
    | { persistence: "snapshot" }
  );

export type MachineConfig<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord = {},
  Snapshot = HasLiteralInit<C> extends true ? DefaultActorSnapshot<C, T> : StateType<C, T>,
> = BaseMachineConfig<C, T, P, D> &
  (HasLiteralInit<C> extends true ? ActorPersistenceConfig<C, T, Snapshot> : DomainPersistenceConfig<C, T, Snapshot>);

type AnyMachineConfig = {
  config: object;
  initialState: string;
  initialContext: AnyRecord;
  groupTag?: string;
  persistence?: unknown;
  reducer?: unknown;
  hydrate?: unknown;
  dehydrate?: unknown;
  effects?: unknown;
};

export type MachineStore = Record<string, AnyMachineConfig>;

export type IsActorTemplate<M> = M extends { config: infer C extends object } ? HasLiteralInit<C> : false;

type ActorRuntimeRecord<C extends object, T extends AnyRecord> = Record<string, PublicActorSlice<C, T>>;

export type MachineSliceState<M> = M extends {
  config: infer C extends object;
  initialContext: infer T extends AnyRecord;
}
  ? IsActorTemplate<M> extends true
    ? ActorRuntimeRecord<C, T>
    : { state: StateName<C>; context: T }
  : never;

export type MachinesState<S extends MachineStore> = {
  [key in keyof S]: MachineSliceState<S[key]>;
};

export type MachineRuntimeSnapshot<C extends object, T extends AnyRecord> = StateType<C, T>;

type RuntimeSnapshotForShape<M, C extends object, T extends AnyRecord> =
  IsActorTemplate<M> extends true ? ActorRuntimeRecord<C, T> : MachineRuntimeSnapshot<C, T>;

type RuntimeSnapshotForConfigMatch<M, C extends object, T extends AnyRecord, P, D, Snapshot> = [
  P,
  D,
  Snapshot,
] extends [AnyEvent, AnyRecord, unknown]
  ? RuntimeSnapshotForShape<M, C, T>
  : never;

type RuntimeSnapshotForPlainShape<M> = M extends {
  config: infer C extends object;
  initialContext: infer T extends AnyRecord;
}
  ? RuntimeSnapshotForShape<M, C, T>
  : never;

export type MachineRuntimeSnapshotForMachine<M> =
  M extends MachineConfig<infer C, infer T, infer P, infer D, infer Snapshot>
    ? RuntimeSnapshotForConfigMatch<M, C, T, P, D, Snapshot>
    : RuntimeSnapshotForPlainShape<M>;

type SnapshotFromDehydrate<M> = M extends { dehydrate: (...args: any[]) => infer Snapshot } ? Snapshot : never;

type SnapshotFromActorHydrate<M> = M extends { hydrate: (prev: any, snapshot: infer Snapshot) => unknown }
  ? Snapshot
  : DefaultActorSnapshotForMachine<M>;

type DefaultActorSnapshotForMachine<M> = M extends {
  config: infer C extends object;
  initialContext: infer T extends AnyRecord;
}
  ? DefaultActorSnapshot<C, T>
  : never;

type ActorHookSnapshotValueForMachine<M> = M extends { dehydrate: (...args: any[]) => unknown }
  ? SnapshotFromDehydrate<M>
  : SnapshotFromActorHydrate<M>;

type ActorSnapshotValueForMachine<M> =
  M extends MachineConfig<infer _C, infer _T, infer _P, infer _D, infer Snapshot>
    ? Snapshot
    : ActorHookSnapshotValueForMachine<M>;

type ActorSnapshotForMachine<M> = M extends { persistence: "snapshot" }
  ? Record<string, ActorSnapshotEntry<ActorSnapshotValueForMachine<M>>>
  : never;

type SnapshotFromDomainHydrate<M> = M extends { hydrate: (prev: any, snapshot: infer Snapshot, meta: any) => unknown }
  ? Snapshot
  : MachineRuntimeSnapshotForMachine<M>;

type DomainSnapshotForMachine<M> = M extends { dehydrate: (...args: any[]) => unknown }
  ? SnapshotFromDehydrate<M>
  : SnapshotFromDomainHydrate<M>;

export type SnapshotForMachine<M> =
  IsActorTemplate<M> extends true ? ActorSnapshotForMachine<M> : DomainSnapshotForMachine<M>;

export type MachineSnapshot<M> = SnapshotForMachine<M>;

type ActorTemplateKey<S extends MachineStore> = {
  [K in keyof S]: IsActorTemplate<S[K]> extends true ? K : never;
}[keyof S];
type DomainKey<S extends MachineStore> = Exclude<keyof S, ActorTemplateKey<S>>;
export type SnapshotActorTemplateKey<S extends MachineStore> = {
  [K in keyof S]: IsActorTemplate<S[K]> extends true ? (S[K] extends { persistence: "snapshot" } ? K : never) : never;
}[keyof S];
export type SnapshotMachineKey<S extends MachineStore> = DomainKey<S> | SnapshotActorTemplateKey<S>;

export type MachineManagerSnapshot<S extends MachineStore> = {
  schemaVersion?: number;
  machines: Partial<{ [key in SnapshotMachineKey<S>]: SnapshotForMachine<S[key]> }>;
};

export type MachineManagerDehydratedSnapshot<
  S extends MachineStore,
  K extends SnapshotMachineKey<S> = SnapshotMachineKey<S>,
> = {
  schemaVersion?: number;
  machines: { [key in K]: SnapshotForMachine<S[key]> };
};

export type MachineManagerDehydrateResult<
  S extends MachineStore,
  Keys extends ReadonlyArray<SnapshotMachineKey<S>>,
> = number extends Keys["length"] ? MachineManagerSnapshot<S> : MachineManagerDehydratedSnapshot<S, Keys[number]>;

export type MachineManagerRuntimeSnapshot<S extends MachineStore> = {
  schemaVersion?: number;
  machines: { [key in keyof S]: MachineRuntimeSnapshotForMachine<S[key]> };
};

export type DehydrateOptions<S extends MachineStore, K extends SnapshotMachineKey<S> = SnapshotMachineKey<S>> = {
  machines?: ReadonlyArray<K>;
};

export type MachineManagerDehydrateFn<S extends MachineStore> = {
  (opts?: { machines?: undefined }): MachineManagerDehydratedSnapshot<S>;
  <const Keys extends ReadonlyArray<SnapshotMachineKey<S>>>(opts: {
    machines: Keys;
  }): MachineManagerDehydrateResult<S, Keys>;
  (opts: DehydrateOptions<S>): MachineManagerSnapshot<S>;
};

export type TransitionSubscriber<S extends MachineStore, P extends AnyEvent = AnyEvent> = (
  prevState: MachinesState<S>,
  currentState: MachinesState<S>,
  action: ManagerCommitAction<S, ManagerAction<P>>,
) => void;

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
type MachineConfigShape<C extends object> = { [key in keyof C]: object };

export type TypedCreateEffectFn<P extends AnyEvent = AnyEvent, D extends AnyRecord = {}> = <
  C extends MachineConfigShape<C> = Record<string, never>,
  N extends StateName<C> | WILDCARD = StateName<C> | WILDCARD,
>(opts: {
  effect: MachineEffect<N, C, P, D>;
  type?: EffectType;
  cancelFn?: (deps: Parameters<MachineEffect<N, C, P, D>>[0]) => () => boolean;
}) => MachineEffect<N, C, P, D>;
