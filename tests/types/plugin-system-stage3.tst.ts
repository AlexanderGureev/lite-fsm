import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, defineStorageRuntime, MachineManager } from "@lite-fsm/core";
import type {
  FSMEvent,
  LiteFsmPlugin,
  LiteFsmStorageRuntimeDefinition,
  MachineConfig,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type AppEvent = FSMEvent<"APP_EVENT", { readonly id: string }>;
type PluginEvent = FSMEvent<"PLUGIN_EVENT", { readonly id: string }>;
type HostEvent = FSMEvent<"HOST_EVENT", { readonly id: string }>;
type OtherPluginEvent = FSMEvent<"OTHER_PLUGIN_EVENT", { readonly id: number }>;
type AppConfig = { readonly idle: { readonly APP_EVENT: "idle" } };
type AppMachine = MachineConfig<AppConfig, {}, AppEvent>;
type StorageInternalEvent = FSMEvent<"STORAGE_INTERNAL", { readonly key: string }>;
type StorageInput = {
  readonly initialContext: { readonly id: string };
  readonly ttl: number;
};
type StageThreeStorageExtension = {
  readonly input: StorageInput;
  readonly internalEvents: StorageInternalEvent;
  readonly reducerContext: { readonly cache: Map<string, string> };
  readonly effectDeps: { readonly cacheApi: { readonly read: (key: string) => string } };
  readonly reactionDeps: { readonly logCache: (message: string) => void };
  readonly resultMetadata: { readonly source: "storage" };
  readonly publicState: { readonly ready: boolean };
  readonly runtimeState: { writes: number };
  readonly templateData: { readonly key: string };
  readonly snapshotData: { readonly commits: number };
  readonly invocation: { readonly id: string };
  readonly identity: { readonly kind: "stage-three"; readonly key: string };
};
type ExpectedStageThreeMachineExtension = {
  readonly input: StorageInput;
  readonly internalEvents: StorageInternalEvent;
  readonly reducerContext: { readonly cache: Map<string, string> };
  readonly effectDeps: { readonly cacheApi: { readonly read: (key: string) => string } };
  readonly reactionDeps: { readonly logCache: (message: string) => void };
  readonly resultMetadata: { readonly source: "storage" };
  readonly publicState: { readonly ready: boolean };
  readonly storage: "stage-three-storage";
};
type RuntimeOnlyStorageKeys = "runtimeState" | "templateData" | "snapshotData" | "invocation" | "identity";
type StorageMachineExtensionOf<Definition> =
  Definition extends LiteFsmStorageRuntimeDefinition<any, infer Extension> ? Extension : never;

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

const stageThreeStorage = defineStorageRuntime<StageThreeStorageExtension>().create({
  kind: "stage-three-storage",
  validateTemplate(ctx) {
    expect(ctx.machine.initialContext.id).type.toBe<string>();
    expect(ctx.machine.ttl).type.toBe<number>();
  },
  compileTemplate(ctx) {
    return { data: { key: ctx.key } };
  },
  createRuntimeState() {
    return { writes: 0 };
  },
  createPublicInitialState() {
    return { ready: true };
  },
  acceptsEvent() {
    return false;
  },
  reduce() {},
  commit() {},
});

const storagePlugin = definePlugin().create({
  name: "stage-three-storage-plugin",
  storage: [stageThreeStorage],
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

  test("storage definition выводит только machine-facing storage поля", () => {
    type Extensions = StorageMachineExtensionOf<typeof stageThreeStorage>;

    type _StorageExtension = Assert<Equal<Extensions, ExpectedStageThreeMachineExtension>>;
    type _MachineFacingKeys = Assert<Equal<keyof Extensions, keyof ExpectedStageThreeMachineExtension>>;
  });

  test("TypedCreateMachineFn получает storage typing из plugin source", () => {
    const createAppMachine: TypedCreateMachineFn<AppEvent, {}, typeof storagePlugin> = createMachine;
    const machine = createAppMachine({
      storage: "stage-three-storage",
      ttl: 60,
      config: {
        idle: { APP_EVENT: "idle", STORAGE_INTERNAL: "idle" },
      },
      initialState: "idle",
      initialContext: { id: "app" },
    });

    expect(machine.storage).type.toBe<"stage-three-storage">();
  });

  test("storage definition не раскрывает runtime-only storage поля", () => {
    type Extensions = StorageMachineExtensionOf<typeof stageThreeStorage>;

    type _NoRuntimeOnlyKeys = Assert<Equal<Extract<keyof Extensions, RuntimeOnlyStorageKeys>, never>>;
  });

  test("Extension generic отклоняет storage и unknown keys", () => {
    // @ts-expect-error!
    defineStorageRuntime<{ readonly input: {}; readonly storage?: "bad" }>().create({
      kind: "stage-three-storage-forbidden",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return undefined;
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });

    // @ts-expect-error!
    defineStorageRuntime<{ readonly input: {}; readonly unknown?: string }>().create({
      kind: "stage-three-unknown-extension",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return undefined;
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });
  });
});
