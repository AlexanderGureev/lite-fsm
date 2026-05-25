import { describe, expect, test } from "tstyche";
import { definePlugin, MachineManager } from "@lite-fsm/core";
import type {
  ActionInterceptor,
  ActionInterceptorContext,
  ActionInterceptorResult,
  ActionRegistry,
  DepsExtensionRegistry,
  DispatchContext,
  DispatchHook,
  DispatchRegistry,
  AnyEvent,
  FSMEvent,
  IMachineManager,
  LiteFsmPlugin,
  MachineConfig,
  MachineManagerOptions,
  ManagerAction,
  ManagerExtensionRegistry,
  ManagerFromPlugins,
  PluginCapabilities,
  PluginInstallContext,
  RouteResolver,
  RouteResolverContext,
  RouteResolverResult,
  ScopedDepsContext,
  ScopedTransitionContext,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type Ping = FSMEvent<"PING">;
type Pong = FSMEvent<"PONG", { id: string }>;
type Event = Ping | Pong;
type Config = { idle: { PING: "ready" }; ready: { PONG: "idle" } };
type Context = { id: string };
type Machine = MachineConfig<Config, Context, Event>;

const machine: Machine = {
  config: { idle: { PING: "ready" }, ready: { PONG: "idle" } },
  initialState: "idle",
  initialContext: { id: "" },
};

const machines = { machine };

type FactoryCapabilities<Name extends string> = {
  manager: { readonly name: Name };
  transitionEvents: FSMEvent<"PLUGIN_EVENT", { source: Name }>;
};

const createFactoryPlugin = <Name extends string>(name: Name): LiteFsmPlugin<FactoryCapabilities<Name>> =>
  definePlugin<FactoryCapabilities<Name>>({
    name: `factory:${name}`,
    install() {},
  });

describe("definePlugin(...)", () => {
  test("сохраняет literal name", () => {
    const plugin = definePlugin({
      name: "literal-plugin",
      install(ctx) {
        expect(ctx).type.toBe<PluginInstallContext>();
        expect(ctx.actions.intercept).type.toBe<(handler: ActionInterceptor) => void>();
        ctx.actions.intercept((dispatch) => {
          expect(dispatch).type.toBe<ActionInterceptorContext>();
          expect(dispatch.action).type.toBe<ManagerAction<AnyEvent>>();
          return { action: { type: "PLUGIN_ACTION" }, skipDelivery: true, stopInterceptors: true };
        });
        expect(ctx.storage.register).type.toBe<
          (kind: string, runtime: Parameters<typeof ctx.storage.register>[1]) => void
        >();
        expect(ctx.storage.get("instance")).type.toBe<Parameters<typeof ctx.storage.register>[1] | undefined>();
        expect(ctx.dispatch.beforeReduce).type.toBe<(hook: DispatchHook) => void>();
        ctx.dispatch.beforeEffects((dispatch) => {
          expect(dispatch).type.toBe<DispatchContext>();
          dispatch.reportError(new Error("optional"));
        });
        expect(ctx.routing.registerMetaKey).type.toBe<
          <Key extends string>(key: Key, resolver: RouteResolver<Key>) => void
        >();
        ctx.routing.registerMetaKey("entityId", (value, resolverCtx) => {
          expect(value).type.toBe<unknown>();
          expect(resolverCtx).type.toBe<RouteResolverContext<"entityId">>();
          expect(resolverCtx.key).type.toBe<"entityId">();
          return String(value);
        });
        expect(ctx.manager).type.toBe<ManagerExtensionRegistry>();
        ctx.manager.extend("tools", (runtime) => {
          expect(runtime.config).type.toBeAssignableTo<Record<string, unknown>>();
          return { ready: true };
        });
        expect(ctx.deps).type.toBe<DepsExtensionRegistry>();
        ctx.deps.extendDeps(
          Object.assign(
            (scope: ScopedDepsContext) => {
              expect(scope.phase).type.toBe<"effect" | "reaction">();
              return { scoped: true };
            },
            { keys: ["scoped"] as const },
          ),
        );
        ctx.deps.extendTransition(
          Object.assign(
            (scope: ScopedTransitionContext) => {
              expect(scope.source.template).type.toBe<string>();
              return { scopedTransition: () => undefined };
            },
            { keys: ["scopedTransition"] as const },
          ),
        );
      },
    });

    expect(plugin.name).type.toBe<"literal-plugin">();
  });

  test("сохраняет phantom capabilities при явном generic capabilities", () => {
    type Capabilities = {
      manager: { readonly ready: true };
      transitionEvents: FSMEvent<"PLUGIN_READY">;
      actionMeta: { readonly source: "plugin" };
      deps: { readonly clock: () => number };
      transition: { readonly pluginTransition: () => void };
      machine: { readonly storage: "plugin" };
    };

    const plugin = definePlugin<Capabilities>({
      name: "capability-plugin",
      install() {},
    });

    type Inferred = NonNullable<(typeof plugin)["__capabilities"]>;
    type _Capabilities = Assert<Equal<Inferred, Capabilities>>;
    expect(plugin.name).type.toBe<string>();
  });

  test("сохраняет literal name и phantom capabilities при явном generic name", () => {
    type Capabilities = {
      manager: { readonly ready: true };
    };

    const plugin = definePlugin<Capabilities, "capability-plugin">({
      name: "capability-plugin",
      install() {},
    });

    type Inferred = NonNullable<(typeof plugin)["__capabilities"]>;
    type _Capabilities = Assert<Equal<Inferred, Capabilities>>;

    expect(plugin.name).type.toBe<"capability-plugin">();
  });

  test("явный generic name проверяет значение name", () => {
    type Capabilities = {
      manager: { readonly ready: true };
    };

    definePlugin<Capabilities, "expected-plugin">({
      // @ts-expect-error!
      name: "actual-plugin",
      install() {},
    });
  });

  test("plugin factory сохраняет inferred capabilities", () => {
    const plugin = createFactoryPlugin("alpha");

    type Inferred = NonNullable<(typeof plugin)["__capabilities"]>;

    expect<Inferred["manager"]>().type.toBe<{ readonly name: "alpha" }>();
    expect<Inferred["transitionEvents"]>().type.toBe<FSMEvent<"PLUGIN_EVENT", { source: "alpha" }>>();
  });

  test("широкий LiteFsmPlugin[] не обязан сохранять plugin-specific inference", () => {
    const plugin = createFactoryPlugin("alpha");
    const plugins: LiteFsmPlugin[] = [plugin];

    type WideCapabilities = NonNullable<(typeof plugins)[number]["__capabilities"]>;
    type HasManager = "manager" extends keyof WideCapabilities ? true : false;

    expect<WideCapabilities>().type.toBe<{}>();
    expect<HasManager>().type.toBe<false>();
  });
});

describe("MachineManager(..., { plugins })", () => {
  test("MachineManagerOptions сохраняет literal tuple plugins", () => {
    const plugin = createFactoryPlugin("tuple");
    type Options = MachineManagerOptions<typeof machines, Event, readonly [typeof plugin]>;

    expect<NonNullable<Options["plugins"]>>().type.toBe<readonly [typeof plugin]>();
  });

  test("отсутствие plugins сохраняет default event inference", () => {
    const manager = MachineManager(machines);

    expect(manager.transition).type.toBe<IMachineManager<typeof machines, Event>["transition"]>();
  });

  test("MachineManager добавляет transitionEvents из plugin tuple", () => {
    const plugin = createFactoryPlugin("manager");
    const manager = MachineManager(machines, { plugins: [plugin] as const });

    expect(manager).type.toBe<ManagerFromPlugins<typeof machines, Event, readonly [typeof plugin]>>();
    expect(manager.name).type.toBe<"manager">();
  });
});

describe("PluginCapabilities", () => {
  test("публикует type-level capability keys", () => {
    type _Keys = Assert<
      Equal<keyof PluginCapabilities, "manager" | "transitionEvents" | "machine" | "actionMeta" | "deps" | "transition">
    >;
  });

  test("публикует routing resolver types", () => {
    type _Result = Assert<Equal<RouteResolverResult, string | readonly string[]>>;
    const resolver: RouteResolver<"entityId"> = (value, ctx) => {
      expect(ctx).type.toBe<RouteResolverContext<"entityId">>();
      return [String(value)];
    };

    expect(resolver).type.toBe<RouteResolver<"entityId">>();
  });

  test("публикует action interceptors и dispatch hook types", () => {
    type _ActionResult = Assert<
      Equal<
        ActionInterceptorResult,
        | void
        | {
            readonly action?: ManagerAction<AnyEvent>;
            readonly skipDelivery?: boolean;
            readonly stopInterceptors?: boolean;
          }
      >
    >;
    type _ActionRegistry = Assert<Equal<ActionRegistry, { intercept(handler: ActionInterceptor): void }>>;
    type _DispatchRegistry = Assert<
      Equal<
        DispatchRegistry,
        {
          beforeReduce(hook: DispatchHook): void;
          afterReduce(hook: DispatchHook): void;
          beforeCommit(hook: DispatchHook): void;
          beforeSubscribers(hook: DispatchHook): void;
          beforeEffects(hook: DispatchHook): void;
          afterEffects(hook: DispatchHook): void;
        }
      >
    >;
  });
});
