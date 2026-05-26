// Public type contracts for storage runtime DSL. Используются и при объявлении
// defineStorageRuntime, и при выводе machine extension'ов для пользовательского
// app wrapper (createMachine).

import type { LiteFsmStorageRuntimeDefinition } from "./pluginStorage";
import type {
  AnyEvent,
  DehydrateOptions,
  HydrateStrategy,
  MachinesState,
  MachineStore,
  ManagerAction,
  ReadonlyManagerAction,
} from "./types";

// === Storage runtime extension ===============================================

export type StorageRuntimeExtension = {
  readonly input?: object;
  readonly internalEvents?: AnyEvent;
  readonly observedEvents?: AnyEvent;
  readonly routeMeta?: object;
  readonly reducerContext?: object;
  readonly effectDeps?: object;
  readonly reactionDeps?: object;
  readonly resultMetadata?: object;
  readonly publicState?: unknown;
  readonly runtimeState?: unknown;
  readonly templateData?: unknown;
  readonly snapshotData?: unknown;
  readonly invocation?: unknown;
  readonly identity?: Readonly<Record<string, unknown>>;
};

export type StorageTemplate<TemplateData = unknown> = {
  readonly key: string;
  readonly kind: string;
  readonly data?: TemplateData;
};

export type StorageManagerContext<Events extends AnyEvent = AnyEvent> = {
  getState(): MachinesState<MachineStore>;
  transition(action: ManagerAction<Events>, options?: unknown): ManagerAction<Events>;
  onTransition(
    cb: (
      prevState: MachinesState<MachineStore>,
      currentState: MachinesState<MachineStore>,
      action: ReadonlyManagerAction<Events> | { readonly type: string; readonly payload?: unknown },
    ) => void,
  ): () => void;
  getDependencies(): Record<string, unknown>;
};

type StorageRuntimeState = unknown;
type StorageEffectInvocation = unknown;

export type StorageActionStageResult =
  | void
  | { readonly type: "replace"; readonly action: ManagerAction<AnyEvent> }
  | { readonly type: "drop" };

export type StoragePrepareActionResult = StorageActionStageResult;
export type StorageReduceResult = void | { readonly type: "skip" };

export type StorageHydrateResult = {
  readonly nextState: Record<string, unknown>;
  readonly changed: boolean;
};

type StorageDispatchRoute =
  | { readonly scope: "actor"; readonly key: "actorId"; readonly targetSet: string[] }
  | { readonly scope: "plugin"; readonly key: string; readonly targetSet: string[] }
  | { readonly scope: "group"; readonly key: "groupId"; readonly targetSet: string[] }
  | { readonly scope: "tag"; readonly key: "groupTag"; readonly targetSet: string[] }
  | { readonly scope: "unscoped"; readonly key: undefined; readonly targetSet: [] };

type StorageDispatchContext = {
  readonly options: unknown;
  readonly runtime: Map<string, unknown>;
  readonly route: StorageDispatchRoute;
  readonly prevState: Record<string, unknown>;
  nextState: Record<string, unknown>;
  readonly skipDelivery: boolean;
  reportError(error: unknown): void;
};

type ValidateTemplateContext = {
  readonly key: string;
  readonly machine: MachineStore[string];
  readonly storageKind: string;
};

type CompileTemplateContext = ValidateTemplateContext;

type CreateRuntimeStateContext = {
  readonly templates: readonly StorageTemplate[];
  readonly manager: StorageManagerContext;
};

type CreatePublicInitialStateContext = {
  readonly template: StorageTemplate;
  readonly state: StorageRuntimeState;
};

type ActionAwareStorageContext = {
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
  readonly state: StorageRuntimeState;
  readonly dispatch: StorageDispatchContext;
};

type StoragePrepareActionContextBase = ActionAwareStorageContext & {
  readonly options: unknown;
  readonly manager: StorageManagerContext;
};

type StorageBeforeReduceContextBase = ActionAwareStorageContext & {
  readonly manager: StorageManagerContext;
};

type AcceptsEventContext = ActionAwareStorageContext & {
  readonly template: StorageTemplate;
};

type StorageReduceContextBase = ActionAwareStorageContext & {
  readonly template: StorageTemplate;
  readonly manager: StorageManagerContext;
};

type StorageReduceBucketContextBase = ActionAwareStorageContext & {
  readonly templates: readonly StorageTemplate[];
  readonly manager: StorageManagerContext;
};

type StorageCommitContextBase = ActionAwareStorageContext & {
  readonly manager: StorageManagerContext;
};

type StorageConditionContextBase = {
  readonly predicate: (action: ReadonlyManagerAction<AnyEvent>) => boolean;
  readonly state: StorageRuntimeState;
  readonly manager: StorageManagerContext;
};

type ResolveEffectInvocationsContext = ActionAwareStorageContext & {
  readonly manager: StorageManagerContext;
};

type StorageEffectInvocationContextBase = ActionAwareStorageContext & {
  readonly invocation: StorageEffectInvocation;
  readonly manager: StorageManagerContext;
};

type StorageDehydrateContextBase = {
  readonly state: StorageRuntimeState;
  readonly manager: StorageManagerContext;
  readonly rootState: Record<string, unknown>;
  readonly options: DehydrateOptions<MachineStore> | undefined;
};

type StorageDehydrateResultBase = {
  readonly machines?: Record<string, unknown>;
  readonly snapshot?: unknown;
};

type StorageHydrateContextBase = {
  readonly state: StorageRuntimeState;
  readonly manager: StorageManagerContext;
  readonly machines: Readonly<Record<string, unknown>>;
  readonly snapshot: unknown | undefined;
  readonly baseState: Record<string, unknown>;
  readonly strategy: HydrateStrategy;
  readonly source: "hydrate" | "opts.snapshot";
  readonly mode: "preview" | "commit" | "init";
};

type ResolveIdentityContext = {
  readonly state: StorageRuntimeState;
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly originalAction: ReadonlyManagerAction<AnyEvent>;
};

type StorageReactionContextBase = ActionAwareStorageContext & {
  readonly manager: StorageManagerContext;
};

type MachineFacingStorageExtensionKey =
  | "input"
  | "internalEvents"
  | "reducerContext"
  | "effectDeps"
  | "reactionDeps"
  | "resultMetadata"
  | "publicState";

export type RejectUnknownMachineExtensionKeys<Extension extends object> = {
  readonly [Key in Exclude<keyof Extension, keyof StorageRuntimeExtension>]-?: never;
};

type StorageMachineFacingExtension<Extension extends StorageRuntimeExtension> = Pick<
  Extension,
  Extract<keyof Extension, MachineFacingStorageExtensionKey>
>;

type ExtensionTemplateMachine<Extension extends StorageRuntimeExtension> = Extension extends {
  readonly input?: infer Input extends object;
}
  ? MachineStore[string] & Input
  : MachineStore[string];

type ExtensionTemplateData<Extension extends StorageRuntimeExtension> = Extension extends {
  readonly templateData?: infer TemplateData;
}
  ? TemplateData
  : unknown;

type ExtensionRuntimeState<Extension extends StorageRuntimeExtension> = Extension extends {
  readonly runtimeState?: infer RuntimeState;
}
  ? RuntimeState
  : unknown;

type ExtensionPublicState<Extension extends StorageRuntimeExtension> = Extension extends {
  readonly publicState?: infer PublicState;
}
  ? PublicState
  : unknown;

type ExtensionSnapshotData<Extension extends StorageRuntimeExtension> = Extension extends {
  readonly snapshotData?: infer SnapshotData;
}
  ? SnapshotData
  : unknown;

type ExtensionInvocation<Extension extends StorageRuntimeExtension> = Extension extends {
  readonly invocation?: infer Invocation;
}
  ? Invocation
  : unknown;

type ExtensionIdentity<Extension extends StorageRuntimeExtension> = Extension extends {
  readonly identity?: infer Identity;
}
  ? Identity extends Readonly<Record<string, unknown>>
    ? Identity
    : Readonly<Record<string, unknown>>
  : Readonly<Record<string, unknown>>;

type ExtensionObservedEvents<Extension extends StorageRuntimeExtension> = "observedEvents" extends keyof Extension
  ? Extension extends { readonly observedEvents?: infer Events extends AnyEvent }
    ? Events
    : AnyEvent
  : AnyEvent;

type ExtensionRouteMeta<Extension extends StorageRuntimeExtension> = "routeMeta" extends keyof Extension
  ? NonNullable<Extension["routeMeta"]> extends object
    ? NonNullable<Extension["routeMeta"]>
    : never
  : never;

export type StorageRouteMetaKeys<Extension extends StorageRuntimeExtension> = [ExtensionRouteMeta<Extension>] extends [
  never,
]
  ? readonly string[]
  : readonly (keyof ExtensionRouteMeta<Extension> & string)[];

export type StorageRequiredRouteMetaForKeys<Extension extends StorageRuntimeExtension, RouteMetaKeys> = [
  ExtensionRouteMeta<Extension>,
] extends [never]
  ? {}
  : RouteMetaKeys extends readonly (keyof ExtensionRouteMeta<Extension> & string)[]
    ? Pick<ExtensionRouteMeta<Extension>, RouteMetaKeys[number]>
    : {};

type WithObservedAction<Context, Extension extends StorageRuntimeExtension> = Omit<
  Context,
  "action" | "originalAction"
> & {
  readonly action: ReadonlyManagerAction<ExtensionObservedEvents<Extension>>;
  readonly originalAction: ReadonlyManagerAction<ExtensionObservedEvents<Extension>>;
};

type WithObservedManager<Context, Extension extends StorageRuntimeExtension> = Omit<Context, "manager"> & {
  readonly manager: StorageManagerContext<ExtensionObservedEvents<Extension>>;
};

type WithObservedPredicate<Context, Extension extends StorageRuntimeExtension> = Omit<Context, "predicate"> & {
  readonly predicate: (action: ReadonlyManagerAction<ExtensionObservedEvents<Extension>>) => boolean;
};

type WithRuntimeState<Context, Extension extends StorageRuntimeExtension> = Omit<Context, "state"> & {
  readonly state: ExtensionRuntimeState<Extension>;
};

type WithRuntimeTemplate<Context, Extension extends StorageRuntimeExtension> = Omit<Context, "template" | "state"> & {
  readonly template: StorageTemplate<ExtensionTemplateData<Extension>>;
  readonly state: ExtensionRuntimeState<Extension>;
};

type WithRuntimeTemplates<Context, Extension extends StorageRuntimeExtension> = Omit<Context, "templates" | "state"> & {
  readonly templates: readonly StorageTemplate<ExtensionTemplateData<Extension>>[];
  readonly state: ExtensionRuntimeState<Extension>;
};

export type StorageValidateTemplateContext<Kind extends string, Extension extends StorageRuntimeExtension> = Omit<
  ValidateTemplateContext,
  "machine" | "storageKind"
> & {
  readonly storageKind: Kind;
  readonly machine: ExtensionTemplateMachine<Extension>;
};

export type StorageCompileTemplateContext<Kind extends string, Extension extends StorageRuntimeExtension> = Omit<
  CompileTemplateContext,
  "machine" | "storageKind"
> & {
  readonly storageKind: Kind;
  readonly machine: ExtensionTemplateMachine<Extension>;
};

export type StorageCreateRuntimeStateContext<Extension extends StorageRuntimeExtension> = Omit<
  WithObservedManager<CreateRuntimeStateContext, Extension>,
  "templates"
> & {
  readonly templates: readonly StorageTemplate<ExtensionTemplateData<Extension>>[];
};

export type StorageCreatePublicInitialStateContext<Extension extends StorageRuntimeExtension> = WithRuntimeTemplate<
  CreatePublicInitialStateContext,
  Extension
>;

export type StoragePrepareActionContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedManager<WithObservedAction<StoragePrepareActionContextBase, Extension>, Extension>,
  Extension
>;

export type StorageBeforeReduceContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedManager<WithObservedAction<StorageBeforeReduceContextBase, Extension>, Extension>,
  Extension
>;

export type StorageAcceptsEventContext<Extension extends StorageRuntimeExtension> = WithRuntimeTemplate<
  WithObservedAction<AcceptsEventContext, Extension>,
  Extension
>;

export type StorageReduceContext<Extension extends StorageRuntimeExtension> = WithRuntimeTemplate<
  WithObservedManager<WithObservedAction<StorageReduceContextBase, Extension>, Extension>,
  Extension
>;

export type StorageReduceBucketContext<Extension extends StorageRuntimeExtension> = WithRuntimeTemplates<
  WithObservedManager<WithObservedAction<StorageReduceBucketContextBase, Extension>, Extension>,
  Extension
>;

export type StorageCommitContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedManager<WithObservedAction<StorageCommitContextBase, Extension>, Extension>,
  Extension
>;

export type StorageConditionContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedManager<WithObservedPredicate<StorageConditionContextBase, Extension>, Extension>,
  Extension
>;

export type StorageResolveEffectInvocationsContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedManager<WithObservedAction<ResolveEffectInvocationsContext, Extension>, Extension>,
  Extension
>;

export type StorageEffectInvocationContext<Extension extends StorageRuntimeExtension> = Omit<
  WithRuntimeState<
    WithObservedManager<WithObservedAction<StorageEffectInvocationContextBase, Extension>, Extension>,
    Extension
  >,
  "invocation"
> & {
  readonly invocation: ExtensionInvocation<Extension>;
};

export type StorageDehydrateContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedManager<StorageDehydrateContextBase, Extension>,
  Extension
>;

export type StorageHydrateContext<Extension extends StorageRuntimeExtension> = Omit<
  WithRuntimeState<WithObservedManager<StorageHydrateContextBase, Extension>, Extension>,
  "snapshot"
> & {
  readonly snapshot: ExtensionSnapshotData<Extension> | undefined;
};

export type StorageIdentityContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedAction<ResolveIdentityContext, Extension>,
  Extension
>;

export type StorageReactionContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedManager<WithObservedAction<StorageReactionContextBase, Extension>, Extension>,
  Extension
>;

export type StorageCompileTemplateResult<TemplateData = unknown> = void | {
  readonly data?: TemplateData;
  readonly key?: never;
  readonly kind?: never;
};

export type StorageDehydrateResult<Extension extends StorageRuntimeExtension> = Omit<
  StorageDehydrateResultBase,
  "snapshot"
> & {
  readonly snapshot?: ExtensionSnapshotData<Extension>;
};

// === Storage runtime block shapes ============================================

type PluginStorageEffectsRuntime<Extension extends StorageRuntimeExtension> = {
  condition?(ctx: StorageConditionContext<Extension>): Promise<boolean>;
  resolveInvocations(ctx: StorageResolveEffectInvocationsContext<Extension>): readonly ExtensionInvocation<Extension>[];
  invoke(ctx: StorageEffectInvocationContext<Extension>): void;
};

type PluginStorageSnapshotRuntime<Extension extends StorageRuntimeExtension> = {
  dehydrate(ctx: StorageDehydrateContext<Extension>): StorageDehydrateResult<Extension>;
  hydrate(ctx: StorageHydrateContext<Extension>): StorageHydrateResult;
};

type PluginStorageIdentityRuntime<Extension extends StorageRuntimeExtension> = {
  resolve(ctx: StorageIdentityContext<Extension>): ExtensionIdentity<Extension> | undefined;
};

type PluginStorageReactionRuntime<Extension extends StorageRuntimeExtension> = {
  run(ctx: StorageReactionContext<Extension>): void;
};

type PluginStorageRuntimeBase<
  Kind extends string,
  Extension extends StorageRuntimeExtension,
  RouteMetaKeys extends StorageRouteMetaKeys<Extension> | undefined,
> = {
  readonly kind: Kind;
  readonly routeMetaKeys?: RouteMetaKeys;
  validateTemplate(ctx: StorageValidateTemplateContext<Kind, Extension>): void;
  compileTemplate(
    ctx: StorageCompileTemplateContext<Kind, Extension>,
  ): StorageCompileTemplateResult<ExtensionTemplateData<Extension>>;
  createRuntimeState(ctx: StorageCreateRuntimeStateContext<Extension>): ExtensionRuntimeState<Extension>;
  createPublicInitialState(ctx: StorageCreatePublicInitialStateContext<Extension>): ExtensionPublicState<Extension>;
  prepareAction?(ctx: StoragePrepareActionContext<Extension>): StoragePrepareActionResult;
  beforeReduce?(ctx: StorageBeforeReduceContext<Extension>): StorageActionStageResult;
  commit(ctx: StorageCommitContext<Extension>): void;
  readonly effects?: PluginStorageEffectsRuntime<Extension>;
  readonly snapshot?: PluginStorageSnapshotRuntime<Extension>;
  readonly identity?: PluginStorageIdentityRuntime<Extension>;
  readonly reactions?: PluginStorageReactionRuntime<Extension>;
};

type PluginTemplateStorageRuntime<
  Kind extends string,
  Extension extends StorageRuntimeExtension,
  RouteMetaKeys extends StorageRouteMetaKeys<Extension> | undefined,
> = PluginStorageRuntimeBase<Kind, Extension, RouteMetaKeys> & {
  readonly reduceScope?: "template";
  acceptsEvent(ctx: StorageAcceptsEventContext<Extension>): boolean;
  reduce(ctx: StorageReduceContext<Extension>): StorageReduceResult;
  readonly reduceBucket?: never;
};

type PluginBucketStorageRuntime<
  Kind extends string,
  Extension extends StorageRuntimeExtension,
  RouteMetaKeys extends StorageRouteMetaKeys<Extension> | undefined,
> = PluginStorageRuntimeBase<Kind, Extension, RouteMetaKeys> & {
  readonly reduceScope: "bucket";
  reduceBucket(ctx: StorageReduceBucketContext<Extension>): StorageReduceResult;
  readonly acceptsEvent?: never;
  readonly reduce?: never;
};

export type PluginStorageRuntime<
  Kind extends string,
  Extension extends StorageRuntimeExtension,
  RouteMetaKeys extends StorageRouteMetaKeys<Extension> | undefined = StorageRouteMetaKeys<Extension> | undefined,
> =
  | PluginTemplateStorageRuntime<Kind, Extension, RouteMetaKeys>
  | PluginBucketStorageRuntime<Kind, Extension, RouteMetaKeys>;

type Prettify<Value> = { [Key in keyof Value]: Value[Key] };

export type StorageMachineExtension<Kind extends string, Extension extends StorageRuntimeExtension> = Prettify<
  StorageMachineFacingExtension<Extension> & { readonly storage: Kind }
>;

export type StorageRuntimeBuilder<Extension extends StorageRuntimeExtension> = {
  create<
    const Kind extends string,
    const RouteMetaKeys extends StorageRouteMetaKeys<Extension> | undefined = undefined,
  >(
    definition: PluginStorageRuntime<Kind, Extension, RouteMetaKeys> & RejectUnknownMachineExtensionKeys<Extension>,
  ): LiteFsmStorageRuntimeDefinition<
    Kind,
    StorageMachineExtension<Kind, Extension>,
    StorageRequiredRouteMetaForKeys<Extension, RouteMetaKeys>
  >;
};
