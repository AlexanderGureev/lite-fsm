import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, MachineManager } from "@lite-fsm/core";
import type {
  CoreActionMeta,
  FSMEvent,
  MachineConfig,
  MachineDependencies,
  MachineEvents,
  MachineResultMetadata,
  MachineRuntimeMetadata,
  MachineRuntimeExtension,
  MachinesState,
  ManagerAction,
  ManagerActionMeta,
  ManagerFromPlugins,
  ManagerTransitionEvents,
  PluginActionMeta,
  PluginTransitionEvents,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type AppStart = FSMEvent<"APP_START">;
type AppStop = FSMEvent<"APP_STOP">;
type AppEvent = AppStart | AppStop;
type AppDeps = { readonly clock: () => number };
type PluginInternalEvent = FSMEvent<"PLUGIN_INTERNAL", { id: string }>;
type PluginTransitionEvent = FSMEvent<"PLUGIN_TRANSITION", { id: string }>;
type OtherPluginTransitionEvent = FSMEvent<"OTHER_PLUGIN_TRANSITION">;

type TestMachineExtension = {
  readonly storage: "test-storage";
  readonly input: {
    readonly initialContext: { readonly id: string; readonly pluginReady: true };
    readonly testRequired: { readonly route: string };
  };
  readonly internalEvents: PluginInternalEvent;
  readonly reducerContext: { readonly pluginScope: string };
  readonly effectDeps: { readonly pluginClock: () => number };
  readonly reactionDeps: { readonly pluginReaction: () => string };
  readonly resultMetadata: { readonly feature: "typed" };
  readonly publicState: { readonly visible: boolean; readonly id: string };
};

type OtherMachineExtension = {
  readonly storage: "other-storage";
  readonly input: { readonly otherRequired: true };
};

type StorageOf<Extension extends MachineRuntimeExtension> =
  Extension extends unknown
    ? "storage" extends keyof Extension
      ? NonNullable<Extension["storage"]> extends string
        ? NonNullable<Extension["storage"]>
        : never
      : never
    : never;
type _StorageOfExtensions = Assert<
  Equal<StorageOf<TestMachineExtension | OtherMachineExtension>, "test-storage" | "other-storage">
>;
type InvalidKeys<Extension extends MachineRuntimeExtension> =
  Extension extends unknown ? Exclude<keyof Extension, keyof MachineRuntimeExtension> : never;
type _ValidExtensionKeys = Assert<Equal<InvalidKeys<TestMachineExtension | OtherMachineExtension>, never>>;

const createAppMachine: TypedCreateMachineFn<AppEvent, AppDeps, TestMachineExtension | OtherMachineExtension> =
  createMachine;

const pluginMachine = createAppMachine({
  storage: "test-storage",
  testRequired: { route: "entity/a" },
  config: {
    IDLE: { APP_START: "READY", PLUGIN_INTERNAL: "READY" },
    READY: { APP_STOP: "IDLE" },
  },
  initialState: "IDLE",
  initialContext: { id: "a", pluginReady: true },
  reducer: (state, action, meta) => {
    expect(state.context.pluginReady).type.toBe<true>();
    expect(action).type.toBe<ManagerAction<AppEvent | PluginInternalEvent>>();
    expect(meta.pluginScope).type.toBe<string>();
    if (action.type === "PLUGIN_INTERNAL") {
      expect(action.payload.id).type.toBe<string>();
    }

    return { state: meta.nextState, context: state.context };
  },
  effects: {
    "*": ({ action, clock, pluginClock, pluginReaction }) => {
      expect(action).type.toBe<AppEvent | PluginInternalEvent>();
      expect(clock()).type.toBe<number>();
      expect(pluginClock()).type.toBe<number>();
      expect(pluginReaction()).type.toBe<string>();
    },
  },
});

const coreMachine = createAppMachine({
  storage: "instance",
  config: {
    IDLE: { APP_START: "READY" },
    READY: { APP_STOP: "IDLE" },
  },
  initialState: "IDLE",
  initialContext: { id: "core" },
});

const entityPlugin = definePlugin<{
  readonly transitionEvents: PluginTransitionEvent;
  readonly actionMeta: { readonly entityId: string };
}>({
  name: "entity-plugin",
  install(ctx) {
    ctx.routing.registerMetaKey("entityId", (value) => String(value));
  },
});

const otherPlugin = definePlugin<{
  readonly transitionEvents: OtherPluginTransitionEvent;
  readonly actionMeta: { readonly otherId: string };
}>({
  name: "other-plugin",
  install(ctx) {
    ctx.routing.registerMetaKey("otherId", (value) => String(value));
  },
});

describe("TypedCreateMachineFn machine extensions", () => {
  test("wrapper принимает storage-specific input и сохраняет downstream metadata", () => {
    expect(pluginMachine.storage).type.toBe<"test-storage">();
    expect(pluginMachine.initialContext).type.toBe<{ readonly id: string; readonly pluginReady: true }>();
    expect(pluginMachine.testRequired).type.toBe<{ readonly route: string }>();

    type _Metadata = Assert<Equal<MachineResultMetadata<typeof pluginMachine>, { readonly feature: "typed" }>>;
    type _RuntimeEffectDeps = Assert<
      Equal<
        MachineRuntimeMetadata<typeof pluginMachine> extends { readonly effectDeps: infer Deps } ? Deps : never,
        { readonly pluginClock: () => number }
      >
    >;
    type _RuntimeReactionDeps = Assert<
      Equal<
        MachineRuntimeMetadata<typeof pluginMachine> extends { readonly reactionDeps: infer Deps } ? Deps : never,
        { readonly pluginReaction: () => string }
      >
    >;
    type _RuntimeStorage = Assert<
      Equal<
        MachineRuntimeMetadata<typeof pluginMachine> extends { readonly storage: infer Storage } ? Storage : never,
        "test-storage"
      >
    >;
    type _RuntimePublicEvents = Assert<
      Equal<
        MachineRuntimeMetadata<typeof pluginMachine> extends { readonly publicEvents: infer Events } ? Events : never,
        AppEvent
      >
    >;
    type _PublicState = Assert<
      Equal<
        MachinesState<{ plugin: typeof pluginMachine }>["plugin"],
        { readonly visible: boolean; readonly id: string }
      >
    >;
    type _PublicEvents = Assert<Equal<MachineEvents<{ plugin: typeof pluginMachine }>, AppEvent>>;
  });

  test("MachineDependencies для custom storage extension оставляет только app deps", () => {
    type Store = { readonly plugin: typeof pluginMachine };
    const manager = MachineManager({ plugin: pluginMachine });

    type _ManagerDependencies = Assert<Equal<MachineDependencies<Store>, AppDeps>>;
    type _ManagerDependenciesWithoutPlugins = Assert<Equal<MachineDependencies<Store, readonly []>, AppDeps>>;
    expect<MachineDependencies<Store>>().type.toBe<AppDeps>();
    expect<MachineDependencies<Store, readonly []>>().type.toBe<AppDeps>();
    expect(manager.getState()).type.toBeAssignableTo<MachinesState<Store>>();
    expect(manager.setDependencies).type.toBe<
      {
        (deps: AppDeps): void;
        (updater: (deps: AppDeps) => AppDeps): void;
      }
    >();
    manager.setDependencies({ clock: () => 1 });

    // @ts-expect-error!
    const invalidDeps: MachineDependencies<Store> = { pluginClock: () => 1 };
    void invalidDeps;

    // @ts-expect-error!
    manager.setDependencies({ pluginClock: () => 1 });
    // @ts-expect-error!
    manager.setDependencies({ pluginReaction: () => "runtime" });
  });

  test("storage-specific fields не попадают в global createMachine", () => {
    // @ts-expect-error!
    createMachine<AppEvent>({
      storage: "test-storage",
      config: { IDLE: { APP_START: "IDLE" } },
      initialState: "IDLE",
      initialContext: {},
    });

    // @ts-expect-error!
    createAppMachine({
      storage: "test-storage",
      config: { IDLE: { APP_START: "IDLE" } },
      initialState: "IDLE",
      initialContext: { id: "a", pluginReady: false },
      testRequired: { route: "entity/a" },
    });

    // @ts-expect-error!
    createAppMachine({
      storage: "test-storage",
      config: { IDLE: { APP_START: "IDLE" } },
      initialState: "IDLE",
      initialContext: { id: "a", pluginReady: true },
      unknownPluginField: true,
      testRequired: { route: "entity/a" },
    });
  });

  test("plugin transition events не подмешиваются в machine AppEvents", () => {
    createAppMachine({
      storage: "instance",
      config: {
        IDLE: {
          APP_START: "IDLE",
          // @ts-expect-error!
          PLUGIN_TRANSITION: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: {},
    });
  });

  test("invalid extension fields отклоняются при объявлении wrapper", () => {
    type InvalidExtension = {
      readonly storage: "invalid-storage";
      readonly invalidField: true;
    };
    type MissingStorageExtension = {
      readonly input: {
        readonly required: true;
      };
    };

    // @ts-expect-error!
    const invalidWrapper: TypedCreateMachineFn<AppEvent, AppDeps, InvalidExtension> = createMachine;
    void invalidWrapper;
    // @ts-expect-error!
    const missingStorageWrapper: TypedCreateMachineFn<AppEvent, AppDeps, MissingStorageExtension> = createMachine;
    void missingStorageWrapper;
  });

  test("public MachineRuntimeExtension фиксирует поддерживаемые ключи", () => {
    type _Keys = Assert<
      Equal<
        keyof MachineRuntimeExtension,
        | "storage"
        | "input"
        | "internalEvents"
        | "reducerContext"
        | "effectDeps"
        | "reactionDeps"
        | "resultMetadata"
        | "publicState"
      >
    >;
  });
});

describe("Manager transition events и action meta из plugins", () => {
  const machines = {
    core: coreMachine satisfies MachineConfig<
      { IDLE: { APP_START: "READY" }; READY: { APP_STOP: "IDLE" } },
      { id: string },
      AppEvent,
      AppDeps
    >,
  };

  test("manager.transition принимает events только от plugins текущего manager", () => {
    const manager = MachineManager(machines, { plugins: [entityPlugin] as const });
    const otherManager = MachineManager(machines, { plugins: [otherPlugin] as const });
    const plainManager = MachineManager(machines);

    manager.transition({ type: "APP_START" });
    manager.transition({ type: "PLUGIN_TRANSITION", payload: { id: "a" } });
    manager.transition({ type: "APP_STOP", meta: { actorId: "actor/a" } });
    manager.transition({ type: "APP_STOP", meta: { entityId: "entity/a" } });

    otherManager.transition({ type: "OTHER_PLUGIN_TRANSITION" });
    otherManager.transition({ type: "APP_STOP", meta: { otherId: "other/a" } });

    // @ts-expect-error!
    manager.transition({ type: "OTHER_PLUGIN_TRANSITION" });
    // @ts-expect-error!
    manager.transition({ type: "APP_STOP", meta: { otherId: "other/a" } });
    // @ts-expect-error!
    plainManager.transition({ type: "PLUGIN_TRANSITION", payload: { id: "a" } });
    // @ts-expect-error!
    plainManager.transition({ type: "APP_STOP", meta: { entityId: "entity/a" } });
  });

  test("public helper types выводят events и meta из plugin tuple", () => {
    type Plugins = readonly [typeof entityPlugin, typeof otherPlugin];

    type _PluginEvents = Assert<
      Equal<PluginTransitionEvents<Plugins>, PluginTransitionEvent | OtherPluginTransitionEvent>
    >;
    type _ManagerEvents = Assert<
      Equal<ManagerTransitionEvents<AppEvent, Plugins>, AppEvent | PluginTransitionEvent | OtherPluginTransitionEvent>
    >;
    type _PluginMeta = Assert<
      Equal<PluginActionMeta<Plugins>, { readonly entityId?: string; readonly otherId?: string }>
    >;
    type _ManagerMeta = Assert<
      Equal<ManagerActionMeta<Plugins>, CoreActionMeta & { readonly entityId?: string; readonly otherId?: string }>
    >;

    const manager = MachineManager(machines, { plugins: [entityPlugin] as const });
    expect(manager).type.toBe<ManagerFromPlugins<typeof machines, AppEvent, readonly [typeof entityPlugin]>>();
  });
});
