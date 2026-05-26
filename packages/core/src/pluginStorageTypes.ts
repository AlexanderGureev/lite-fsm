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
import type { AnyEvent, MachineStore } from "./types";

// === Storage runtime extension ===============================================

export type StorageRuntimeExtension = {
  readonly input?: object;
  readonly internalEvents?: AnyEvent;
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

type ExtensionTemplateMachine<Extension extends StorageRuntimeExtension> =
  Extension extends { readonly input?: infer Input extends object }
    ? MachineStore[string] & Input
    : MachineStore[string];

type ExtensionTemplateData<Extension extends StorageRuntimeExtension> =
  Extension extends { readonly templateData?: infer TemplateData } ? TemplateData : unknown;

type ExtensionRuntimeState<Extension extends StorageRuntimeExtension> =
  Extension extends { readonly runtimeState?: infer RuntimeState } ? RuntimeState : unknown;

type ExtensionPublicState<Extension extends StorageRuntimeExtension> =
  Extension extends { readonly publicState?: infer PublicState } ? PublicState : unknown;

type ExtensionSnapshotData<Extension extends StorageRuntimeExtension> =
  Extension extends { readonly snapshotData?: infer SnapshotData } ? SnapshotData : unknown;

type ExtensionInvocation<Extension extends StorageRuntimeExtension> =
  Extension extends { readonly invocation?: infer Invocation } ? Invocation : unknown;

type ExtensionIdentity<Extension extends StorageRuntimeExtension> =
  Extension extends { readonly identity?: infer Identity }
    ? Identity extends Readonly<Record<string, unknown>>
      ? Identity
      : Readonly<Record<string, unknown>>
    : Readonly<Record<string, unknown>>;

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

export type StorageValidateTemplateContext<
  Kind extends string,
  Extension extends StorageRuntimeExtension,
> = Omit<KernelValidateTemplateContext, "machine" | "storageKind"> & {
  readonly storageKind: Kind;
  readonly machine: ExtensionTemplateMachine<Extension>;
};

export type StorageCompileTemplateContext<
  Kind extends string,
  Extension extends StorageRuntimeExtension,
> = Omit<KernelCompileTemplateContext, "machine" | "storageKind"> & {
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
  KernelStoragePrepareActionContext,
  Extension
>;

export type StorageBeforeReduceContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  KernelStorageBeforeReduceContext,
  Extension
>;

export type StorageAcceptsEventContext<Extension extends StorageRuntimeExtension> = WithRuntimeTemplate<
  KernelAcceptsEventContext,
  Extension
>;

export type StorageReduceContext<Extension extends StorageRuntimeExtension> = WithRuntimeTemplate<
  KernelStorageReduceContext,
  Extension
>;

export type StorageReduceBucketContext<Extension extends StorageRuntimeExtension> = WithRuntimeTemplates<
  KernelStorageReduceBucketContext,
  Extension
>;

export type StorageCommitContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  KernelStorageCommitContext,
  Extension
>;

export type StorageConditionContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  KernelStorageConditionContext,
  Extension
>;

export type StorageResolveEffectInvocationsContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  KernelResolveEffectInvocationsContext,
  Extension
>;

export type StorageEffectInvocationContext<Extension extends StorageRuntimeExtension> = Omit<
  WithRuntimeState<KernelStorageEffectInvocationContext, Extension>,
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
  KernelResolveIdentityContext,
  Extension
>;

export type StorageReactionContext<Extension extends StorageRuntimeExtension> = WithRuntimeState<
  KernelStorageReactionContext,
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

type PluginStorageRuntimeBase<Kind extends string, Extension extends StorageRuntimeExtension> = {
  readonly kind: Kind;
  readonly routeMetaKeys?: readonly string[];
  validateTemplate(ctx: StorageValidateTemplateContext<Kind, Extension>): void;
  compileTemplate(ctx: StorageCompileTemplateContext<Kind, Extension>): StorageCompileTemplateResult<
    ExtensionTemplateData<Extension>
  >;
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

type PluginTemplateStorageRuntime<Kind extends string, Extension extends StorageRuntimeExtension> =
  PluginStorageRuntimeBase<Kind, Extension> & {
    readonly reduceScope?: "template";
    acceptsEvent(ctx: StorageAcceptsEventContext<Extension>): boolean;
    reduce(ctx: StorageReduceContext<Extension>): StorageReduceResult;
    readonly reduceBucket?: never;
  };

type PluginBucketStorageRuntime<Kind extends string, Extension extends StorageRuntimeExtension> =
  PluginStorageRuntimeBase<Kind, Extension> & {
    readonly reduceScope: "bucket";
    reduceBucket(ctx: StorageReduceBucketContext<Extension>): StorageReduceResult;
    readonly acceptsEvent?: never;
    readonly reduce?: never;
  };

export type PluginStorageRuntime<Kind extends string, Extension extends StorageRuntimeExtension> =
  | PluginTemplateStorageRuntime<Kind, Extension>
  | PluginBucketStorageRuntime<Kind, Extension>;

type Prettify<Value> = { [Key in keyof Value]: Value[Key] };

export type StorageMachineExtension<
  Kind extends string,
  Extension extends StorageRuntimeExtension,
> = Prettify<StorageMachineFacingExtension<Extension> & { readonly storage: Kind }>;

export type StorageRuntimeBuilder<Extension extends StorageRuntimeExtension> = {
  create<const Kind extends string>(
    definition: PluginStorageRuntime<Kind, Extension> & RejectUnknownMachineExtensionKeys<Extension>,
  ): LiteFsmStorageRuntimeDefinition<Kind, StorageMachineExtension<Kind, Extension>>;
};
