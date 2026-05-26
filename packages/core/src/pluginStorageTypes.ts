// Public type contracts for storage runtime DSL. Используются и при объявлении
// defineStorageRuntime, и при выводе machine extension'ов для пользовательского
// app wrapper (createMachine).

import type { LiteFsmStorageRuntimeDefinition } from "./pluginStorage";
import type {
  AcceptsEventContext,
  CompileTemplateContext,
  CreatePublicInitialStateContext,
  CreateRuntimeStateContext,
  ResolveEffectInvocationsContext,
  ResolveIdentityContext,
  StorageBeginReduceContext,
  StorageCommitContext,
  StorageConditionContext,
  StorageDehydrateContext,
  StorageEffectInvocationContext,
  StorageEffectsRuntime,
  StorageHydrateContext,
  StorageIdentityRuntime,
  StoragePrepareActionContext,
  StoragePrepareActionResult,
  StorageReactionContext,
  StorageReduceContext,
  StorageRuntimeState,
  StorageSnapshotRuntime,
  ValidateTemplateContext,
} from "./runtime/kernel/storage";
import type { AnyEvent, MachineStore } from "./types";

// === Plugin machine extension input ==========================================

export type PluginMachineExtensionInput = {
  readonly input?: object;
  readonly internalEvents?: AnyEvent;
  readonly reducerContext?: object;
  readonly effectDeps?: object;
  readonly reactionDeps?: object;
  readonly resultMetadata?: object;
  readonly publicState?: unknown;
};

export type RejectUnknownMachineExtensionKeys<Extension extends object> = {
  readonly [Key in Exclude<keyof Extension, keyof PluginMachineExtensionInput>]: never;
};

type ExtensionTemplateMachine<Extension extends PluginMachineExtensionInput> =
  Extension extends { readonly input?: infer Input extends object }
    ? MachineStore[string] & Input
    : MachineStore[string];

type PluginTemplateContext<
  Kind extends string,
  Extension extends PluginMachineExtensionInput,
  Context extends ValidateTemplateContext | CompileTemplateContext = ValidateTemplateContext,
> = Omit<Context, "machine" | "storageKind"> & {
  readonly storageKind: Kind;
  readonly machine: ExtensionTemplateMachine<Extension>;
};

export type StorageTemplatePayload = void | {
  readonly data?: unknown;
  readonly key?: never;
  readonly kind?: never;
};

// === Storage runtime block shapes ============================================

type PluginStorageEffectsRuntime = {
  condition?(ctx: StorageConditionContext): Promise<boolean>;
  resolveInvocations(ctx: ResolveEffectInvocationsContext): ReturnType<StorageEffectsRuntime["resolveInvocations"]>;
  invoke(ctx: StorageEffectInvocationContext): void;
};

type PluginStorageSnapshotRuntime = {
  dehydrate(ctx: StorageDehydrateContext): ReturnType<StorageSnapshotRuntime["dehydrate"]>;
  hydrate(ctx: StorageHydrateContext): ReturnType<StorageSnapshotRuntime["hydrate"]>;
};

type PluginStorageIdentityRuntime = {
  resolve(ctx: ResolveIdentityContext): ReturnType<StorageIdentityRuntime["resolve"]>;
};

type PluginStorageReactionRuntime = {
  run(ctx: StorageReactionContext): void;
};

export type PluginStorageRuntime<Kind extends string, Extension extends PluginMachineExtensionInput> = {
  readonly kind: Kind;
  readonly routeMetaKeys?: readonly string[];
  validateTemplate(ctx: PluginTemplateContext<Kind, Extension>): void;
  compileTemplate(ctx: PluginTemplateContext<Kind, Extension, CompileTemplateContext>): StorageTemplatePayload;
  createRuntimeState(ctx: CreateRuntimeStateContext): StorageRuntimeState;
  createPublicInitialState(ctx: CreatePublicInitialStateContext): unknown;
  prepareAction?(ctx: StoragePrepareActionContext): StoragePrepareActionResult;
  beginReduce?(ctx: StorageBeginReduceContext): void | false;
  acceptsEvent(ctx: AcceptsEventContext): boolean;
  reduce(ctx: StorageReduceContext): void | false;
  commit(ctx: StorageCommitContext): void;
  readonly effects?: PluginStorageEffectsRuntime;
  readonly snapshot?: PluginStorageSnapshotRuntime;
  readonly identity?: PluginStorageIdentityRuntime;
  readonly reactions?: PluginStorageReactionRuntime;
};

type Prettify<Value> = { [Key in keyof Value]: Value[Key] };

export type NormalizedStorageMachineExtension<
  Kind extends string,
  Extension extends PluginMachineExtensionInput,
> = Prettify<Omit<Extension, "storage"> & { readonly storage: Kind }>;

export type StorageRuntimeBuilder<Extension extends PluginMachineExtensionInput> = {
  create<const Kind extends string>(
    definition: PluginStorageRuntime<Kind, Extension> & RejectUnknownMachineExtensionKeys<Extension>,
  ): LiteFsmStorageRuntimeDefinition<Kind, NormalizedStorageMachineExtension<Kind, Extension>>;
};
