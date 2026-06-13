// Type-only API для createMachine. Runtime реализация и публичный value экспортируются
// из createMachine.ts; здесь живут все type aliases вокруг inference: input/result форм,
// захвата literal persistence, валидации internal storage extensions и storage-specific overload'ов.

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
  StateName,
  StateType,
  TransitionNextState,
  WILDCARD,
} from "./types";
import type { LiteFsmPlugin } from "./plugin";
import type { StorageTypingExtensionsForPluginSource } from "./pluginHelpers";
import type {
  StorageDependentField,
  StorageDependentTypeLambda,
  StorageMachineTypingExtension,
} from "./pluginStorageTypes";

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

type PluginSource = LiteFsmPlugin<any, any, any> | readonly LiteFsmPlugin<any, any, any>[];

type ExtensionWithStorage<Extensions extends StorageMachineTypingExtension> =
  Extensions extends unknown
    ? "storage" extends keyof Extensions
      ? NonNullable<Extensions["storage"]> extends string
        ? Extensions & { readonly storage: NonNullable<Extensions["storage"]> }
        : never
      : never
    : never;

type ExtensionStorageKind<Extension extends StorageMachineTypingExtension> =
  "storage" extends keyof Extension ? NonNullable<Extension["storage"]> & string : never;

type ExtensionStorageValues<Extensions extends StorageMachineTypingExtension> =
  Extensions extends unknown ? ExtensionStorageKind<Extensions> : never;

type ExtensionForStorage<Extensions extends StorageMachineTypingExtension, Storage extends string> =
  Extensions extends unknown ? (ExtensionStorageKind<Extensions> extends Storage ? Extensions : never) : never;

type ExtensionDeclaredInput<Extension extends StorageMachineTypingExtension> =
  "input" extends keyof Extension
    ? NonNullable<Extension["input"]> extends infer Input
      ? Input extends object
        ? Input
        : {}
      : {}
    : {};

type ExtensionInput<Extension extends StorageMachineTypingExtension> = Omit<ExtensionDeclaredInput<Extension>, "storage">;

type ConcreteStorageInput<StorageKind extends string, Input extends object> = Prettify<
  { readonly storage: StorageKind } & Input
>;

type CreateMachineStructuralInputKey =
  | "storage"
  | "config"
  | "initialState"
  | "initialContext"
  | "reducer"
  | "effects"
  | "persistence"
  | "groupTag"
  | "hydrate"
  | "dehydrate";

type ExactExtensionInput<Input extends object, InputShape extends object, StorageInput extends object> = StorageInput & {
  readonly [Key in Exclude<keyof Input, keyof InputShape | CreateMachineStructuralInputKey>]-?: never;
};

type ResolvedExtensionInput<Input extends object, InputShape extends object> = {
  readonly [Key in keyof InputShape]: Key extends keyof Input ? Input[Key] : InputShape[Key];
};

type ExtensionCreateMachineCfg<Storage extends string> = {
  readonly storage: Storage;
  readonly config: object;
  readonly initialState: string;
  readonly initialContext: unknown;
};

type CfgIdentity<Cfg extends object> = { readonly [Key in keyof Cfg]: Cfg[Key] };

type CfgConfig<Cfg extends object> =
  Cfg extends { readonly config: infer Config extends object } ? Config : Record<string, never>;

type CfgContext<Cfg extends object, T extends AnyRecord, StorageInput extends object> =
  StorageInput extends { readonly initialContext: infer Context extends AnyRecord }
    ? Context
    : Cfg extends { readonly initialContext: infer Context extends AnyRecord }
      ? Context
      : T;

type ResolveDependentResultByName<Key extends PropertyKey, Value, ConcreteInput extends object> =
  Key extends keyof ConcreteInput
    ? ConcreteInput[Key]
    : Key extends `${string}Context${string}` | `${string}context${string}`
      ? ConcreteInput extends { readonly initialContext: infer Context }
        ? Context
        : Value
      : Key extends
            | `${string}Spawn${string}`
            | `${string}spawn${string}`
            | `${string}Payload${string}`
            | `${string}payload${string}`
        ? ConcreteInput extends { readonly spawnSchema: infer Spawn }
          ? Spawn
          : Value
        : Value;

type ResolveDependentResultValue<Key extends PropertyKey, Value, ConcreteInput extends object> =
  Value extends (...args: infer Args) => infer Result
    ? (...args: Args) => ResolveDependentResultByName<Key, Result, ConcreteInput>
    : ResolveDependentResultByName<Key, Value, ConcreteInput>;

type ResolveDependentResult<Result, ConcreteInput extends object> =
  Result extends object
    ? { readonly [Key in keyof Result]: ResolveDependentResultValue<Key, Result[Key], ConcreteInput> }
    : Result;

type ApplyStorageDependentLambda<Lambda extends StorageDependentTypeLambda, ConcreteInput extends object> = (
  Lambda & { readonly input: ConcreteInput }
)["type"];

type ApplyExtensionField<Field, ConcreteInput extends object> =
  Field extends StorageDependentField<infer Lambda>
    ? ApplyStorageDependentLambda<Lambda, ConcreteInput>
    : Field extends { <Input extends ConcreteInput>(input: Input): infer Result }
      ? ResolveDependentResult<Result, ConcreteInput>
      : Field extends (input: ConcreteInput) => infer Result
        ? ResolveDependentResult<Result, ConcreteInput>
        : Field;

type ExtensionObjectField<
  Extension extends StorageMachineTypingExtension,
  Key extends keyof StorageMachineTypingExtension,
  ConcreteInput extends object,
> =
  Key extends keyof Extension
    ? ApplyExtensionField<NonNullable<Extension[Key]>, ConcreteInput> extends infer Result
      ? Result extends object
        ? Result
        : {}
      : {}
    : {};

type ExtensionAnyRecordField<
  Extension extends StorageMachineTypingExtension,
  Key extends keyof StorageMachineTypingExtension,
  ConcreteInput extends object,
> =
  Key extends keyof Extension
    ? ApplyExtensionField<NonNullable<Extension[Key]>, ConcreteInput> extends infer Result
      ? Result extends AnyRecord
        ? Result
        : {}
      : {}
    : {};

type ExtensionInternalEvents<Extension extends StorageMachineTypingExtension> =
  "internalEvents" extends keyof Extension
    ? NonNullable<Extension["internalEvents"]> extends infer Events
      ? Events extends AnyEvent
        ? Events
        : never
      : never
    : never;

type ExtensionReducerContext<
  Extension extends StorageMachineTypingExtension,
  ConcreteInput extends object,
> = ExtensionObjectField<Extension, "reducerContext", ConcreteInput>;

type ExtensionEffectDeps<
  Extension extends StorageMachineTypingExtension,
  ConcreteInput extends object,
> = ExtensionAnyRecordField<Extension, "effectDeps", ConcreteInput>;

type ExtensionReactionDeps<
  Extension extends StorageMachineTypingExtension,
  ConcreteInput extends object,
> = ExtensionAnyRecordField<Extension, "reactionDeps", ConcreteInput>;

type ExtensionResultMetadata<
  Extension extends StorageMachineTypingExtension,
  ConcreteInput extends object,
> = ExtensionObjectField<Extension, "resultMetadata", ConcreteInput>;

type ExtensionPublicState<Extension extends StorageMachineTypingExtension, ConcreteInput extends object> =
  "publicState" extends keyof Extension
    ? ApplyExtensionField<NonNullable<Extension["publicState"]>, ConcreteInput>
    : never;

type HasExtensionResultMetadata<Extension extends StorageMachineTypingExtension> =
  "resultMetadata" extends keyof Extension ? true : false;

type HasExtensionPublicState<Extension extends StorageMachineTypingExtension> =
  "publicState" extends keyof Extension ? true : false;

type HasExtensionEffectDeps<Extension extends StorageMachineTypingExtension> =
  "effectDeps" extends keyof Extension ? true : false;

type HasExtensionReactionDeps<Extension extends StorageMachineTypingExtension> =
  "reactionDeps" extends keyof Extension ? true : false;

type ExtensionDefaultContext<Extension extends StorageMachineTypingExtension> =
  ExtensionInput<Extension> extends { initialContext: infer Context extends AnyRecord } ? Context : AnyRecord;

type ExtensionContext<T extends AnyRecord, Input extends object> =
  Input extends { initialContext: infer Context extends AnyRecord } ? Context : T;

type ExtensionEvents<P extends AnyEvent, Extension extends StorageMachineTypingExtension> =
  P | ExtensionInternalEvents<Extension>;

type ExtensionInvocationDeps<
  D extends AnyRecord,
  Extension extends StorageMachineTypingExtension,
  ConcreteInput extends object,
> = D & ExtensionEffectDeps<Extension, ConcreteInput> & ExtensionReactionDeps<Extension, ConcreteInput>;

type ExtensionReducer<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  Extension extends StorageMachineTypingExtension,
  ConcreteInput extends object,
> = (
  state: MachineReducerInputState<C, T>,
  payload: P,
  meta: { nextState: TransitionNextState<C>; config: C } & ExtensionReducerContext<Extension, ConcreteInput>,
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
  Cfg extends object,
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord,
  Snapshot,
  Persistence,
  Extension extends StorageMachineTypingExtension,
  InputShape extends object = ExtensionInput<Extension>,
  StorageInput extends object = ResolvedExtensionInput<Cfg, InputShape>,
  Context extends AnyRecord = ExtensionContext<T, StorageInput>,
  Events extends AnyEvent = ExtensionEvents<P, Extension>,
  StorageKind extends string = ExtensionStorageKind<Extension>,
> = CfgIdentity<Cfg> &
  Omit<
  CoreCreateMachineInput<C, Context, P, D, Snapshot, Persistence>,
  "storage" | "config" | "initialContext" | "reducer" | "effects" | keyof InputShape
> & {
  storage: StorageKind;
  config: C & CFG<C, Events, ConfigKeys<C>, ConfigTargetStates<C>>;
} & ExtensionFallbackInput<InputShape, "initialContext", { initialContext: Context }> &
  ExtensionFallbackInput<
    InputShape,
    "reducer",
    { reducer?: ExtensionReducer<C, Context, ManagerAction<Events>, Extension, ConcreteStorageInput<StorageKind, StorageInput>> }
  > &
  ExtensionFallbackInput<
    InputShape,
    "effects",
    {
      effects?: ExtensionEffects<
        C,
        Events,
        ExtensionInvocationDeps<D, Extension, ConcreteStorageInput<StorageKind, StorageInput>>
      >;
    }
  > &
  ExactExtensionInput<Cfg, InputShape, StorageInput>;

type ExtensionRuntimeMetadata<
  Extension extends StorageMachineTypingExtension,
  P extends AnyEvent,
  ConcreteInput extends object,
> = {
  readonly storage: ExtensionStorageKind<Extension>;
  readonly publicEvents: P;
} & (HasExtensionResultMetadata<Extension> extends true
  ? { readonly resultMetadata: ExtensionResultMetadata<Extension, ConcreteInput> }
  : {}) &
  (HasExtensionEffectDeps<Extension> extends true
    ? { readonly effectDeps: ExtensionEffectDeps<Extension, ConcreteInput> }
    : {}) &
  (HasExtensionReactionDeps<Extension> extends true
    ? { readonly reactionDeps: ExtensionReactionDeps<Extension, ConcreteInput> }
    : {}) &
  (HasExtensionPublicState<Extension> extends true
    ? { readonly publicState: ExtensionPublicState<Extension, ConcreteInput> }
    : {});

// Phantom markers: см. контракт «Phantom type-only keys» в types.ts. Эти поля
// никогда не существуют в runtime value, нужны только для inference в helper-типах
// `MachineRuntimeMetadata` / `MachineDeclaredDependencies`.
type RuntimeResultPhantom<
  Extension extends StorageMachineTypingExtension,
  P extends AnyEvent,
  D extends AnyRecord,
  ConcreteInput extends object,
> = {
  readonly __liteFsmRuntime?: ExtensionRuntimeMetadata<Extension, P, ConcreteInput>;
  readonly __liteFsmDependencies?: D;
};

type ExtensionCreateMachineResult<
  C extends object,
  T extends AnyRecord,
  P extends AnyEvent,
  D extends AnyRecord,
  Snapshot,
  Persistence,
  Extension extends StorageMachineTypingExtension,
  StorageInput extends object = ExtensionInput<Extension>,
  Context extends AnyRecord = ExtensionContext<T, StorageInput>,
> = Prettify<
  Omit<
    CoreCreateMachineResult<C, Context, P, D, Snapshot, Persistence>,
    "storage" | keyof ExtensionInput<Extension>
  > & { storage: ExtensionStorageKind<Extension> } & StorageInput &
    RuntimeResultPhantom<Extension, P, D, ConcreteStorageInput<ExtensionStorageKind<Extension>, StorageInput>>
>;

type InvalidStorageTypingExtensionKeys<Extensions extends StorageMachineTypingExtension> =
  Extensions extends unknown ? Exclude<keyof Extensions, keyof StorageMachineTypingExtension> : never;

type MissingStorageTypingExtensionKeys<Extensions extends StorageMachineTypingExtension> =
  Extensions extends unknown
    ? [keyof Extensions] extends [never]
      ? never
      : "storage" extends keyof Extensions
        ? never
        : keyof Extensions
    : never;

type ValidStorageTypingExtensions<Extensions extends StorageMachineTypingExtension> = [
  InvalidStorageTypingExtensionKeys<Extensions> | MissingStorageTypingExtensionKeys<Extensions>,
] extends [never]
  ? Extensions
  : never;

type PluginStorageTypingExtensions<Plugins extends PluginSource> = ValidStorageTypingExtensions<
  StorageTypingExtensionsForPluginSource<Plugins>
>;

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
  Extensions extends StorageMachineTypingExtension,
> {
  call<
    Storage extends ExtensionStorageValues<ExtensionWithStorage<Extensions>>,
    Extension extends ExtensionForStorage<ExtensionWithStorage<Extensions>, Storage> = ExtensionForStorage<
      ExtensionWithStorage<Extensions>,
      Storage
    >,
    const Cfg extends ExtensionCreateMachineCfg<Storage> = ExtensionCreateMachineCfg<Storage>,
    InputShape extends object = ExtensionInput<Extension>,
    StorageInput extends object = ResolvedExtensionInput<Cfg, InputShape>,
    C extends object = CfgConfig<Cfg>,
    T extends AnyRecord = ExtensionDefaultContext<Extension>,
    Context extends AnyRecord = CfgContext<Cfg, T, StorageInput>,
    Snapshot = DefaultSnapshotForConfig<C, Context>,
    Persistence extends CapturedPersistence = undefined,
  >(
    cfg: ExtensionCreateMachineInput<
      Cfg,
      C,
      T,
      P,
      D,
      Snapshot,
      Persistence,
      Extension,
      InputShape,
      StorageInput,
      Context,
      ExtensionEvents<P, Extension>,
      Storage
    >,
  ): ExtensionCreateMachineResult<C, T, P, D, Snapshot, Persistence, Extension, StorageInput, Context>;
}

type ExtensionTypedCreateMachineFn<
  P extends AnyEvent,
  D extends AnyRecord,
  Extensions extends StorageMachineTypingExtension,
> = ExtensionTypedCreateMachineFnHolder<P, D, Extensions>["call"];

export type TypedCreateMachineFn<
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
  Plugins extends PluginSource = never,
> = [Plugins] extends [never]
  ? CoreTypedCreateMachineFn<P, D>
  : [PluginStorageTypingExtensions<Plugins>] extends [never]
    ? CoreTypedCreateMachineFn<P, D>
    : CoreTypedCreateMachineFn<P, D> & ExtensionTypedCreateMachineFn<P, D, PluginStorageTypingExtensions<Plugins>>;

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
    Plugins extends PluginSource = never,
    Extensions extends StorageMachineTypingExtension = PluginStorageTypingExtensions<Plugins>,
    Storage extends ExtensionStorageValues<ExtensionWithStorage<Extensions>> = ExtensionStorageValues<
      ExtensionWithStorage<Extensions>
    >,
    Extension extends ExtensionForStorage<ExtensionWithStorage<Extensions>, Storage> = ExtensionForStorage<
      ExtensionWithStorage<Extensions>,
      Storage
    >,
    const Cfg extends ExtensionCreateMachineCfg<Storage> = ExtensionCreateMachineCfg<Storage>,
    InputShape extends object = ExtensionInput<Extension>,
    StorageInput extends object = ResolvedExtensionInput<Cfg, InputShape>,
    C extends object = CfgConfig<Cfg>,
    T extends AnyRecord = ExtensionDefaultContext<Extension>,
    Context extends AnyRecord = CfgContext<Cfg, T, StorageInput>,
    Snapshot = DefaultSnapshotForConfig<C, Context>,
    Persistence extends CapturedPersistence = undefined,
  >(
    cfg: ExtensionCreateMachineInput<
      Cfg,
      C,
      T,
      P,
      D,
      Snapshot,
      Persistence,
      Extension,
      InputShape,
      StorageInput,
      Context,
      ExtensionEvents<P, Extension>,
      Storage
    >,
  ): ExtensionCreateMachineResult<C, T, P, D, Snapshot, Persistence, Extension, StorageInput, Context>;
};

export type CreateMachineFn = DirectCreateMachineFn & AnyExtensionCreateMachineFn;
