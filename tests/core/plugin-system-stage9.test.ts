import { describe, expect, it, vi } from "vitest";

import { definePlugin, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig } from "@lite-fsm/core";
import {
  createMachineManagerFactory,
  type RuntimePreset,
} from "@lite-fsm/core/internal/runtime/kernel/createMachineManagerFactory";
import type {
  CompiledStorageTemplate,
  StorageDehydrateContext,
  StorageHydrateContext,
  StorageRuntime,
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

type SnapshotRuntimeOptions = {
  readonly initialValue?: number;
  readonly hydrate?: ReturnType<typeof vi.fn<(ctx: StorageHydrateContext) => void>>;
  readonly dehydrate?: ReturnType<typeof vi.fn<(ctx: StorageDehydrateContext) => void>>;
};

const readStoragePayload = (kind: string, ctx: StorageHydrateContext): StoragePayload => {
  const envelope = ctx.snapshot as { storage?: Record<string, unknown> };
  const payload = envelope.storage?.[kind];
  if (!payload || typeof payload !== "object" || typeof (payload as StoragePayload).value !== "number") {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_STORAGE_SNAPSHOT",
      `[lite-fsm] hydrate: invalid storage snapshot for runtime '${kind}'.`,
    );
  }
  return payload as StoragePayload;
};

const createSnapshotRuntime = (kind: string, options: SnapshotRuntimeOptions = {}) => {
  const runtimeState = {
    value: options.initialValue ?? 0,
    templates: [] as readonly CompiledStorageTemplate[],
  };
  const hydrate = options.hydrate ?? vi.fn<(ctx: StorageHydrateContext) => void>();
  const dehydrate = options.dehydrate ?? vi.fn<(ctx: StorageDehydrateContext) => void>();

  const runtime: StorageRuntime = {
    kind,
    validateTemplate() {},
    compileTemplate(ctx) {
      return { key: ctx.key, kind };
    },
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
        return { storage: { value: runtimeState.value } };
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
  };

  return { runtime, runtimeState, hydrate, dehydrate };
};

const createRuntimePlugin = (runtime: StorageRuntime) =>
  definePlugin({
    name: `stage9/${runtime.kind}`,
    install(ctx) {
      ctx.storage.register(runtime.kind, runtime);
    },
  });

const createNoSnapshotRuntime = (kind: string): StorageRuntime => ({
  kind,
  validateTemplate() {},
  compileTemplate(ctx) {
    return { key: ctx.key, kind };
  },
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

const createPassthroughSnapshotRuntime = (
  kind: string,
  hydrate = vi.fn<(ctx: StorageHydrateContext) => void>(),
): StorageRuntime => ({
  ...createNoSnapshotRuntime(kind),
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

const createPresetManager = (runtimes: readonly StorageRuntime[], defaultStorageKind: string) => {
  const plugin = definePlugin({
    name: `stage9-preset/${defaultStorageKind}`,
    install(ctx) {
      for (const runtime of runtimes) ctx.storage.register(runtime.kind, runtime);
    },
  });
  const preset: RuntimePreset = {
    name: `stage9-preset/${defaultStorageKind}`,
    defaultStorageKind,
    plugins: [plugin],
  };

  return createMachineManagerFactory(preset)({ custom: createStorageMachine(defaultStorageKind) });
};

describe("storage snapshot extension points у MachineManager", () => {
  it("round-trip custom runtime проходит через snapshot.storage[kind]", () => {
    const sourceRuntime = createSnapshotRuntime("stage9");
    const source = MachineManager(
      { counter: counterMachine, custom: createStorageMachine("stage9") },
      { plugins: [createRuntimePlugin(sourceRuntime.runtime)] },
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
    expect(sourceRuntime.dehydrate).toHaveBeenCalledOnce();

    const restoredRuntime = createSnapshotRuntime("stage9");
    const restored = MachineManager(
      { counter: counterMachine, custom: createStorageMachine("stage9") },
      { plugins: [createRuntimePlugin(restoredRuntime.runtime)], snapshot },
    );

    expect(restoredRuntime.hydrate).toHaveBeenCalledOnce();
    expect(restored.getState().custom).toEqual({ state: "READY", context: { value: 1 } });
  });

  it("dehydrate по умолчанию включает storage runtimes со snapshot capability", () => {
    const custom = createSnapshotRuntime("stage9", { initialValue: 7 });
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createRuntimePlugin(custom.runtime)] });

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
    const custom = createSnapshotRuntime("stage9", { initialValue: 3 });
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createRuntimePlugin(custom.runtime)] });

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
    const alpha = createSnapshotRuntime("alpha", { initialValue: 1 });
    const beta = createSnapshotRuntime("beta", { initialValue: 2 });
    const manager = MachineManager(
      { counter: counterMachine },
      { plugins: [createRuntimePlugin(alpha.runtime), createRuntimePlugin(beta.runtime)] },
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
    const custom = createSnapshotRuntime("stage9", { initialValue: 5 });
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createRuntimePlugin(custom.runtime)] });

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
      { plugins: [createRuntimePlugin(createNoSnapshotRuntime("ephemeral"))] },
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
      { plugins: [createRuntimePlugin(createNoSnapshotRuntime("ephemeral"))] },
    );

    expect(() => manager.dehydrate({ storage: ["ephemeral"] })).toThrow(
      "[lite-fsm] dehydrate: storage runtime 'ephemeral' does not support snapshots.",
    );
  });

  it("hydrate storage данных известного runtime без capability бросает clear error", () => {
    const manager = MachineManager(
      { counter: counterMachine },
      { plugins: [createRuntimePlugin(createNoSnapshotRuntime("ephemeral"))] },
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
    const custom = createSnapshotRuntime("stage9");
    const manager = MachineManager(
      { custom: createStorageMachine("stage9") },
      { plugins: [createRuntimePlugin(custom.runtime)] },
    );

    expect(() => manager.hydrate({ machines: {}, storage: { stage9: { value: "bad" } } })).toThrow(
      "[lite-fsm] hydrate: invalid storage snapshot for runtime 'stage9'.",
    );
  });

  it("getSnapshot не вызывает StorageSnapshotRuntime.dehydrate и не включает storage", () => {
    const custom = createSnapshotRuntime("stage9", { initialValue: 9 });
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createRuntimePlugin(custom.runtime)] });

    expect(manager.getSnapshot()).toEqual({
      schemaVersion: undefined,
      machines: {
        counter: { state: "IDLE", context: { count: 0 } },
      },
    });
    expect(custom.dehydrate).not.toHaveBeenCalled();
  });

  it("legacy snapshot без storage сохраняет hydrate и getHydratedState behavior", () => {
    const custom = createSnapshotRuntime("stage9");
    const manager = MachineManager({ counter: counterMachine }, { plugins: [createRuntimePlugin(custom.runtime)] });

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
    const alpha = createSnapshotRuntime("alpha");
    const beta = createSnapshotRuntime("beta");
    const manager = MachineManager(
      { counter: counterMachine },
      { plugins: [createRuntimePlugin(alpha.runtime), createRuntimePlugin(beta.runtime)] },
    );

    manager.hydrate({ machines: {}, storage: { alpha: { value: 10 } } });

    expect(alpha.hydrate).toHaveBeenCalledOnce();
    expect(beta.hydrate).not.toHaveBeenCalled();
  });

  it("getHydratedState со storage payload не мутирует runtime state", () => {
    const custom = createSnapshotRuntime("stage9");
    const manager = MachineManager(
      { custom: createStorageMachine("stage9") },
      { plugins: [createRuntimePlugin(custom.runtime)] },
    );

    const preview = manager.getHydratedState({ machines: {}, storage: { stage9: { value: 11 } } });

    expect(preview.custom).toEqual({ state: "READY", context: { value: 11 } });
    expect(manager.getState().custom).toEqual({ state: "READY", context: { value: 0 } });
    expect(custom.runtimeState.value).toBe(0);
  });

  it("unknown machine hydrate использует первый snapshot runtime, если default runtime не поддерживает snapshot", () => {
    const hydrate = vi.fn<(ctx: StorageHydrateContext) => void>();
    const manager = createPresetManager(
      [createNoSnapshotRuntime("plain"), createPassthroughSnapshotRuntime("snapshot", hydrate)],
      "plain",
    );

    manager.hydrate({ machines: { missing: { state: "READY", context: { value: 1 } } } } as never);

    expect(hydrate).toHaveBeenCalledOnce();
  });

  it("unknown machine hydrate бросает unsupported snapshot error без snapshot runtimes", () => {
    const manager = createPresetManager([createNoSnapshotRuntime("plain")], "plain");

    expect(() =>
      manager.hydrate({ machines: { missing: { state: "READY", context: { value: 1 } } } } as never),
    ).toThrow("[lite-fsm] snapshot is not supported by the configured storage runtimes.");
  });
});
