import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, defineStorageRuntime, MachineManager } from "@lite-fsm/core";
import type {
  FSMEvent,
  LiteFsmStorageRuntimeDefinition,
  ManagerAction,
  PluginManagerEvents,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type AppEvent = FSMEvent<"LOAD"> | FSMEvent<"RESET">;
type CacheEvent = FSMEvent<"CACHE_REFRESH", { readonly key: string }>;
type CacheExtension = {
  readonly input: {
    readonly ttl: number;
    readonly initialContext: { readonly token: string };
  };
  readonly internalEvents: CacheEvent;
  readonly effectDeps: {
    readonly cacheApi: { readonly read: () => string };
  };
  readonly publicState: {
    readonly ready: boolean;
    readonly value: string;
  };
};
type CacheMachineExtension = CacheExtension & { readonly storage: "cache" };
type StorageMachineExtensionOf<Definition> =
  Definition extends LiteFsmStorageRuntimeDefinition<any, infer Extension> ? Extension : never;

const cacheStorage = defineStorageRuntime<CacheExtension>().create({
  kind: "cache",
  validateTemplate(ctx) {
    expect(ctx.storageKind).type.toBe<"cache">();
    expect(ctx.machine.ttl).type.toBe<number>();
    expect(ctx.machine.initialContext.token).type.toBe<string>();
  },
  compileTemplate(ctx) {
    expect(ctx.machine.ttl).type.toBe<number>();
    return { data: { key: ctx.key } };
  },
  createRuntimeState() {
    return {};
  },
  createPublicInitialState() {
    return { ready: true, value: "cached" };
  },
  acceptsEvent() {
    return false;
  },
  reduce() {},
  commit() {},
});

const cachePlugin = definePlugin<CacheEvent>().create({
  name: "stage-eight-cache",
  storage: [cacheStorage],
  manager: {
    cacheTools: (runtime) => ({
      refresh: (key: string) => runtime.transition({ type: "CACHE_REFRESH", payload: { key } }),
    }),
  },
});

describe("plugin system — этап 8 storage types", () => {
  test("definePlugin storage section выводит machine extension из storage definition", () => {
    type _CacheExtension = Assert<
      StorageMachineExtensionOf<typeof cacheStorage> extends CacheMachineExtension
        ? CacheMachineExtension extends StorageMachineExtensionOf<typeof cacheStorage>
          ? true
          : false
        : false
    >;
    type _PluginEvents = Assert<Equal<PluginManagerEvents<typeof cachePlugin>, CacheEvent>>;
  });

  test("MachineManager сохраняет tuple inference после storage plugin", () => {
    const createAppMachine: TypedCreateMachineFn<AppEvent, {}, typeof cachePlugin> = createMachine;
    const machines = {
      cache: createAppMachine({
        storage: "cache",
        ttl: 60,
        config: {
          IDLE: { LOAD: "IDLE", CACHE_REFRESH: "IDLE" },
        },
        initialState: "IDLE",
        initialContext: { token: "token" },
        effects: {
          IDLE: ({ cacheApi, transition }) => {
            expect(cacheApi.read()).type.toBe<string>();
            expect(transition({ type: "CACHE_REFRESH", payload: { key: "user" } })).type.toBe<
              ManagerAction<AppEvent | CacheEvent>
            >();
          },
        },
      }),
    };
    const manager = MachineManager(machines, { plugins: [cachePlugin] as const });

    expect(manager.getState().cache).type.toBe<{ readonly ready: boolean; readonly value: string }>();
    expect(manager.cacheTools.refresh("user")).type.toBe<ManagerAction<CacheEvent>>();
    expect(manager.transition({ type: "CACHE_REFRESH", payload: { key: "user" } })).type.toBeAssignableTo<
      ManagerAction<AppEvent | CacheEvent>
    >();
    // @ts-expect-error!
    manager.transition({ type: "UNKNOWN" });
  });
});
