import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, MachineManager } from "@lite-fsm/core";
import type {
  AnyEvent,
  FSMEvent,
  MachineStore,
  ManagerAction,
  MachinesState,
  PluginManagerExtensions,
  PluginRouteMeta,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

// @ts-expect-error!
import type { ManagerExtensionsForPlugins } from "@lite-fsm/core";

type AppEvent = FSMEvent<"APP_EVENT", { readonly id: string }>;
type PluginEvent = FSMEvent<"PLUGIN_EVENT", { readonly id: string }>;
type HostEvent = FSMEvent<"HOST_EVENT", { readonly id: string }>;
type OtherPluginEvent = FSMEvent<"OTHER_PLUGIN_EVENT", { readonly id: string }>;
type AppConfig = { readonly idle: { readonly APP_EVENT: "idle" } };

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
      expect(ctx.action).type.toBe<ManagerAction<HostEvent | PluginEvent>>();

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
      expect(ctx.transition({ type: "UNDECLARED_EVENT" })).type.toBe<ManagerAction<AnyEvent>>();

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

const machines = { app: appMachine };

describe("plugin system — этап 4 types", () => {
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

  test("PluginRouteMeta остается raw map, а PluginManagerExtensions остается one-generic helper", () => {
    type _RouteMeta = Assert<
      Equal<PluginRouteMeta<typeof stageFourPlugin>, { readonly entityId: string; readonly loose: unknown }>
    >;
    type _ManagerExtensions = Assert<
      Equal<
        PluginManagerExtensions<typeof stageFourPlugin>,
        { readonly audit: { readonly enabled: true; readonly ping: () => ManagerAction<AnyEvent> } }
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

  test("manager extension доступен только при подключенном plugin tuple", () => {
    const withPlugin = MachineManager(machines, { plugins: [stageFourPlugin] });
    const withoutPlugin = MachineManager(machines);

    expect(withPlugin.audit.enabled).type.toBe<true>();
    expect(withPlugin.audit.ping()).type.toBe<ManagerAction<AnyEvent>>();

    // @ts-expect-error!
    withoutPlugin.audit;
  });
});
