import type { AnyEvent, MachineRuntimeExtension, MachineStore } from "./types";
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
  StorageRuntime,
  StorageRuntimeState,
  StorageSnapshotRuntime,
  ValidateTemplateContext,
} from "./runtime/kernel/storage";
import { LiteFsmError } from "./utils";

const liteFsmStorageRuntimeMarker: unique symbol = Symbol.for("lite-fsm.storage-runtime.value") as never;
const liteFsmStorageRuntimePayload: unique symbol = Symbol.for("lite-fsm.storage-runtime.payload") as never;
declare const liteFsmStorageRuntimeExtension: unique symbol;

export type LiteFsmStorageRuntimeDefinition<
  Kind extends string = string,
  MachineExtension extends MachineRuntimeExtension = MachineRuntimeExtension,
> = {
  readonly kind: Kind;
  readonly [liteFsmStorageRuntimeMarker]: true;
  readonly [liteFsmStorageRuntimePayload]: StorageRuntime;
  readonly [liteFsmStorageRuntimeExtension]: MachineExtension;
};

type PluginMachineExtensionInput = {
  readonly input?: object;
  readonly internalEvents?: AnyEvent;
  readonly reducerContext?: object;
  readonly effectDeps?: object;
  readonly reactionDeps?: object;
  readonly resultMetadata?: object;
  readonly publicState?: unknown;
};

type RejectUnknownMachineExtensionKeys<Extension extends object> = {
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

type StorageTemplatePayload = void | {
  readonly data?: unknown;
  readonly key?: never;
  readonly kind?: never;
};

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

type PluginStorageRuntime<
  Kind extends string,
  Extension extends PluginMachineExtensionInput,
> = {
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

type StorageRuntimeDefinitionKey =
  | "kind"
  | "routeMetaKeys"
  | "validateTemplate"
  | "compileTemplate"
  | "createRuntimeState"
  | "createPublicInitialState"
  | "prepareAction"
  | "beginReduce"
  | "acceptsEvent"
  | "reduce"
  | "commit"
  | "effects"
  | "snapshot"
  | "identity"
  | "reactions";

type Prettify<Value> = { [Key in keyof Value]: Value[Key] };

type NormalizedStorageMachineExtension<
  Kind extends string,
  Extension extends PluginMachineExtensionInput,
> = Prettify<Omit<Extension, "storage"> & { readonly storage: Kind }>;

type StorageRuntimeBuilder<Extension extends PluginMachineExtensionInput> = {
  create<const Kind extends string>(
    definition: PluginStorageRuntime<Kind, Extension> &
      RejectUnknownMachineExtensionKeys<Extension>,
  ): LiteFsmStorageRuntimeDefinition<Kind, NormalizedStorageMachineExtension<Kind, Extension>>;
};

type PlainRecord = Record<string, unknown>;
type UnknownFunction = (...args: never[]) => unknown;

const storageRuntimeTopLevelKeys = new Set<StorageRuntimeDefinitionKey>([
  "kind",
  "routeMetaKeys",
  "validateTemplate",
  "compileTemplate",
  "createRuntimeState",
  "createPublicInitialState",
  "prepareAction",
  "beginReduce",
  "acceptsEvent",
  "reduce",
  "commit",
  "effects",
  "snapshot",
  "identity",
  "reactions",
]);

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const isPlainObject = (value: unknown): value is PlainRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const invalidPluginDefinition = (message: string): never => {
  throw new LiteFsmError("LITE_FSM_INVALID_PLUGIN_DEFINITION", `[lite-fsm] invalid plugin definition: ${message}`);
};

const assertStorageRuntimeDefinitionName = (value: unknown): string => {
  if (typeof value === "string" && value.length > 0) return value;

  return invalidPluginDefinition("storage runtime kind must be a non-empty string.");
};

const assertKnownStorageRuntimeDefinitionKeys = (definition: PlainRecord) => {
  for (const key of Object.keys(definition)) {
    if (storageRuntimeTopLevelKeys.has(key as StorageRuntimeDefinitionKey)) continue;

    invalidPluginDefinition(`unknown storage runtime field '${key}'.`);
  }
};

const assertFunctionProperty = (owner: PlainRecord, key: string, label: string): UnknownFunction => {
  const value = owner[key];
  if (typeof value === "function") return value as UnknownFunction;

  return invalidPluginDefinition(`${label} must be a function.`);
};

const assertOptionalFunctionProperty = (owner: PlainRecord, key: string, label: string) => {
  if (!hasOwn(owner, key) || owner[key] === undefined) return;

  assertFunctionProperty(owner, key, label);
};

const assertOptionalRuntimeBlock = (
  definition: PlainRecord,
  key: "effects" | "snapshot" | "identity" | "reactions",
  requiredMethods: readonly string[],
  optionalMethods: readonly string[] = [],
) => {
  if (!hasOwn(definition, key) || definition[key] === undefined) return;
  const block = definition[key];
  if (!isPlainObject(block)) {
    invalidPluginDefinition(`storage runtime '${key}' must be a plain object.`);
  }

  const blockRecord = block as PlainRecord;
  const allowed = new Set([...requiredMethods, ...optionalMethods]);
  for (const blockKey of Object.keys(blockRecord)) {
    if (allowed.has(blockKey)) continue;

    invalidPluginDefinition(`unknown storage runtime '${key}' method '${blockKey}'.`);
  }
  for (const method of requiredMethods) {
    assertFunctionProperty(blockRecord, method, `storage runtime '${key}.${method}'`);
  }
  for (const method of optionalMethods) {
    assertOptionalFunctionProperty(blockRecord, method, `storage runtime '${key}.${method}'`);
  }
};

const assertStorageRuntimeDefinition = (value: unknown): StorageRuntime => {
  if (!isPlainObject(value)) {
    return invalidPluginDefinition("storage runtime definition must be a plain object.");
  }

  assertKnownStorageRuntimeDefinitionKeys(value);
  assertStorageRuntimeDefinitionName(value.kind);

  for (const method of [
    "validateTemplate",
    "compileTemplate",
    "createRuntimeState",
    "createPublicInitialState",
    "acceptsEvent",
    "reduce",
    "commit",
  ] as const) {
    assertFunctionProperty(value, method, `storage runtime '${method}'`);
  }

  assertOptionalFunctionProperty(value, "prepareAction", "storage runtime 'prepareAction'");
  assertOptionalFunctionProperty(value, "beginReduce", "storage runtime 'beginReduce'");
  assertOptionalRuntimeBlock(value, "effects", ["resolveInvocations", "invoke"], ["condition"]);
  assertOptionalRuntimeBlock(value, "snapshot", ["dehydrate", "hydrate"]);
  assertOptionalRuntimeBlock(value, "identity", ["resolve"]);
  assertOptionalRuntimeBlock(value, "reactions", ["run"]);

  return value as unknown as StorageRuntime;
};

const normalizePublicStorageRuntime = <Kind extends string>(
  kind: Kind,
  runtime: StorageRuntime,
): StorageRuntime => ({
  ...runtime,
  kind,
  compileTemplate(ctx) {
    const compileTemplate = runtime.compileTemplate as unknown as (
      context: CompileTemplateContext,
    ) => StorageTemplatePayload;
    const payload = compileTemplate(ctx);
    if (payload === undefined) return { key: ctx.key, kind };

    return Object.assign({}, payload, { key: ctx.key, kind });
  },
});

const createStorageRuntimeValue = <
  const Kind extends string,
  Extension extends PluginMachineExtensionInput,
>(
  definition: PluginStorageRuntime<Kind, Extension>,
): LiteFsmStorageRuntimeDefinition<Kind, NormalizedStorageMachineExtension<Kind, Extension>> => {
  const runtime = assertStorageRuntimeDefinition(definition);
  const kind = assertStorageRuntimeDefinitionName(definition.kind) as Kind;
  const normalized = normalizePublicStorageRuntime(kind, runtime);
  const value = { kind } as LiteFsmStorageRuntimeDefinition<Kind, NormalizedStorageMachineExtension<Kind, Extension>>;

  Object.defineProperties(value, {
    [liteFsmStorageRuntimeMarker]: {
      value: true,
    },
    [liteFsmStorageRuntimePayload]: {
      value: normalized,
    },
  });

  return Object.freeze(value);
};

export const isLiteFsmStorageRuntimeDefinition = (value: unknown): value is LiteFsmStorageRuntimeDefinition => {
  return isPlainObject(value) && Reflect.get(value, liteFsmStorageRuntimeMarker) === true;
};

export const getStorageRuntimePayload = (definition: LiteFsmStorageRuntimeDefinition): StorageRuntime => {
  return Reflect.get(definition, liteFsmStorageRuntimePayload) as StorageRuntime;
};

export function defineStorageRuntime<
  Extension extends PluginMachineExtensionInput = {},
>(): StorageRuntimeBuilder<Extension> {
  if (arguments.length > 0) {
    invalidPluginDefinition(
      "defineStorageRuntime must be called without arguments; use defineStorageRuntime().create(...).",
    );
  }

  return {
    create<const Kind extends string>(
      definition: PluginStorageRuntime<Kind, Extension> &
        RejectUnknownMachineExtensionKeys<Extension>,
    ) {
      return createStorageRuntimeValue<Kind, Extension>(definition as unknown as PluginStorageRuntime<Kind, Extension>);
    },
  };
}
