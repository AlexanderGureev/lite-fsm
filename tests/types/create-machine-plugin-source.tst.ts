import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, defineStorageRuntime } from "@lite-fsm/core";
import type { FSMEvent, LiteFsmPlugin, ManagerAction, TypedCreateMachineFn } from "@lite-fsm/core";

type AppEvent = FSMEvent<"LOAD"> | FSMEvent<"RESET">;
type CacheInternalEvent = FSMEvent<"CACHE_INVALIDATED", { readonly key: string }>;
type AppDeps = { readonly api: { readonly load: () => Promise<string> } };

type CacheExtension = {
  readonly input: {
    readonly ttl: number;
    readonly initialContext: { readonly token: string };
  };
  readonly internalEvents: CacheInternalEvent;
  readonly effectDeps: {
    readonly cacheApi: { readonly read: () => string };
  };
  readonly publicState: {
    readonly ready: boolean;
  };
};

type DirectCacheExtension = CacheExtension & { readonly storage: "cache" };

const cacheStorage = defineStorageRuntime<CacheExtension>().create({
  kind: "cache",
  validateTemplate(ctx) {
    expect(ctx.machine.ttl).type.toBe<number>();
    expect(ctx.machine.initialContext.token).type.toBe<string>();
  },
  compileTemplate() {},
  createRuntimeState() {
    return {};
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

const sessionStorage = defineStorageRuntime().create({
  kind: "session",
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

const cachePlugin = definePlugin().create({
  name: "create-machine-cache",
  storage: [cacheStorage],
});

const sessionPlugin = definePlugin().create({
  name: "create-machine-session",
  storage: [sessionStorage],
});

describe("TypedCreateMachineFn plugin source", () => {
  test("без third generic сохраняет core-only domain machine и actor template", () => {
    const createAppMachine: TypedCreateMachineFn<AppEvent, AppDeps> = createMachine;

    createAppMachine({
      config: { idle: { LOAD: "loading" }, loading: { RESET: "idle" } },
      initialState: "idle",
      initialContext: { token: "" },
      effects: {
        loading: ({ api }) => {
          expect(api.load()).type.toBe<Promise<string>>();
        },
      },
    });

    createAppMachine({
      storage: "instance",
      config: { __INIT: { LOAD: "active" }, active: { RESET: "__RESOLVED" } },
      initialState: "__INIT",
      initialContext: { token: "" },
    });

    createAppMachine({
      // @ts-expect-error!
      storage: "cache",
      ttl: 60,
      config: { idle: { LOAD: "idle" } },
      initialState: "idle",
      initialContext: { token: "" },
    });
  });

  test("plugin tuple дает storage-specific machine typing", () => {
    const plugins = [cachePlugin] as const;
    const createAppMachine: TypedCreateMachineFn<AppEvent, AppDeps, typeof plugins> = createMachine;

    const machine = createAppMachine({
      storage: "cache",
      ttl: 60,
      config: {
        idle: { LOAD: "loading", CACHE_INVALIDATED: "idle" },
        loading: { RESET: "idle" },
      },
      initialState: "idle",
      initialContext: { token: "" },
      effects: {
        loading: ({ api, cacheApi, transition }) => {
          expect(api.load()).type.toBe<Promise<string>>();
          expect(cacheApi.read()).type.toBe<string>();
          expect(transition({ type: "CACHE_INVALIDATED", payload: { key: "user" } })).type.toBe<
            ManagerAction<AppEvent | CacheInternalEvent>
          >();
        },
      },
    });

    expect(machine.storage).type.toBe<"cache">();
  });

  test("plugin union работает как tuple union", () => {
    const createAppMachine: TypedCreateMachineFn<AppEvent, AppDeps, typeof cachePlugin | typeof sessionPlugin> =
      createMachine;

    expect(
      createAppMachine({
        storage: "cache",
        ttl: 60,
        config: { idle: { LOAD: "idle" } },
        initialState: "idle",
        initialContext: { token: "" },
      }).storage,
    ).type.toBe<"cache">();
    expect(
      createAppMachine({
        storage: "session",
        config: { idle: { LOAD: "idle" } },
        initialState: "idle",
        initialContext: {},
      }).storage,
    ).type.toBe<"session">();
  });

  test("широкий plugin array не сохраняет plugin-specific storage inference", () => {
    const plugins: readonly LiteFsmPlugin[] = [cachePlugin];
    const createAppMachine: TypedCreateMachineFn<AppEvent, AppDeps, typeof plugins> = createMachine;

    createAppMachine({
      config: { idle: { LOAD: "idle" } },
      initialState: "idle",
      initialContext: {},
    });

    createAppMachine({
      // @ts-expect-error!
      storage: "cache",
      ttl: 60,
      config: { idle: { LOAD: "idle" } },
      initialState: "idle",
      initialContext: { token: "" },
    });
  });

  test("third generic принимает только plugin source", () => {
    // @ts-expect-error!
    type _UnknownObjectRejected = TypedCreateMachineFn<AppEvent, AppDeps, { readonly storage: "cache" }>;
    // @ts-expect-error!
    type _DirectExtensionRejected = TypedCreateMachineFn<AppEvent, AppDeps, DirectCacheExtension>;
  });
});
