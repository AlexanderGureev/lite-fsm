import { afterEach, describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import {
  attachTransitionTraceSession,
  createTransitionTraceSession,
  readTransitionTraceSession,
  TRANSITION_TRACE_COLLECTOR_SYMBOL,
  TRANSITION_TRACE_RUNTIME_KEY,
  type TransitionTraceCollector,
} from "@lite-fsm/core/internal/runtime/kernel/transitionTrace";
import type { StorageDispatchContext } from "@lite-fsm/core/internal/runtime/kernel/storage";

const traceGlobal = globalThis as Record<symbol, unknown>;

const installCollector = (): TransitionTraceCollector => {
  const collector: TransitionTraceCollector = { records: [] };
  traceGlobal[TRANSITION_TRACE_COLLECTOR_SYMBOL] = collector;
  return collector;
};

const createDispatchContext = (): StorageDispatchContext => ({
  options: undefined,
  runtime: new Map(),
  route: { scope: "unscoped", key: undefined, targetSet: [] },
  prevState: {},
  nextState: {},
  skipDelivery: false,
  reportError() {},
});

afterEach(() => {
  delete traceGlobal[TRANSITION_TRACE_COLLECTOR_SYMBOL];
  vi.restoreAllMocks();
});

describe("internal transition trace carrier", () => {
  it("не создает session без collector", () => {
    const now = vi.spyOn(performance, "now");

    expect(createTransitionTraceSession("TICK")).toBeUndefined();
    expect(now).not.toHaveBeenCalled();
  });

  it("не создает session для некорректного collector", () => {
    const now = vi.spyOn(performance, "now");

    traceGlobal[TRANSITION_TRACE_COLLECTOR_SYMBOL] = true;
    expect(createTransitionTraceSession("TICK")).toBeUndefined();

    traceGlobal[TRANSITION_TRACE_COLLECTOR_SYMBOL] = { records: {} };
    expect(createTransitionTraceSession("TICK")).toBeUndefined();
    expect(now).not.toHaveBeenCalled();
  });

  it("записывает phase, counter и завершенный record при включенном collector", () => {
    const collector = installCollector();
    vi.spyOn(performance, "now").mockReturnValueOnce(10).mockReturnValueOnce(14);
    const session = createTransitionTraceSession("TICK");

    if (!session) throw new Error("Expected transition trace session");
    const dispatch = createDispatchContext();
    attachTransitionTraceSession(dispatch, session);
    const startedAt = session.now();
    session.record("core.test.phase", startedAt, { runtimeKind: "instance" });
    session.count("core.test.counter", 3);
    session.finish("ok");

    expect(dispatch.runtime.get(TRANSITION_TRACE_RUNTIME_KEY)).toBe(session);
    expect(collector.records).toEqual([
      {
        actionType: "TICK",
        depth: 0,
        status: "ok",
        phases: [{ key: "core.test.phase", durationMs: 4, runtimeKind: "instance" }],
        counters: [{ key: "core.test.counter", value: 3 }],
      },
    ]);
  });

  it("сохраняет nested depth и default counter value", () => {
    const collector = installCollector();
    const parent = createTransitionTraceSession("PARENT");
    const child = createTransitionTraceSession("CHILD");
    if (!parent || !child) throw new Error("Expected nested transition trace sessions");

    child.count("core.test.counter");
    child.finish("ok");
    parent.finish("ok");

    expect(collector.records.map((record) => [record.actionType, record.depth, record.counters])).toEqual([
      ["CHILD", 1, [{ key: "core.test.counter", value: 1 }]],
      ["PARENT", 0, []],
    ]);
  });

  it("игнорирует записи и повторное завершение после finish", () => {
    const collector = installCollector();
    const now = vi.spyOn(performance, "now");
    const session = createTransitionTraceSession("TICK");
    if (!session) throw new Error("Expected transition trace session");
    const dispatch = createDispatchContext();

    attachTransitionTraceSession(dispatch, undefined);
    session.finish("ok");
    session.record("core.test.phase", 10);
    session.count("core.test.counter");
    session.finish("error");

    expect(dispatch.runtime.has(TRANSITION_TRACE_RUNTIME_KEY)).toBe(false);
    expect(now).not.toHaveBeenCalled();
    expect(collector.records).toEqual([
      {
        actionType: "TICK",
        depth: 0,
        status: "ok",
        phases: [],
        counters: [],
      },
    ]);
  });

  it("читает только корректную session из dispatch runtime", () => {
    const dispatch = createDispatchContext();

    expect(readTransitionTraceSession(dispatch)).toBeUndefined();
    dispatch.runtime.set(TRANSITION_TRACE_RUNTIME_KEY, true);
    expect(readTransitionTraceSession(dispatch)).toBeUndefined();
    dispatch.runtime.set(TRANSITION_TRACE_RUNTIME_KEY, {
      depth: "0",
      now: vi.fn(),
      record: vi.fn(),
      count: vi.fn(),
      finish: vi.fn(),
    });
    expect(readTransitionTraceSession(dispatch)).toBeUndefined();

    const collector = installCollector();
    const session = createTransitionTraceSession("TICK");
    if (!session) throw new Error("Expected transition trace session");
    attachTransitionTraceSession(dispatch, session);

    expect(readTransitionTraceSession(dispatch)).toBe(session);
    session.finish("ok");
    expect(collector.records).toHaveLength(1);
  });

  it("завершает record при thrown callback и сохраняет исходную ошибку", () => {
    const collector = installCollector();
    vi.spyOn(performance, "now").mockReturnValueOnce(20).mockReturnValueOnce(25);
    const session = createTransitionTraceSession("TICK");
    if (!session) throw new Error("Expected transition trace session");
    const expected = new Error("failed transition");
    let caught: unknown;

    try {
      const startedAt = session.now();
      session.record("core.test.phase", startedAt);
      throw expected;
    } catch (error) {
      session.finish("error");
      caught = error;
    }

    expect(caught).toBe(expected);
    expect(collector.records).toEqual([
      {
        actionType: "TICK",
        depth: 0,
        status: "error",
        phases: [{ key: "core.test.phase", durationMs: 5 }],
        counters: [],
      },
    ]);
  });
});

describe("core transition trace runtime", () => {
  it("обычный transition без collector возвращает action и обновляет state без таймера trace", () => {
    const now = vi.spyOn(performance, "now");
    const manager = MachineManager({
      counter: {
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: { count: 0 },
      },
    });
    const action = { type: "GO" } as const;

    expect(manager.transition(action)).toEqual(action);
    expect(manager.getState().counter).toEqual({ state: "ACTIVE", context: { count: 0 } });
    expect(now).not.toHaveBeenCalled();
  });

  it("включенный collector видит total phase и bucket reduce phase", () => {
    const collector = installCollector();
    const manager = MachineManager({
      counter: {
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: { count: 0 },
      },
    });

    manager.transition({ type: "GO" });

    expect(collector.records).toHaveLength(1);
    const record = collector.records[0]!;
    expect(record).toMatchObject({ actionType: "GO", depth: 0, status: "ok" });
    const phaseKeys = record.phases.map((phase) => phase.key);
    expect(phaseKeys).toEqual(
      expect.arrayContaining([
        "core.transition.total",
        "core.assertUserAction",
        "core.createDispatch",
        "core.prepareAction.total",
        "core.beforeReduce.total",
        "core.interceptors",
        "core.hooks.beforeReduce",
        "core.rootReducer",
        "core.markExternallyChangedBuckets",
        "core.hooks.afterReduce",
        "core.hooks.beforeCommit",
        "core.commit.total",
        "core.hooks.beforeSubscribers",
        "core.reactions.total",
        "core.subscribers",
        "core.hooks.beforeEffects",
        "core.effects.total",
        "core.hooks.afterEffects",
        "core.bucket.prepareAction.instance",
        "core.bucket.beforeReduce.instance",
        "core.bucket.reduce.instance",
        "core.bucket.commit.instance",
        "core.bucket.effects.resolve.instance",
        "core.bucket.effects.invoke.instance",
      ]),
    );
    expect(record.phases.find((phase) => phase.key === "core.transition.total")).not.toHaveProperty("runtimeKind");
    expect(record.phases.find((phase) => phase.key === "core.bucket.reduce.instance")).toMatchObject({
      runtimeKind: "instance",
    });
  });

  it("thrown reducer сохраняет исходную ошибку и завершает trace со статусом error", () => {
    const collector = installCollector();
    const expected = new Error("broken reducer");
    const manager = MachineManager({
      broken: {
        config: { IDLE: { BOOM: "IDLE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        reducer() {
          throw expected;
        },
      },
    });

    expect(() => manager.transition({ type: "BOOM" })).toThrow(expected);
    expect(collector.records).toHaveLength(1);
    expect(collector.records[0]).toMatchObject({ actionType: "BOOM", depth: 0, status: "error" });
    expect(collector.records[0]!.phases.map((phase) => phase.key)).toEqual(
      expect.arrayContaining(["core.bucket.reduce.instance", "core.rootReducer", "core.transition.total"]),
    );
  });

  it("nested transition получает depth больше нуля", () => {
    const collector = installCollector();
    const manager = MachineManager(
      {
        task: {
          config: { IDLE: { CHILD: "DONE" }, DONE: { PARENT: null } },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      {
        middleware: [
          (api) => (next) => (action) => {
            if (action.type === "PARENT") api.transition({ type: "CHILD" });
            return next(action);
          },
        ],
      },
    );

    manager.transition({ type: "PARENT" });

    expect(collector.records.map((record) => [record.actionType, record.depth])).toEqual([
      ["CHILD", 1],
      ["PARENT", 0],
    ]);
  });
});
