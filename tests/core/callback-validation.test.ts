import { describe, expect, it, vi } from "vitest";

import { definePlugin, defineStorageRuntime, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig, ManagerAction, Middleware } from "@lite-fsm/core";
import type { StorageReduceContext } from "@lite-fsm/core/internal/runtime/kernel/storage";

type TestEvent = FSMEvent<"RAW"> | FSMEvent<"NEXT"> | FSMEvent<"FINAL"> | FSMEvent<"STOPPED">;
type TestAction = ManagerAction<TestEvent>;
type TestSlice = { readonly seen: readonly string[] };
type StorageDefinition = ReturnType<ReturnType<typeof defineStorageRuntime>["create"]>;
type InstanceSlice = { readonly state: "IDLE"; readonly context: { readonly seen: readonly string[] } };

const slug = (value: string): string => value.replace(/ /g, "-");

const createMachine = (kind: string): MachineConfig<{ readonly IDLE: {} }, {}, TestEvent> & { readonly storage: string } =>
  ({
    storage: kind,
    config: { IDLE: {} },
    initialState: "IDLE",
    initialContext: {},
  }) as never;

const expectLiteFsmError = (run: () => unknown, code: LiteFsmError["code"], message?: string): LiteFsmError => {
  let caught: unknown;

  try {
    run();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(LiteFsmError);
  expect((caught as LiteFsmError).code).toBe(code);
  if (message) expect((caught as Error).message).toContain(message);
  return caught as LiteFsmError;
};

const createTemplateStorage = (
  kind: string,
  overrides: Record<string, unknown> = {},
) =>
  defineStorageRuntime().create({
    kind,
    validateTemplate() {},
    compileTemplate() {},
    createRuntimeState() {
      return undefined;
    },
    createPublicInitialState() {
      return { seen: [] } satisfies TestSlice;
    },
    acceptsEvent() {
      return true;
    },
    reduce({ action, dispatch, template }: StorageReduceContext) {
      const prev = dispatch.nextState[template.key] as TestSlice;
      dispatch.nextState = {
        ...dispatch.nextState,
        [template.key]: { seen: [...prev.seen, action.type] } satisfies TestSlice,
      };
    },
    commit() {},
    ...overrides,
  } as never);

const createBucketStorage = (kind: string, reduceBucket: (ctx: unknown) => unknown) =>
  defineStorageRuntime().create({
    kind,
    reduceScope: "bucket",
    validateTemplate() {},
    compileTemplate() {},
    createRuntimeState() {
      return undefined;
    },
    createPublicInitialState() {
      return { seen: [] } satisfies TestSlice;
    },
    reduceBucket,
    commit() {},
  } as never);

const createManager = (
  storage: StorageDefinition,
  plugins: readonly unknown[] = [],
  middleware: readonly Middleware<Record<string, TestSlice>, TestEvent>[] = [],
  options: { readonly onError?: (error: unknown) => void } = {},
) =>
  MachineManager(
    { item: createMachine(storage.kind) } as never,
    {
      plugins: [definePlugin().create({ name: `storage-${storage.kind}`, storage: [storage] }), ...plugins],
      middleware,
      onError: options.onError,
    } as never,
  ) as unknown as {
    transition(action: TestAction): TestAction;
    getState(): Record<string, TestSlice>;
    onTransition(cb: (prev: Record<string, TestSlice>, current: Record<string, TestSlice>, action: TestAction) => void): void;
  };

describe("runtime validation callback protocols — storage compileTemplate", () => {
  it("принимает null-prototype object с единственным полем data", () => {
    const payload = Object.assign(Object.create(null), { data: { source: "null-proto" } });
    const storage = createTemplateStorage("compile-null-prototype", {
      compileTemplate() {
        return payload as never;
      },
    });
    const plugin = definePlugin().create({ name: "plugin-compile-null-prototype", storage: [storage] });

    const manager = MachineManager({ item: createMachine(storage.kind) } as never, { plugins: [plugin] } as never);

    expect(manager.getState()).toEqual({ item: { seen: [] } });
  });

  for (const [label, result] of [
    ["primitive", "bad"],
    ["null", null],
    ["array", []],
    ["key", { key: "spoofed" }],
    ["kind", { kind: "spoofed" }],
    ["unknown field", { unknown: true }],
  ] as const) {
    it(`отклоняет compileTemplate result ${label}`, () => {
      const kind = `compile-${slug(label)}`;
      const storage = createTemplateStorage(kind, {
        compileTemplate() {
          return result as never;
        },
      });
      const plugin = definePlugin().create({ name: `plugin-${kind}`, storage: [storage] });

      const error = expectLiteFsmError(
        () => MachineManager({ item: createMachine(kind) } as never, { plugins: [plugin] } as never),
        "LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT",
        `storage runtime '${kind}' compileTemplate`,
      );

      expect(error.message).toContain("data");
    });
  }
});

describe("runtime validation callback protocols — storage action stages", () => {
  for (const phase of ["prepareAction", "beforeReduce"] as const) {
    for (const [label, result] of [
      ["primitive", 1],
      ["unknown shape", {}],
      ["unknown type", { type: "unknown" }],
      ["replace without action", { type: "replace" }],
      ["drop with action", { type: "drop", action: { type: "NEXT" } }],
      ["drop with extra field", { type: "drop", extra: true }],
      ["replace with extra field", { type: "replace", action: { type: "NEXT" }, extra: true }],
    ] as const) {
      it(`отклоняет ${phase} result ${label}`, () => {
        const storage = createTemplateStorage(`action-${phase}-${slug(label)}`, {
          [phase]() {
            return result as never;
          },
        });
        const manager = createManager(storage);

        expectLiteFsmError(
          () => manager.transition({ type: "RAW" }),
          "LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT",
          `storage runtime '${storage.kind}' ${phase}`,
        );
        expect(manager.getState()).toEqual({ item: { seen: [] } });
      });
    }

    for (const [label, action] of [
      ["non-object action", "NEXT"],
      ["missing type", {}],
      ["non-string type", { type: 1 }],
      ["reserved type", { type: "@@lite-fsm/INTERNAL" }],
    ] as const) {
      it(`отклоняет ${phase} replacement action ${label}`, () => {
        const storage = createTemplateStorage(`replacement-${phase}-${slug(label)}`, {
          [phase]() {
            return { type: "replace", action } as never;
          },
        });
        const manager = createManager(storage);

        expectLiteFsmError(
          () => manager.transition({ type: "RAW" }),
          "LITE_FSM_INVALID_REPLACEMENT_ACTION",
          `storage runtime '${storage.kind}' ${phase}`,
        );
        expect(manager.getState()).toEqual({ item: { seen: [] } });
      });
    }
  }

  it("не запускает следующие storage phases после invalid prepareAction result", () => {
    const log: string[] = [];
    const onError = vi.fn();
    const storage = createTemplateStorage("storage-invalid-prepare-fail-fast", {
      prepareAction() {
        log.push("prepare");
        return { type: "drop", extra: true } as never;
      },
      beforeReduce() {
        log.push("beforeReduce");
      },
      reduce() {
        log.push("reduce");
      },
    });
    const plugin = definePlugin().create({
      name: "storage-invalid-prepare-interceptor",
      intercept() {
        log.push("intercept");
      },
    });
    const middleware: Middleware<Record<string, TestSlice>, TestEvent> = () => (next) => (action) => {
      log.push(`middleware:${action.type}`);
      return next(action);
    };
    const manager = createManager(storage, [plugin], [middleware], { onError });

    expectLiteFsmError(
      () => manager.transition({ type: "RAW" }),
      "LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT",
      "storage-invalid-prepare-fail-fast",
    );
    expect(log).toEqual(["prepare"]);
    expect(onError).not.toHaveBeenCalled();
    expect(manager.getState()).toEqual({ item: { seen: [] } });
  });

  it("не пересчитывает route для invalid storage replacement action", () => {
    const routeResolver = vi.fn(() => "target");
    const storage = createTemplateStorage("storage-invalid-route-replacement", {
      prepareAction() {
        return { type: "replace", action: { meta: { entityId: "target" } } } as never;
      },
    });
    const routePlugin = definePlugin().create({
      name: "storage-invalid-route-meta",
      routeMeta: { entityId: routeResolver },
    });
    const manager = createManager(storage, [routePlugin]);

    expectLiteFsmError(
      () => manager.transition({ type: "RAW" }),
      "LITE_FSM_INVALID_REPLACEMENT_ACTION",
      "storage runtime 'storage-invalid-route-replacement' prepareAction",
    );
    expect(routeResolver).not.toHaveBeenCalled();
  });
});

describe("runtime validation callback protocols — storage reduce stages", () => {
  for (const [label, result] of [
    ["skip with extra field", { type: "skip", extra: true }],
    ["unknown type", { type: "unknown" }],
    ["drop", { type: "drop" }],
    ["replace", { type: "replace", action: { type: "NEXT" } }],
    ["primitive", 1],
  ] as const) {
    it(`отклоняет reduce result ${label}`, () => {
      const storage = createTemplateStorage(`reduce-${slug(label)}`, {
        reduce() {
          return result as never;
        },
      });
      const manager = createManager(storage);

      expectLiteFsmError(
        () => manager.transition({ type: "RAW" }),
        "LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT",
        `storage runtime '${storage.kind}' reduce`,
      );
      expect(manager.getState()).toEqual({ item: { seen: [] } });
    });

    it(`отклоняет reduceBucket result ${label}`, () => {
      const storage = createBucketStorage(`reduce-bucket-${slug(label)}`, () => result);
      const manager = createManager(storage);

      expectLiteFsmError(
        () => manager.transition({ type: "RAW" }),
        "LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT",
        `storage runtime '${storage.kind}' reduceBucket`,
      );
      expect(manager.getState()).toEqual({ item: { seen: [] } });
    });
  }

  for (const [label, result] of [
    ["truthy", "yes"],
    ["falsy", 0],
  ] as const) {
    it(`отклоняет acceptsEvent ${label} non-boolean`, () => {
      const storage = createTemplateStorage(`accepts-${label}`, {
        acceptsEvent() {
          return result as never;
        },
      });
      const manager = createManager(storage);

      expectLiteFsmError(
        () => manager.transition({ type: "RAW" }),
        "LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT",
        `storage runtime '${storage.kind}' acceptsEvent`,
      );
    });
  }
});

describe("runtime validation callback protocols — plugin intercept", () => {
  for (const [label, result, code] of [
    ["primitive", 1, "LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT"],
    ["array", [], "LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT"],
    ["unknown field", { unknown: true }, "LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT"],
    ["non-boolean skipDelivery", { skipDelivery: 1 }, "LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT"],
    ["non-boolean stopInterceptors", { stopInterceptors: "yes" }, "LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT"],
    ["non-object replacement", { action: "NEXT" }, "LITE_FSM_INVALID_REPLACEMENT_ACTION"],
    ["missing replacement type", { action: {} }, "LITE_FSM_INVALID_REPLACEMENT_ACTION"],
    ["non-string replacement type", { action: { type: 1 } }, "LITE_FSM_INVALID_REPLACEMENT_ACTION"],
    ["reserved replacement type", { action: { type: "@@lite-fsm/INTERNAL" } }, "LITE_FSM_INVALID_REPLACEMENT_ACTION"],
  ] as const) {
    it(`отклоняет intercept result ${label}`, () => {
      const plugin = definePlugin().create({
        name: `invalid-intercept-${slug(label)}`,
        intercept() {
          return result as never;
        },
      });
      const manager = MachineManager(
        {
          item: {
            config: { IDLE: { RAW: "IDLE" } },
            initialState: "IDLE",
            initialContext: { seen: [] },
            reducer: (state: InstanceSlice) => ({
              ...state,
              context: { seen: [...state.context.seen, "reduced"] },
            }),
          },
        } as never,
        { plugins: [plugin] } as never,
      );

      expectLiteFsmError(
        () => manager.transition({ type: "RAW" } as never),
        code,
        `plugin 'invalid-intercept-${slug(label)}' intercept`,
      );
      expect(manager.getState()).toEqual({ item: { state: "IDLE", context: { seen: [] } } });
    });
  }

  it("не вызывает onError автоматически для invalid plugin callback result", () => {
    const log: string[] = [];
    const onError = vi.fn();
    const subscriber = vi.fn();
    const effect = vi.fn();
    const invalidPlugin = definePlugin().create({
      name: "invalid-plugin-callback-on-error",
      intercept() {
        log.push("invalid");
        return { skipDelivery: 1 } as never;
      },
      hooks: {
        beforeReduce() {
          log.push("hook");
        },
      },
    });
    const nextPlugin = definePlugin().create({
      name: "invalid-plugin-callback-next",
      intercept() {
        log.push("next");
      },
    });
    const manager = MachineManager(
      {
        item: {
          config: { IDLE: { RAW: "IDLE" } },
          initialState: "IDLE",
          initialContext: { seen: [] as string[] },
          reducer: (state: InstanceSlice) => ({ ...state, context: { seen: [...state.context.seen, "reduced"] } }),
          effects: {
            IDLE: effect,
          },
        },
      } as never,
      { plugins: [invalidPlugin, nextPlugin], onError } as never,
    );
    manager.onTransition(subscriber);

    expectLiteFsmError(
      () => manager.transition({ type: "RAW" } as never),
      "LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT",
      "plugin 'invalid-plugin-callback-on-error' intercept",
    );
    expect(log).toEqual(["invalid"]);
    expect(onError).not.toHaveBeenCalled();
    expect(subscriber).not.toHaveBeenCalled();
    expect(effect).not.toHaveBeenCalled();
    expect(manager.getState()).toEqual({ item: { state: "IDLE", context: { seen: [] } } });
  });

  it("не меняет action, route, state и subscribers после invalid intercept result", () => {
    const log: string[] = [];
    const onError = vi.fn();
    const subscriber = vi.fn();
    const effect = vi.fn();
    const routeResolver = vi.fn(() => "target");
    const firstPlugin = definePlugin().create({
      name: "invalid-intercept-fail-fast-first",
      routeMeta: { entityId: routeResolver },
      intercept(ctx) {
        log.push(`first:${ctx.action.type}`);
        return { action: { meta: { entityId: "target" } } } as never;
      },
      hooks: {
        beforeReduce() {
          log.push("hook");
        },
      },
    });
    const secondPlugin = definePlugin().create({
      name: "invalid-intercept-fail-fast-second",
      intercept() {
        log.push("second");
      },
    });
    const middleware: Middleware<Record<string, { readonly state: string; readonly context: { readonly seen: string[] } }>, TestEvent> =
      () => (next) => (action) => {
        log.push(`middleware:before:${action.type}`);
        const result = next(action);
        log.push(`middleware:after:${result.type}`);
        return result;
      };
    const manager = MachineManager(
      {
        item: {
          config: { IDLE: { RAW: "IDLE" } },
          initialState: "IDLE",
          initialContext: { seen: [] },
          reducer: (state: InstanceSlice) => ({ ...state, context: { seen: [...state.context.seen, "reduced"] } }),
          effects: {
            IDLE: effect,
          },
        },
      } as never,
      { plugins: [firstPlugin, secondPlugin], middleware: [middleware], onError } as never,
    );
    manager.onTransition(subscriber);

    expectLiteFsmError(
      () => manager.transition({ type: "RAW" } as never),
      "LITE_FSM_INVALID_REPLACEMENT_ACTION",
      "plugin 'invalid-intercept-fail-fast-first' intercept",
    );
    expect(log).toEqual(["middleware:before:RAW", "first:RAW"]);
    expect(onError).not.toHaveBeenCalled();
    expect(routeResolver).not.toHaveBeenCalled();
    expect(subscriber).not.toHaveBeenCalled();
    expect(effect).not.toHaveBeenCalled();
    expect(manager.getState()).toEqual({ item: { state: "IDLE", context: { seen: [] } } });
  });

  it("{} из intercept является no-op", () => {
    const plugin = definePlugin().create({
      name: "intercept-empty-noop",
      intercept() {
        return {};
      },
    });
    const manager = MachineManager(
      {
        item: {
          config: { IDLE: { RAW: "IDLE" } },
          initialState: "IDLE",
          initialContext: { seen: [] as string[] },
          reducer: (state: InstanceSlice, action: TestAction) => ({
            ...state,
            context: { seen: [...state.context.seen, action.type] },
          }),
        },
      } as never,
      { plugins: [plugin] },
    );

    expect(manager.transition({ type: "RAW" } as never)).toEqual({ type: "RAW" });
    expect(manager.getState()).toEqual({ item: { state: "IDLE", context: { seen: ["RAW"] } } });
  });

  it("валидные intercept flags сохраняют behavior", () => {
    const second = vi.fn();
    const firstPlugin = definePlugin().create({
      name: "intercept-valid-flags-first",
      intercept() {
        return { action: { type: "STOPPED" }, skipDelivery: true, stopInterceptors: true };
      },
    });
    const secondPlugin = definePlugin().create({
      name: "intercept-valid-flags-second",
      intercept: second,
    });
    const manager = MachineManager(
      {
        item: {
          config: { IDLE: { RAW: "IDLE", STOPPED: "IDLE" } },
          initialState: "IDLE",
          initialContext: { seen: [] as string[] },
          reducer: (state: InstanceSlice, action: TestAction) => ({
            ...state,
            context: { seen: [...state.context.seen, action.type] },
          }),
        },
      } as never,
      { plugins: [firstPlugin, secondPlugin] },
    );

    expect(manager.transition({ type: "RAW" } as never)).toEqual({ type: "STOPPED" });
    expect(second).not.toHaveBeenCalled();
    expect(manager.getState()).toEqual({ item: { state: "IDLE", context: { seen: [] } } });
  });
});
