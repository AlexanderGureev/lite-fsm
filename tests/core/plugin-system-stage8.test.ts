import { describe, expect, it } from "vitest";

import { definePlugin, defineStorageRuntime, LiteFsmError, MachineManager } from "@lite-fsm/core";

const expectLiteFsmError = (run: () => unknown, code: LiteFsmError["code"], message?: string) => {
  expect(run).toThrow(LiteFsmError);

  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(LiteFsmError);
    expect((error as LiteFsmError).code).toBe(code);
    if (message) expect((error as Error).message).toContain(message);
    return;
  }

  throw new Error("Expected LiteFsmError.");
};

type CacheState = {
  readonly ready: boolean;
  readonly value: number;
};

type CacheExtension = {
  readonly input: {
    readonly initialContext: { readonly value: number };
  };
  readonly publicState: CacheState;
};

const createStorageRuntimeDefinition = (
  kind: string,
  options: {
    readonly routeMetaKeys?: readonly string[];
    readonly order?: string[];
  } = {},
) =>
  defineStorageRuntime<CacheExtension>().create({
    kind,
    routeMetaKeys: options.routeMetaKeys,
    validateTemplate({ key }) {
      options.order?.push(`${kind}:validate:${key}`);
    },
    compileTemplate({ key, machine }) {
      options.order?.push(`${kind}:compile:${key}`);
      return { data: { value: (machine.initialContext as { readonly value: number }).value } };
    },
    createRuntimeState() {
      options.order?.push(`${kind}:runtime`);
      return {};
    },
    createPublicInitialState({ template }) {
      options.order?.push(`${kind}:initial:${template.key}`);
      const data = template.data as { readonly value: number };
      return { ready: true, value: data.value };
    },
    prepareAction({ action }) {
      options.order?.push(`${kind}:prepare:${action.type}`);
    },
    acceptsEvent({ action }) {
      return action.type === "PING";
    },
    reduce({ template, dispatch }) {
      const current = dispatch.nextState[template.key] as CacheState;
      dispatch.nextState = {
        ...dispatch.nextState,
        [template.key]: { ready: true, value: current.value + 1 },
      };
    },
    commit() {},
  });

const createCacheMachine = (storage: string, value = 0) => ({
  storage,
  config: { idle: { PING: "idle" } },
  initialState: "idle",
  initialContext: { value },
});

const createInstanceMachine = () => ({
  config: { idle: { PING: "idle" } },
  initialState: "idle",
  initialContext: { value: 0 },
});

describe("plugin system — этап 8 runtime storage section", () => {
  it("регистрирует storage runtime из plugin section и создает public initial state", () => {
    const cacheStorage = createStorageRuntimeDefinition("stage-eight-cache");
    const plugin = definePlugin().create({
      name: "stage-eight-cache-plugin",
      storage: [cacheStorage],
    });
    const manager = MachineManager(
      {
        cache: createCacheMachine("stage-eight-cache", 7),
      },
      { plugins: [plugin] as const },
    );

    expect(manager.getState().cache).toEqual({ ready: true, value: 7 });

    manager.transition({ type: "PING" });

    expect(manager.getState().cache).toEqual({ ready: true, value: 8 });
  });

  it("применяет storage definitions внутри plugin в порядке массива", () => {
    const order: string[] = [];
    const firstStorage = createStorageRuntimeDefinition("stage-eight-first", { order });
    const secondStorage = createStorageRuntimeDefinition("stage-eight-second", { order });
    const plugin = definePlugin().create({
      name: "stage-eight-ordered-storage",
      storage: [firstStorage, secondStorage],
    });
    const manager = MachineManager(
      {
        first: createCacheMachine("stage-eight-first", 1),
        second: createCacheMachine("stage-eight-second", 10),
      },
      { plugins: [plugin] as const },
    );

    manager.transition({ type: "PING" });

    expect(order.filter((entry) => entry.endsWith(":runtime"))).toEqual([
      "stage-eight-first:runtime",
      "stage-eight-second:runtime",
    ]);
    expect(order.filter((entry) => entry.endsWith(":prepare:PING"))).toEqual([
      "stage-eight-first:prepare:PING",
      "stage-eight-second:prepare:PING",
    ]);
    expect(manager.getState()).toEqual({
      first: { ready: true, value: 2 },
      second: { ready: true, value: 11 },
    });
  });

  it("диагностирует duplicate storage kind внутри одного plugin как invalid definition", () => {
    const firstStorage = createStorageRuntimeDefinition("stage-eight-duplicate-local");
    const secondStorage = createStorageRuntimeDefinition("stage-eight-duplicate-local");

    expectLiteFsmError(
      () =>
        definePlugin().create({
          name: "stage-eight-local-duplicates",
          storage: [firstStorage, secondStorage],
        }),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
      "duplicate storage kind 'stage-eight-duplicate-local'",
    );
  });

  it("диагностирует duplicate storage kind между plugins или internal preset", () => {
    const firstPlugin = definePlugin().create({
      name: "stage-eight-duplicate-first",
      storage: [createStorageRuntimeDefinition("stage-eight-duplicate-shared")],
    });
    const secondPlugin = definePlugin().create({
      name: "stage-eight-duplicate-second",
      storage: [createStorageRuntimeDefinition("stage-eight-duplicate-shared")],
    });
    const instancePlugin = definePlugin().create({
      name: "stage-eight-duplicate-instance",
      storage: [createStorageRuntimeDefinition("instance")],
    });

    expectLiteFsmError(
      () => MachineManager({ counter: createInstanceMachine() }, { plugins: [firstPlugin, secondPlugin] as const }),
      "LITE_FSM_DUPLICATE_STORAGE_KIND",
      "duplicate storage kind 'stage-eight-duplicate-shared'",
    );
    expectLiteFsmError(
      () => MachineManager({ counter: createInstanceMachine() }, { plugins: [instancePlugin] as const }),
      "LITE_FSM_DUPLICATE_STORAGE_KIND",
      "duplicate storage kind 'instance'",
    );
  });

  it("сохраняет focused validation для invalid, empty, object и inline storage sections", () => {
    const storage = createStorageRuntimeDefinition("stage-eight-valid-section");

    expectLiteFsmError(
      () => definePlugin().create({ name: "stage-eight-empty-storage", storage: [] } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () => definePlugin().create({ name: "stage-eight-object-storage", storage: { cache: storage } } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () =>
        definePlugin().create({
          name: "stage-eight-inline-storage",
          storage: [{ kind: "inline" }],
        } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () =>
        definePlugin().create({
          name: "stage-eight-invalid-marker",
          storage: [Object.create(null)],
        } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
  });

  it("требует routeMeta resolver для routeMetaKeys storage definition", () => {
    const cacheStorage = createStorageRuntimeDefinition("stage-eight-routed-missing", {
      routeMetaKeys: ["cacheKey"],
    });
    const plugin = definePlugin().create({
      name: "stage-eight-routed-missing-plugin",
      storage: [cacheStorage],
    });

    expectLiteFsmError(
      () =>
        MachineManager(
          {
            cache: createCacheMachine("stage-eight-routed-missing"),
          },
          { plugins: [plugin] as const },
        ),
      "LITE_FSM_MISSING_ROUTE_META_RESOLVER",
      "requires route resolver for meta key 'cacheKey'",
    );
  });

  it("фиксирует routeMetaKeys при создании storage definition", () => {
    const routeMetaKeys = ["cacheKey"];
    const cacheStorage = createStorageRuntimeDefinition("stage-eight-stable-route-keys", {
      routeMetaKeys,
    });
    const plugin = definePlugin().create({
      name: "stage-eight-stable-route-keys-plugin",
      storage: [cacheStorage],
      routeMeta: {
        cacheKey(value) {
          return String(value);
        },
      },
    });

    routeMetaKeys.push("lateKey");

    const manager = MachineManager(
      {
        cache: createCacheMachine("stage-eight-stable-route-keys"),
      },
      { plugins: [plugin] as const },
    );

    manager.transition({ type: "PING", meta: { cacheKey: "cache" } });

    expect(manager.getState().cache).toEqual({ ready: true, value: 1 });
  });

  it("использует routeMeta resolver вместе с routeMetaKeys storage definition", () => {
    const resolvedKeys: string[] = [];
    const cacheStorage = createStorageRuntimeDefinition("stage-eight-routed-cache", {
      routeMetaKeys: ["cacheKey"],
    });
    const plugin = definePlugin().create({
      name: "stage-eight-routed-cache-plugin",
      storage: [cacheStorage],
      routeMeta: {
        cacheKey(value) {
          resolvedKeys.push(String(value));
          return String(value);
        },
      },
    });
    const manager = MachineManager(
      {
        cache: createCacheMachine("stage-eight-routed-cache", 2),
      },
      { plugins: [plugin] as const },
    );

    manager.transition({ type: "PING", meta: { cacheKey: "cache" } });

    expect(resolvedKeys).toContain("cache");
    expect(manager.getState().cache).toEqual({ ready: true, value: 3 });
  });
});
