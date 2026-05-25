import type {
  ActionInterceptor,
  DispatchHook,
  DispatchHookPhase,
  ManagerRuntimeContext,
  NormalizedScopedDepsEntry,
  NormalizedScopedTransitionEntry,
  NormalizedPlugin,
  NormalizedStorageEntry,
  ScopedInvocationContext,
} from "../../plugin";
import { LiteFsmError } from "../../utils";
import { createManagerExtensionRuntime, registerRouteMetaEntry } from "./pluginSections";
import { createRoutingRuntime } from "./routing";
import type { RuntimeStorageEntry, StorageRegistry, StorageRuntime } from "./storage";

type PluginRegistryOptions = {
  readonly defaultStorageKind: string;
};

export type { DispatchHookPhase };

type ScopedExtensionKind = "dep" | "transition";
type RuntimeScopedTransition = ScopedInvocationContext["transition"] & Record<string, unknown>;

const coreScopedDepKeys = new Set(["action", "condition", "self", "transition"]);
const coreScopedTransitionKeys = new Set(["actor", "group", "tag", "transition", "unscoped"]);

const hasKey = (value: object, key: string): boolean => key in value;

const assertScopedEntryKey = (
  kind: ScopedExtensionKind,
  { owner, key }: { readonly owner: string; readonly key: string },
  owners: Map<string, string>,
  coreKeys: ReadonlySet<string>,
) => {
  if (key.length === 0) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_SCOPED_EXTENSION",
      `[lite-fsm] plugin '${owner}' registered invalid ${kind} extension key.`,
    );
  }
  if (owners.has(key)) {
    throw new LiteFsmError(
      "LITE_FSM_DUPLICATE_SCOPED_EXTENSION_KEY",
      `[lite-fsm] duplicate scoped ${kind} extension key '${key}'.`,
    );
  }
  if (coreKeys.has(key)) {
    throw new LiteFsmError(
      "LITE_FSM_SCOPED_EXTENSION_CORE_KEY",
      `[lite-fsm] plugin '${owner}' cannot override core scoped ${kind} key '${key}'.`,
    );
  }
};

const assertNoScopedOverride = (
  kind: ScopedExtensionKind,
  { owner, key }: { readonly owner: string; readonly key: string },
  base: Record<string, unknown>,
) => {
  if (!hasKey(base, key)) return;

  throw new LiteFsmError(
    "LITE_FSM_SCOPED_EXTENSION_OVERRIDE",
    `[lite-fsm] plugin '${owner}' cannot override existing scoped ${kind} key '${key}'.`,
  );
};

export const createPluginRegistry = ({ defaultStorageKind }: PluginRegistryOptions) => {
  const installedNames = new Set<string>();
  const storageRuntimes = new Map<string, StorageRuntime>();
  const actionInterceptors: ActionInterceptor[] = [];
  const scopedDeps: NormalizedScopedDepsEntry[] = [];
  const scopedTransition: NormalizedScopedTransitionEntry[] = [];
  const scopedDepOwners = new Map<string, string>();
  const scopedTransitionOwners = new Map<string, string>();
  const managerExtensions = createManagerExtensionRuntime();
  const dispatchHooks: { [Phase in DispatchHookPhase]: DispatchHook[] } = {
    beforeReduce: [],
    afterReduce: [],
    beforeCommit: [],
    beforeSubscribers: [],
    beforeEffects: [],
    afterEffects: [],
  };
  const routingRuntime = createRoutingRuntime();

  const storage = Object.freeze({
    register(kind: string, runtime: StorageRuntime) {
      if (storageRuntimes.has(kind)) {
        throw new LiteFsmError("LITE_FSM_DUPLICATE_STORAGE_KIND", `[lite-fsm] duplicate storage kind '${kind}'.`);
      }
      if (runtime.kind !== kind) {
        throw new LiteFsmError(
          "LITE_FSM_INVALID_STORAGE_RUNTIME",
          `[lite-fsm] storage runtime registered for kind '${kind}' declared kind '${runtime.kind}'.`,
        );
      }

      storageRuntimes.set(kind, runtime);
    },
    get(kind: string) {
      return storageRuntimes.get(kind);
    },
  } satisfies StorageRegistry);

  const addStorageEntry = (entry: NormalizedStorageEntry) => {
    storage.register(entry.kind, entry.value as StorageRuntime);
  };

  const addScopedDepsEntry = (entry: NormalizedScopedDepsEntry) => {
    assertScopedEntryKey("dep", entry, scopedDepOwners, coreScopedDepKeys);

    scopedDepOwners.set(entry.key, entry.owner);
    scopedDeps.push(entry);
  };

  const addScopedTransitionEntry = (entry: NormalizedScopedTransitionEntry) => {
    assertScopedEntryKey("transition", entry, scopedTransitionOwners, coreScopedTransitionKeys);

    scopedTransitionOwners.set(entry.key, entry.owner);
    scopedTransition.push(entry);
  };

  const createScopedTransition = (
    baseTransition: ScopedInvocationContext["transition"],
    ctx: ScopedInvocationContext,
  ): ScopedInvocationContext["transition"] => {
    if (scopedTransition.length === 0) return baseTransition;

    const transition = Object.assign(
      ((action) => ctx.transition(action)) as ScopedInvocationContext["transition"],
      baseTransition,
    ) as RuntimeScopedTransition;
    const scopedCtx = { ...ctx, transition };

    for (const entry of scopedTransition) {
      assertNoScopedOverride("transition", entry, transition);
      transition[entry.key] = entry.factory(scopedCtx);
    }

    return transition;
  };

  return {
    defaultStorageKind,
    storage,
    routing: routingRuntime,
    createScopedDeps(
      baseDeps: Record<string, unknown>,
      ctx: ScopedInvocationContext,
    ): Record<string, unknown> {
      if (scopedDeps.length === 0 && scopedTransition.length === 0) return baseDeps;

      const transition = createScopedTransition(ctx.transition, ctx);
      const extended: Record<string, unknown> = { ...baseDeps, transition };
      const scopedCtx = { ...ctx, transition };

      for (const entry of scopedDeps) {
        assertNoScopedOverride("dep", entry, extended);
        extended[entry.key] = entry.factory(scopedCtx);
      }

      return extended;
    },
    attachManagerExtensions<T extends Record<string, unknown>>(target: T, ctx: ManagerRuntimeContext): T {
      return managerExtensions.attach(target, ctx);
    },
    listActionInterceptors(): readonly ActionInterceptor[] {
      return actionInterceptors;
    },
    listDispatchHooks(phase: DispatchHookPhase): readonly DispatchHook[] {
      return dispatchHooks[phase];
    },
    addPlugin(plugin: NormalizedPlugin) {
      if (installedNames.has(plugin.name)) {
        throw new LiteFsmError("LITE_FSM_DUPLICATE_PLUGIN", `[lite-fsm] duplicate plugin name '${plugin.name}'.`);
      }

      installedNames.add(plugin.name);
      for (const entry of plugin.storage) addStorageEntry(entry);
      for (const entry of plugin.routeMeta) registerRouteMetaEntry(routingRuntime.registry, entry);
      for (const entry of plugin.scopedDeps) addScopedDepsEntry(entry);
      for (const entry of plugin.scopedTransition) addScopedTransitionEntry(entry);
      for (const entry of plugin.manager) managerExtensions.add(entry);
      if (plugin.intercept) actionInterceptors.push(plugin.intercept);
      for (const entry of Object.values(plugin.hooks)) {
        dispatchHooks[entry.phase].push(entry.hook);
      }
    },
    assertDefaultStorageRegistered() {
      if (storage.get(defaultStorageKind)) return;

      throw new LiteFsmError(
        "LITE_FSM_MISSING_DEFAULT_STORAGE_KIND",
        `[lite-fsm] default storage kind '${defaultStorageKind}' is not registered.`,
      );
    },
    assertStorageRouteResolversRegistered() {
      for (const runtime of storageRuntimes.values()) {
        for (const key of runtime.routeMetaKeys ?? []) {
          if (routingRuntime.hasMetaKey(key)) continue;

          throw new LiteFsmError(
            "LITE_FSM_MISSING_ROUTE_META_RESOLVER",
            `[lite-fsm] storage runtime '${runtime.kind}' requires route resolver for meta key '${key}'.`,
          );
        }
      }
    },
    listStorageRuntimes(): RuntimeStorageEntry[] {
      return [...storageRuntimes].map(([kind, runtime]) => ({ kind, runtime }));
    },
  };
};
