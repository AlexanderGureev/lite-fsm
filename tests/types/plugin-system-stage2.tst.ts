import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin } from "@lite-fsm/core";
import type {
  AnyEvent,
  EffectDeps,
  FSMEvent,
  ManagerAction,
  ManagerFromPlugins,
  PluginMachineExtensions,
  PluginManagerEvents,
  PluginManagerExtensions,
  PluginRouteMeta,
  PluginScopedDeps,
  PluginScopedTransition,
  ReadonlyManagerAction,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type AppEvent = FSMEvent<"APP_EVENT", { readonly id: string }>;
type HostEvent = FSMEvent<"HOST_EVENT", { readonly id: string }>;
type PluginEvent = FSMEvent<"PLUGIN_EVENT", { readonly id: string }>;
type OtherPluginEvent = FSMEvent<"OTHER_PLUGIN_EVENT", { readonly otherId: number }>;
type AppConfig = { readonly idle: { readonly APP_EVENT: "idle" } };
type AppWithPluginConfig = { readonly idle: { readonly APP_EVENT: "idle"; readonly PLUGIN_EVENT: "idle" } };

const observingPlugin = definePlugin<PluginEvent, HostEvent>().create({
  name: "observing-plugin",
  routeMeta: {
    entityId(value: string, ctx) {
      expect(ctx.action).type.toBe<ReadonlyManagerAction<HostEvent | PluginEvent>>();

      return value;
    },
    loose(value) {
      expect(value).type.toBe<unknown>();

      return String(value);
    },
  },
  manager: {
    audit() {
      return { enabled: true } as const;
    },
  },
});

const effectPlugin = definePlugin<PluginEvent>().create({
  name: "effect-plugin",
  scopedDeps: {
    currentUser(scope) {
      expect(scope.event).type.toBe<ReadonlyManagerAction<AnyEvent>>();

      return { id: scope.source.template } as const;
    },
    trace(scope) {
      return (message: string) => `${scope.phase}:${message}`;
    },
  },
  scopedTransition: {
    notify(scope) {
      return (id: string) => scope.transition({ type: "PLUGIN_EVENT", payload: { id } });
    },
  },
});

const otherPlugin = definePlugin<OtherPluginEvent>().create({
  name: "other-plugin",
  routeMeta: {
    otherId(value: number) {
      return String(value);
    },
  },
  manager: {
    otherAudit() {
      return { level: "other" } as const;
    },
  },
});

type PluginTuple = readonly [typeof observingPlugin, typeof otherPlugin];
type PluginUnion = typeof observingPlugin | typeof otherPlugin;

const appMachine = createMachine<AppEvent, {}, AppConfig, {}>({
  config: {
    idle: { APP_EVENT: "idle" },
  },
  initialState: "idle",
  initialContext: {},
});

type Store = { readonly app: typeof appMachine };

describe("plugin helper types — этап 2", () => {
  test("извлекает manager events из PluginEvents без HostEvents", () => {
    type _Single = Assert<Equal<PluginManagerEvents<typeof observingPlugin>, PluginEvent>>;
    type _Tuple = Assert<Equal<PluginManagerEvents<PluginTuple>, PluginEvent | OtherPluginEvent>>;
    type _Union = Assert<Equal<PluginManagerEvents<PluginUnion>, PluginEvent | OtherPluginEvent>>;
    type _HostEventsExcluded = Assert<Equal<Extract<PluginManagerEvents<typeof observingPlugin>, HostEvent>, never>>;
  });

  test("извлекает raw route meta map из plugin union и tuple", () => {
    type _Single = Assert<
      Equal<PluginRouteMeta<typeof observingPlugin>, { readonly entityId: string; readonly loose: unknown }>
    >;
    type _Tuple = Assert<
      Equal<
        PluginRouteMeta<PluginTuple>,
        { readonly entityId: string; readonly loose: unknown; readonly otherId: number }
      >
    >;
    type _UnionMatchesTuple = Assert<Equal<PluginRouteMeta<PluginTuple>, PluginRouteMeta<PluginUnion>>>;
  });

  test("извлекает scoped deps, scoped transition и manager extensions из DSL keys", () => {
    type _ScopedDeps = Assert<
      Equal<
        PluginScopedDeps<typeof effectPlugin>,
        { readonly currentUser: { readonly id: string }; readonly trace: (message: string) => string }
      >
    >;
    type _ScopedTransition = Assert<
      Equal<PluginScopedTransition<typeof effectPlugin>, { readonly notify: (id: string) => ManagerAction<PluginEvent> }>
    >;
    type _ManagerExtensions = Assert<
      Equal<PluginManagerExtensions<typeof observingPlugin>, { readonly audit: { readonly enabled: true } }>
    >;
    type _TupleManagerExtensions = Assert<
      Equal<
        PluginManagerExtensions<PluginTuple>,
        { readonly audit: { readonly enabled: true }; readonly otherAudit: { readonly level: "other" } }
      >
    >;
  });

  test("EffectDeps добавляет scoped deps и scoped transition methods без callable core transition", () => {
    type AppDeps = { readonly api: { readonly save: () => Promise<void> } };
    type Deps = EffectDeps<AppDeps, readonly [typeof effectPlugin]>;
    type _Deps = Assert<
      Deps extends AppDeps & {
        readonly currentUser: { readonly id: string };
        readonly trace: (message: string) => string;
        readonly transition: { readonly notify: (id: string) => ManagerAction<PluginEvent> };
      }
        ? true
        : false
    >;

    const deps = null as unknown as Deps;

    expect(deps.transition.notify("id")).type.toBe<ManagerAction<PluginEvent>>();
    // @ts-expect-error!
    deps.transition({ type: "PLUGIN_EVENT", payload: { id: "id" } });
  });

  test("manager-level composition берет события только из текущего plugin tuple", () => {
    const manager = null as unknown as ManagerFromPlugins<Store, AppEvent, readonly [typeof observingPlugin]>;

    manager.transition({ type: "APP_EVENT", payload: { id: "app" } });
    manager.transition({ type: "PLUGIN_EVENT", payload: { id: "plugin" } });
    expect(manager.audit.enabled).type.toBe<true>();
    // @ts-expect-error!
    manager.transition({ type: "HOST_EVENT", payload: { id: "host" } });
    // @ts-expect-error!
    manager.transition({ type: "OTHER_PLUGIN_EVENT", payload: { otherId: 1 } });
  });

  test("createMachine не получает plugin events без явного включения PluginManagerEvents", () => {
    createMachine<AppEvent, {}, AppConfig, {}>({
      config: {
        idle: {
          APP_EVENT: "idle",
        },
      },
      initialState: "idle",
      initialContext: {},
    });

    // @ts-expect-error!
    createMachine<AppEvent, {}, AppWithPluginConfig, {}>({
      config: {
        idle: {
          APP_EVENT: "idle",
          PLUGIN_EVENT: "idle",
        },
      },
      initialState: "idle",
      initialContext: {},
    });

    type AppWithPluginEvents = AppEvent | PluginManagerEvents<typeof observingPlugin>;

    createMachine<AppWithPluginEvents, {}, AppWithPluginConfig, {}>({
      config: {
        idle: { APP_EVENT: "idle", PLUGIN_EVENT: "idle" },
      },
      initialState: "idle",
      initialContext: {},
    });
  });

  test("PluginMachineExtensions остается never до typed storage definitions", () => {
    type _Single = Assert<Equal<PluginMachineExtensions<typeof observingPlugin>, never>>;
    type _Tuple = Assert<Equal<PluginMachineExtensions<readonly [typeof observingPlugin]>, never>>;
  });

  test("PluginManagerExtensions остается public helper с одним plugin input", () => {
    type _OneInput = Assert<
      Equal<PluginManagerExtensions<typeof observingPlugin>, { readonly audit: { readonly enabled: true } }>
    >;
    // @ts-expect-error!
    type _LegacyShape = PluginManagerExtensions<Store, AppEvent, readonly [typeof observingPlugin]>;
  });
});
