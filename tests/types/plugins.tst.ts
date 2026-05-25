import { describe, expect, test } from "tstyche";
import { definePlugin, defineStorageRuntime, MachineManager } from "@lite-fsm/core";
import type {
  AnyEvent,
  EffectDeps,
  FSMEvent,
  IMachineManager,
  MachineConfig,
  MachineManagerOptions,
  MachinesState,
  Middleware,
  ManagerAction,
  ManagerFromPlugins,
  PluginMachineExtensions,
  PluginManagerEvents,
  PluginManagerExtensions,
  PluginRouteMeta,
  PluginScopedDeps,
  PluginScopedTransition,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type Ping = FSMEvent<"PING">;
type Pong = FSMEvent<"PONG", { id: string }>;
type AppEvent = Ping | Pong;
type PluginEvent = FSMEvent<"PLUGIN_EVENT", { source: "plugin" }>;
type HostEvent = FSMEvent<"HOST_EVENT", { id: string }>;
type Config = { idle: { PING: "ready" }; ready: { PONG: "idle" } };
type Context = { id: string };
type Machine = MachineConfig<Config, Context, AppEvent>;
type Store = { machine: Machine };

const machine: Machine = {
  config: { idle: { PING: "ready" }, ready: { PONG: "idle" } },
  initialState: "idle",
  initialContext: { id: "" },
};

const machines: Store = { machine };

type CacheExtension = {
  readonly input: {
    readonly initialContext: { readonly value: number };
  };
  readonly publicState: { readonly value: number };
  readonly effectDeps: { readonly cache: () => void };
};

const cacheStorage = defineStorageRuntime<CacheExtension>().create({
  kind: "cache",
  validateTemplate(ctx) {
    expect(ctx.storageKind).type.toBe<"cache">();
    expect(ctx.machine.initialContext).type.toBeAssignableTo<{ readonly value: number }>();
  },
  compileTemplate(ctx) {
    expect(ctx.storageKind).type.toBe<"cache">();
    return { data: { value: ctx.machine.initialContext.value } };
  },
  createRuntimeState() {
    return {};
  },
  createPublicInitialState() {
    return { value: 0 };
  },
  acceptsEvent() {
    return false;
  },
  reduce() {},
  commit() {},
});

const plugin = definePlugin<PluginEvent, HostEvent>().create({
  name: "typed-plugin",
  routeMeta: {
    entityId(value: string, ctx) {
      expect(ctx.key).type.toBe<"entityId">();
      expect(ctx.action).type.toBe<ManagerAction<PluginEvent | HostEvent>>();

      return value;
    },
  },
  manager: {
    tools(ctx) {
      expect(ctx.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } })).type.toBe<
        ManagerAction<AnyEvent>
      >();

      return {
        ready: true,
        emit: () => ctx.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } }),
      } as const;
    },
  },
  scopedDeps: {
    current(scope) {
      expect(scope.event).type.toBe<ManagerAction<PluginEvent | HostEvent>>();

      return { template: scope.source.template } as const;
    },
  },
  scopedTransition: {
    pluginOnly(scope) {
      expect(scope.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } })).type.toBe<
        ManagerAction<PluginEvent>
      >();

      return () => scope.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } });
    },
  },
  intercept(ctx) {
    expect(ctx.action).type.toBe<ManagerAction<PluginEvent | HostEvent>>();

    return { skipDelivery: false };
  },
  hooks: {
    beforeEffects(ctx) {
      expect(ctx.runtime).type.toBe<Map<string, unknown>>();
      ctx.reportError(new Error("optional"));
    },
  },
});

const storagePlugin = definePlugin<PluginEvent>().create({
  name: "storage-plugin",
  storage: [cacheStorage],
});

describe("definePlugin().create(...)", () => {
  test("сохраняет literal name и contextual typing final sections", () => {
    expect(plugin.name).type.toBe<"typed-plugin">();

    // @ts-expect-error!
    definePlugin({ name: "direct-call", setup() {} });

    definePlugin().create({
      name: "unknown-callback",
      // @ts-expect-error!
      setup() {},
    });
  });

  test("выводит public helper types из DSL sections", () => {
    type _Events = Assert<Equal<PluginManagerEvents<typeof plugin>, PluginEvent>>;
    type _RouteMeta = Assert<Equal<PluginRouteMeta<typeof plugin>, { readonly entityId: string }>>;
    type _Manager = Assert<
      Equal<
        PluginManagerExtensions<typeof plugin>,
        { readonly tools: { readonly ready: true; readonly emit: () => ManagerAction<AnyEvent> } }
      >
    >;
    type _ScopedDeps = Assert<Equal<PluginScopedDeps<typeof plugin>, { readonly current: { readonly template: string } }>>;
    type _ScopedTransition = Assert<
      Equal<PluginScopedTransition<typeof plugin>, { readonly pluginOnly: () => ManagerAction<PluginEvent> }>
    >;
  });

  test("выводит storage machine extension из defineStorageRuntime", () => {
    type Expected = {
      readonly input: {
        readonly initialContext: { readonly value: number };
      };
      readonly publicState: { readonly value: number };
      readonly effectDeps: { readonly cache: () => void };
      readonly storage: "cache";
    };

    type _MachineExtension = Assert<Equal<PluginMachineExtensions<typeof storagePlugin>, Expected>>;
  });
});

describe("MachineManager(..., { plugins })", () => {
  test("MachineManagerOptions сохраняет literal tuple plugins", () => {
    type Options = MachineManagerOptions<typeof machines, AppEvent, readonly [typeof plugin]>;

    expect<NonNullable<Options["plugins"]>>().type.toBe<readonly [typeof plugin]>();
  });

  test("отсутствие plugins сохраняет default event inference", () => {
    const manager = MachineManager(machines);

    expect(manager.transition).type.toBe<IMachineManager<typeof machines, AppEvent>["transition"]>();
    // @ts-expect-error!
    manager.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } });
    // @ts-expect-error!
    manager.tools;
  });

  test("явные generic S/P с opts без plugins не расширяют события plugin union", () => {
    const middleware: Middleware<MachinesState<Store>, AppEvent> = () => (next) => (action) => next(action);
    const manager = MachineManager<Store, AppEvent>(machines, { middleware: [middleware] });

    manager.transition({ type: "PING" });
    manager.transition({ type: "PONG", payload: { id: "pong" } });
    expect(manager.onTransition).type.toBe<IMachineManager<Store, AppEvent>["onTransition"]>();

    // @ts-expect-error!
    manager.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } });
    // @ts-expect-error!
    manager.tools;
  });

  test("MachineManager добавляет PluginEvents и manager extensions из plugin tuple", () => {
    const manager = MachineManager(machines, { plugins: [plugin] as const });

    expect(manager).type.toBe<ManagerFromPlugins<typeof machines, AppEvent, readonly [typeof plugin]>>();
    manager.transition({ type: "PING" });
    manager.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } });
    expect(manager.tools.ready).type.toBe<true>();

    // @ts-expect-error!
    manager.transition({ type: "HOST_EVENT", payload: { id: "host" } });
  });

  test("не принимает structural plugin-like object на type-level", () => {
    MachineManager(machines, {
      plugins: [
        {
          name: "structural",
          // @ts-expect-error!
          setup() {},
        },
      ],
    });
  });
});

describe("EffectDeps<AppDeps, Plugin>", () => {
  test("добавляет scoped deps и scoped transition methods для tuple и union", () => {
    type AppDeps = { readonly api: () => void };
    type TupleDeps = EffectDeps<AppDeps, readonly [typeof plugin]>;
    type UnionDeps = EffectDeps<AppDeps, typeof plugin | typeof storagePlugin>;
    type ExpectedTransition = { readonly pluginOnly: () => ManagerAction<PluginEvent> };

    expect<TupleDeps>().type.toBeAssignableTo<{
      readonly api: () => void;
      readonly current: { readonly template: string };
      readonly transition: ExpectedTransition;
    }>();
    expect<UnionDeps["transition"]>().type.toBe<ExpectedTransition>();
  });
});
