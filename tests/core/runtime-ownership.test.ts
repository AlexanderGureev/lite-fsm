import { describe, expect, it, vi } from "vitest";

import {
  createMachineManagerFactory,
  type RuntimePreset,
} from "@lite-fsm/core/internal/runtime/kernel/createMachineManagerFactory";
import type { NormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import { instanceStorageRuntime } from "@lite-fsm/core/internal/runtime/instance/storage";
import type { StorageRuntime } from "@lite-fsm/core/internal/runtime/kernel/storage";
import { LiteFsmError, type FSMEvent, type MachineConfig, type ManagerAction, type Middleware } from "@lite-fsm/core";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type TickEvent = FSMEvent<"TICK">;
type NestedEvent = FSMEvent<"OUTER"> | FSMEvent<"INNER">;
type CounterConfig = { IDLE: { TICK: "IDLE" } };
type CounterState = { counter: { state: "IDLE"; context: { count: number } } };
type CounterMachine = MachineConfig<CounterConfig, { count: number }, TickEvent>;

const createCounter = (storage: string): CounterMachine =>
  ({
    storage,
    config: { IDLE: { TICK: "IDLE" } },
    initialState: "IDLE",
    initialContext: { count: 0 },
  }) as never;

type TestRuntimeOptions = {
  readonly effects?: boolean;
  readonly reactions?: boolean;
  readonly order?: string[];
};

const createTestRuntime = (kind: string, options: TestRuntimeOptions = {}): StorageRuntime => {
  const runtimeState = {
    commits: 0,
    effects: 0,
  };

  const runtime: StorageRuntime = {
    kind,
    validateTemplate() {},
    compileTemplate(ctx) {
      return { key: ctx.key, kind };
    },
    createRuntimeState() {
      return runtimeState;
    },
    createPublicInitialState() {
      return { state: "IDLE", context: { count: 0 } };
    },
    acceptsEvent({ action }) {
      return action.type === "TICK";
    },
    reduce({ template, dispatch }) {
      options.order?.push(`${kind}:reduce`);
      const prev = dispatch.nextState[template.key] as { state: "IDLE"; context: { count: number } };
      dispatch.nextState = {
        ...dispatch.nextState,
        [template.key]: { state: "IDLE", context: { count: prev.context.count + 1 } },
      };
    },
    commit() {
      options.order?.push(`${kind}:commit`);
      runtimeState.commits += 1;
    },
  };

  return {
    ...runtime,
    ...(options.reactions
      ? {
          reactions: {
            run() {
              options.order?.push(`${kind}:reaction`);
            },
          },
        }
      : {}),
    ...(options.effects
      ? {
          effects: {
            resolveInvocations() {
              options.order?.push(`${kind}:resolve-effects`);
              return [{ kind }];
            },
            invoke() {
              options.order?.push(`${kind}:effect`);
              runtimeState.effects += 1;
            },
          },
        }
      : {}),
  };
};

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

const createManagerWithRuntime = (runtime: StorageRuntime, machines: Record<string, CounterMachine>) => {
  const preset: RuntimePreset = {
    name: `preset/${runtime.kind}`,
    defaultStorageKind: runtime.kind,
    plugins: [runtimePlugin(`plugin/${runtime.kind}`, [{ kind: runtime.kind, runtime }])],
  };

  return createMachineManagerFactory(preset)(machines);
};

const createNestedMachine = (storage: string) =>
  ({
    storage,
    config: { READY: { OUTER: "READY", INNER: "READY" } },
    initialState: "READY",
    initialContext: { count: 0 },
  }) as never;

const createNestedRuntime = (
  kind: string,
  accepts: (action: NestedEvent) => boolean,
  effects: string[],
  options: { readonly nestedFrom?: "effect" | "reaction" } = { nestedFrom: "effect" },
): StorageRuntime => ({
  kind,
  validateTemplate() {},
  compileTemplate(ctx) {
    return { key: ctx.key, kind };
  },
  createRuntimeState() {
    return {};
  },
  createPublicInitialState() {
    return { state: "READY", context: { count: 0 } };
  },
  acceptsEvent({ action }) {
    return accepts(action as NestedEvent);
  },
  reduce({ template, dispatch }) {
    const prev = dispatch.nextState[template.key] as { state: "READY"; context: { count: number } };
    dispatch.nextState = {
      ...dispatch.nextState,
      [template.key]: { state: "READY", context: { count: prev.context.count + 1 } },
    };
  },
  commit() {},
  ...(options.nestedFrom === "reaction"
    ? {
        reactions: {
          run({ action, manager }) {
            effects.push(`reaction:${kind}:${action.type}`);
            if (kind === "a" && action.type === "OUTER") {
              manager.transition({ type: "INNER" });
            }
          },
        },
      }
    : {}),
  effects: {
    resolveInvocations({ action }) {
      return [{ type: action.type }];
    },
    invoke({ invocation, manager }) {
      const action = invocation as { type: string };
      effects.push(`${kind}:${action.type}`);
      if (options.nestedFrom === "effect" && kind === "a" && action.type === "OUTER") {
        manager.transition({ type: "INNER" });
      }
    },
  },
});

describe("storage runtime ownership", () => {
  it("runtime без effects capability не участвует в effect phase", () => {
    const order: string[] = [];
    const manager = createManagerWithRuntime(createTestRuntime("custom", { order }), {
      counter: createCounter("custom"),
    });

    manager.transition({ type: "TICK" });

    expect(order).toEqual(["custom:reduce", "custom:commit"]);
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 1 } } });
  });

  it("runtime без reactions capability не участвует в reaction phase", () => {
    const order: string[] = [];
    const manager = createManagerWithRuntime(createTestRuntime("custom", { effects: true, order }), {
      counter: createCounter("custom"),
    });

    manager.transition({ type: "TICK" });

    expect(order).toEqual(["custom:reduce", "custom:commit", "custom:resolve-effects", "custom:effect"]);
  });

  it("commit touched runtimes выполняется до subscribers, а reactions выполняются между ними", () => {
    const order: string[] = [];
    const runtime = createTestRuntime("custom", { reactions: true, order });
    const manager = createManagerWithRuntime(runtime, { counter: createCounter("custom") });

    manager.onTransition(() => {
      order.push("subscriber");
    });
    manager.transition({ type: "TICK" });

    expect(order).toEqual(["custom:reduce", "custom:commit", "custom:reaction", "subscriber"]);
  });

  it("storage runtime не вызывает subscribers и effects во время reduce или commit", () => {
    const order: string[] = [];
    const runtime = createTestRuntime("custom", { effects: true, order });
    const manager = createManagerWithRuntime(runtime, { counter: createCounter("custom") });

    manager.onTransition(() => {
      order.push("subscriber");
    });
    manager.transition({ type: "TICK" });

    expect(order).toEqual(["custom:reduce", "custom:commit", "subscriber", "custom:resolve-effects", "custom:effect"]);
  });

  it("effect phase выполняется после subscribers и middleware post-next code", () => {
    const order: string[] = [];
    const runtime = createTestRuntime("custom", { effects: true, order });
    const manager = createMachineManagerFactory({
      name: "preset/custom",
      defaultStorageKind: "custom",
      plugins: [runtimePlugin("plugin/custom", [{ kind: "custom", runtime }])],
    })(
      { counter: createCounter("custom") },
      {
        middleware: [
          () => (next) => (action) => {
            order.push("middleware:before");
            const result = next(action);
            order.push("middleware:after");
            return result;
          },
        ],
      },
    );

    manager.onTransition(() => {
      order.push("subscriber");
    });
    manager.transition({ type: "TICK" });

    expect(order).toEqual([
      "middleware:before",
      "custom:reduce",
      "custom:commit",
      "subscriber",
      "middleware:after",
      "custom:resolve-effects",
      "custom:effect",
    ]);
  });

  it("nested dispatch из effect не перетирает touched runtimes внешнего dispatch", () => {
    const effects: string[] = [];
    const runtimeA = createNestedRuntime("a", (action) => action.type === "OUTER" || action.type === "INNER", effects);
    const runtimeB = createNestedRuntime("b", (action) => action.type === "OUTER", effects);
    const manager = createMachineManagerFactory({
      name: "preset/nested",
      defaultStorageKind: "a",
      plugins: [
        runtimePlugin("plugin/nested", [
          { kind: "a", runtime: runtimeA },
          { kind: "b", runtime: runtimeB },
        ]),
      ],
    })({
      a: createNestedMachine("a"),
      b: createNestedMachine("b"),
    });

    manager.transition({ type: "OUTER" });

    expect(effects).toEqual(["a:OUTER", "a:INNER", "b:OUTER"]);
    expect(manager.getState()).toEqual({
      a: { state: "READY", context: { count: 2 } },
      b: { state: "READY", context: { count: 1 } },
    });
  });

  it("nested dispatch из storage reaction запрещается до subscribers", () => {
    const effects: string[] = [];
    const runtimeA = createNestedRuntime(
      "a",
      (action) => action.type === "OUTER" || action.type === "INNER",
      effects,
      { nestedFrom: "reaction" },
    );
    const runtimeB = createNestedRuntime("b", (action) => action.type === "OUTER", effects, {
      nestedFrom: "reaction",
    });
    const manager = createMachineManagerFactory({
      name: "preset/nested-reaction",
      defaultStorageKind: "a",
      plugins: [
        runtimePlugin("plugin/nested-reaction", [
          { kind: "a", runtime: runtimeA },
          { kind: "b", runtime: runtimeB },
        ]),
      ],
    })({
      a: createNestedMachine("a"),
      b: createNestedMachine("b"),
    });

    let caught: unknown;
    try {
      manager.transition({ type: "OUTER" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LiteFsmError);
    expect((caught as LiteFsmError).code).toBe("LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN");
    expect((caught as LiteFsmError).message).toContain("storage.reactions");
    expect(effects).toEqual(["reaction:a:OUTER"]);
    expect(manager.getState()).toEqual({
      a: { state: "READY", context: { count: 1 } },
      b: { state: "READY", context: { count: 1 } },
    });
  });

  it("nested dispatch из subscriber не перетирает touched runtimes внешнего dispatch", () => {
    const effects: string[] = [];
    const runtimeA = createNestedRuntime("a", (action) => action.type === "OUTER" || action.type === "INNER", effects, {});
    const runtimeB = createNestedRuntime("b", (action) => action.type === "OUTER", effects, {});
    const manager = createMachineManagerFactory({
      name: "preset/nested-subscriber",
      defaultStorageKind: "a",
      plugins: [
        runtimePlugin("plugin/nested-subscriber", [
          { kind: "a", runtime: runtimeA },
          { kind: "b", runtime: runtimeB },
        ]),
      ],
    })({
      a: createNestedMachine("a"),
      b: createNestedMachine("b"),
    });
    let nested = false;
    manager.onTransition((_prev, _current, action) => {
      if (nested || action.type !== "OUTER") return;
      nested = true;
      manager.transition({ type: "INNER" });
    });

    manager.transition({ type: "OUTER" });

    expect(effects).toEqual(["a:INNER", "a:OUTER", "b:OUTER"]);
    expect(manager.getState()).toEqual({
      a: { state: "READY", context: { count: 2 } },
      b: { state: "READY", context: { count: 1 } },
    });
  });

  it("middleware получает generic api без запуска unsupported capabilities", async () => {
    const order: string[] = [];
    const runtime = createTestRuntime("custom", { order });
    let nested = false;
    const middleware: Middleware<CounterState, TickEvent> = (api) => (next) => (action) => {
      order.push("condition");
      void api.condition(() => true);
      if (!nested) {
        nested = true;
        api.transition({ type: "NOOP" } as unknown as ManagerAction<TickEvent>);
        order.push("nested");
      }
      return next(action);
    };
    const manager = createMachineManagerFactory({
      name: "preset/custom-api",
      defaultStorageKind: "custom",
      plugins: [runtimePlugin("plugin/custom-api", [{ kind: "custom", runtime }])],
    })(
      { counter: createCounter("custom") },
      {
        middleware: [middleware],
      },
    );

    manager.transition({ type: "TICK" });

    expect(order).toEqual(["condition", "condition", "nested", "custom:reduce", "custom:commit"]);
  });

  it("createRuntimeState вызывается один раз для каждого registered storage kind с templates своего kind", () => {
    const created: Array<{ kind: string; keys: string[] }> = [];
    const first = createTestRuntime("first");
    const second = createTestRuntime("second");
    const wrap = (runtime: StorageRuntime): StorageRuntime => ({
      ...runtime,
      createRuntimeState(ctx) {
        created.push({ kind: runtime.kind, keys: ctx.templates.map((template) => template.key) });
        return runtime.createRuntimeState(ctx);
      },
    });
    const plugin = runtimePlugin("plugin/storage-state", [
      { kind: "first", runtime: wrap(first) },
      { kind: "second", runtime: wrap(second) },
    ]);

    createMachineManagerFactory({ name: "preset/storage-state", defaultStorageKind: "first", plugins: [plugin] })({
      alpha: createCounter("first"),
    });

    expect(created).toEqual([
      { kind: "first", keys: ["alpha"] },
      { kind: "second", keys: [] },
    ]);
  });

  it("generic manager поддерживает runtime snapshot, deps и replaceReducer без storage snapshot capability", () => {
    const runtime = createTestRuntime("custom");
    const manager = createManagerWithRuntime(runtime, { counter: createCounter("custom") });
    const subscriber = vi.fn();
    const unsubscribe = manager.onTransition(subscriber);

    manager.setDependencies({ token: "a" } as never);
    manager.setDependencies((deps) => ({ ...deps, token: "b" }) as never);
    expect(manager.getSnapshot()).toEqual({
      schemaVersion: undefined,
      machines: { counter: { state: "IDLE", context: { count: 0 } } },
    });
    expect(() => manager.dehydrate()).toThrow(
      "[lite-fsm] snapshot is not supported by the configured storage runtimes.",
    );
    expect(() => manager.getHydratedState({ machines: {} } as never)).toThrow(
      "[lite-fsm] snapshot is not supported by the configured storage runtimes.",
    );

    expect(() => manager.hydrate({ machines: { counter: { state: "IDLE", context: { count: 7 } } } } as never)).toThrow(
      "[lite-fsm] hydrate: storage runtime 'custom' does not support snapshots.",
    );
    expect(subscriber).not.toHaveBeenCalled();

    unsubscribe();
    manager.replaceReducer(() => () => undefined as never);
    expect(() => manager.transition({ type: "TICK" })).toThrow(
      "Reducer returned undefined. Return the next state, or use immerMiddleware to mutate draft state without return.",
    );
    expect(subscriber).not.toHaveBeenCalled();
  });

  it("generic manager запрещает reserved system actions", () => {
    const manager = createManagerWithRuntime(createTestRuntime("custom"), { counter: createCounter("custom") });

    expect(() => manager.transition({ type: "@@lite-fsm/HYDRATE" } as never)).toThrow(
      "[lite-fsm] reserved system action '@@lite-fsm/HYDRATE' cannot be dispatched.",
    );
  });
});

describe("storage diagnostics", () => {
  it("unknown и duplicate storage diagnostics сохраняются", () => {
    const duplicate = runtimePlugin("duplicate-storage", [
      { kind: "custom", runtime: createTestRuntime("custom") },
      { kind: "custom", runtime: createTestRuntime("custom") },
    ]);

    expect(() =>
      createMachineManagerFactory({ name: "preset/duplicate", defaultStorageKind: "custom", plugins: [duplicate] })({
        counter: createCounter("custom"),
      }),
    ).toThrow(
      "[lite-fsm] duplicate storage kind 'custom': plugin 'duplicate-storage' conflicts with plugin 'duplicate-storage'.",
    );

    expect(() =>
      createMachineManagerFactory({ name: "preset/unknown", defaultStorageKind: "custom", plugins: [] })({
        counter: createCounter("custom"),
      }),
    ).toThrow("[lite-fsm] default storage kind 'custom' is not registered.");
  });
});

describe("import boundary", () => {
  it("storage runtime contract не содержит createManagerRuntime escape hatch", () => {
    expect(instanceStorageRuntime).not.toHaveProperty("createManagerRuntime");
    expect(readFileSync(join(process.cwd(), "packages/core/src/runtime/kernel/storage.ts"), "utf8")).not.toContain(
      "createManagerRuntime",
    );
  });

  it("kernel modules не импортируют runtime instance modules", () => {
    const kernelDir = join(process.cwd(), "packages/core/src/runtime/kernel");
    const files = readdirSync(kernelDir)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => join(kernelDir, file));

    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toMatch(/runtime\/instance|\.\.\/instance/);
    }
  });

  it("единственный import instanceRuntimePlugin находится в runtime/defaultPreset.ts", () => {
    const srcDir = join(process.cwd(), "packages/core/src");
    const hits: string[] = [];
    const visit = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const file = join(dir, name);
        if (statSync(file).isDirectory()) {
          visit(file);
          continue;
        }
        if (!file.endsWith(".ts")) continue;
        if (readFileSync(file, "utf8").includes("instanceRuntimePlugin")) hits.push(file);
      }
    };

    visit(srcDir);

    expect(hits.map((file) => file.replace(`${process.cwd()}/`, ""))).toEqual([
      "packages/core/src/runtime/defaultPreset.ts",
      "packages/core/src/runtime/instance/plugin.ts",
    ]);
  });
});
