// Plugin DSL normalization: валидирует raw plugin definition и приводит к NormalizedPlugin,
// который потребляет kernel runtime. Все ошибки бросаются как LiteFsmError с кодом
// LITE_FSM_INVALID_PLUGIN_DEFINITION.

import type { LiteFsmStorageRuntimeDefinition } from "./pluginStorage";
import { getStorageRuntimePayload, isLiteFsmStorageRuntimeDefinition } from "./pluginStorage";
import type {
  ActionInterceptor,
  DispatchHook,
  DispatchHookPhase,
  ManagerExtensionFactory,
  NormalizedDispatchHook,
  NormalizedManagerEntry,
  NormalizedPlugin,
  NormalizedRouteMetaEntry,
  NormalizedScopedDepsEntry,
  NormalizedScopedFactory,
  NormalizedScopedTransitionEntry,
  NormalizedStorageEntry,
  RouteResolver,
} from "./pluginTypes";
import type { StorageRuntime } from "./runtime/kernel/storage";
import { DISPATCH_HOOK_PHASES } from "./pluginTypes";
import { LiteFsmError } from "./utils";

// === Shared primitives =======================================================

export type PlainRecord = Record<string, unknown>;
export type UnknownFunction = (...args: never[]) => unknown;

export const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

export const isPlainObject = (value: unknown): value is PlainRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// Достаёт user plugins из opaque MachineManagerOptions: на этом уровне generic-форма
// MachineManagerOptions<S, P, Plugins> уже потеряна, и факт наличия plugins выясняется
// structurally без ущерба type-safety публичного API (входной cast локализован здесь).
export const extractUserPlugins = (opts: unknown): readonly unknown[] =>
  (opts as { readonly plugins?: readonly unknown[] } | undefined)?.plugins ?? [];

export const invalidPluginDefinition = (message: string): never => {
  throw new LiteFsmError("LITE_FSM_INVALID_PLUGIN_DEFINITION", `[lite-fsm] invalid plugin definition: ${message}`);
};

export const assertNonEmptyString = (value: unknown, message: string): string => {
  if (typeof value === "string" && value.length > 0) return value;

  return invalidPluginDefinition(message);
};

export const assertFunction = (value: unknown, message: string): UnknownFunction => {
  if (typeof value === "function") return value as UnknownFunction;

  return invalidPluginDefinition(message);
};

// === Plugin definition schema ================================================

const PLUGIN_DEFINITION_KEYS = new Set([
  "name",
  "routeMeta",
  "manager",
  "storage",
  "scopedDeps",
  "scopedTransition",
  "intercept",
  "hooks",
]);

const DISPATCH_HOOK_PHASE_SET = new Set<string>(DISPATCH_HOOK_PHASES);

// === Section assertions ======================================================

const assertKnownTopLevelSections = (definition: PlainRecord) => {
  for (const key of Object.keys(definition)) {
    if (PLUGIN_DEFINITION_KEYS.has(key)) continue;

    invalidPluginDefinition(`unknown top-level section '${key}'.`);
  }
};

const assertObjectSection = (section: string, value: unknown): [string, unknown][] => {
  if (!isPlainObject(value)) {
    return invalidPluginDefinition(`section '${section}' must be a plain object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    invalidPluginDefinition(`section '${section}' must not be empty.`);
  }

  return entries;
};

const assertSectionFunction = (section: string, key: string, value: unknown): UnknownFunction =>
  assertFunction(value, `section '${section}' entry '${key}' must be a function.`);

const assertDispatchHookPhase = (value: string): DispatchHookPhase => {
  if (DISPATCH_HOOK_PHASE_SET.has(value)) return value as DispatchHookPhase;

  return invalidPluginDefinition(`unknown dispatch hook phase '${value}'.`);
};

const assertStorageSection = (value: unknown): readonly LiteFsmStorageRuntimeDefinition[] => {
  if (!Array.isArray(value)) {
    return invalidPluginDefinition("section 'storage' must be an array of storage definitions.");
  }

  if (value.length === 0) {
    return invalidPluginDefinition("section 'storage' must not be empty.");
  }

  return value.map((item) => {
    if (isLiteFsmStorageRuntimeDefinition(item)) return item;

    return invalidPluginDefinition("storage definitions require defineStorageRuntime().create(...).");
  });
};

// === Section normalizers =====================================================

const normalizeStorage = (owner: string, value: unknown): readonly NormalizedStorageEntry[] => {
  const registeredKinds = new Set<string>();

  return assertStorageSection(value).map((definition) => {
    if (registeredKinds.has(definition.kind)) {
      invalidPluginDefinition(`plugin '${owner}' defines duplicate storage kind '${definition.kind}'.`);
    }

    registeredKinds.add(definition.kind);
    return {
      owner,
      kind: definition.kind,
      value: getStorageRuntimePayload(definition),
    };
  });
};

type NormalizedStorageRuntimeEntry = NormalizedStorageEntry & {
  readonly value: StorageRuntime;
};

export const getNormalizedStorageRuntimeEntries = (
  plugin: NormalizedPlugin,
): readonly NormalizedStorageRuntimeEntry[] => plugin.storage as readonly NormalizedStorageRuntimeEntry[];

const normalizeRouteMeta = (owner: string, value: unknown): readonly NormalizedRouteMetaEntry[] =>
  assertObjectSection("routeMeta", value).map(([key, resolver]) => ({
    owner,
    key,
    resolver: assertSectionFunction("routeMeta", key, resolver) as RouteResolver,
  }));

const normalizeManager = (owner: string, value: unknown): readonly NormalizedManagerEntry[] =>
  assertObjectSection("manager", value).map(([key, factory]) => ({
    owner,
    key,
    factory: assertSectionFunction("manager", key, factory) as ManagerExtensionFactory,
  }));

const normalizeScopedFactories = (
  section: "scopedDeps" | "scopedTransition",
  owner: string,
  value: unknown,
): readonly (NormalizedScopedDepsEntry | NormalizedScopedTransitionEntry)[] =>
  assertObjectSection(section, value).map(([key, factory]) => ({
    owner,
    key,
    factory: assertSectionFunction(section, key, factory) as NormalizedScopedFactory,
  }));

const normalizeHooks = (owner: string, value: unknown): Partial<Record<DispatchHookPhase, NormalizedDispatchHook>> => {
  const hooks: Partial<Record<DispatchHookPhase, NormalizedDispatchHook>> = {};

  for (const [phase, hook] of assertObjectSection("hooks", value)) {
    const hookPhase = assertDispatchHookPhase(phase);

    hooks[hookPhase] = {
      owner,
      phase: hookPhase,
      hook: assertSectionFunction("hooks", phase, hook) as DispatchHook,
    };
  }

  return hooks;
};

// === Entry point =============================================================

export const normalizePluginDefinition = (value: unknown): NormalizedPlugin => {
  if (!isPlainObject(value)) {
    return invalidPluginDefinition("definition must be a plain object.");
  }

  assertKnownTopLevelSections(value);
  const name = assertNonEmptyString(value.name, "name must be a non-empty string.");

  const normalized: NormalizedPlugin = {
    name,
    storage: hasOwn(value, "storage") ? normalizeStorage(name, value.storage) : [],
    routeMeta: hasOwn(value, "routeMeta") ? normalizeRouteMeta(name, value.routeMeta) : [],
    scopedDeps: hasOwn(value, "scopedDeps") ? normalizeScopedFactories("scopedDeps", name, value.scopedDeps) : [],
    scopedTransition: hasOwn(value, "scopedTransition")
      ? normalizeScopedFactories("scopedTransition", name, value.scopedTransition)
      : [],
    manager: hasOwn(value, "manager") ? normalizeManager(name, value.manager) : [],
    hooks: hasOwn(value, "hooks") ? normalizeHooks(name, value.hooks) : {},
  };

  if (!hasOwn(value, "intercept")) return normalized;

  return {
    ...normalized,
    intercept: assertFunction(value.intercept, "section 'intercept' must be a function.") as ActionInterceptor,
  };
};
