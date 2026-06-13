import {
  AnyEvent,
  AnyRecord,
  CoreActionMeta,
  DefaultDeps,
  GenerateSpawnIdFn,
  MachineConfig,
  MachineManagerDehydrateFn,
  MachineManagerRuntimeSnapshot,
  MachineManagerSnapshot,
  MachineRuntimeMetadata,
  MachineStore,
  MachinesState,
  Reducer,
  StateName,
  StateType,
  TransitionSubscriber,
  HydrateOptions,
  HydratePreviewOptions,
  UnknownMachineKeyContext,
  Middleware,
  WILDCARD,
  ManagerAction,
} from "./types";
import type {
  LiteFsmPlugin,
  ManagerActionMeta,
  ManagerTransitionEvents,
  PluginManagerExtensions,
  PluginScopedDeps,
  ScopedPluginDepsOf,
} from "./plugin";

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void
  ? I
  : never;

type Prettify<T> = { [K in keyof T]: T[K] };

type MachineRuntimeOwnedDependencyKeys<E> =
  | (MachineRuntimeMetadata<E> extends { readonly effectDeps: infer Deps extends object } ? keyof Deps : never)
  | (MachineRuntimeMetadata<E> extends { readonly reactionDeps: infer Deps extends object } ? keyof Deps : never);

// Phantom marker: см. контракт «Phantom type-only keys» в types.ts.
type MachineDeclaredDependencies<E> = E extends { readonly __liteFsmDependencies?: infer D extends AnyRecord }
  ? D
  : never;

type ConfigDependencies<E> =
  MachineDeclaredDependencies<E> extends never
    ? E extends MachineConfig<infer C, infer T, infer P, infer D, infer Snapshot>
      ? [C, T, P, D, Snapshot] extends [object, AnyRecord, AnyEvent, AnyRecord, unknown]
        ? D
        : never
      : Omit<E, "storage"> extends MachineConfig<infer C, infer T, infer P, infer D, infer Snapshot>
        ? [C, T, P, D, Snapshot] extends [object, AnyRecord, AnyEvent, AnyRecord, unknown]
          ? D
          : never
        : never
    : MachineDeclaredDependencies<E>;

type StripScopedDependencies<D, Plugins extends readonly LiteFsmPlugin<any, any, any>[], E> = Prettify<
  Omit<
    D,
    | keyof DefaultDeps
    | "self"
    | keyof ScopedPluginDepsOf<D>
    | keyof PluginScopedDeps<Plugins>
    | MachineRuntimeOwnedDependencyKeys<E>
  >
>;

type EffectFunctionDependencies<F, Plugins extends readonly LiteFsmPlugin<any, any, any>[], E> =
  NonNullable<F> extends (deps: infer D) => unknown ? StripScopedDependencies<D, Plugins, E> : {};

type EffectDependencies<E, Plugins extends readonly LiteFsmPlugin<any, any, any>[]> = "effects" extends keyof E
  ? keyof NonNullable<E["effects"]> extends never
    ? {}
    : [ConfigDependencies<E>] extends [never]
      ? UnionToIntersection<
          {
            [key in keyof NonNullable<E["effects"]>]: EffectFunctionDependencies<
              NonNullable<E["effects"]>[key],
              Plugins,
              E
            >;
          }[keyof NonNullable<E["effects"]>]
        >
      : StripScopedDependencies<ConfigDependencies<E>, Plugins, E>
  : {};

export type MachineDependencies<
  S extends MachineStore,
  Plugins extends readonly LiteFsmPlugin<any, any, any>[] = readonly [],
> = keyof S extends never
  ? {}
  : Prettify<
      Omit<
        UnionToIntersection<
          {
            [key in keyof S]: EffectDependencies<S[key], Plugins>;
          }[keyof S]
        >,
        keyof PluginScopedDeps<Plugins>
      >
    >;

type EventFromReducer<M> = M extends { reducer: MachineConfig<infer C, infer T, infer P, infer D>["reducer"] }
  ? [C, T, D] extends [object, AnyRecord, AnyRecord]
    ? P
    : never
  : never;

type EventFromMachineConfig<M> =
  M extends MachineConfig<infer C, infer T, infer P, infer D>
    ? [C, T, D] extends [object, AnyRecord, AnyRecord]
      ? P
      : never
    : never;

type EventFromRuntimeMetadata<M> =
  MachineRuntimeMetadata<M> extends { readonly publicEvents: infer P extends AnyEvent } ? P : never;

export type MachineEvents<S extends MachineStore> = {
  [key in keyof S]: EventFromRuntimeMetadata<S[key]> extends never
    ? EventFromReducer<S[key]> extends never
      ? EventFromMachineConfig<S[key]> extends never
        ? AnyEvent
        : EventFromMachineConfig<S[key]>
      : EventFromReducer<S[key]>
    : EventFromRuntimeMetadata<S[key]>;
}[keyof S];

export type MachineManagerOptions<
  S extends MachineStore,
  P extends AnyEvent = MachineEvents<S>,
  Plugins extends readonly LiteFsmPlugin<any, any, any>[] = readonly [],
> = {
  onError?: (err: unknown) => void;
  middleware?: Middleware<MachinesState<S>, ManagerTransitionEvents<P, Plugins>, ManagerActionMeta<Plugins>>[];
  snapshot?: MachineManagerSnapshot<S>;
  schemaVersion?: number;
  onUnknownMachineKey?: (key: string, context: UnknownMachineKeyContext) => void;
  onSchemaVersionMismatch?: (incoming: number | undefined, current: number | undefined) => void;
  originId?: string;
  generateActorId?: GenerateSpawnIdFn<ManagerTransitionEvents<P, Plugins>>;
  generateGroupId?: GenerateSpawnIdFn<ManagerTransitionEvents<P, Plugins>>;
  plugins?: Plugins;
};

export type IMachine<
  C extends object,
  T extends AnyRecord = {},
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
> = {
  transition: (state: StateType<C, T>, action: P) => StateType<C, T>;
  invokeEffect: (
    prevState: StateName<C>,
    currentState: StateName<C>,
    deps: D & DefaultDeps<StateName<C> | WILDCARD, C, P>,
  ) => Promise<void>;
  config: C;
};

export type IMachineManager<
  S extends MachineStore,
  P extends AnyEvent = MachineEvents<S>,
  Meta extends object = CoreActionMeta,
  Plugins extends readonly LiteFsmPlugin<any, any, any>[] = readonly [],
> = {
  transition: (payload: ManagerAction<P, Meta>) => ManagerAction<P, Meta>;
  getState: () => MachinesState<S>;
  getSnapshot: () => MachineManagerRuntimeSnapshot<S>;
  getHydratedState: (snapshot: MachineManagerSnapshot<S>, opts?: HydratePreviewOptions<S>) => MachinesState<S>;
  hydrate: (snapshot: MachineManagerSnapshot<S>, opts?: HydrateOptions) => void;
  dehydrate: MachineManagerDehydrateFn<S>;
  onTransition: (cb: TransitionSubscriber<S, P, Meta>) => () => void;
  replaceReducer: (
    cb: (
      reducer: Reducer<MachinesState<S>, ManagerAction<P, Meta>>,
    ) => Reducer<MachinesState<S>, ManagerAction<P, Meta>>,
  ) => void;
  setDependencies: {
    (deps: MachineDependencies<S, Plugins>): void;
    (updater: (deps: MachineDependencies<S, Plugins>) => MachineDependencies<S, Plugins>): void;
  };
};

export type ManagerFromPlugins<
  S extends MachineStore,
  AppEvents extends AnyEvent,
  Plugins extends readonly LiteFsmPlugin<any, any, any>[],
> = IMachineManager<S, ManagerTransitionEvents<AppEvents, Plugins>, ManagerActionMeta<Plugins>, Plugins> &
  PluginManagerExtensions<Plugins, S>;
