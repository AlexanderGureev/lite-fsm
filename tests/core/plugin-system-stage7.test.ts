import { describe, expect, it } from "vitest";

import { definePlugin, defineStorageRuntime, LiteFsmError, MachineManager } from "@lite-fsm/core";
import { getNormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import type { StorageRuntime } from "@lite-fsm/core/internal/runtime/kernel/storage";

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

const createStorageRuntimeDefinition = (kind = "stage-seven-cache") => ({
  kind,
  validateTemplate() {},
  compileTemplate() {},
  createRuntimeState() {
    return {};
  },
  createPublicInitialState() {
    return { state: "IDLE", context: { count: 0 } };
  },
  acceptsEvent() {
    return false;
  },
  reduce() {},
  commit() {},
});

describe("plugin system — этап 7 storage builder", () => {
  it("создает opaque storage definition и нормализует public compileTemplate payload", () => {
    const emptyPayloadStorage = defineStorageRuntime().create(createStorageRuntimeDefinition("empty-payload"));
    const dataPayloadStorage = defineStorageRuntime().create({
      ...createStorageRuntimeDefinition("data-payload"),
      compileTemplate() {
        return { data: { ttl: 1000 } };
      },
    });
    const plugin = definePlugin().create({
      name: "stage-seven-storage-plugin",
      storage: [emptyPayloadStorage, dataPayloadStorage],
    });
    const normalized = getNormalizedPlugin(plugin);

    expect(Object.keys(emptyPayloadStorage)).toEqual(["kind"]);
    expect(Object.isFrozen(emptyPayloadStorage)).toBe(true);
    expect(normalized.storage).toHaveLength(2);
    expect(normalized.storage[0]).toMatchObject({
      owner: "stage-seven-storage-plugin",
      kind: "empty-payload",
    });

    const emptyRuntime = normalized.storage[0]!.value as StorageRuntime;
    const dataRuntime = normalized.storage[1]!.value as StorageRuntime;
    const machine = {
      config: { IDLE: {} },
      initialState: "IDLE",
      initialContext: { count: 0 },
    };

    expect(emptyRuntime.compileTemplate({ key: "counter", storageKind: "empty-payload", machine })).toEqual({
      key: "counter",
      kind: "empty-payload",
    });
    expect(dataRuntime.compileTemplate({ key: "counter", storageKind: "data-payload", machine })).toEqual({
      key: "counter",
      kind: "data-payload",
      data: { ttl: 1000 },
    });
  });

  it("сохраняет builder-owned key и kind при обходе типов compileTemplate", () => {
    const storage = defineStorageRuntime().create({
      ...createStorageRuntimeDefinition("owned-kind"),
      compileTemplate() {
        return {
          key: "spoofed-key",
          kind: "spoofed-kind",
          data: { ttl: 250 },
        } as never;
      },
    });
    const plugin = definePlugin().create({
      name: "stage-seven-owned-compile-template",
      storage: [storage],
    });
    const normalized = getNormalizedPlugin(plugin);
    const runtime = normalized.storage[0]!.value as StorageRuntime;
    const machine = {
      config: { IDLE: {} },
      initialState: "IDLE",
      initialContext: { count: 0 },
    };

    expect(runtime.compileTemplate({ key: "counter", storageKind: "owned-kind", machine })).toEqual({
      key: "counter",
      kind: "owned-kind",
      data: { ttl: 250 },
    });
  });

  it("валидирует локальную форму storage runtime definition", () => {
    const create = defineStorageRuntime().create;

    create(
      Object.assign(Object.create(null), createStorageRuntimeDefinition("null-proto-storage")) as ReturnType<
        typeof createStorageRuntimeDefinition
      >,
    );
    create({ ...createStorageRuntimeDefinition("explicit-template-scope"), reduceScope: "template" });
    create({
      kind: "bucket-scope",
      reduceScope: "bucket",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      reduceBucket() {},
      commit() {},
    });
    create({ ...createStorageRuntimeDefinition("route-meta-keys"), routeMetaKeys: ["entityId"] });
    expectLiteFsmError(
      () => (defineStorageRuntime as unknown as (arg: unknown) => unknown)({}),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(() => create(null as never), "LITE_FSM_INVALID_PLUGIN_DEFINITION");
    expectLiteFsmError(
      () => create({ ...createStorageRuntimeDefinition(""), kind: "" }),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () => create({ ...createStorageRuntimeDefinition(), unknown: true } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () => create({ ...createStorageRuntimeDefinition(), routeMetaKeys: "entityId" } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () => create({ ...createStorageRuntimeDefinition(), routeMetaKeys: ["entityId", 1] } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () => create({ ...createStorageRuntimeDefinition(), validateTemplate: "bad" } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(() => {
      const { commit: _commit, ...definition } = createStorageRuntimeDefinition();
      return create(definition as never);
    }, "LITE_FSM_INVALID_PLUGIN_DEFINITION");
    expectLiteFsmError(
      () => create({ ...createStorageRuntimeDefinition(), reduceScope: "entity" } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () =>
        create({
          kind: "bucket-missing-reduce-bucket",
          reduceScope: "bucket",
          validateTemplate() {},
          compileTemplate() {},
          createRuntimeState() {
            return {};
          },
          createPublicInitialState() {
            return {};
          },
          commit() {},
        } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(() => {
      const { acceptsEvent: _acceptsEvent, ...definition } = createStorageRuntimeDefinition();
      return create(definition as never);
    }, "LITE_FSM_INVALID_PLUGIN_DEFINITION");
    expectLiteFsmError(() => {
      const { reduce: _reduce, ...definition } = createStorageRuntimeDefinition();
      return create(definition as never);
    }, "LITE_FSM_INVALID_PLUGIN_DEFINITION");
    expectLiteFsmError(
      () =>
        create({
          kind: "bucket-with-accepts-event",
          reduceScope: "bucket",
          validateTemplate() {},
          compileTemplate() {},
          createRuntimeState() {
            return {};
          },
          createPublicInitialState() {
            return {};
          },
          acceptsEvent() {
            return true;
          },
          reduceBucket() {},
          commit() {},
        } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () =>
        create({
          kind: "bucket-with-reduce",
          reduceScope: "bucket",
          validateTemplate() {},
          compileTemplate() {},
          createRuntimeState() {
            return {};
          },
          createPublicInitialState() {
            return {};
          },
          reduce() {},
          reduceBucket() {},
          commit() {},
        } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () => create({ ...createStorageRuntimeDefinition(), reduceScope: "template", reduceBucket() {} } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () => create({ ...createStorageRuntimeDefinition(), reduceBucket() {} } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () => create({ ...createStorageRuntimeDefinition(), prepareAction: false } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () => create({ ...createStorageRuntimeDefinition(), beforeReduce: null } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    // Regression-аудит: удаленные поля старого storage protocol остаются обычными unknown fields.
    for (const definition of [
      { ...createStorageRuntimeDefinition(), beginReduce() {} },
      { ...createStorageRuntimeDefinition(), prepareActionResult: "drop" },
      { ...createStorageRuntimeDefinition(), beforeReduceResult: "drop" },
      { ...createStorageRuntimeDefinition(), reduceResult: "skip" },
      { ...createStorageRuntimeDefinition(), reduceBucketResult: "skip" },
    ]) {
      expectLiteFsmError(() => create(definition as never), "LITE_FSM_INVALID_PLUGIN_DEFINITION");
    }
  });

  it("валидирует optional runtime blocks", () => {
    const create = defineStorageRuntime().create;

    create({
      ...createStorageRuntimeDefinition("with-optional-blocks"),
      beforeReduce() {
        return { type: "replace", action: { type: "OPTIONAL_BLOCK" } };
      },
      effects: {
        condition: async () => true,
        resolveInvocations: () => [],
        invoke() {},
      },
      snapshot: {
        dehydrate: () => ({}),
        hydrate: () => ({ nextState: {}, changed: false }),
      },
      identity: {
        resolve: () => undefined,
      },
      reactions: {
        run() {},
      },
    });

    for (const definition of [
      { ...createStorageRuntimeDefinition(), effects: null },
      { ...createStorageRuntimeDefinition(), effects: { resolveInvocations: () => [], invoke() {}, extra() {} } },
      { ...createStorageRuntimeDefinition(), effects: { invoke() {} } },
      { ...createStorageRuntimeDefinition(), effects: { resolveInvocations: () => [], invoke() {}, condition: true } },
      { ...createStorageRuntimeDefinition(), snapshot: { dehydrate: () => ({}) } },
      { ...createStorageRuntimeDefinition(), identity: { resolve: "bad" } },
      { ...createStorageRuntimeDefinition(), reactions: [] },
    ]) {
      expectLiteFsmError(() => create(definition as never), "LITE_FSM_INVALID_PLUGIN_DEFINITION");
    }
  });

  it("применяет object result protocol в prepareAction и beforeReduce", () => {
    const calls: string[] = [];
    const storage = defineStorageRuntime().create({
      kind: "stage-one-result-protocol",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return { seen: [] as string[] };
      },
      prepareAction({ action }) {
        calls.push(`prepare:${action.type}`);
        if (action.type === "RAW") return { type: "replace", action: { type: "PREPARED" } };
        if (action.type === "PREPARE_DROP") return { type: "drop" };
      },
      beforeReduce({ action, originalAction }) {
        calls.push(`before:${originalAction.type}:${action.type}`);
        if (action.type === "PREPARED") return { type: "replace", action: { type: "COMMITTED" } };
        if (action.type === "BEFORE_DROP") return { type: "drop" };
      },
      acceptsEvent({ action }) {
        return action.type === "COMMITTED";
      },
      reduce({ action, dispatch, template }) {
        const current = dispatch.nextState[template.key] as { readonly seen: readonly string[] };
        dispatch.nextState = {
          ...dispatch.nextState,
          [template.key]: { seen: [...current.seen, action.type] },
        };
      },
      commit() {
        calls.push("commit");
      },
    });
    const plugin = definePlugin().create({ name: "stage-one-result-protocol", storage: [storage] });
    const manager = MachineManager(
      {
        cache: {
          storage: "stage-one-result-protocol",
          config: { IDLE: {} },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      { plugins: [plugin] },
    );

    expect(manager.transition({ type: "RAW" })).toEqual({ type: "COMMITTED" });
    expect(manager.getState()).toEqual({ cache: { seen: ["COMMITTED"] } });
    expect(calls).toEqual(["prepare:RAW", "before:RAW:PREPARED", "commit"]);

    calls.length = 0;
    expect(manager.transition({ type: "PREPARE_DROP" })).toEqual({ type: "PREPARE_DROP" });
    expect(manager.transition({ type: "BEFORE_DROP" })).toEqual({ type: "BEFORE_DROP" });
    expect(manager.getState()).toEqual({ cache: { seen: ["COMMITTED"] } });
    expect(calls).toEqual(["prepare:PREPARE_DROP", "prepare:BEFORE_DROP", "before:BEFORE_DROP:BEFORE_DROP"]);
  });

  it("принимает storage section только как readonly array opaque definitions", () => {
    const storage = defineStorageRuntime().create(createStorageRuntimeDefinition("valid-section"));

    definePlugin().create({
      name: "stage-seven-valid-storage-section",
      storage: [storage] as const,
    });

    expectLiteFsmError(
      () => definePlugin().create({ name: "stage-seven-empty-storage", storage: [] } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () => definePlugin().create({ name: "stage-seven-object-storage", storage: { cache: storage } } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () =>
        definePlugin().create({
          name: "stage-seven-inline-storage",
          storage: [createStorageRuntimeDefinition("inline")],
        } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
  });

  it("передает пользовательский storage section в MachineManager через runtime registry", () => {
    const storage = defineStorageRuntime().create(createStorageRuntimeDefinition("manager-registered"));
    const plugin = definePlugin().create({
      name: "stage-seven-manager-registered",
      storage: [storage],
    });
    const manager = MachineManager(
      {
        counter: {
          storage: "manager-registered",
          config: { IDLE: { INC: "IDLE" } },
          initialState: "IDLE",
          initialContext: { count: 0 },
        },
      },
      { plugins: [plugin] as const },
    );

    expect(manager.getState().counter).toEqual({ state: "IDLE", context: { count: 0 } });
  });

  it("сохраняет встроенный instance storage через internal preset", () => {
    const manager = MachineManager({
      counter: {
        config: { IDLE: { INC: "IDLE" } },
        initialState: "IDLE",
        initialContext: { count: 0 },
        reducer: (state: { readonly context: { readonly count: number } }, action: { type: "INC" }) => ({
          state: "IDLE" as const,
          context: { count: action.type === "INC" ? state.context.count + 1 : state.context.count },
        }),
      },
    });

    manager.transition({ type: "INC" });

    expect(manager.getState().counter).toEqual({ state: "IDLE", context: { count: 1 } });
  });
});
