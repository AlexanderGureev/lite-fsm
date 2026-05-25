import type {
  ActionInterceptor,
  ActionRegistry,
  DepsExtensionRegistry,
  DispatchHook,
  DispatchRegistry,
  LiteFsmPlugin,
  ManagerExtensionFactory,
  ManagerExtensionRegistry,
  ManagerRuntimeContext,
  PluginInstallContext,
  RoutingRegistry,
  ScopedDepsFactory,
  ScopedInvocationContext,
  ScopedTransitionFactory,
} from "../../plugin";
import { LiteFsmError } from "../../utils";
import { createRoutingRuntime } from "./routing";
import type { RuntimeStorageEntry, StorageRegistry, StorageRuntime } from "./storage";

type PluginRegistryOptions = {
  readonly defaultStorageKind: string;
};

export type DispatchHookPhase = keyof DispatchRegistry;

const coreDepsKeys = new Set(["action", "condition", "self", "transition"]);
const coreTransitionKeys = new Set(["actor", "group", "tag", "transition", "unscoped"]);

type ExtensionKind = "dep" | "transition";
type DepsExtension = {
  readonly owner: string;
  readonly factory: ScopedDepsFactory;
};
type TransitionExtension = {
  readonly owner: string;
  readonly factory: ScopedTransitionFactory;
};
type ManagerExtension = {
  readonly owner: string;
  readonly key: string;
  readonly factory: ManagerExtensionFactory;
};
type RuntimeScopedTransition = ((action: Parameters<ScopedInvocationContext["transition"]>[0]) => unknown) & object;

const coreManagerKeys = new Set([
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
const assertExtensionFactory = (
  kind: ExtensionKind,
  owner: string,
  factory: ScopedDepsFactory | ScopedTransitionFactory,
) => {
  if (!Array.isArray(factory.keys)) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_SCOPED_EXTENSION",
      `[lite-fsm] plugin '${owner}' registered ${kind} extension without declared keys.`,
    );
  }
};

const assertDeclaredKeys = (
  kind: ExtensionKind,
  owner: string,
  keys: readonly string[],
  claimedKeys: Map<string, string>,
  coreKeys: ReadonlySet<string>,
) => {
  const seen = new Set<string>();
  for (const key of keys) {
    if (typeof key !== "string" || key.length === 0) {
      throw new LiteFsmError(
        "LITE_FSM_INVALID_SCOPED_EXTENSION",
        `[lite-fsm] plugin '${owner}' registered invalid ${kind} extension key.`,
      );
    }
    if (seen.has(key) || claimedKeys.has(key)) {
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

    seen.add(key);
  }
};

const assertReturnedKeys = (
  kind: ExtensionKind,
  owner: string,
  returned: Record<string, unknown>,
  keys: readonly string[],
) => {
  const declared = new Set(keys);
  for (const key of Object.keys(returned)) {
    if (declared.has(key)) continue;

    throw new LiteFsmError(
      "LITE_FSM_SCOPED_EXTENSION_UNOWNED_KEY",
      `[lite-fsm] plugin '${owner}' returned scoped ${kind} key '${key}' without ownership.`,
    );
  }
};

const assertNoBaseOverride = (
  kind: ExtensionKind,
  owner: string,
  returned: Record<string, unknown>,
  base: Record<string, unknown>,
) => {
  for (const key of Object.keys(returned)) {
    if (!(key in base)) continue;

    throw new LiteFsmError(
      "LITE_FSM_SCOPED_EXTENSION_OVERRIDE",
      `[lite-fsm] plugin '${owner}' cannot override existing scoped ${kind} key '${key}'.`,
    );
  }
};

export const createPluginRegistry = ({ defaultStorageKind }: PluginRegistryOptions) => {
  const installedNames = new Set<string>();
  const storageRuntimes = new Map<string, StorageRuntime>();
  const actionInterceptors: ActionInterceptor[] = [];
  const depExtensions: DepsExtension[] = [];
  const transitionExtensions: TransitionExtension[] = [];
  const managerExtensions: ManagerExtension[] = [];
  const depOwners = new Map<string, string>();
  const transitionOwners = new Map<string, string>();
  const managerExtensionOwners = new Map<string, string>();
  let installingPlugin: string | undefined;
  const dispatchHooks: { [Phase in DispatchHookPhase]: DispatchHook[] } = {
    beforeReduce: [],
    afterReduce: [],
    beforeCommit: [],
    beforeSubscribers: [],
    beforeEffects: [],
    afterEffects: [],
  };
  const routingRuntime = createRoutingRuntime();

  const assertInstallOpen = (operation: string): string => {
    if (installingPlugin) return installingPlugin;

    throw new LiteFsmError(
      "LITE_FSM_PLUGIN_REGISTRY_CLOSED",
      `[lite-fsm] plugin registry '${operation}' can only be changed during plugin install.`,
    );
  };

  const actions = Object.freeze({
    intercept(handler) {
      assertInstallOpen("actions");
      actionInterceptors.push(handler);
    },
  } satisfies ActionRegistry);

  const storage = Object.freeze({
    register(kind: string, runtime: StorageRuntime) {
      assertInstallOpen("storage");
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

  const dispatch = Object.freeze({
    beforeReduce(hook) {
      assertInstallOpen("dispatch");
      dispatchHooks.beforeReduce.push(hook);
    },
    afterReduce(hook) {
      assertInstallOpen("dispatch");
      dispatchHooks.afterReduce.push(hook);
    },
    beforeCommit(hook) {
      assertInstallOpen("dispatch");
      dispatchHooks.beforeCommit.push(hook);
    },
    beforeSubscribers(hook) {
      assertInstallOpen("dispatch");
      dispatchHooks.beforeSubscribers.push(hook);
    },
    beforeEffects(hook) {
      assertInstallOpen("dispatch");
      dispatchHooks.beforeEffects.push(hook);
    },
    afterEffects(hook) {
      assertInstallOpen("dispatch");
      dispatchHooks.afterEffects.push(hook);
    },
  } satisfies DispatchRegistry);

  const deps = Object.freeze({
    extendDeps(factory) {
      const owner = assertInstallOpen("deps");
      assertExtensionFactory("dep", owner, factory);
      assertDeclaredKeys("dep", owner, factory.keys, depOwners, coreDepsKeys);
      depExtensions.push({ owner, factory });
      for (const key of factory.keys) depOwners.set(key, owner);
    },
    extendTransition(factory) {
      const owner = assertInstallOpen("deps");
      assertExtensionFactory("transition", owner, factory);
      assertDeclaredKeys("transition", owner, factory.keys, transitionOwners, coreTransitionKeys);
      transitionExtensions.push({ owner, factory });
      for (const key of factory.keys) transitionOwners.set(key, owner);
    },
  } satisfies DepsExtensionRegistry);

  const manager = Object.freeze({
    extend(key, factory) {
      const owner = assertInstallOpen("manager");
      if (managerExtensionOwners.has(key)) {
        throw new LiteFsmError(
          "LITE_FSM_DUPLICATE_MANAGER_EXTENSION_KEY",
          `[lite-fsm] duplicate manager extension key '${key}'.`,
        );
      }
      if (coreManagerKeys.has(key)) {
        throw new LiteFsmError(
          "LITE_FSM_MANAGER_EXTENSION_CORE_KEY",
          `[lite-fsm] plugin '${owner}' cannot override core manager method '${key}'.`,
        );
      }

      managerExtensionOwners.set(key, owner);
      managerExtensions.push({ owner, key, factory });
    },
  } satisfies ManagerExtensionRegistry);

  const installContext = Object.freeze({
    actions,
    storage,
    dispatch,
    routing: Object.freeze({
      registerMetaKey(key, resolver) {
        assertInstallOpen("routing");
        routingRuntime.registry.registerMetaKey(key, resolver);
      },
    } satisfies RoutingRegistry),
    manager,
    deps,
  }) satisfies PluginInstallContext;

  const extendTransition = (
    base: RuntimeScopedTransition,
    ctx: ScopedInvocationContext,
  ): ScopedInvocationContext["transition"] => {
    if (transitionExtensions.length === 0) return base as unknown as ScopedInvocationContext["transition"];

    const transition = Object.assign(
      ((action: Parameters<typeof ctx.transition>[0]) => ctx.transition(action)) as ScopedInvocationContext["transition"],
      base,
    ) as ScopedInvocationContext["transition"] & Record<string, unknown>;
    const extensionContext = { ...ctx, transition };
    for (const { owner, factory } of transitionExtensions) {
      const extension = factory(extensionContext) as Record<string, unknown>;
      assertReturnedKeys("transition", owner, extension, factory.keys);
      assertNoBaseOverride("transition", owner, extension, transition);
      Object.assign(transition, extension);
    }
    return transition;
  };

  return {
    defaultStorageKind,
    actions,
    dispatch,
    storage,
    routing: routingRuntime,
    createScopedDeps(
      baseDeps: Record<string, unknown>,
      ctx: Omit<ScopedInvocationContext, "transition"> & {
        readonly transition: RuntimeScopedTransition;
      },
    ): Record<string, unknown> {
      if (depExtensions.length === 0 && transitionExtensions.length === 0) return baseDeps;

      const transition = extendTransition(ctx.transition, ctx as ScopedInvocationContext);
      const extended = { ...baseDeps, transition };
      const extensionContext = { ...ctx, transition: transition as ScopedInvocationContext["transition"] };
      for (const { owner, factory } of depExtensions) {
        const extension = factory(extensionContext as ScopedInvocationContext) as Record<string, unknown>;
        assertReturnedKeys("dep", owner, extension, factory.keys);
        assertNoBaseOverride("dep", owner, extension, extended);
        Object.assign(extended, extension);
      }
      return extended;
    },
    attachManagerExtensions<T extends Record<string, unknown>>(target: T, ctx: ManagerRuntimeContext): T {
      for (const { key, factory } of managerExtensions) {
        Object.defineProperty(target, key, {
          value: factory(ctx),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return target;
    },
    listActionInterceptors(): readonly ActionInterceptor[] {
      return actionInterceptors;
    },
    listDispatchHooks(phase: DispatchHookPhase): readonly DispatchHook[] {
      return dispatchHooks[phase];
    },
    install(plugin: LiteFsmPlugin) {
      if (installedNames.has(plugin.name)) {
        throw new LiteFsmError("LITE_FSM_DUPLICATE_PLUGIN", `[lite-fsm] duplicate plugin name '${plugin.name}'.`);
      }

      installedNames.add(plugin.name);
      installingPlugin = plugin.name;
      try {
        plugin.install(installContext);
      } finally {
        installingPlugin = undefined;
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
