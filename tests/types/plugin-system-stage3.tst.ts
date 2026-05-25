import { describe, expect, test } from "tstyche";
import { definePlugin, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig } from "@lite-fsm/core";
import type { LiteFsmPlugin } from "@lite-fsm/core/internal/plugin";

type AppEvent = FSMEvent<"APP_EVENT", { readonly id: string }>;
type PluginEvent = FSMEvent<"PLUGIN_EVENT", { readonly id: string }>;
type HostEvent = FSMEvent<"HOST_EVENT", { readonly id: string }>;
type OtherPluginEvent = FSMEvent<"OTHER_PLUGIN_EVENT", { readonly id: number }>;
type AppConfig = { readonly idle: { readonly APP_EVENT: "idle" } };
type AppMachine = MachineConfig<AppConfig, {}, AppEvent>;

const appMachine: AppMachine = {
  config: { idle: { APP_EVENT: "idle" } },
  initialState: "idle",
  initialContext: {},
};

const machines = { app: appMachine };

const plugin = definePlugin<PluginEvent, HostEvent>().create({
  name: "stage-three-plugin",
  manager: {
    tools() {
      return { ready: true } as const;
    },
  },
});

const otherPlugin = definePlugin<OtherPluginEvent>().create({
  name: "stage-three-other-plugin",
});

type WidePluginValue = LiteFsmPlugin<string, never, object>;

describe("MachineManager plugins — этап 3", () => {
  test("принимает tuple builder plugin values и добавляет события только текущего tuple", () => {
    const manager = MachineManager(machines, { plugins: [plugin] });

    manager.transition({ type: "APP_EVENT", payload: { id: "app" } });
    manager.transition({ type: "PLUGIN_EVENT", payload: { id: "plugin" } });
    expect(manager.tools.ready).type.toBe<true>();

    // @ts-expect-error!
    manager.transition({ type: "HOST_EVENT", payload: { id: "host" } });
    // @ts-expect-error!
    manager.transition({ type: "OTHER_PLUGIN_EVENT", payload: { id: 1 } });
  });

  test("учитывает только plugin values из переданного tuple", () => {
    const manager = MachineManager(machines, { plugins: [plugin, otherPlugin] });

    manager.transition({ type: "PLUGIN_EVENT", payload: { id: "plugin" } });
    manager.transition({ type: "OTHER_PLUGIN_EVENT", payload: { id: 1 } });

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

  test("широкий plugin array не обязан сохранять plugin-specific inference", () => {
    const plugins: readonly WidePluginValue[] = [plugin as unknown as WidePluginValue];
    const manager = MachineManager(machines, { plugins });

    manager.transition({ type: "APP_EVENT", payload: { id: "app" } });

    // @ts-expect-error!
    manager.transition({ type: "PLUGIN_EVENT", payload: { id: "plugin" } });
    // @ts-expect-error!
    manager.tools;
  });
});
