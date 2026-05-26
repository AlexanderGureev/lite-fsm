import type {
  ActionInterceptor,
  DispatchHook,
  DispatchHookPhase,
  ManagerRuntimeContext,
  NormalizedManagerEntry,
  NormalizedPlugin,
  NormalizedScopedDepsEntry,
  NormalizedScopedTransitionEntry,
  ScopedInvocationContext,
} from "../../plugin";
import { DISPATCH_HOOK_PHASES } from "../../pluginTypes";
import { LiteFsmError } from "../../utils";
import { createRoutingRuntime } from "./routing";
import type { RuntimeStorageEntry, StorageRegistry, StorageRuntime } from "./storage";

export type { DispatchHookPhase };

type PluginRegistryOptions = {
  readonly defaultStorageKind: string;
};

// === Conflict-prevention key sets ============================================

const CORE_MANAGER_KEYS = new Set([
  "getState",
  "getSnapshot",
  "getHydratedState",
  "hydrate",
  "dehydrate",
  "transition",
  "setDependencies",
  "onTransition",
  "replaceReducer",
]);

const CORE_SCOPED_DEP_KEYS = new Set(["action", "condition", "self", "transition"]);
const CORE_SCOPED_TRANSITION_KEYS = new Set(["actor", "group", "tag", "transition", "unscoped"]);

// === Scoped registry =========================================================
// Дедуплицирует регистрацию scoped deps и scoped transition: одинаковая валидация
// per-extension key, разные core-key наборы и kind в сообщении ошибки.

type ScopedKind = "dep" | "transition";
type ScopedEntry = NormalizedScopedDepsEntry | NormalizedScopedTransitionEntry;

const createScopedRegistry = <Entry extends ScopedEntry>(kind: ScopedKind, coreKeys: ReadonlySet<string>) => {
  const entries: Entry[] = [];
  const owners = new Map<string, string>();

  const add = (entry: Entry) => {
    if (entry.key.length === 0) {
      throw new LiteFsmError(
        "LITE_FSM_INVALID_SCOPED_EXTENSION",
        `[lite-fsm] plugin '${entry.owner}' registered invalid ${kind} extension key.`,
      );
    }
    if (owners.has(entry.key)) {
      throw new LiteFsmError(
        "LITE_FSM_DUPLICATE_SCOPED_EXTENSION_KEY",
        `[lite-fsm] duplicate scoped ${kind} extension key '${entry.key}'.`,
      );
    }
    if (coreKeys.has(entry.key)) {
      throw new LiteFsmError(
        "LITE_FSM_SCOPED_EXTENSION_CORE_KEY",
        `[lite-fsm] plugin '${entry.owner}' cannot override core scoped ${kind} key '${entry.key}'.`,
      );
    }

    owners.set(entry.key, entry.owner);
    entries.push(entry);
  };

  const assertNoOverride = (entry: Entry, base: Record<string, unknown>) => {
    if (!(entry.key in base)) return;
    throw new LiteFsmError(
      "LITE_FSM_SCOPED_EXTENSION_OVERRIDE",
      `[lite-fsm] plugin '${entry.owner}' cannot override existing scoped ${kind} key '${entry.key}'.`,
    );
  };

  return { add, assertNoOverride, entries };
};

// === Storage registry ========================================================

const createStorageRegistry = () => {
  const runtimes = new Map<string, StorageRuntime>();

  const registry: StorageRegistry = Object.freeze({
    register(kind, runtime) {
      if (runtimes.has(kind)) {
        throw new LiteFsmError("LITE_FSM_DUPLICATE_STORAGE_KIND", `[lite-fsm] duplicate storage kind '${kind}'.`);
      }
      if (runtime.kind !== kind) {
        throw new LiteFsmError(
          "LITE_FSM_INVALID_STORAGE_RUNTIME",
          `[lite-fsm] storage runtime registered for kind '${kind}' declared kind '${runtime.kind}'.`,
        );
      }
      runtimes.set(kind, runtime);
    },
    get(kind) {
      return runtimes.get(kind);
    },
  });

  return {
    registry,
    list: (): RuntimeStorageEntry[] => [...runtimes].map(([kind, runtime]) => ({ kind, runtime })),
    values: () => runtimes.values(),
  };
};

// === Plugin registry =========================================================

export const createPluginRegistry = ({ defaultStorageKind }: PluginRegistryOptions) => {
  const installedNames = new Set<string>();
  const storage = createStorageRegistry();
  const scopedDeps = createScopedRegistry<NormalizedScopedDepsEntry>("dep", CORE_SCOPED_DEP_KEYS);
  const scopedTransition = createScopedRegistry<NormalizedScopedTransitionEntry>(
    "transition",
    CORE_SCOPED_TRANSITION_KEYS,
  );
  const actionInterceptors: ActionInterceptor[] = [];
  const managerEntries: NormalizedManagerEntry[] = [];
  const managerKeys = new Set<string>();
  const dispatchHooks: Record<DispatchHookPhase, DispatchHook[]> = Object.fromEntries(
    DISPATCH_HOOK_PHASES.map((phase) => [phase, [] as DispatchHook[]]),
  ) as Record<DispatchHookPhase, DispatchHook[]>;
  const routingRuntime = createRoutingRuntime();

  const addManagerEntry = (entry: NormalizedManagerEntry) => {
    if (CORE_MANAGER_KEYS.has(entry.key)) {
      throw new LiteFsmError(
        "LITE_FSM_MANAGER_EXTENSION_CORE_KEY",
        `[lite-fsm] plugin '${entry.owner}' cannot register manager extension '${entry.key}' because it is a core manager key.`,
      );
    }
    if (managerKeys.has(entry.key)) {
      throw new LiteFsmError(
        "LITE_FSM_DUPLICATE_MANAGER_EXTENSION_KEY",
        `[lite-fsm] duplicate manager extension key '${entry.key}'.`,
      );
    }

    managerKeys.add(entry.key);
    managerEntries.push(entry);
  };

  // Scoped transition factories дают ctx.transition с дополнительными методами;
  // base remains callable, чтобы plugin-методы могли проксировать вызов core transition.
  type RuntimeScopedTransition = ScopedInvocationContext["transition"] & Record<string, unknown>;
  const createScopedTransition = (
    baseTransition: ScopedInvocationContext["transition"],
    ctx: ScopedInvocationContext,
  ): ScopedInvocationContext["transition"] => {
    if (scopedTransition.entries.length === 0) return baseTransition;

    const transition = Object.assign(
      ((action) => ctx.transition(action)) as ScopedInvocationContext["transition"],
      baseTransition,
    ) as RuntimeScopedTransition;
    const scopedCtx = { ...ctx, transition };

    for (const entry of scopedTransition.entries) {
      scopedTransition.assertNoOverride(entry, transition);
      transition[entry.key] = entry.factory(scopedCtx);
    }

    return transition;
  };

  return {
    defaultStorageKind,
    storage: storage.registry,
    routing: routingRuntime,
    listStorageRuntimes: storage.list,
    listActionInterceptors: (): readonly ActionInterceptor[] => actionInterceptors,
    listDispatchHooks: (phase: DispatchHookPhase): readonly DispatchHook[] => dispatchHooks[phase],

    createScopedDeps(baseDeps: Record<string, unknown>, ctx: ScopedInvocationContext): Record<string, unknown> {
      if (scopedDeps.entries.length === 0 && scopedTransition.entries.length === 0) return baseDeps;

      const transition = createScopedTransition(ctx.transition, ctx);
      const extended: Record<string, unknown> = { ...baseDeps, transition };
      const scopedCtx = { ...ctx, transition };

      for (const entry of scopedDeps.entries) {
        scopedDeps.assertNoOverride(entry, extended);
        extended[entry.key] = entry.factory(scopedCtx);
      }

      return extended;
    },

    attachManagerExtensions<T extends Record<string, unknown>>(target: T, ctx: ManagerRuntimeContext): T {
      for (const { key, factory } of managerEntries) {
        Object.defineProperty(target, key, {
          value: factory(ctx),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return target;
    },

    addPlugin(plugin: NormalizedPlugin) {
      if (installedNames.has(plugin.name)) {
        throw new LiteFsmError("LITE_FSM_DUPLICATE_PLUGIN", `[lite-fsm] duplicate plugin name '${plugin.name}'.`);
      }

      installedNames.add(plugin.name);
      for (const entry of plugin.storage) storage.registry.register(entry.kind, entry.value as StorageRuntime);
      for (const entry of plugin.routeMeta) routingRuntime.registry.registerRouteMeta(entry.key, entry.resolver);
      for (const entry of plugin.scopedDeps) scopedDeps.add(entry);
      for (const entry of plugin.scopedTransition) scopedTransition.add(entry);
      for (const entry of plugin.manager) addManagerEntry(entry);
      if (plugin.intercept) actionInterceptors.push(plugin.intercept);
      for (const entry of Object.values(plugin.hooks)) {
        dispatchHooks[entry.phase].push(entry.hook);
      }
    },

    assertDefaultStorageRegistered() {
      if (storage.registry.get(defaultStorageKind)) return;

      throw new LiteFsmError(
        "LITE_FSM_MISSING_DEFAULT_STORAGE_KIND",
        `[lite-fsm] default storage kind '${defaultStorageKind}' is not registered.`,
      );
    },

    assertStorageRouteResolversRegistered() {
      for (const runtime of storage.values()) {
        for (const key of runtime.routeMetaKeys ?? []) {
          if (routingRuntime.hasMetaKey(key)) continue;

          throw new LiteFsmError(
            "LITE_FSM_MISSING_ROUTE_META_RESOLVER",
            `[lite-fsm] storage runtime '${runtime.kind}' requires route resolver for meta key '${key}'.`,
          );
        }
      }
    },
  };
};
