import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, MachineManager } from "@lite-fsm/core";
import type {
  AnyEvent,
  FSMEvent,
  MachineStore,
  ManagerAction,
  ManagerFromPlugins,
  ManagerRuntimeContext,
  MachinesState,
  PluginManagerExtensions,
  PluginRouteMeta,
  ReadonlyManagerAction,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

// @ts-expect-error!
import type { ManagerExtensionsForPlugins } from "@lite-fsm/core";

type AppEvent = FSMEvent<"APP_EVENT", { readonly id: string }>;
type PluginEvent = FSMEvent<"PLUGIN_EVENT", { readonly id: string }>;
type HostEvent = FSMEvent<"HOST_EVENT", { readonly id: string }>;
type OtherPluginEvent = FSMEvent<"OTHER_PLUGIN_EVENT", { readonly id: string }>;
type AppConfig = { readonly idle: { readonly APP_EVENT: "idle" } };
type EntityAccess<State> = {
  readonly read: () => State;
};

const appMachine = createMachine<AppEvent, {}, AppConfig, {}>({
  config: {
    idle: { APP_EVENT: "idle" },
  },
  initialState: "idle",
  initialContext: {},
});

const stageFourPlugin = definePlugin<PluginEvent, HostEvent>().create({
  name: "stage-four-plugin",
  routeMeta: {
    entityId(value: string, ctx) {
      expect(ctx.key).type.toBe<"entityId">();
      expect(ctx.action).type.toBe<ReadonlyManagerAction<HostEvent | PluginEvent>>();

      return value;
    },
    loose(value, ctx) {
      expect(value).type.toBe<unknown>();
      expect(ctx.key).type.toBe<"loose">();

      return String(value);
    },
  },
  manager: {
    audit(ctx) {
      expect(ctx.getState()).type.toBe<MachinesState<MachineStore>>();
      expect(ctx.transition({ type: "PLUGIN_EVENT", payload: { id: "plugin" } })).type.toBe<
        ManagerAction<PluginEvent>
      >();
      // @ts-expect-error!
      ctx.transition({ type: "HOST_EVENT", payload: { id: "host" } });
      // @ts-expect-error!
      ctx.transition({ type: "UNDECLARED_EVENT" });

      return {
        enabled: true,
        ping: () => ctx.transition({ type: "PLUGIN_EVENT", payload: { id: "plugin" } }),
      } as const;
    },
  },
});

const otherPlugin = definePlugin<OtherPluginEvent>().create({
  name: "stage-four-other-plugin",
  routeMeta: {
    otherId(value: number) {
      return String(value);
    },
  },
});

const storeParametricPlugin = definePlugin().create({
  name: "stage-four-store-parametric-manager",
  manager: {
    access<S extends MachineStore>(ctx: ManagerRuntimeContext<AnyEvent, S>): EntityAccess<MachinesState<S>> {
      return {
        read: () => ctx.getState(),
      };
    },
  },
});

const markerPlugin = definePlugin().create({
  name: "stage-four-marker-manager",
  manager: {
    marker() {
      return { enabled: true } as const;
    },
  },
});

const genericMethodPlugin = definePlugin().create({
  name: "stage-four-generic-method-manager",
  manager: {
    tools() {
      return {
        select<Value>(value: Value): Value {
          return value;
        },
      };
    },
  },
});

const machines = { app: appMachine };

describe("plugin system — этап 4 types", () => {
  test("ManagerRuntimeContext сохраняет Events generic и параметризуется store", () => {
    type LegacyContext = ManagerRuntimeContext<AppEvent>;
    type StoreContext = ManagerRuntimeContext<AppEvent, typeof machines>;

    type _LegacyConfig = Assert<Equal<LegacyContext["config"], MachineStore>>;
    type _LegacyState = Assert<Equal<ReturnType<LegacyContext["getState"]>, MachinesState<MachineStore>>>;
    type _StoreConfig = Assert<Equal<StoreContext["config"], typeof machines>>;
    type _StoreState = Assert<Equal<ReturnType<StoreContext["getState"]>, MachinesState<typeof machines>>>;
    type _StoreTransition = Assert<
      Equal<StoreContext["transition"], (action: ManagerAction<AppEvent>, options?: unknown) => ManagerAction<AppEvent>>
    >;
  });

  test("добавляет optional route meta только в manager.transition подключенного tuple", () => {
    const manager = MachineManager(machines, { plugins: [stageFourPlugin] });

    manager.transition({ type: "APP_EVENT", payload: { id: "app" } });
    manager.transition({ type: "APP_EVENT", payload: { id: "app" }, meta: {} });
    manager.transition({ type: "APP_EVENT", payload: { id: "app" }, meta: { entityId: "entity/a" } });
    manager.transition({ type: "APP_EVENT", payload: { id: "app" }, meta: { loose: { any: "value" } } });
    manager.transition({ type: "PLUGIN_EVENT", payload: { id: "plugin" }, meta: { entityId: "entity/a" } });

    // @ts-expect-error!
    manager.transition({ type: "APP_EVENT", payload: { id: "app" }, meta: { entityId: 1 } });
    // @ts-expect-error!
    manager.transition({ type: "APP_EVENT", payload: { id: "app" }, meta: { otherId: 1 } });
    // @ts-expect-error!
    manager.transition({ type: "HOST_EVENT", payload: { id: "host" }, meta: { entityId: "entity/a" } });
  });

  test("не добавляет route meta и manager extension без plugin tuple", () => {
    const manager = MachineManager(machines);

    manager.transition({ type: "APP_EVENT", payload: { id: "app" } });

    // @ts-expect-error!
    manager.transition({ type: "APP_EVENT", payload: { id: "app" }, meta: { entityId: "entity/a" } });
    // @ts-expect-error!
    manager.audit;
  });

  test("PluginRouteMeta остается raw map, а PluginManagerExtensions сохраняет default store", () => {
    type _RouteMeta = Assert<
      Equal<PluginRouteMeta<typeof stageFourPlugin>, { readonly entityId: string; readonly loose: unknown }>
    >;
    type _ManagerExtensions = Assert<
      Equal<
        PluginManagerExtensions<typeof stageFourPlugin>,
        { readonly audit: { readonly enabled: true; readonly ping: () => ManagerAction<PluginEvent> } }
      >
    >;
    type _TupleRouteMeta = Assert<
      Equal<
        PluginRouteMeta<readonly [typeof stageFourPlugin, typeof otherPlugin]>,
        { readonly entityId: string; readonly loose: unknown; readonly otherId: number }
      >
    >;

    // @ts-expect-error!
    type _LegacyShape = PluginManagerExtensions<typeof machines, AppEvent, readonly [typeof stageFourPlugin]>;
  });

  test("PluginManagerExtensions инстанцирует generic manager factory текущим store", () => {
    type _DefaultStore = Assert<
      Equal<
        PluginManagerExtensions<typeof storeParametricPlugin>,
        { readonly access: EntityAccess<MachinesState<MachineStore>> }
      >
    >;
    type _CurrentStore = Assert<
      Equal<
        PluginManagerExtensions<typeof storeParametricPlugin, typeof machines>,
        { readonly access: EntityAccess<MachinesState<typeof machines>> }
      >
    >;
    type _TupleIntersection = Assert<
      Equal<
        PluginManagerExtensions<readonly [typeof storeParametricPlugin, typeof markerPlugin], typeof machines>,
        {
          readonly access: EntityAccess<MachinesState<typeof machines>>;
          readonly marker: { readonly enabled: true };
        }
      >
    >;
  });

  test("PluginManagerExtensions сохраняет generic methods без store references", () => {
    type _GenericMethod = Assert<
      Equal<
        PluginManagerExtensions<typeof genericMethodPlugin, typeof machines>,
        {
          readonly tools: {
            select<Value>(value: Value): Value;
          };
        }
      >
    >;
  });

  test("manager factory не фиксирует конкретный store на уровне plugin definition", () => {
    definePlugin().create({
      name: "stage-four-concrete-store-manager",
      manager: {
        // @ts-expect-error!
        access(ctx: ManagerRuntimeContext<AnyEvent, typeof machines>) {
          return ctx.getState().app;
        },
      },
    });
  });

  test("ManagerFromPlugins и MachineManager возвращают store-parametric manager extension", () => {
    const manager = MachineManager(machines, { plugins: [storeParametricPlugin] });

    expect(manager).type.toBe<ManagerFromPlugins<typeof machines, AppEvent, readonly [typeof storeParametricPlugin]>>();
    expect(manager.access.read()).type.toBe<MachinesState<typeof machines>>();
    expect(manager.access.read().app.context).type.toBe<{}>();
  });

  test("manager extension доступен только при подключенном plugin tuple", () => {
    const withPlugin = MachineManager(machines, { plugins: [stageFourPlugin] });
    const withoutPlugin = MachineManager(machines);

    expect(withPlugin.audit.enabled).type.toBe<true>();
    expect(withPlugin.audit.ping()).type.toBe<ManagerAction<PluginEvent>>();

    // @ts-expect-error!
    withoutPlugin.audit;
  });
});
