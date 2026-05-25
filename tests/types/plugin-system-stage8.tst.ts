import { describe, expect, test } from "tstyche";
import { definePlugin, MachineManager } from "@lite-fsm/core";
import type {
  FSMEvent,
  LiteFsmPlugin,
  MachineConfig,
  ManagerAction,
  ManagerExtensionAppEvents,
  ManagerExtensionCapability,
  ManagerExtensionFactory,
  ManagerExtensionRegistry,
  ManagerExtensionStore,
  ManagerFromPlugins,
  ManagerRuntimeContext,
  PluginManagerExtensions,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type Start = FSMEvent<"START">;
type Stop = FSMEvent<"STOP">;
type AppEvent = Start | Stop;
type Config = { idle: { START: "active" }; active: { STOP: "idle" } };
type Ctx = { id: string };
type CounterMachine = MachineConfig<Config, Ctx, AppEvent>;

const counter: CounterMachine = {
  config: { idle: { START: "active" }, active: { STOP: "idle" } },
  initialState: "idle",
  initialContext: { id: "counter" },
};

const machines = {
  counter,
};

type AuditExtension = {
  readonly audit: {
    readonly machineKeys: () => readonly string[];
    readonly start: () => ManagerAction<AppEvent>;
  };
};

const auditPlugin = definePlugin<{ readonly manager: AuditExtension }>({
  name: "manager-audit",
  install(ctx) {
    ctx.manager.extend("audit", (runtime) => ({
      machineKeys: () => Object.keys(runtime.config),
      start: () => runtime.transition({ type: "START" }) as ManagerAction<AppEvent>,
    }));
  },
});

type MachineKeysManagerExtension<Capability extends ManagerExtensionCapability> = {
  readonly machineTools: {
    readonly key: keyof ManagerExtensionStore<Capability>;
    readonly transition: (
      action: ManagerAction<ManagerExtensionAppEvents<Capability>>,
    ) => ManagerAction<ManagerExtensionAppEvents<Capability>>;
  };
};

interface MachineKeysManagerCapability extends ManagerExtensionCapability {
  __liteFsmManagerExtension(): MachineKeysManagerExtension<this>;
}

const machineKeysPlugin = definePlugin<{ readonly manager: MachineKeysManagerCapability }>({
  name: "machine-keys",
  install(ctx) {
    ctx.manager.extend("machineTools", (runtime) => ({
      key: Object.keys(runtime.config)[0],
      transition: runtime.transition,
    }));
  },
});

describe("plugin system stage 8 — manager extension types", () => {
  test("plugin добавляет typed manager.foo", () => {
    const manager = MachineManager(machines, { plugins: [auditPlugin] as const });

    expect(manager.audit.machineKeys()).type.toBe<readonly string[]>();
    expect(manager.audit.start()).type.toBe<ManagerAction<AppEvent>>();
    expect(manager).type.toBe<ManagerFromPlugins<typeof machines, AppEvent, readonly [typeof auditPlugin]>>();
  });

  test("PluginManagerExtensions выводит object capability из текущего tuple", () => {
    type _AuditExtension = Assert<
      Equal<PluginManagerExtensions<typeof machines, AppEvent, readonly [typeof auditPlugin]>, AuditExtension>
    >;
    const manager = MachineManager(machines, { plugins: [auditPlugin] as const });

    expect<PluginManagerExtensions<typeof machines, AppEvent, readonly [typeof auditPlugin]>>().type.toBeAssignableTo<
      AuditExtension
    >();
    expect(manager.audit.start()).type.toBe<ManagerAction<AppEvent>>();
  });

  test("manager extension capability может зависеть от S и AppEvents текущего manager", () => {
    const manager = MachineManager(machines, { plugins: [machineKeysPlugin] as const });

    expect(manager.machineTools.key).type.toBe<"counter">();
    expect(manager.machineTools.transition({ type: "START" })).type.toBe<ManagerAction<AppEvent>>();
    // @ts-expect-error!
    manager.machineTools.transition({ type: "OTHER" });
  });

  test("без plugin TypeScript не показывает manager extension field", () => {
    const manager = MachineManager(machines);

    // @ts-expect-error!
    manager.audit;
    // @ts-expect-error!
    manager.machineTools;
  });

  test("широкий LiteFsmPlugin[] не обязан сохранять plugin-specific manager extension inference", () => {
    const plugins: LiteFsmPlugin[] = [auditPlugin, machineKeysPlugin];
    const manager = MachineManager(machines, { plugins });

    // @ts-expect-error!
    manager.audit;
    // @ts-expect-error!
    manager.machineTools;
  });

  test("публикует manager extension registry и factory/context types", () => {
    type _Registry = Assert<
      Equal<
        ManagerExtensionRegistry,
        {
          extend<Key extends string, Value>(key: Key, factory: ManagerExtensionFactory<Value>): void;
        }
      >
    >;
    type _ContextKeys = Assert<
      Equal<
        keyof ManagerRuntimeContext,
        | "config"
        | "options"
        | "schemaVersion"
        | "getState"
        | "transition"
        | "onTransition"
        | "getDependencies"
      >
    >;
    const factory: ManagerExtensionFactory<{ readonly ready: true }> = (runtime) => {
      expect(runtime.config).type.toBeAssignableTo<Record<string, unknown>>();
      expect(runtime.getState()).type.toBeAssignableTo<Record<string, unknown>>();
      return { ready: true };
    };

    expect(factory).type.toBe<(ctx: ManagerRuntimeContext) => { readonly ready: true }>();
  });
});
