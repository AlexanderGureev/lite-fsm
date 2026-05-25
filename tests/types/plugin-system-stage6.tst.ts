import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, MachineManager } from "@lite-fsm/core";
import type {
  EffectDeps,
  FSMEvent,
  ManagerAction,
  PluginManagerEvents,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { Assert } from "./_helpers";

type AppEvent = FSMEvent<"APP_EVENT", { readonly id: string }>;
type HostEvent = FSMEvent<"HOST_EVENT", { readonly id: string }>;
type PluginEvent = FSMEvent<"PLUGIN_EVENT", { readonly id: string }>;
type OtherEvent = FSMEvent<"OTHER_EVENT", { readonly id: string }>;
type AppDeps = { readonly clock: () => number };

const scopedPlugin = definePlugin<PluginEvent, HostEvent>().create({
  name: "stage-six-scoped",
  scopedDeps: {
    currentUser(scope) {
      expect(scope.event).type.toBe<ManagerAction<HostEvent | PluginEvent>>();
      expect(scope.transition).type.toBe<(action: ManagerAction<PluginEvent>) => ManagerAction<PluginEvent>>();

      scope.transition({ type: "PLUGIN_EVENT", payload: { id: "plugin" } });
      // @ts-expect-error!
      scope.transition({ type: "HOST_EVENT", payload: { id: "host" } });
      // @ts-expect-error!
      scope.transition({ type: "OTHER_EVENT", payload: { id: "other" } } satisfies ManagerAction<OtherEvent>);

      return { id: scope.source.template } as const;
    },
    trace(scope) {
      expect(scope.phase).type.toBe<"effect" | "reaction">();

      return (message: string) => `${scope.event.type}:${message}`;
    },
  },
  scopedTransition: {
    notify(scope) {
      expect(scope.event).type.toBe<ManagerAction<HostEvent | PluginEvent>>();

      return (id: string) => scope.transition({ type: "PLUGIN_EVENT", payload: { id } });
    },
  },
});

const commandPlugin = definePlugin<PluginEvent>().create({
  name: "stage-six-command",
  scopedTransition: {
    log(scope) {
      return (message: string): void => {
        void scope.event;
        void message;
      };
    },
  },
});

const noEventPlugin = definePlugin().create({
  name: "stage-six-no-events",
  scopedTransition: {
    emit(scope) {
      return () => {
        // @ts-expect-error!
        scope.transition({ type: "ARBITRARY_EVENT" });
      };
    },
  },
});

type AppWithPluginEvents = AppEvent | PluginManagerEvents<typeof scopedPlugin | typeof commandPlugin>;

const createAppMachine: TypedCreateMachineFn<
  AppWithPluginEvents,
  EffectDeps<AppDeps, readonly [typeof scopedPlugin, typeof commandPlugin]>
> = createMachine;

const appMachine = createAppMachine({
  config: {
    idle: { APP_EVENT: "ready" },
    ready: { PLUGIN_EVENT: "idle" },
  },
  initialState: "idle",
  initialContext: {},
  effects: {
    ready: ({ clock, currentUser, trace, transition }) => {
      expect(clock()).type.toBe<number>();
      expect(currentUser.id).type.toBe<string>();
      expect(trace("ready")).type.toBe<string>();
      expect(transition({ type: "APP_EVENT", payload: { id: "app" } })).type.toBe<
        ManagerAction<AppWithPluginEvents>
      >();
      expect(transition.notify("plugin")).type.toBe<ManagerAction<PluginEvent>>();
      expect(transition.log("message")).type.toBe<void>();
    },
  },
});

const machines = { app: appMachine };

describe("plugin system — этап 6 types", () => {
  test("inline scoped sections получают contextual scope", () => {
    type _ScopedDepKeys = Assert<
      EffectDeps<AppDeps, typeof scopedPlugin> extends AppDeps & {
          readonly currentUser: { readonly id: string };
          readonly trace: (message: string) => string;
          readonly transition: { readonly notify: (id: string) => ManagerAction<PluginEvent> };
        }
        ? true
        : false
    >;
    type _NoEvents = Assert<
      EffectDeps<{}, typeof noEventPlugin> extends {
        readonly transition: { readonly emit: () => void };
      }
        ? true
        : false
    >;
  });

  test("EffectDeps поддерживает tuple и union plugins", () => {
    type TupleDeps = EffectDeps<AppDeps, readonly [typeof scopedPlugin, typeof commandPlugin]>;
    type UnionDeps = EffectDeps<AppDeps, typeof scopedPlugin | typeof commandPlugin>;

    expect<TupleDeps>().type.toBeAssignableTo<{
      readonly clock: () => number;
      readonly currentUser: { readonly id: string };
      readonly trace: (message: string) => string;
      readonly transition: {
        readonly notify: (id: string) => ManagerAction<PluginEvent>;
        readonly log: (message: string) => void;
      };
    }>();
    expect<UnionDeps>().type.toBeAssignableTo<TupleDeps>();
    expect<TupleDeps>().type.toBeAssignableTo<UnionDeps>();
  });

  test("TypedCreateMachineFn D дает callable core transition вместе со scoped methods", () => {
    type MachineDeps = EffectDeps<AppDeps, readonly [typeof scopedPlugin, typeof commandPlugin]> & {
      readonly transition: (action: ManagerAction<AppWithPluginEvents>) => ManagerAction<AppWithPluginEvents>;
    };
    const deps = null as unknown as MachineDeps;

    expect(deps.transition({ type: "APP_EVENT", payload: { id: "app" } })).type.toBe<
      ManagerAction<AppWithPluginEvents>
    >();
    expect(deps.transition.notify("plugin")).type.toBe<ManagerAction<PluginEvent>>();
    expect(deps.transition.log("message")).type.toBe<void>();
  });

  test("manager.transition не получает scoped transition methods", () => {
    const manager = MachineManager(machines, { plugins: [scopedPlugin, commandPlugin] as const });

    manager.transition({ type: "APP_EVENT", payload: { id: "app" } });
    manager.transition({ type: "PLUGIN_EVENT", payload: { id: "plugin" } });

    // @ts-expect-error!
    manager.transition.notify("plugin");
    // @ts-expect-error!
    manager.transition.log("message");
  });
});
