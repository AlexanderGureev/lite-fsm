// Type-only API для createMachine. Runtime реализация и публичный value экспортируются
// из createMachine.ts; здесь живут все type aliases вокруг inference: input/result форм,
// захвата literal persistence, валидации MachineRuntimeExtension и storage-specific overload'ов.

import type {
  AnyEvent,
  AnyRecord,
  ActorDehydrateHook,
  ActorHydrateHook,
  ActorPersistence,
  CFG,
  DefaultActorSnapshot,
  EffectStateName,
  MachineConfig,
  MachineEffect,
  ManagerAction,
  MachineReducerInputState,
  MachineReducerState,
  MachineRuntimeExtension,
  StateName,
  StateType,
  TransitionNextState,
  WILDCARD,
} from "./types";

// === Дефолтный снимок =======================================================
//
// Если cfg.dehydrate не задан, Snapshot = дефолтный снимок, зависящий от
// типа машины (actor / domain). Snapshot не выводится через посредника `M` —
// иначе TS вынужденно выводит `M` со всеми полями cfg, что даёт дублирование
// `config: C & C` в hover. Сейчас Snapshot инферится напрямую из cfg.dehydrate
// через contextual `MachineConfig.dehydrate: (...args) => Snapshot`.

type HasLiteralInit<C extends object> = string extends keyof C ? false : "__INIT" extends keyof C ? true : false;

type DefaultSnapshotForConfig<C extends object, T extends AnyRecord> =
  HasLiteralInit<C> extends true ? DefaultActorSnapshot<C, T> : StateType<C, T>;

// === Захват literal persistence ==============================================

type CapturedPersistence = ActorPersistence | undefined;
type WithCapturedPersistence<Persistence> = [Persistence] extends [undefined] ? {} : { persistence: Persistence };

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type CoreCreateMachineResult<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord,
  Snapshot,
  Persistence,
> =
  HasLiteralInit<C> extends true
    ? Prettify<MachineConfig<C, T, P, D, Snapshot> & WithCapturedPersistence<Persistence>>
    : MachineConfig<C, T, P, D, Snapshot>;

// === Public API =============================================================

// Два разных union-а ключей CFG для DX-completions:
// - `ConfigKeys` параметризует `[state in K]` mapped type — литералы отсюда TS
//   предлагает в completions как имена source state. `"__INIT"` нужен здесь,
//   чтобы подсказывать spawn-edge даже когда `C` ещё не выведен.
// - `ConfigTargetStates` параметризует `TransitionMap` (target values).
//   `"__INIT"` сюда добавлять НЕЛЬЗЯ: TS перебирает строковые литералы из
//   выражения типа и предлагает их в completions, не учитывая
//   `Exclude<..., "__INIT">` внутри `ActorTransitionTarget`. Для actor template
//   `__INIT` всё равно попадёт сюда через `StateName<C>` после inference, но
//   это происходит на уровне типов, а не литералов из выражения.
export type ConfigKeys<C extends object> = StateName<C> | WILDCARD | "__INIT";
export type ConfigTargetStates<C extends object> = StateName<C> | WILDCARD;

type MachineBaseInput<C extends object, T extends AnyRecord, P extends AnyEvent, D extends AnyRecord, Snapshot> = Pick<
  MachineConfig<C, T, P, D, Snapshot>,
  "storage" | "config" | "initialState" | "initialContext" | "reducer" | "effects"
>;

type ActorSnapshotHooks<C extends object, T extends AnyRecord, Snapshot> = {
  hydrate?: ActorHydrateHook<C, T, Snapshot>;
  dehydrate?: ActorDehydrateHook<C, T, Snapshot>;
};

type ActorPersistenceInput<C extends object, T extends AnyRecord, Snapshot> = {
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

export type CoreCreateMachineInput<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord,
  Snapshot,
  Persistence,
> =
  HasLiteralInit<C> extends true
    ? MachineBaseInput<C, T, P, D, Snapshot> &
        ActorPersistenceInput<C, T, Snapshot> & { persistence?: Persistence | ActorPersistence }
    : MachineConfig<C, T, P, D, Snapshot>;

type ExtensionWithStorage<Extensions extends MachineRuntimeExtension> =
  Extensions extends unknown
    ? "storage" extends keyof Extensions
      ? NonNullable<Extensions["storage"]> extends string
        ? Extensions & { readonly storage: NonNullable<Extensions["storage"]> }
        : never
      : never
    : never;

type ExtensionStorageKind<Extension extends MachineRuntimeExtension> =
  "storage" extends keyof Extension ? NonNullable<Extension["storage"]> & string : never;

type ExtensionStorageValues<Extensions extends MachineRuntimeExtension> =
  Extensions extends unknown ? ExtensionStorageKind<Extensions> : never;

type ExtensionForStorage<Extensions extends MachineRuntimeExtension, Storage extends string> =
  Extensions extends unknown ? (ExtensionStorageKind<Extensions> extends Storage ? Extensions : never) : never;

type ExtensionInput<Extension extends MachineRuntimeExtension> =
  "input" extends keyof Extension
    ? NonNullable<Extension["input"]> extends infer Input
      ? Input extends object
        ? Input
        : {}
      : {}
    : {};

type ExtensionInternalEvents<Extension extends MachineRuntimeExtension> =
  "internalEvents" extends keyof Extension
    ? NonNullable<Extension["internalEvents"]> extends infer Events
      ? Events extends AnyEvent
        ? Events
        : never
      : never
    : never;

type ExtensionReducerContext<Extension extends MachineRuntimeExtension> =
  "reducerContext" extends keyof Extension
    ? NonNullable<Extension["reducerContext"]> extends infer Context
      ? Context extends object
        ? Context
        : {}
      : {}
    : {};

type ExtensionEffectDeps<Extension extends MachineRuntimeExtension> =
  "effectDeps" extends keyof Extension
    ? NonNullable<Extension["effectDeps"]> extends infer Deps
      ? Deps extends AnyRecord
        ? Deps
        : {}
      : {}
    : {};

type ExtensionReactionDeps<Extension extends MachineRuntimeExtension> =
  "reactionDeps" extends keyof Extension
    ? NonNullable<Extension["reactionDeps"]> extends infer Deps
      ? Deps extends AnyRecord
        ? Deps
        : {}
      : {}
    : {};

type ExtensionResultMetadata<Extension extends MachineRuntimeExtension> =
  "resultMetadata" extends keyof Extension
    ? NonNullable<Extension["resultMetadata"]> extends infer Metadata
      ? Metadata extends object
        ? Metadata
        : {}
      : {}
    : {};

type ExtensionPublicState<Extension extends MachineRuntimeExtension> =
  "publicState" extends keyof Extension
    ? Extension["publicState"]
    : never;

type HasExtensionResultMetadata<Extension extends MachineRuntimeExtension> =
  "resultMetadata" extends keyof Extension ? true : false;

type HasExtensionPublicState<Extension extends MachineRuntimeExtension> =
  "publicState" extends keyof Extension ? true : false;

type HasExtensionEffectDeps<Extension extends MachineRuntimeExtension> =
  "effectDeps" extends keyof Extension ? true : false;

type HasExtensionReactionDeps<Extension extends MachineRuntimeExtension> =
  "reactionDeps" extends keyof Extension ? true : false;

type ExtensionDefaultContext<Extension extends MachineRuntimeExtension> =
  ExtensionInput<Extension> extends { initialContext: infer Context extends AnyRecord } ? Context : AnyRecord;

type ExtensionContext<T extends AnyRecord, Extension extends MachineRuntimeExtension> =
  ExtensionInput<Extension> extends { initialContext: infer Context extends AnyRecord } ? Context : T;

type ExtensionEvents<P extends AnyEvent, Extension extends MachineRuntimeExtension> =
  P | ExtensionInternalEvents<Extension>;

type ExtensionInvocationDeps<D extends AnyRecord, Extension extends MachineRuntimeExtension> =
  D & ExtensionEffectDeps<Extension> & ExtensionReactionDeps<Extension>;

type ExtensionReducer<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  Extension extends MachineRuntimeExtension,
> = (
  state: MachineReducerInputState<C, T>,
  payload: P,
  meta: { nextState: TransitionNextState<C>; config: C } & ExtensionReducerContext<Extension>,
) => MachineReducerState<C, T> | void;

type ExtensionEffects<
  C extends object,
  P extends AnyEvent,
  D extends AnyRecord,
> = {
  [key in EffectStateName<C>]?: MachineEffect<key, C, P, D>;
};

type ExtensionFallbackInput<
  Input extends object,
  Key extends string,
  Fallback extends object,
> = Key extends keyof Input ? {} : Fallback;

type ExtensionCreateMachineInput<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord,
  Snapshot,
  Persistence,
  Extension extends MachineRuntimeExtension,
  Input extends object = ExtensionInput<Extension>,
  Context extends AnyRecord = ExtensionContext<T, Extension>,
  Events extends AnyEvent = ExtensionEvents<P, Extension>,
  StorageKind extends string = ExtensionStorageKind<Extension>,
> = Omit<
  CoreCreateMachineInput<C, Context, P, D, Snapshot, Persistence>,
  "storage" | "config" | "initialContext" | "reducer" | "effects" | keyof Input
> & {
  storage: StorageKind;
  config: C & CFG<C, Events, ConfigKeys<C>, ConfigTargetStates<C>>;
} & ExtensionFallbackInput<Input, "initialContext", { initialContext: Context }> &
  ExtensionFallbackInput<Input, "reducer", { reducer?: ExtensionReducer<C, Context, ManagerAction<Events>, Extension> }> &
  ExtensionFallbackInput<Input, "effects", { effects?: ExtensionEffects<C, Events, ExtensionInvocationDeps<D, Extension>> }> &
  Input;

type ExtensionRuntimeMetadata<Extension extends MachineRuntimeExtension, P extends AnyEvent> = {
  readonly storage: ExtensionStorageKind<Extension>;
  readonly publicEvents: P;
} & (HasExtensionResultMetadata<Extension> extends true
  ? { readonly resultMetadata: ExtensionResultMetadata<Extension> }
  : {}) &
  (HasExtensionEffectDeps<Extension> extends true ? { readonly effectDeps: ExtensionEffectDeps<Extension> } : {}) &
  (HasExtensionReactionDeps<Extension> extends true ? { readonly reactionDeps: ExtensionReactionDeps<Extension> } : {}) &
  (HasExtensionPublicState<Extension> extends true ? { readonly publicState: ExtensionPublicState<Extension> } : {});

// Phantom markers: см. контракт «Phantom type-only keys» в types.ts. Эти поля
// никогда не существуют в runtime value, нужны только для inference в helper-типах
// `MachineRuntimeMetadata` / `MachineDeclaredDependencies`.
type RuntimeResultPhantom<Extension extends MachineRuntimeExtension, P extends AnyEvent, D extends AnyRecord> = {
  readonly __liteFsmRuntime?: ExtensionRuntimeMetadata<Extension, P>;
  readonly __liteFsmDependencies?: D;
};

type ExtensionCreateMachineResult<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord,
  Snapshot,
  Persistence,
  Extension extends MachineRuntimeExtension,
  Context extends AnyRecord = ExtensionContext<T, Extension>,
> = Prettify<
  Omit<
    CoreCreateMachineResult<C, Context, P, D, Snapshot, Persistence>,
    "storage" | keyof ExtensionInput<Extension>
  > & { storage: ExtensionStorageKind<Extension> } & ExtensionInput<Extension> &
    RuntimeResultPhantom<Extension, P, D>
>;

type InvalidMachineRuntimeExtensionKeys<Extensions extends MachineRuntimeExtension> =
  Extensions extends unknown ? Exclude<keyof Extensions, keyof MachineRuntimeExtension> : never;

type MissingMachineRuntimeExtensionStorageKeys<Extensions extends MachineRuntimeExtension> =
  Extensions extends unknown
    ? [keyof Extensions] extends [never]
      ? never
      : "storage" extends keyof Extensions
        ? never
        : keyof Extensions
    : never;

type ValidMachineRuntimeExtensions<Extensions extends MachineRuntimeExtension> = [
  InvalidMachineRuntimeExtensionKeys<Extensions> | MissingMachineRuntimeExtensionStorageKeys<Extensions>,
] extends [never]
  ? Extensions
  : never;

type CoreTypedCreateMachineFn<P extends AnyEvent = AnyEvent, D extends AnyRecord = {}> = <
  C extends CFG<C, P, ConfigKeys<C>, ConfigTargetStates<C>>,
  T extends AnyRecord,
  Snapshot = DefaultSnapshotForConfig<C, T>,
  Persistence extends CapturedPersistence = undefined,
>(
  cfg: CoreCreateMachineInput<C, T, P, D, Snapshot, Persistence>,
) => CoreCreateMachineResult<C, T, P, D, Snapshot, Persistence>;

// Bivariance trick: method shorthand в interface даёт bivariant параметры,
// indexed access снаружи распаковывает сигнатуру обратно в call signature.
// Вынесли в named interface, чтобы IDE-парсеры стабильно подсвечивали структуру.
interface ExtensionTypedCreateMachineFnHolder<
  P extends AnyEvent,
  D extends AnyRecord,
  Extensions extends MachineRuntimeExtension,
> {
  call<
    Storage extends ExtensionStorageValues<ExtensionWithStorage<Extensions>>,
    Extension extends ExtensionForStorage<ExtensionWithStorage<Extensions>, Storage> = ExtensionForStorage<
      ExtensionWithStorage<Extensions>,
      Storage
    >,
    C extends object = Record<string, never>,
    T extends AnyRecord = ExtensionDefaultContext<Extension>,
    Snapshot = DefaultSnapshotForConfig<C, ExtensionContext<T, Extension>>,
    Persistence extends CapturedPersistence = undefined,
  >(
    cfg: ExtensionCreateMachineInput<
      C,
      T,
      P,
      D,
      Snapshot,
      Persistence,
      Extension,
      ExtensionInput<Extension>,
      ExtensionContext<T, Extension>,
      ExtensionEvents<P, Extension>,
      Storage
    >,
  ): ExtensionCreateMachineResult<C, T, P, D, Snapshot, Persistence, Extension>;
}

type ExtensionTypedCreateMachineFn<
  P extends AnyEvent,
  D extends AnyRecord,
  Extensions extends MachineRuntimeExtension,
> = ExtensionTypedCreateMachineFnHolder<P, D, Extensions>["call"];

export type TypedCreateMachineFn<
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
  Extensions extends MachineRuntimeExtension = {},
> = [ValidMachineRuntimeExtensions<Extensions>] extends [never]
  ? never
  : [keyof ValidMachineRuntimeExtensions<Extensions>] extends [never]
    ? CoreTypedCreateMachineFn<P, D>
    : CoreTypedCreateMachineFn<P, D> &
        ExtensionTypedCreateMachineFn<P, D, ValidMachineRuntimeExtensions<Extensions>>;

type DirectCreateMachineFn = <
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
  C extends CFG<C, P, ConfigKeys<C>, ConfigTargetStates<C>> = Record<string, never>,
  T extends AnyRecord = {},
  Snapshot = DefaultSnapshotForConfig<C, T>,
  Persistence extends CapturedPersistence = undefined,
>(
  cfg: CoreCreateMachineInput<C, T, P, D, Snapshot, Persistence>,
) => CoreCreateMachineResult<C, T, P, D, Snapshot, Persistence>;

type AnyExtensionCreateMachineFn = {
  <
    P extends AnyEvent = AnyEvent,
    D extends AnyRecord = {},
    Extensions extends MachineRuntimeExtension = never,
    Storage extends ExtensionStorageValues<ExtensionWithStorage<Extensions>> = ExtensionStorageValues<
      ExtensionWithStorage<Extensions>
    >,
    Extension extends ExtensionForStorage<ExtensionWithStorage<Extensions>, Storage> = ExtensionForStorage<
      ExtensionWithStorage<Extensions>,
      Storage
    >,
    C extends object = Record<string, never>,
    T extends AnyRecord = ExtensionDefaultContext<Extension>,
    Snapshot = DefaultSnapshotForConfig<C, ExtensionContext<T, Extension>>,
    Persistence extends CapturedPersistence = undefined,
  >(
    cfg: ExtensionCreateMachineInput<C, T, P, D, Snapshot, Persistence, Extension, ExtensionInput<Extension>, ExtensionContext<T, Extension>, ExtensionEvents<P, Extension>, Storage>,
  ): ExtensionCreateMachineResult<C, T, P, D, Snapshot, Persistence, Extension>;
};

export type CreateMachineFn = DirectCreateMachineFn & AnyExtensionCreateMachineFn;
