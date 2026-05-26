import { describe, expect, it, vi } from "vitest";

import { definePlugin, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, GenericMiddleware, MachineConfig, ManagerAction, Middleware, MiddlewareApi } from "@lite-fsm/core";
import type { NormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import { createMachineManagerFactory } from "@lite-fsm/core/internal/runtime/kernel/createMachineManagerFactory";
import { instanceStorageRuntime } from "@lite-fsm/core/internal/runtime/instance/storage";
import type {
  StorageActionStageResult,
  StorageReduceBucketContext,
  StorageRuntime,
} from "@lite-fsm/core/internal/runtime/kernel/storage";

import { createLikeSync, createReplacingMiddleware, createSnapshotLikeSync } from "./MachineManager.actors.fixtures";

type TestEvent =
  | FSMEvent<"RAW">
  | FSMEvent<"PREPARED">
  | FSMEvent<"PREPARED_A">
  | FSMEvent<"PREPARED_B">
  | FSMEvent<"BEFORE">
  | FSMEvent<"BEFORE_A">
  | FSMEvent<"BEFORE_B">
  | FSMEvent<"FINAL">
  | FSMEvent<"SKIP">
  | FSMEvent<"PREPARE_DROP">
  | FSMEvent<"BEFORE_DROP">;

type TestAction = ManagerAction<TestEvent>;
type TestSlice = { readonly seen: readonly string[] };

const createStoragePlugin = (runtimes: readonly StorageRuntime[]): NormalizedPlugin => ({
  name: "stage-two-storage-pipeline",
  storage: runtimes.map((runtime) => ({
    owner: "stage-two-storage-pipeline",
    kind: runtime.kind,
    value: runtime,
  })),
  routeMeta: [],
  scopedDeps: [],
  scopedTransition: [],
  manager: [],
  hooks: {},
});

const createRuntime = (
  kind: string,
  log: string[],
  overrides: Partial<StorageRuntime> & {
    readonly reduceScope?: "template";
    readonly reduceBucket?: never;
  } = {},
): StorageRuntime => ({
  kind,
  validateTemplate() {},
  compileTemplate(ctx) {
    return { key: ctx.key, kind };
  },
  createRuntimeState() {
    return undefined;
  },
  createPublicInitialState() {
    return { seen: [] } satisfies TestSlice;
  },
  acceptsEvent({ action }) {
    return ["PREPARED", "PREPARED_B", "BEFORE", "BEFORE_B", "FINAL", "RAW"].includes(action.type);
  },
  reduce({ action, dispatch, template }) {
    log.push(`reduce:${kind}:${action.type}`);
    const prev = dispatch.nextState[template.key] as TestSlice;
    dispatch.nextState = {
      ...dispatch.nextState,
      [template.key]: { seen: [...prev.seen, action.type] } satisfies TestSlice,
    };
  },
  commit({ action }) {
    log.push(`commit:${kind}:${action.type}`);
  },
  reactions: {
    run({ action }) {
      log.push(`reaction:${kind}:${action.type}`);
    },
  },
  effects: {
    resolveInvocations({ action }) {
      log.push(`resolveEffects:${kind}:${action.type}`);
      return [action];
    },
    invoke({ invocation }) {
      log.push(`effect:${kind}:${(invocation as TestAction).type}`);
    },
  },
  ...overrides,
});

const createManager = (
  runtimes: readonly StorageRuntime[],
  options: {
    readonly plugins?: readonly unknown[];
    readonly middleware?: readonly Middleware<Record<string, TestSlice>, TestEvent>[];
    readonly config?: Record<string, unknown>;
  } = {},
) => {
  const factory = createMachineManagerFactory({
    name: "stage-two-storage-pipeline-preset",
    defaultStorageKind: runtimes[0]!.kind,
    plugins: [createStoragePlugin(runtimes)],
  });

  const config =
    options.config ??
    ({
      item: {
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
      },
    } as const);

  return factory(
    config as never,
    options as never,
  ) as unknown as {
    transition(action: TestAction, options?: unknown): TestAction;
    getState(): Record<string, TestSlice>;
    onTransition(
      cb: (prev: Record<string, TestSlice>, current: Record<string, TestSlice>, action: TestAction) => void,
    ): () => void;
  };
};

const expectLiteFsmError = (run: () => unknown, code: string) => {
  expect(run).toThrow(LiteFsmError);

  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(LiteFsmError);
    expect((error as LiteFsmError).code).toBe(code);
    return;
  }

  throw new Error("Expected LiteFsmError.");
};

const createMiddleware = (
  log: string[],
): Middleware<Record<string, TestSlice>, TestEvent> =>
  (_api: MiddlewareApi<Record<string, TestSlice>, TestEvent>) =>
  (next) =>
  (action) => {
    log.push(`middleware:before:${action.type}`);
    const result = next(action as TestAction);
    log.push(`middleware:after:${result.type}`);
    return result;
  };

describe("storage runtime dispatch pipeline — этап 2 action lifecycle", () => {
  it("prepareAction replacement выполняется до middleware", () => {
    const log: string[] = [];
    const runtime = createRuntime("stage-two-main", log, {
      prepareAction({ action }) {
        log.push(`prepare:${action.type}`);
        if (action.type === "RAW") return { type: "replace", action: { type: "PREPARED" } };
      },
    });
    const manager = createManager([runtime], { middleware: [createMiddleware(log)] });

    const returned = manager.transition({ type: "RAW" });

    expect(returned).toEqual({ type: "PREPARED" });
    expect(log).toEqual([
      "prepare:RAW",
      "middleware:before:PREPARED",
      "reduce:stage-two-main:PREPARED",
      "commit:stage-two-main:PREPARED",
      "reaction:stage-two-main:PREPARED",
      "middleware:after:PREPARED",
      "resolveEffects:stage-two-main:PREPARED",
      "effect:stage-two-main:PREPARED",
    ]);
  });

  it("несколько prepareAction replacements применяются последовательно", () => {
    const log: string[] = [];
    const first = createRuntime("stage-two-first", log, {
      prepareAction({ action }) {
        log.push(`first:${action.type}`);
        return action.type === "RAW" ? { type: "replace", action: { type: "PREPARED_A" } } : undefined;
      },
    });
    const second = createRuntime("stage-two-second", log, {
      prepareAction({ action }) {
        log.push(`second:${action.type}`);
        return action.type === "PREPARED_A" ? { type: "replace", action: { type: "PREPARED_B" } } : undefined;
      },
    });
    const manager = createManager([first, second], { middleware: [createMiddleware(log)] });

    expect(manager.transition({ type: "RAW" })).toEqual({ type: "PREPARED_B" });
    expect(log.slice(0, 3)).toEqual(["first:RAW", "second:PREPARED_A", "middleware:before:PREPARED_B"]);
  });

  it("beforeReduce replacement выполняется после middleware и до interceptors", () => {
    const log: string[] = [];
    const runtime = createRuntime("stage-two-main", log, {
      beforeReduce({ action }) {
        log.push(`beforeReduce:${action.type}`);
        if (action.type === "RAW") return { type: "replace", action: { type: "BEFORE" } };
      },
    });
    const plugin = definePlugin().create({
      name: "stage-two-interceptor",
      intercept(ctx) {
        log.push(`intercept:${ctx.action.type}`);
      },
    });
    const manager = createManager([runtime], { plugins: [plugin], middleware: [createMiddleware(log)] });

    expect(manager.transition({ type: "RAW" })).toEqual({ type: "BEFORE" });
    expect(log.slice(0, 4)).toEqual([
      "middleware:before:RAW",
      "beforeReduce:RAW",
      "intercept:BEFORE",
      "reduce:stage-two-main:BEFORE",
    ]);
  });

  it("несколько beforeReduce replacements применяются последовательно", () => {
    const log: string[] = [];
    const first = createRuntime("stage-two-first", log, {
      beforeReduce({ action }) {
        log.push(`first:${action.type}`);
        return action.type === "RAW" ? { type: "replace", action: { type: "BEFORE_A" } } : undefined;
      },
    });
    const second = createRuntime("stage-two-second", log, {
      beforeReduce({ action }) {
        log.push(`second:${action.type}`);
        return action.type === "BEFORE_A" ? { type: "replace", action: { type: "BEFORE_B" } } : undefined;
      },
    });
    const interceptor = vi.fn((ctx: { readonly action: { readonly type: string } }) => {
      log.push(`intercept:${ctx.action.type}`);
    });
    const plugin = definePlugin().create({ name: "stage-two-before-chain", intercept: interceptor });
    const manager = createManager([first, second], { plugins: [plugin] });

    expect(manager.transition({ type: "RAW" })).toEqual({ type: "BEFORE_B" });
    expect(log.slice(0, 3)).toEqual(["first:RAW", "second:BEFORE_A", "intercept:BEFORE_B"]);
  });

  it("drop в prepareAction является silent no-op и возвращает raw action", () => {
    const log: string[] = [];
    const runtime = createRuntime("stage-two-main", log, {
      prepareAction({ action }) {
        log.push(`prepare:${action.type}`);
        if (action.type === "PREPARE_DROP") return { type: "drop" };
      },
    });
    const manager = createManager([runtime], { middleware: [createMiddleware(log)] });

    expect(manager.transition({ type: "PREPARE_DROP" })).toEqual({ type: "PREPARE_DROP" });
    expect(manager.getState()).toEqual({ item: { seen: [] } });
    expect(log).toEqual(["prepare:PREPARE_DROP"]);
  });

  it("drop в beforeReduce является silent no-op и возвращает raw action", () => {
    const log: string[] = [];
    const runtime = createRuntime("stage-two-main", log, {
      beforeReduce({ action }) {
        log.push(`beforeReduce:${action.type}`);
        if (action.type === "BEFORE_DROP") return { type: "drop" };
      },
    });
    const manager = createManager([runtime], { middleware: [createMiddleware(log)] });

    expect(manager.transition({ type: "BEFORE_DROP" })).toEqual({ type: "BEFORE_DROP" });
    expect(manager.getState()).toEqual({ item: { seen: [] } });
    expect(log).toEqual([
      "middleware:before:BEFORE_DROP",
      "beforeReduce:BEFORE_DROP",
      "middleware:after:BEFORE_DROP",
    ]);
  });

  it("drop не вызывает interceptors, hooks, reduce, commit, reactions, subscribers и effects", () => {
    const log: string[] = [];
    const runtime = createRuntime("stage-two-main", log, {
      beforeReduce() {
        log.push("beforeReduce:drop");
        return { type: "drop" };
      },
    });
    const plugin = definePlugin().create({
      name: "stage-two-drop-guarantees",
      intercept() {
        log.push("intercept");
      },
      hooks: {
        beforeReduce() {
          log.push("hook:beforeReduce");
        },
        beforeEffects() {
          log.push("hook:beforeEffects");
        },
      },
    });
    const manager = createManager([runtime], { plugins: [plugin], middleware: [createMiddleware(log)] });
    manager.onTransition(() => log.push("subscriber"));

    expect(manager.transition({ type: "BEFORE_DROP" })).toEqual({ type: "BEFORE_DROP" });
    expect(log).toEqual([
      "middleware:before:BEFORE_DROP",
      "beforeReduce:drop",
      "middleware:after:BEFORE_DROP",
    ]);
  });

  it("intercept replacement остается final committed action для reducer, subscribers, effects, middleware и return value", () => {
    const log: string[] = [];
    const runtime = createRuntime("stage-two-main", log);
    const plugin = definePlugin().create({
      name: "stage-two-final-intercept",
      intercept() {
        return { action: { type: "FINAL" } };
      },
    });
    const manager = createManager([runtime], { plugins: [plugin], middleware: [createMiddleware(log)] });
    manager.onTransition((_prev, _current, action) => log.push(`subscriber:${action.type}`));

    expect(manager.transition({ type: "RAW" })).toEqual({ type: "FINAL" });
    expect(log).toEqual([
      "middleware:before:RAW",
      "reduce:stage-two-main:FINAL",
      "commit:stage-two-main:FINAL",
      "reaction:stage-two-main:FINAL",
      "subscriber:FINAL",
      "middleware:after:FINAL",
      "resolveEffects:stage-two-main:FINAL",
      "effect:stage-two-main:FINAL",
    ]);
  });

  it("skipDelivery после interceptor не запускает storage reduce и effects", () => {
    const log: string[] = [];
    const runtime = createRuntime("stage-two-main", log);
    const plugin = definePlugin().create({
      name: "stage-two-skip",
      intercept() {
        return { action: { type: "FINAL" }, skipDelivery: true };
      },
    });
    const manager = createManager([runtime], { plugins: [plugin] });

    expect(manager.transition({ type: "RAW" })).toEqual({ type: "FINAL" });
    expect(manager.getState()).toEqual({ item: { seen: [] } });
    expect(log).toEqual([]);
  });

  it("skipDelivery после interceptor сохраняет subscribers и middleware after-next result для final action", () => {
    const log: string[] = [];
    const runtime = createRuntime("stage-two-main", log);
    const plugin = definePlugin().create({
      name: "stage-two-skip-subscribers",
      intercept() {
        return { action: { type: "FINAL" }, skipDelivery: true };
      },
    });
    const manager = createManager([runtime], { plugins: [plugin], middleware: [createMiddleware(log)] });
    manager.onTransition((_prev, _current, action) => log.push(`subscriber:${action.type}`));

    expect(manager.transition({ type: "RAW" })).toEqual({ type: "FINAL" });
    expect(log).toEqual(["middleware:before:RAW", "subscriber:FINAL", "middleware:after:FINAL"]);
  });

  it("prepareAction и beforeReduce не используют dispatch.nextState как staged behavior", () => {
    const log: string[] = [];
    const runtime = createRuntime("stage-two-main", log, {
      prepareAction({ dispatch }) {
        dispatch.runtime.set("stage-two", "from-runtime-map");
        dispatch.nextState = { item: { seen: ["prepare-mutation"] } };
      },
      beforeReduce({ dispatch }) {
        log.push(String(dispatch.runtime.get("stage-two")));
        dispatch.nextState = { item: { seen: ["before-mutation"] } };
      },
      reduce({ action, dispatch, template }) {
        const prev = dispatch.nextState[template.key] as TestSlice;
        log.push(`reduce-prev:${prev.seen.join(",") || "empty"}`);
        dispatch.nextState = {
          ...dispatch.nextState,
          [template.key]: { seen: [...prev.seen, action.type] } satisfies TestSlice,
        };
      },
    });
    const manager = createManager([runtime]);

    expect(manager.transition({ type: "RAW" })).toEqual({ type: "RAW" });
    expect(manager.getState()).toEqual({ item: { seen: ["RAW"] } });
    expect(log).toEqual([
      "from-runtime-map",
      "reduce-prev:empty",
      "commit:stage-two-main:RAW",
      "reaction:stage-two-main:RAW",
      "resolveEffects:stage-two-main:RAW",
      "effect:stage-two-main:RAW",
    ]);
  });

  it("options доступны через storage и plugin dispatch context views", () => {
    const log: string[] = [];
    const plugin = definePlugin().create({
      name: "stage-two-options",
      intercept(ctx) {
        log.push(`intercept:${(ctx.options as { readonly source: string }).source}`);
      },
    });
    const runtime = createRuntime("stage-two-main", log, {
      prepareAction({ dispatch, options }) {
        log.push(`prepare-arg:${(options as { readonly source: string }).source}`);
        log.push(`prepare-dispatch:${(dispatch.options as { readonly source: string }).source}`);
      },
    });
    const manager = createManager([runtime], { plugins: [plugin] });

    manager.transition({ type: "RAW" }, { source: "transition" });

    expect(log).toEqual([
      "prepare-arg:transition",
      "prepare-dispatch:transition",
      "intercept:transition",
      "reduce:stage-two-main:RAW",
      "commit:stage-two-main:RAW",
      "reaction:stage-two-main:RAW",
      "resolveEffects:stage-two-main:RAW",
      "effect:stage-two-main:RAW",
    ]);
  });

  it("regression-аудит: public StorageDispatchContext не раскрывает private action lifecycle fields", () => {
    const seen: Record<string, boolean> = {};
    const inspect = (dispatch: Record<string, unknown>): StorageActionStageResult => {
      for (const key of ["action", "originalAction", "preparedAction", "committedAction", "dropped", "touched"]) {
        seen[key] = key in dispatch;
      }
    };
    const runtime = createRuntime("stage-two-main", [], {
      prepareAction({ dispatch }) {
        return inspect(dispatch as unknown as Record<string, unknown>);
      },
      beforeReduce({ dispatch }) {
        return inspect(dispatch as unknown as Record<string, unknown>);
      },
    });
    const manager = createManager([runtime]);

    manager.transition({ type: "RAW" });

    expect(seen).toEqual({
      action: false,
      originalAction: false,
      preparedAction: false,
      committedAction: false,
      dropped: false,
      touched: false,
    });
  });
});

describe("storage runtime dispatch pipeline — этап 3 reduceScope", () => {
  const multiTemplateConfig = {
    first: {
      config: { IDLE: {} },
      initialState: "IDLE",
      initialContext: {},
    },
    second: {
      config: { IDLE: {} },
      initialState: "IDLE",
      initialContext: {},
    },
    skipped: {
      config: { IDLE: {} },
      initialState: "IDLE",
      initialContext: {},
    },
  } as const;

  it("template-scope storage вызывает acceptsEvent и reduce для каждого matching template", () => {
    const log: string[] = [];
    const runtime = createRuntime("stage-three-template", log, {
      compileTemplate(ctx) {
        return { key: ctx.key, kind: "stage-three-template", data: { key: ctx.key } };
      },
      acceptsEvent({ action, template }) {
        log.push(`accept:${template.key}:${action.type}`);
        return action.type === "RAW" && template.key !== "skipped";
      },
      reduce({ template, dispatch }) {
        log.push(`reduce:${template.key}`);
        const prev = dispatch.nextState[template.key] as TestSlice;
        dispatch.nextState = {
          ...dispatch.nextState,
          [template.key]: { seen: [...prev.seen, template.key] } satisfies TestSlice,
        };
      },
      commit() {
        log.push("commit");
      },
      reactions: undefined,
      effects: undefined,
    });
    const manager = createManager([runtime], { config: multiTemplateConfig });

    manager.transition({ type: "RAW" });

    expect(manager.getState()).toEqual({
      first: { seen: ["first"] },
      second: { seen: ["second"] },
      skipped: { seen: [] },
    });
    expect(log).toEqual([
      "accept:first:RAW",
      "reduce:first",
      "accept:second:RAW",
      "reduce:second",
      "accept:skipped:RAW",
      "commit",
    ]);
  });

  it("bucket-scope storage вызывает reduceBucket один раз и передает все templates bucket", () => {
    const log: string[] = [];
    const runtime: StorageRuntime = {
      kind: "stage-three-bucket",
      reduceScope: "bucket",
      validateTemplate() {},
      compileTemplate(ctx) {
        return { key: ctx.key, kind: "stage-three-bucket", data: { key: ctx.key } };
      },
      createRuntimeState() {
        return undefined;
      },
      createPublicInitialState() {
        return { seen: [] } satisfies TestSlice;
      },
      reduceBucket({ templates, dispatch }) {
        log.push(`bucket:${templates.map((template) => template.key).join(",")}`);
        dispatch.nextState = Object.fromEntries(
          templates.map((template) => [template.key, { seen: [template.key] } satisfies TestSlice]),
        );
      },
      commit() {
        log.push("commit");
      },
    };
    const manager = createManager([runtime], { config: multiTemplateConfig });

    manager.transition({ type: "RAW" });

    expect(manager.getState()).toEqual({
      first: { seen: ["first"] },
      second: { seen: ["second"] },
      skipped: { seen: ["skipped"] },
    });
    expect(log).toEqual(["bucket:first,second,skipped", "commit"]);
  });

  it("bucket-scope storage не вызывает acceptsEvent", () => {
    const acceptsEvent = vi.fn(() => true);
    const runtime = {
      kind: "stage-three-bucket-with-extra-callback",
      reduceScope: "bucket",
      validateTemplate() {},
      compileTemplate(ctx: { readonly key: string }) {
        return { key: ctx.key, kind: "stage-three-bucket-with-extra-callback" };
      },
      createRuntimeState() {
        return undefined;
      },
      createPublicInitialState() {
        return { seen: [] };
      },
      acceptsEvent,
      reduceBucket() {},
      commit() {},
    } as unknown as StorageRuntime;
    const manager = createManager([runtime]);

    manager.transition({ type: "RAW" });

    expect(acceptsEvent).not.toHaveBeenCalled();
  });

  it("{ type: 'skip' } из template reduce не запускает commit, reactions и effects", () => {
    const log: string[] = [];
    const runtime = createRuntime("stage-three-template-skip", log, {
      acceptsEvent() {
        return true;
      },
      reduce() {
        log.push("reduce");
        return { type: "skip" };
      },
    });
    const manager = createManager([runtime]);

    manager.transition({ type: "RAW" });

    expect(log).toEqual(["reduce"]);
  });

  it("{ type: 'skip' } из reduceBucket не запускает commit, reactions и effects", () => {
    const log: string[] = [];
    const runtime = {
      ...createRuntime("stage-three-bucket-skip", log),
      reduceScope: "bucket",
      acceptsEvent: undefined,
      reduce: undefined,
      reduceBucket() {
        log.push("reduceBucket");
        return { type: "skip" };
      },
    } as unknown as StorageRuntime;
    const manager = createManager([runtime]);

    manager.transition({ type: "RAW" });

    expect(log).toEqual(["reduceBucket"]);
  });

  it("drop и replace из template reduce отклоняются runtime validation", () => {
    for (const result of [{ type: "drop" }, { type: "replace", action: { type: "FINAL" } }]) {
      const runtime = createRuntime("stage-three-template-invalid-result", [], {
        acceptsEvent() {
          return true;
        },
        reduce() {
          return result as never;
        },
      });
      const manager = createManager([runtime]);

      expectLiteFsmError(() => manager.transition({ type: "RAW" }), "LITE_FSM_INVALID_STORAGE_RUNTIME");
    }
  });

  it("drop и replace из reduceBucket отклоняются runtime validation", () => {
    for (const result of [{ type: "drop" }, { type: "replace", action: { type: "FINAL" } }]) {
      const runtime = {
        ...createRuntime("stage-three-bucket-invalid-result", []),
        reduceScope: "bucket",
        acceptsEvent: undefined,
        reduce: undefined,
        reduceBucket() {
          return result as never;
        },
      } as unknown as StorageRuntime;
      const manager = createManager([runtime]);

      expectLiteFsmError(() => manager.transition({ type: "RAW" }), "LITE_FSM_INVALID_STORAGE_RUNTIME");
    }
  });

  it("condition обслуживается default storage bucket", async () => {
    let conditionResult: Promise<boolean> | undefined;
    const runtime = createRuntime("stage-three-condition", [], {
      effects: {
        condition({ predicate }) {
          return Promise.resolve(predicate({ type: "RAW" }));
        },
        resolveInvocations() {
          return [];
        },
        invoke() {},
      },
    });
    const middleware: Middleware<Record<string, TestSlice>, TestEvent> = (api) => (next) => (action) => {
      conditionResult = api.condition((candidate) => candidate.type === "RAW");
      return next(action);
    };
    const manager = createManager([runtime], { middleware: [middleware] });

    manager.transition({ type: "RAW" });

    await expect(conditionResult).resolves.toBe(true);
  });

  it("condition возвращает false без effects.condition у default storage", async () => {
    let conditionResult: Promise<boolean> | undefined;
    const runtime = createRuntime("stage-three-no-condition", [], { effects: undefined });
    const middleware: Middleware<Record<string, TestSlice>, TestEvent> = (api) => (next) => (action) => {
      conditionResult = api.condition((candidate) => candidate.type === "RAW");
      return next(action);
    };
    const manager = createManager([runtime], { middleware: [middleware] });

    manager.transition({ type: "RAW" });

    await expect(conditionResult).resolves.toBe(false);
  });
});

describe("storage runtime dispatch pipeline — этап 4 instance runtime", () => {
  it("instance reduceBucket вызывается один раз на dispatch при нескольких templates", () => {
    let reduceBucketCalls = 0;
    const instanceRuntime = instanceStorageRuntime as Extract<StorageRuntime, { readonly reduceScope: "bucket" }>;
    const runtime: StorageRuntime = {
      ...instanceRuntime,
      reduceBucket(ctx: StorageReduceBucketContext) {
        reduceBucketCalls += 1;
        return instanceRuntime.reduceBucket(ctx);
      },
    };
    const factory = createMachineManagerFactory({
      name: "stage-four-instance-bucket",
      defaultStorageKind: "instance",
      plugins: [
        {
          name: "stage-four-instance-storage",
          storage: [{ owner: "stage-four-instance-storage", kind: "instance", value: runtime }],
          routeMeta: [],
          scopedDeps: [],
          scopedTransition: [],
          manager: [],
          hooks: {},
        },
      ],
    });

    const manager = factory({
      first: {
        config: { IDLE: { HIT: null } },
        initialState: "IDLE",
        initialContext: { hits: 0 },
        reducer: (state, _action) => ({ state: state.state, context: { hits: state.context.hits + 1 } }),
      } satisfies MachineConfig<{ IDLE: { HIT: null } }, { hits: number }, { type: "HIT" }>,
      second: {
        config: { IDLE: { HIT: null } },
        initialState: "IDLE",
        initialContext: { hits: 0 },
        reducer: (state, _action) => ({ state: state.state, context: { hits: state.context.hits + 1 } }),
      } satisfies MachineConfig<{ IDLE: { HIT: null } }, { hits: number }, { type: "HIT" }>,
    });

    manager.transition({ type: "HIT" });

    expect(reduceBucketCalls).toBe(1);
    expect(manager.getState()).toEqual({
      first: { state: "IDLE", context: { hits: 1 } },
      second: { state: "IDLE", context: { hits: 1 } },
    });
  });

  it("sender disposed action silently drops without subscribers or effects", () => {
    let savedTransition: ((action: { type: "BUMP" }) => unknown) | undefined;
    const subscribers: unknown[] = [];
    const effects: string[] = [];
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ transition }) => {
          savedTransition = transition;
        },
      },
    };
    const manager = MachineManager({
      domain: {
        config: { IDLE: { BUMP: null } },
        initialState: "IDLE",
        initialContext: { bumps: 0 },
        reducer: (state) => ({ state: state.state, context: { bumps: state.context.bumps + 1 } }),
        effects: {
          "*": ({ action }) => {
            effects.push(action.type);
          },
        },
      } satisfies MachineConfig<{ IDLE: { BUMP: null } }, { bumps: number }, { type: "BUMP" }>,
      likeSync: actorMachine,
    });
    manager.onTransition((_prev, _current, action) => subscribers.push(action));

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
    subscribers.length = 0;
    effects.length = 0;
    const returned = savedTransition?.({ type: "BUMP" });

    expect(returned).toEqual({ type: "BUMP" });
    expect(manager.getState().domain.context.bumps).toBe(0);
    expect(subscribers).toEqual([]);
    expect(effects).toEqual([]);
  });

  it("instance validation сохраняет прежние ошибки для domain persistence и invalid originId", () => {
    expect(() =>
      MachineManager({
        domain: {
          config: { IDLE: {} },
          initialState: "IDLE",
          initialContext: {},
          persistence: "snapshot",
        } as never,
      }),
    ).toThrow(LiteFsmError);

    expect(() => MachineManager({ likeSync: createLikeSync() }, { originId: "" })).toThrow(LiteFsmError);
  });

  it("valid originId и snapshot actor template проходят instance init", () => {
    const manager = MachineManager({ likeSync: createSnapshotLikeSync() }, { originId: "peer" });

    manager.transition({ type: "LIKE", payload: { id: "a" } });

    expect(manager.getState().likeSync["peer#likeSync/0"].context.id).toBe("a");
  });

  it("actor route without matching transition remains silent no-op", () => {
    const manager = MachineManager({ likeSync: createLikeSync() });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    const before = manager.getState();
    manager.transition({ type: "PING", meta: { actorId: "likeSync/0" } });

    expect(manager.getState()).toBe(before);
  });

  it("groupTag route без spawn templates не создает actors", () => {
    const beta = {
      config: { __INIT: { OTHER: "READY" }, READY: {} },
      groupTag: "beta",
      initialState: "__INIT",
      initialContext: { seen: 0 },
    } satisfies MachineConfig<
      { __INIT: { OTHER: "READY" }; READY: {} },
      { seen: number },
      { type: "LIKE"; payload: { id: string } } | { type: "OTHER" }
    >;
    const manager = MachineManager({ likeSync: createLikeSync(), beta });

    manager.transition({ type: "OTHER" });
    manager.transition({ type: "LIKE", payload: { id: "ghost" }, meta: { groupTag: "beta" } });

    expect(manager.getState().likeSync).toEqual({});
    expect(Object.keys(manager.getState().beta)).toEqual(["beta/0"]);
  });

  it("plugin route доставляет action domain reducer без actor routing", () => {
    const plugin = definePlugin().create({
      name: "stage-four-plugin-route",
      routeMeta: { cacheKey: () => "cache/a" },
    });
    const manager = MachineManager(
      {
        domain: {
          config: { IDLE: { HIT: null } },
          initialState: "IDLE",
          initialContext: { hits: 0 },
          reducer: (state) => ({ state: state.state, context: { hits: state.context.hits + 1 } }),
        } satisfies MachineConfig<{ IDLE: { HIT: null } }, { hits: number }, { type: "HIT" }>,
        likeSync: createLikeSync(),
      },
      { plugins: [plugin] },
    );

    manager.transition({ type: "HIT", meta: { cacheKey: "cache/a" } } as never);

    expect(manager.getState().domain.context.hits).toBe(1);
    expect(manager.getState().likeSync).toEqual({});
  });

  it("middleware condition uses instance effects condition", async () => {
    let conditionResult: Promise<boolean> | undefined;
    const middleware: GenericMiddleware = (api) => (next) => (action) => {
      conditionResult = api.condition((candidate) => candidate.type === "BUMP");
      return next(action);
    };
    const manager = MachineManager(
      {
        domain: {
          config: { IDLE: { BUMP: null } },
          initialState: "IDLE",
          initialContext: {},
        } satisfies MachineConfig<{ IDLE: { BUMP: null } }, {}, { type: "BUMP" }>,
      },
      { middleware: [middleware] },
    );

    manager.transition({ type: "BUMP" });

    await expect(conditionResult).resolves.toBe(true);
  });

  it("middleware replacement проходит post-normalize до interceptors", () => {
    const seen: unknown[] = [];
    const rewriteMeta: GenericMiddleware = () => (next) => (action) =>
      next({ ...action, meta: { senderActorId: "fake", senderGroupId: "fake", senderGroupTag: "fake" } });
    const plugin = definePlugin().create({
      name: "stage-four-post-normalize",
      intercept(ctx) {
        seen.push(ctx.action);
      },
    });
    const manager = MachineManager(
      {
        domain: {
          config: { IDLE: { BUMP: null } },
          initialState: "IDLE",
          initialContext: {},
        } satisfies MachineConfig<{ IDLE: { BUMP: null } }, {}, { type: "BUMP" }>,
      },
      { middleware: [rewriteMeta], plugins: [plugin] },
    );

    manager.transition({ type: "BUMP" });

    expect(seen).toEqual([{ type: "BUMP" }]);
  });

  it("interceptor replacement после beforeReduce доходит до reducers, subscribers и effects", () => {
    const actorEffects: string[] = [];
    const domainEffects: string[] = [];
    const subscribers: unknown[] = [];
    const plugin = definePlugin().create({
      name: "stage-four-intercept-replacement",
      intercept(ctx) {
        if (ctx.action.type === "LIKE") {
          return { action: { type: "LIKE", payload: { id: "final" } } };
        }
      },
    });
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ action }) => {
          if (action.type === "LIKE") actorEffects.push(action.payload.id);
        },
      },
    };
    const manager = MachineManager(
      {
        domain: {
          config: { IDLE: { LIKE: null } },
          initialState: "IDLE",
          initialContext: { id: "" },
          reducer: (state, action) =>
            action.type === "LIKE"
              ? { state: state.state, context: { id: action.payload.id } }
              : state,
          effects: {
            "*": ({ action }) => {
              if (action.type === "LIKE") domainEffects.push(action.payload.id);
            },
          },
        } satisfies MachineConfig<{ IDLE: { LIKE: null } }, { id: string }, LikeAction>,
        likeSync: actorMachine,
      },
      { plugins: [plugin] },
    );
    manager.onTransition((_prev, _current, action) => subscribers.push(action));

    const returned = manager.transition({ type: "LIKE", payload: { id: "raw" } });

    expect(returned).toEqual({ type: "LIKE", payload: { id: "final" } });
    expect(manager.getState().domain.context.id).toBe("final");
    expect(manager.getState().likeSync["likeSync/0"].context.id).toBe("final");
    expect(subscribers).toEqual([{ type: "LIKE", payload: { id: "final" } }]);
    expect(domainEffects).toEqual(["final"]);
    expect(actorEffects).toEqual(["final"]);
  });

  it("interceptor replacement обновляет private committed action перед reduceRoot и effect target resolution", () => {
    const actorEffects: string[] = [];
    const plugin = definePlugin().create({
      name: "stage-four-intercept-target",
      intercept(ctx) {
        if (ctx.action.type === "BUMP") return { action: { type: "BUMP", meta: { actorId: "likeSync/1" } } };
      },
    });
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        "*": ({ action, self }) => {
          actorEffects.push(`${self.actorId}:${action.type}`);
        },
      },
    };
    const manager = MachineManager({ likeSync: actorMachine }, { plugins: [plugin] });

    manager.transition({ type: "LIKE", payload: { id: "first" } });
    manager.transition({ type: "LIKE", payload: { id: "second" } });
    actorEffects.length = 0;
    manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });

    expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(1);
    expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2);
    expect(actorEffects).toEqual(["likeSync/1:BUMP"]);
  });

  it("nested transitions не перетирают touched runtimes и effect prev state", () => {
    const effects: string[] = [];
    const manager = MachineManager({
      domain: {
        config: { IDLE: { LIKE: "PENDING" }, PENDING: { RESET: "IDLE" } },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          IDLE: ({ action }) => {
            effects.push(action.type);
          },
        },
      } satisfies MachineConfig<
        { IDLE: { LIKE: "PENDING" }; PENDING: { RESET: "IDLE" } },
        {},
        { type: "LIKE" } | { type: "RESET" }
      >,
    });
    manager.onTransition((_prev, _current, action) => {
      if (action.type === "LIKE") manager.transition({ type: "RESET" });
    });

    manager.transition({ type: "LIKE" });

    expect(manager.getState().domain.state).toBe("IDLE");
    expect(effects).toEqual(["RESET"]);
  });

  it("state replacement actor records reconciled после commit как раньше", () => {
    const patchExisting = createReplacingMiddleware("PING", (next) => ({
      ...next,
      likeSync: {
        "likeSync/0": {
          state: "PENDING",
          context: { id: "patched", count: 10 },
          meta: { actorId: "likeSync/0", groupId: "fake", groupTag: "fake" },
        },
      },
    }));
    const manager = MachineManager({ likeSync: createLikeSync() }, { middleware: [patchExisting] });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    const meta = manager.getState().likeSync["likeSync/0"].meta;
    patchExisting.replace();

    expect(manager.getState().likeSync["likeSync/0"].context).toEqual({ id: "patched", count: 10 });
    expect(manager.getState().likeSync["likeSync/0"].meta).toBe(meta);
    expect(manager.getState().likeSync["likeSync/0"].meta).toEqual({
      actorId: "likeSync/0",
      groupId: "likeSync/0",
      groupTag: "likeSync",
    });
  });
});

type LikeAction = FSMEvent<"LIKE", { id: string }>;
