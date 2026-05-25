import { describe, expect, it, vi } from "vitest";

import { definePlugin, defineStorageRuntime, MachineManager } from "@lite-fsm/core";
import type { NormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import {
  createMachineManagerFactory,
  type RuntimePreset,
} from "@lite-fsm/core/internal/runtime/kernel/createMachineManagerFactory";
import { INSTANCE_RUNTIME_PLUGIN_NAME, instanceRuntimePlugin } from "@lite-fsm/core/internal/runtime/instance/plugin";
import { instanceStorageRuntime } from "@lite-fsm/core/internal/runtime/instance/storage";
import { createRoutingRuntime } from "@lite-fsm/core/internal/runtime/kernel/routing";
import type { FSMEvent, MachineConfig } from "@lite-fsm/core";
import type {
  CompiledStorageTemplate,
  ManagerRuntimeContext,
  StorageRuntime,
  StorageRuntimeState,
} from "@lite-fsm/core/internal/runtime/kernel/storage";

type CounterEvent = FSMEvent<"INC">;
type CounterConfig = { IDLE: { INC: "ACTIVE" }; ACTIVE: { INC: null } };
type CounterContext = { count: number };
type CounterMachine = MachineConfig<CounterConfig, CounterContext, CounterEvent>;

const createCounter = (storage?: "instance"): CounterMachine => ({
  ...(storage === undefined ? {} : { storage }),
  config: { IDLE: { INC: "ACTIVE" }, ACTIVE: { INC: null } },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (slice, _action, { nextState }) => ({
    state: nextState,
    context: { count: slice.context.count + 1 },
  }),
});

const testStorageRuntime = (kind: string): StorageRuntime => ({
  kind,
  validateTemplate() {},
  compileTemplate(ctx) {
    return { key: ctx.key, kind };
  },
  createRuntimeState() {
    return undefined;
  },
  createPublicInitialState() {
    return undefined;
  },
  acceptsEvent() {
    return true;
  },
  reduce() {},
  commit() {},
});

const testStorageDefinition = (kind: string) =>
  defineStorageRuntime().create({
    kind,
    validateTemplate() {},
    compileTemplate() {},
    createRuntimeState() {
      return undefined;
    },
    createPublicInitialState() {
      return undefined;
    },
    acceptsEvent() {
      return true;
    },
    reduce() {},
    commit() {},
  });

const runtimePlugin = (
  name: string,
  entries: readonly { readonly kind: string; readonly runtime: StorageRuntime }[],
): NormalizedPlugin => ({
  name,
  storage: entries.map(({ kind, runtime }) => ({ owner: name, kind, value: runtime })),
  routeMeta: [],
  scopedDeps: [],
  scopedTransition: [],
  manager: [],
  hooks: {},
});

describe("runtime preset MachineManager", () => {
  it("machine без storage использует default storage kind instance", () => {
    const manager = MachineManager({ counter: createCounter() });

    manager.transition({ type: "INC" });

    expect(manager.getState()).toEqual({ counter: { state: "ACTIVE", context: { count: 1 } } });
  });

  it("явное storage instance работает как отсутствие storage", () => {
    const implicit = MachineManager({ counter: createCounter() });
    const explicit = MachineManager({ counter: createCounter("instance") });

    implicit.transition({ type: "INC" });
    explicit.transition({ type: "INC" });

    expect(explicit.getState()).toEqual(implicit.getState());
    expect(explicit.dehydrate()).toEqual(implicit.dehydrate());
  });

  it("unknown storage бросает init error", () => {
    const machine = {
      ...createCounter(),
      storage: "missing",
    } as never;

    expect(() => MachineManager({ counter: machine })).toThrow(
      "[lite-fsm] machine 'counter' uses unknown storage kind 'missing'.",
    );
  });

  it("duplicate storage kind бросает init error", () => {
    const first = definePlugin().create({ name: "first-storage", storage: [testStorageDefinition("custom")] });
    const second = definePlugin().create({ name: "second-storage", storage: [testStorageDefinition("custom")] });

    expect(() => MachineManager({ counter: createCounter() }, { plugins: [first, second] })).toThrow(
      "[lite-fsm] duplicate storage kind 'custom'.",
    );
  });

  it("storage registry проверяет совпадение registered kind и runtime.kind", () => {
    const plugin = runtimePlugin("storage-kind-mismatch", [
      { kind: "custom", runtime: testStorageRuntime("other") },
    ]);

    expect(() =>
      createMachineManagerFactory({
        name: "test/storage-kind-mismatch",
        defaultStorageKind: "instance",
        plugins: [instanceRuntimePlugin, plugin],
      })({ counter: createCounter() }),
    ).toThrow(
      "[lite-fsm] storage runtime registered for kind 'custom' declared kind 'other'.",
    );
  });

  it("kernel отклоняет compiled template с другим storage kind", () => {
    const runtime: StorageRuntime = {
      ...testStorageRuntime("custom"),
      compileTemplate(ctx) {
        return { key: ctx.key, kind: "other" };
      },
    };
    const plugin = runtimePlugin("compiled-kind-mismatch", [{ kind: "custom", runtime }]);
    const machine = { ...createCounter(), storage: "custom" } as never;

    expect(() =>
      createMachineManagerFactory({
        name: "test/compiled-kind-mismatch",
        defaultStorageKind: "custom",
        plugins: [plugin],
      })({ counter: machine }),
    ).toThrow(
      "[lite-fsm] storage runtime 'custom' compiled machine 'counter' with kind 'other'.",
    );
  });

  it("missing default storage kind бросает init error через internal factory", () => {
    const createManager = createMachineManagerFactory({
      name: "test/missing-default",
      defaultStorageKind: "missing",
      plugins: [],
    });

    expect(() => createManager({ counter: createCounter() })).toThrow(
      "[lite-fsm] default storage kind 'missing' is not registered.",
    );
  });

  it("preset plugins устанавливаются раньше user plugins", () => {
    const order: string[] = [];
    const presetPlugin: NormalizedPlugin = {
      name: "preset-storage",
      storage: [],
      routeMeta: [],
      scopedDeps: [],
      scopedTransition: [],
      manager: [],
      intercept() {
        order.push("preset");
      },
      hooks: {},
    };
    const userPlugin = definePlugin().create({
      name: "user-storage",
      intercept() {
        order.push("user");
      },
    });
    const preset: RuntimePreset = {
      name: "test/runtime",
      defaultStorageKind: "instance",
      plugins: [instanceRuntimePlugin, presetPlugin],
    };

    const manager = createMachineManagerFactory(preset)({ counter: createCounter() }, { plugins: [userPlugin] });
    manager.transition({ type: "INC" });

    expect(order).toEqual(["preset", "user"]);
  });

  it("user plugin не может повторно занять instance", () => {
    const plugin = definePlugin().create({
      name: "duplicate-instance-storage",
      storage: [testStorageDefinition("instance")],
    });

    expect(() => MachineManager({ counter: createCounter() }, { plugins: [plugin] })).toThrow(
      "[lite-fsm] duplicate storage kind 'instance'.",
    );
  });

  it("no-op plugin не меняет поведение", () => {
    const effect = vi.fn();
    const plugin = definePlugin().create({ name: "runtime-preset-noop" });
    const manager = MachineManager(
      {
        counter: {
          ...createCounter(),
          effects: { ACTIVE: effect },
        },
      },
      { plugins: [plugin] },
    );

    manager.transition({ type: "INC" });

    expect(manager.getState()).toEqual({ counter: { state: "ACTIVE", context: { count: 1 } } });
    expect(effect).toHaveBeenCalledTimes(1);
  });
});

describe("instanceStorageRuntime", () => {
  it("регистрируется через instanceRuntimePlugin и реализует runtime capability contract", () => {
    const config = { counter: createCounter() };
    let rootState = {};
    const routing = createRoutingRuntime();
    const manager: ManagerRuntimeContext = {
      config,
      options: undefined,
      schemaVersion: undefined,
      routing,
      getState: () => rootState as never,
      transition: (action) => action,
      onTransition: () => () => {},
      getDependencies: () => ({}),
      createScopedDeps: (baseDeps) => baseDeps,
    };

    const template: CompiledStorageTemplate = { key: "counter", kind: "instance" };
    const runtimeState: StorageRuntimeState = instanceStorageRuntime.createRuntimeState({ templates: [template], manager });
    rootState = {
      counter: instanceStorageRuntime.createPublicInitialState({ template, state: runtimeState }),
    };

    expect(instanceRuntimePlugin).toMatchObject({
      name: INSTANCE_RUNTIME_PLUGIN_NAME,
      storage: [{ owner: INSTANCE_RUNTIME_PLUGIN_NAME, kind: "instance", value: instanceStorageRuntime }],
    });
    expect(instanceStorageRuntime).not.toHaveProperty("createManagerRuntime");
    expect(instanceStorageRuntime.effects).toBeDefined();
    expect(instanceStorageRuntime.snapshot).toBeDefined();
    expect(instanceStorageRuntime.identity).toBeDefined();
    expect(instanceStorageRuntime.identity?.resolve({ state: runtimeState, action: { type: "INC" } })).toBeUndefined();
    expect(
      instanceStorageRuntime.identity?.resolve({
        state: runtimeState,
        action: { type: "INC", meta: { actorId: "missing" } },
      }),
    ).toBeUndefined();
    expect(() =>
      instanceStorageRuntime.identity?.resolve({ state: {}, action: { type: "INC" } }),
    ).toThrow("[lite-fsm] invalid instance storage runtime state.");
    const action = { type: "INC" };
    const createDispatch = (overrides: Record<string, unknown> = {}) => ({
      options: undefined,
      runtime: new Map<string, unknown>(),
      originalAction: action,
      preparedAction: action,
      action,
      skipDelivery: false,
      route: routing.resolveRoute(action),
      prevState: rootState,
      nextState: rootState,
      nextCalled: true,
      dropped: false,
      touched: new Set<string>(),
      reportError() {},
      ...overrides,
    });
    const dispatch = createDispatch();
    expect(
      instanceStorageRuntime.reduce({
        template,
        action,
        state: runtimeState,
        manager,
        dispatch,
      }),
    ).toBeUndefined();
    expect(dispatch.nextState).toEqual({ counter: { state: "ACTIVE", context: { count: 1 } } });
    const droppedDispatch = createDispatch({
      options: { sender: { actorId: "missing", groupId: "missing", groupTag: "missing" } },
    });
    expect(
      instanceStorageRuntime.reduce({
        template,
        action,
        state: runtimeState,
        manager,
        dispatch: droppedDispatch,
      }),
    ).toBe(false);
    expect(droppedDispatch.dropped).toBe(true);
    const beginDispatch = createDispatch();
    expect(
      instanceStorageRuntime.beginReduce?.({ action, state: runtimeState, manager, dispatch: beginDispatch }),
    ).toBeUndefined();
    expect(
      instanceStorageRuntime.beginReduce?.({ action, state: runtimeState, manager, dispatch: beginDispatch }),
    ).toBeUndefined();
    expect(
      instanceStorageRuntime.commit({
        state: runtimeState,
        manager,
        dispatch: createDispatch(),
      }),
    ).toBeUndefined();
    expect(
      instanceStorageRuntime.compileTemplate({ key: "counter", machine: createCounter(), storageKind: "instance" }),
    ).toEqual({
      key: "counter",
      kind: "instance",
    });
    expect(rootState).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
  });
});
