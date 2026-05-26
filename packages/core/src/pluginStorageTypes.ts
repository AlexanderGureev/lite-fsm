// Public type contracts for storage runtime DSL. Используются и при объявлении
// defineStorageRuntime, и при выводе machine extension'ов для пользовательского
// app wrapper (createMachine).

import type { LiteFsmStorageRuntimeDefinition } from "./pluginStorage";
import type {
  AcceptsEventContext as KernelAcceptsEventContext,
  CompileTemplateContext as KernelCompileTemplateContext,
  CreatePublicInitialStateContext as KernelCreatePublicInitialStateContext,
  CreateRuntimeStateContext as KernelCreateRuntimeStateContext,
  ResolveEffectInvocationsContext as KernelResolveEffectInvocationsContext,
  ResolveIdentityContext as KernelResolveIdentityContext,
  StorageActionStageResult,
  StorageBeforeReduceContext as KernelStorageBeforeReduceContext,
  StorageCommitContext as KernelStorageCommitContext,
  StorageConditionContext as KernelStorageConditionContext,
  StorageDehydrateContext as KernelStorageDehydrateContext,
  StorageDehydrateResult as KernelStorageDehydrateResult,
  StorageEffectInvocationContext as KernelStorageEffectInvocationContext,
  StorageHydrateContext as KernelStorageHydrateContext,
  StorageHydrateResult,
  StoragePrepareActionContext as KernelStoragePrepareActionContext,
  StoragePrepareActionResult,
  StorageReduceBucketContext as KernelStorageReduceBucketContext,
  StorageReactionContext as KernelStorageReactionContext,
  StorageReduceContext as KernelStorageReduceContext,
  StorageReduceResult,
  ValidateTemplateContext as KernelValidateTemplateContext,
} from "./runtime/kernel/storage";
import type { AnyEvent, MachineStore, ManagerAction } from "./types";

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
  readonly action: ManagerAction<ExtensionObservedEvents<Extension>>;
  readonly originalAction: ManagerAction<ExtensionObservedEvents<Extension>>;
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
  KernelValidateTemplateContext,
  "machine" | "storageKind"
> & {
  readonly storageKind: Kind;
  readonly machine: ExtensionTemplateMachine<Extension>;
};

export type StorageCompileTemplateContext<Kind extends string, Extension extends StorageRuntimeExtension> = Omit<
  KernelCompileTemplateContext,
  "machine" | "storageKind"
> & {
  readonly storageKind: Kind;
  readonly machine: ExtensionTemplateMachine<Extension>;
};

export type StorageCreateRuntimeStateContext<Extension extends StorageRuntimeExtension> = Omit<
  KernelCreateRuntimeStateContext,
  "templates"
> & {
  readonly templates: readonly StorageTemplate<ExtensionTemplateData<Extension>>[];
};

export type StorageCreatePublicInitialStateContext<Extension extends StorageRuntimeExtension> = WithRuntimeTemplate<
  KernelCreatePublicInitialStateContext,
  Extension
>;

export type StoragePrepareActionContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedAction<KernelStoragePrepareActionContext, Extension>,
  Extension
>;

export type StorageBeforeReduceContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedAction<KernelStorageBeforeReduceContext, Extension>,
  Extension
>;

export type StorageAcceptsEventContext<Extension extends StorageRuntimeExtension> = WithRuntimeTemplate<
  WithObservedAction<KernelAcceptsEventContext, Extension>,
  Extension
>;

export type StorageReduceContext<Extension extends StorageRuntimeExtension> = WithRuntimeTemplate<
  WithObservedAction<KernelStorageReduceContext, Extension>,
  Extension
>;

export type StorageReduceBucketContext<Extension extends StorageRuntimeExtension> = WithRuntimeTemplates<
  WithObservedAction<KernelStorageReduceBucketContext, Extension>,
  Extension
>;

export type StorageCommitContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedAction<KernelStorageCommitContext, Extension>,
  Extension
>;

export type StorageConditionContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  KernelStorageConditionContext,
  Extension
>;

export type StorageResolveEffectInvocationsContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedAction<KernelResolveEffectInvocationsContext, Extension>,
  Extension
>;

export type StorageEffectInvocationContext<Extension extends StorageRuntimeExtension> = Omit<
  WithRuntimeState<WithObservedAction<KernelStorageEffectInvocationContext, Extension>, Extension>,
  "invocation"
> & {
  readonly invocation: ExtensionInvocation<Extension>;
};

export type StorageDehydrateContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  KernelStorageDehydrateContext,
  Extension
>;

export type StorageHydrateContext<Extension extends StorageRuntimeExtension> = Omit<
  WithRuntimeState<KernelStorageHydrateContext, Extension>,
  "snapshot"
> & {
  readonly snapshot: ExtensionSnapshotData<Extension> | undefined;
};

export type StorageIdentityContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedAction<KernelResolveIdentityContext, Extension>,
  Extension
>;

export type StorageReactionContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  WithObservedAction<KernelStorageReactionContext, Extension>,
  Extension
>;

type StorageCompileTemplateResult<TemplateData = unknown> = void | {
  readonly data?: TemplateData;
  readonly key?: never;
  readonly kind?: never;
};

type StorageDehydrateResult<Extension extends StorageRuntimeExtension> = Omit<
  KernelStorageDehydrateResult,
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
