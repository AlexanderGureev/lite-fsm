// Storage runtime DSL normalization: валидирует defineStorageRuntime() input и нормализует
// compileTemplate так, чтобы builder подставлял key/kind поверх user-возвращённого payload.

import { assertFunction, assertNonEmptyString, hasOwn, invalidPluginDefinition, isPlainObject } from "./pluginNormalize";
import type { StorageTemplatePayload } from "./pluginStorageTypes";
import type { CompileTemplateContext, StorageRuntime } from "./runtime/kernel/storage";

const REQUIRED_METHODS = [
  "validateTemplate",
  "compileTemplate",
  "createRuntimeState",
  "createPublicInitialState",
  "acceptsEvent",
  "reduce",
  "commit",
] as const;

const OPTIONAL_METHODS = ["prepareAction", "beginReduce"] as const;

type BlockSpec = {
  readonly required: readonly string[];
  readonly optional?: readonly string[];
};

const BLOCKS = {
  effects: { required: ["resolveInvocations", "invoke"], optional: ["condition"] },
  snapshot: { required: ["dehydrate", "hydrate"] },
  identity: { required: ["resolve"] },
  reactions: { required: ["run"] },
} as const satisfies Record<string, BlockSpec>;

type BlockKey = keyof typeof BLOCKS;

const KNOWN_KEYS = new Set<string>([
  "kind",
  "routeMetaKeys",
  ...REQUIRED_METHODS,
  ...OPTIONAL_METHODS,
  ...Object.keys(BLOCKS),
]);

const assertOptionalMethod = (owner: Record<string, unknown>, key: string, label: string) => {
  if (!hasOwn(owner, key) || owner[key] === undefined) return;
  assertFunction(owner[key], `${label} must be a function.`);
};

const assertRouteMetaKeys = (definition: Record<string, unknown>) => {
  if (!hasOwn(definition, "routeMetaKeys") || definition.routeMetaKeys === undefined) return;

  const keys = definition.routeMetaKeys;
  if (Array.isArray(keys) && keys.every((key) => typeof key === "string")) return;

  invalidPluginDefinition("storage runtime 'routeMetaKeys' must be an array of strings.");
};

const assertBlock = (definition: Record<string, unknown>, key: BlockKey, spec: BlockSpec) => {
  if (!hasOwn(definition, key) || definition[key] === undefined) return;
  if (!isPlainObject(definition[key])) {
    invalidPluginDefinition(`storage runtime '${key}' must be a plain object.`);
  }

  const block = definition[key] as Record<string, unknown>;
  const allowed = new Set<string>([...spec.required, ...(spec.optional ?? [])]);
  for (const blockKey of Object.keys(block)) {
    if (allowed.has(blockKey)) continue;
    invalidPluginDefinition(`unknown storage runtime '${key}' method '${blockKey}'.`);
  }
  for (const method of spec.required) {
    assertFunction(block[method], `storage runtime '${key}.${method}' must be a function.`);
  }
  for (const method of spec.optional ?? []) {
    assertOptionalMethod(block, method, `storage runtime '${key}.${method}'`);
  }
};

export const assertStorageRuntimeDefinition = (value: unknown): StorageRuntime => {
  if (!isPlainObject(value)) {
    return invalidPluginDefinition("storage runtime definition must be a plain object.");
  }

  for (const key of Object.keys(value)) {
    if (KNOWN_KEYS.has(key)) continue;
    invalidPluginDefinition(`unknown storage runtime field '${key}'.`);
  }

  assertNonEmptyString(value.kind, "storage runtime kind must be a non-empty string.");
  assertRouteMetaKeys(value);

  for (const method of REQUIRED_METHODS) {
    assertFunction(value[method], `storage runtime '${method}' must be a function.`);
  }
  for (const method of OPTIONAL_METHODS) {
    assertOptionalMethod(value, method, `storage runtime '${method}'`);
  }
  for (const [key, spec] of Object.entries(BLOCKS) as [BlockKey, BlockSpec][]) {
    assertBlock(value, key, spec);
  }

  return value as unknown as StorageRuntime;
};

// Builder подставляет финальный kind и обогащает compileTemplate так, чтобы payload
// всегда содержал key/kind — user runtime возвращает только опциональный `data`.
export const normalizePublicStorageRuntime = <Kind extends string>(
  kind: Kind,
  runtime: StorageRuntime,
): StorageRuntime => ({
  ...runtime,
  ...(runtime.routeMetaKeys === undefined ? {} : { routeMetaKeys: [...runtime.routeMetaKeys] }),
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
