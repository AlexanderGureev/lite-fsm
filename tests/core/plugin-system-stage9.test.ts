import { describe, expect, it, vi } from "vitest";

import { definePlugin, defineStorageRuntime, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig, StorageDehydrateContext, StorageHydrateContext } from "@lite-fsm/core";
import type { NormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import {
  getStorageRuntimePayload,
  type LiteFsmStorageRuntimeDefinition,
} from "@lite-fsm/core/internal/pluginStorage";
import {
  createMachineManagerFactory,
  type RuntimePreset,
} from "@lite-fsm/core/internal/runtime/kernel/createMachineManagerFactory";
import { createRoutingRuntime } from "@lite-fsm/core/internal/runtime/kernel/routing";
import type {
  CompiledStorageTemplate,
} from "@lite-fsm/core/internal/runtime/kernel/storage";

type IncEvent = FSMEvent<"INC">;
type CounterMachine = MachineConfig<{ IDLE: { INC: "IDLE" } }, { count: number }, IncEvent>;

const counterMachine = {
  config: { IDLE: { INC: "IDLE" } },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (state) => ({ state: state.state, context: { count: state.context.count + 1 } }),
} satisfies CounterMachine;

const createStorageMachine = (kind: string) =>
  ({
    storage: kind,
    config: { READY: { BUMP: "READY" } },
    initialState: "READY",
    initialContext: { value: 0 },
  }) as never;

type StoragePayload = { value: number };
type StageStorageDefinition = LiteFsmStorageRuntimeDefinition<string>;
type SnapshotDehydrateContext = StorageDehydrateContext<{}>;
type SnapshotHydrateContext = StorageHydrateContext<{}>;

type SnapshotStorageOptions = {
  readonly initialValue?: number;
  readonly hydrate?: ReturnType<typeof vi.fn<(ctx: SnapshotHydrateContext) => void>>;
  readonly dehydrate?: ReturnType<typeof vi.fn<(ctx: SnapshotDehydrateContext) => void>>;
};

const readStoragePayload = (kind: string, ctx: SnapshotHydrateContext): StoragePayload => {
  const payload = ctx.snapshot;
  if (!payload || typeof payload !== "object" || typeof (payload as StoragePayload).value !== "number") {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_STORAGE_SNAPSHOT",
      `[lite-fsm] hydrate: invalid storage snapshot for runtime '${kind}'.`,
    );
  }
  return payload as StoragePayload;
};

const createSnapshotStorage = (kind: string, options: SnapshotStorageOptions = {}) => {
  const runtimeState = {
    value: options.initialValue ?? 0,
    templates: [] as readonly CompiledStorageTemplate[],
  };
  const hydrate = options.hydrate ?? vi.fn<(ctx: SnapshotHydrateContext) => void>();
  const dehydrate = options.dehydrate ?? vi.fn<(ctx: SnapshotDehydrateContext) => void>();

  const storage = defineStorageRuntime().create({
    kind,
    validateTemplate() {},
    compileTemplate() {},
    createRuntimeState(ctx) {
      runtimeState.templates = ctx.templates;
      return runtimeState;
    },
    createPublicInitialState() {
      return { state: "READY", context: { value: runtimeState.value } };
    },
    acceptsEvent({ action }) {
      return action.type === "BUMP";
    },
    reduce({ template, dispatch }) {
      const prev = dispatch.nextState[template.key] as { state: "READY"; context: StoragePayload };
      dispatch.nextState = {
        ...dispatch.nextState,
        [template.key]: { state: "READY", context: { value: prev.context.value + 1 } },
      };
    },
    commit({ dispatch }) {
      for (const template of runtimeState.templates) {
        const slice = dispatch.nextState[template.key] as { state: "READY"; context: StoragePayload } | undefined;
        if (slice) runtimeState.value = slice.context.value;
      }
    },
    snapshot: {
      dehydrate(ctx) {
        dehydrate(ctx);
        expect(ctx.state).toBe(runtimeState);
        return { snapshot: { value: runtimeState.value } };
      },
      hydrate(ctx) {
        hydrate(ctx);
        expect(ctx.state).toBe(runtimeState);
        const payload = readStoragePayload(kind, ctx);
        const nextState = { ...ctx.baseState };

        for (const template of runtimeState.templates) {
          nextState[template.key] = { state: "READY", context: { value: payload.value } };
        }
        if (ctx.mode !== "preview") runtimeState.value = payload.value;

        return { nextState, changed: payload.value !== runtimeState.value || runtimeState.templates.length > 0 };
      },
    },
  });

  return { storage, runtimeState, hydrate, dehydrate };
};

const createPluginWithStorage = (storage: StageStorageDefinition) =>
  definePlugin().create({
    name: `stage9/${storage.kind}`,
    storage: [storage],
  });

const createNoSnapshotStorage = (kind: string) =>
  defineStorageRuntime().create({
    kind,
    validateTemplate() {},
    compileTemplate() {},
    createRuntimeState() {
      return {};
    },
    createPublicInitialState() {
      return { state: "READY", context: { value: 0 } };
    },
    acceptsEvent() {
      return false;
    },
    reduce() {},
    commit() {},
  });

const createPassthroughSnapshotStorage = (
  kind: string,
  hydrate = vi.fn<(ctx: SnapshotHydrateContext) => void>(),
): StageStorageDefinition =>
  defineStorageRuntime().create({
    kind,
    validateTemplate() {},
    compileTemplate() {},
    createRuntimeState() {
      return {};
    },
    createPublicInitialState() {
      return { state: "READY", context: { value: 0 } };
    },
    acceptsEvent() {
      return false;
    },
    reduce() {},
    commit() {},
    snapshot: {
      dehydrate() {
        return { machines: {} };
      },
      hydrate(ctx) {
        hydrate(ctx);
        return { nextState: ctx.baseState, changed: false };
      },
    },
  });

const createInvalidSnapshotResultStorage = (kind: string, result: unknown): StageStorageDefinition =>
  defineStorageRuntime().create({
    kind,
    validateTemplate() {},
    compileTemplate() {},
    createRuntimeState() {
      return {};
    },
    createPublicInitialState() {
      return { state: "READY", context: { value: 0 } };
    },
    acceptsEvent() {
      return false;
    },
    reduce() {},
    commit() {},
    snapshot: {
      dehydrate() {
        return result as never;
      },
      hydrate(ctx) {
        return { nextState: ctx.baseState, changed: false };
      },
    },
  });

const createPresetPlugin = (name: string, storages: readonly StageStorageDefinition[]): NormalizedPlugin => ({
  name,
  storage: storages.map((storage) => ({
    owner: name,
    kind: storage.kind,
    value: getStorageRuntimePayload(storage),
  })),
  routeMeta: [],
  scopedDeps: [],
  scopedTransition: [],
  manager: [],
  hooks: {},
});

const createPresetManager = (storages: readonly StageStorageDefinition[], defaultStorageKind: string) => {
  const pluginName = `stage9-preset/${defaultStorageKind}`;
  const preset: RuntimePreset = {
    name: `stage9-preset/${defaultStorageKind}`,
    defaultStorageKind,
    plugins: [createPresetPlugin(pluginName, storages)],
  };

  return createMachineManagerFactory(preset)({ custom: createStorageMachine(defaultStorageKind) });
};

const expectLiteFsmError = (run: () => unknown, code: LiteFsmError["code"], message: string) => {
  expect(run).toThrow(LiteFsmError);
  expect(run).toThrow(message);
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(LiteFsmError);
    expect((error as LiteFsmError).code).toBe(code);
    return;
  }

  throw new Error("Expected LiteFsmError.");
};

describe("storage snapshot extension points у MachineManager", () => {
  it("round-trip custom runtime проходит через snapshot.storage[kind]", () => {
    const sourceStorage = createSnapshotStorage("stage9");
    const source = MachineManager(
      { counter: counterMachine, custom: createStorageMachine("stage9") },
      { plugins: [createPluginWithStorage(sourceStorage.storage)] },
    );
    source.transition({ type: "BUMP" } as never);

    const snapshot = source.dehydrate();

    expect(snapshot).toEqual({
      schemaVersion: undefined,
      machines: {
        counter: { state: "IDLE", context: { count: 0 } },
      },
      storage: {
        stage9: { value: 1 },
      },
    });
    expect(sourceStorage.dehydrate).toHaveBeenCalledOnce();

    const restoredStorage = createSnapshotStorage("stage9");
    const restored = MachineManager(
      { counter: counterMachine, custom: createStorageMachine("stage9") },
      { plugins: [createPluginWithStorage(restoredStorage.storage)], snapshot },
    );

    expect(restoredStorage.hydrate).toHaveBeenCalledOnce();
    expect(restoredStorage.hydrate.mock.calls[0]?.[0].snapshot).toEqual({ value: 1 });
    expect(restored.getState().custom).toEqual({ state: "READY", context: { value: 1 } });
  });

  it("dehydrate по умолчанию включает storage runtimes со snapshot capability", () => {
    const custom = createSnapshotStorage("stage9", { initialValue: 7 });
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createPluginWithStorage(custom.storage)] });

    expect(manager.dehydrate()).toEqual({
      schemaVersion: undefined,
      machines: {
        counter: { state: "IDLE", context: { count: 0 } },
      },
      storage: {
        stage9: { value: 7 },
      },
    });
  });

  it("dehydrate({ machines }) не отключает storage snapshot", () => {
    const custom = createSnapshotStorage("stage9", { initialValue: 3 });
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createPluginWithStorage(custom.storage)] });

    expect(manager.dehydrate({ machines: ["counter"] })).toEqual({
      schemaVersion: undefined,
      machines: {
        counter: { state: "IDLE", context: { count: 0 } },
      },
      storage: {
        stage9: { value: 3 },
      },
    });
  });

  it("dehydrate({ storage }) фильтрует только storage и не отключает machines", () => {
    const alpha = createSnapshotStorage("alpha", { initialValue: 1 });
    const beta = createSnapshotStorage("beta", { initialValue: 2 });
    const manager = MachineManager(
      { counter: counterMachine },
      { plugins: [createPluginWithStorage(alpha.storage), createPluginWithStorage(beta.storage)] },
    );

    expect(manager.dehydrate({ storage: ["beta"] })).toEqual({
      schemaVersion: undefined,
      machines: {
        counter: { state: "IDLE", context: { count: 0 } },
      },
      storage: {
        beta: { value: 2 },
      },
    });
    expect(alpha.dehydrate).not.toHaveBeenCalled();
    expect(beta.dehydrate).toHaveBeenCalledOnce();
  });

  it("dehydrate({ storage: [] }) отключает storage snapshot", () => {
    const custom = createSnapshotStorage("stage9", { initialValue: 5 });
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createPluginWithStorage(custom.storage)] });

    expect(manager.dehydrate({ storage: [] })).toEqual({
      schemaVersion: undefined,
      machines: {
        counter: { state: "IDLE", context: { count: 0 } },
      },
    });
    expect(custom.dehydrate).not.toHaveBeenCalled();
  });

  it("runtime без snapshot capability не добавляет storage payload", () => {
    const manager = MachineManager(
      { counter: counterMachine },
      { plugins: [createPluginWithStorage(createNoSnapshotStorage("ephemeral"))] },
    );

    expect(manager.dehydrate()).toEqual({
      schemaVersion: undefined,
      machines: {
        counter: { state: "IDLE", context: { count: 0 } },
      },
    });
  });

  it("явный dehydrate({ storage }) для runtime без capability бросает clear error", () => {
    const manager = MachineManager(
      { counter: counterMachine },
      { plugins: [createPluginWithStorage(createNoSnapshotStorage("ephemeral"))] },
    );

    expect(() => manager.dehydrate({ storage: ["ephemeral"] })).toThrow(
      "[lite-fsm] dehydrate: storage runtime 'ephemeral' does not support snapshots.",
    );
  });

  it("hydrate storage данных известного runtime без capability бросает clear error", () => {
    const manager = MachineManager(
      { counter: counterMachine },
      { plugins: [createPluginWithStorage(createNoSnapshotStorage("ephemeral"))] },
    );

    expect(() => manager.hydrate({ machines: {}, storage: { ephemeral: { value: 1 } } })).toThrow(
      "[lite-fsm] hydrate: storage runtime 'ephemeral' does not support snapshots.",
    );
  });

  it("hydrate и getHydratedState для неизвестного storage runtime бросают clear error", () => {
    const manager = MachineManager({ counter: counterMachine });

    expect(() => manager.hydrate({ machines: {}, storage: { missing: { value: 1 } } })).toThrow(
      "[lite-fsm] hydrate: unknown storage kind 'missing'.",
    );
    expect(() => manager.getHydratedState({ machines: {}, storage: { missing: { value: 1 } } })).toThrow(
      "[lite-fsm] hydrate: unknown storage kind 'missing'.",
    );
  });

  it("invalid storage snapshot payload бросает clear error", () => {
    const custom = createSnapshotStorage("stage9");
    const manager = MachineManager(
      { custom: createStorageMachine("stage9") },
      { plugins: [createPluginWithStorage(custom.storage)] },
    );

    expect(() => manager.hydrate({ machines: {}, storage: { stage9: { value: "bad" } } })).toThrow(
      "[lite-fsm] hydrate: invalid storage snapshot for runtime 'stage9'.",
    );
  });

  it("getSnapshot не вызывает StorageSnapshotRuntime.dehydrate и не включает storage", () => {
    const custom = createSnapshotStorage("stage9", { initialValue: 9 });
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createPluginWithStorage(custom.storage)] });

    expect(manager.getSnapshot()).toEqual({
      schemaVersion: undefined,
      machines: {
        counter: { state: "IDLE", context: { count: 0 } },
      },
    });
    expect(custom.dehydrate).not.toHaveBeenCalled();
  });

  it("legacy snapshot без storage сохраняет hydrate и getHydratedState behavior", () => {
    const custom = createSnapshotStorage("stage9");
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createPluginWithStorage(custom.storage)] });

    const preview = manager.getHydratedState({
      machines: {
        counter: { state: "IDLE", context: { count: 4 } },
      },
    });

    expect(preview.counter.context.count).toBe(4);
    expect(custom.hydrate).not.toHaveBeenCalled();

    manager.hydrate({
      machines: {
        counter: { state: "IDLE", context: { count: 5 } },
      },
    });

    expect(manager.getState().counter.context.count).toBe(5);
    expect(custom.hydrate).not.toHaveBeenCalled();
  });

  it("storage snapshot не влияет на чужие runtimes и hydrate вызывает только владельца kind", () => {
    const alpha = createSnapshotStorage("alpha");
    const beta = createSnapshotStorage("beta");
    const manager = MachineManager(
      { counter: counterMachine },
      { plugins: [createPluginWithStorage(alpha.storage), createPluginWithStorage(beta.storage)] },
    );

    manager.hydrate({ machines: {}, storage: { alpha: { value: 10 } } });

    expect(alpha.hydrate).toHaveBeenCalledOnce();
    expect(beta.hydrate).not.toHaveBeenCalled();
  });

  it("hydrate передает runtime только snapshot payload и machine snapshots своего kind", () => {
    const alpha = createSnapshotStorage("alpha");
    const beta = createSnapshotStorage("beta");
    const alphaSnapshot = { state: "READY", context: { value: 101 } };
    const betaSnapshot = { state: "READY", context: { value: 202 } };
    const manager = MachineManager(
      {
        alphaDoc: createStorageMachine("alpha"),
        betaDoc: createStorageMachine("beta"),
      },
      { plugins: [createPluginWithStorage(alpha.storage), createPluginWithStorage(beta.storage)] },
    );

    manager.hydrate({
      machines: {
        alphaDoc: alphaSnapshot,
        betaDoc: betaSnapshot,
      },
      storage: {
        alpha: { value: 10 },
        beta: { value: 20 },
      },
    } as never);

    expect(alpha.hydrate).toHaveBeenCalledOnce();
    expect(alpha.hydrate.mock.calls[0]?.[0].snapshot).toEqual({ value: 10 });
    expect(alpha.hydrate.mock.calls[0]?.[0].machines).toEqual({ alphaDoc: alphaSnapshot });
    expect(beta.hydrate).toHaveBeenCalledOnce();
    expect(beta.hydrate.mock.calls[0]?.[0].snapshot).toEqual({ value: 20 });
    expect(beta.hydrate.mock.calls[0]?.[0].machines).toEqual({ betaDoc: betaSnapshot });
  });

  it("getHydratedState со storage payload не мутирует runtime state", () => {
    const custom = createSnapshotStorage("stage9");
    const manager = MachineManager(
      { custom: createStorageMachine("stage9") },
      { plugins: [createPluginWithStorage(custom.storage)] },
    );

    const preview = manager.getHydratedState({ machines: {}, storage: { stage9: { value: 11 } } });

    expect(preview.custom).toEqual({ state: "READY", context: { value: 11 } });
    expect(manager.getState().custom).toEqual({ state: "READY", context: { value: 0 } });
    expect(custom.runtimeState.value).toBe(0);
  });

  it("unknown machine hydrate использует первый snapshot runtime, если default runtime не поддерживает snapshot", () => {
    const hydrate = vi.fn<(ctx: SnapshotHydrateContext) => void>();
    const manager = createPresetManager(
      [createNoSnapshotStorage("plain"), createPassthroughSnapshotStorage("snapshot", hydrate)],
      "plain",
    );

    manager.hydrate({ machines: { missing: { state: "READY", context: { value: 1 } } } } as never);

    expect(hydrate).toHaveBeenCalledOnce();
  });

  it("unknown machine hydrate бросает unsupported snapshot error без snapshot runtimes", () => {
    const manager = createPresetManager([createNoSnapshotStorage("plain")], "plain");

    expect(() =>
      manager.hydrate({ machines: { missing: { state: "READY", context: { value: 1 } } } } as never),
    ).toThrow("[lite-fsm] snapshot is not supported by the configured storage runtimes.");
  });

  it("legacy storage field в dehydrate result бросает invalid storage runtime", () => {
    const legacy = createInvalidSnapshotResultStorage("legacy", { storage: { value: 1 } });
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createPluginWithStorage(legacy)] });

    expectLiteFsmError(
      () => manager.dehydrate(),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
      "[lite-fsm] dehydrate: storage runtime 'legacy' returned unknown snapshot field 'storage'.",
    );
  });

  it("unknown top-level field в dehydrate result бросает invalid storage runtime", () => {
    const invalid = createInvalidSnapshotResultStorage("invalid", { snapshot: { value: 1 }, extra: true });
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createPluginWithStorage(invalid)] });

    expectLiteFsmError(
      () => manager.dehydrate(),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
      "[lite-fsm] dehydrate: storage runtime 'invalid' returned unknown snapshot field 'extra'.",
    );
  });

  it("non-object dehydrate result бросает invalid storage runtime", () => {
    const invalid = createInvalidSnapshotResultStorage("invalid-result", null);
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createPluginWithStorage(invalid)] });

    expectLiteFsmError(
      () => manager.dehydrate(),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
      "[lite-fsm] dehydrate: storage runtime 'invalid-result' snapshot.dehydrate() must return an object.",
    );
  });

  it("invalid machines field в dehydrate result бросает invalid storage runtime", () => {
    const invalid = createInvalidSnapshotResultStorage("invalid-machines", { machines: [] });
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createPluginWithStorage(invalid)] });

    expectLiteFsmError(
      () => manager.dehydrate(),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
      "[lite-fsm] dehydrate: storage runtime 'invalid-machines' returned invalid machines snapshot.",
    );
  });
});

describe("routing runtime cleanup coverage", () => {
  it("сохраняет route meta registration, stripping helpers и priority", () => {
    const routing = createRoutingRuntime();

    expect(routing.registeredMetaKeys).toEqual([]);
    expect(routing.hasRoute(undefined)).toBe(false);
    expect(routing.stripSenderFields(undefined)).toEqual({});

    routing.registry.registerRouteMeta("cacheKey", (value) => [String(value), String(value), "fallback"]);

    expect(routing.registeredMetaKeys).toEqual(["cacheKey"]);
    expect(routing.hasMetaKey("cacheKey")).toBe(true);
    expect(routing.stripSenderFields({})).toEqual({});
    expect(routing.stripRouting({})).toEqual({});
    expect(
      routing.stripSenderFields({
        actorId: "actor/a",
        groupId: "group/a",
        groupTag: "tag/a",
        senderActorId: "sender/a",
        senderGroupId: "sender-group/a",
        senderGroupTag: "sender-tag/a",
        cacheKey: "cache/a",
      } as never),
    ).toEqual({
      actorId: "actor/a",
      groupId: "group/a",
      groupTag: "tag/a",
      cacheKey: "cache/a",
    });
    expect(
      routing.stripRouting({
        actorId: "actor/a",
        groupId: "group/a",
        groupTag: "tag/a",
        senderActorId: "sender/a",
        senderGroupId: "sender-group/a",
        senderGroupTag: "sender-tag/a",
        cacheKey: "cache/a",
      } as never),
    ).toEqual({
      senderActorId: "sender/a",
      senderGroupId: "sender-group/a",
      senderGroupTag: "sender-tag/a",
      cacheKey: "cache/a",
    });

    expect(routing.hasRoute({ senderActorId: "sender/a" })).toBe(false);
    expect(routing.hasRoute({ actorId: "actor/a" })).toBe(true);
    expect(routing.hasRoute({ cacheKey: "cache/a" } as never)).toBe(true);
    expect(routing.hasRoute({ groupId: "group/a" })).toBe(true);
    expect(routing.hasRoute({ groupTag: "tag/a" })).toBe(true);
    expect(routing.resolveRoute({ type: "PING", meta: { senderActorId: "sender/a" } })).toEqual({
      scope: "unscoped",
      key: undefined,
      targetSet: [],
    });
    expect(routing.resolveRoute({ type: "PING", meta: { actorId: ["actor/a", "actor/a"] } })).toEqual({
      scope: "actor",
      key: "actorId",
      targetSet: ["actor/a"],
    });
    expect(routing.resolveRoute({ type: "PING", meta: { cacheKey: "cache/a" } as never })).toEqual({
      scope: "plugin",
      key: "cacheKey",
      targetSet: ["cache/a", "fallback"],
    });
    expect(routing.resolveRoute({ type: "PING", meta: { groupId: "group/a" } })).toEqual({
      scope: "group",
      key: "groupId",
      targetSet: ["group/a"],
    });
    expect(routing.resolveRoute({ type: "PING", meta: { groupTag: "tag/a" } })).toEqual({
      scope: "tag",
      key: "groupTag",
      targetSet: ["tag/a"],
    });
  });

  it("сохраняет diagnostics для duplicate keys и invalid resolver result", () => {
    const routing = createRoutingRuntime();

    routing.registry.registerRouteMeta("cacheKey", () => "cache/a");

    expect(() => routing.registry.registerRouteMeta("cacheKey", () => "cache/b")).toThrow(LiteFsmError);
    expect(() => routing.registry.registerRouteMeta("actorId", () => "actor/a")).toThrow(LiteFsmError);

    const invalidObject = createRoutingRuntime();
    invalidObject.registry.registerRouteMeta("cacheKey", () => ({ id: "cache/a" }) as never);
    expect(() => invalidObject.resolveRoute({ type: "PING", meta: { cacheKey: "cache/a" } as never })).toThrow(
      LiteFsmError,
    );

    const invalidArray = createRoutingRuntime();
    invalidArray.registry.registerRouteMeta("cacheKey", () => ["cache/a", 1] as never);
    expect(() => invalidArray.resolveRoute({ type: "PING", meta: { cacheKey: "cache/a" } as never })).toThrow(
      LiteFsmError,
    );
  });
});
