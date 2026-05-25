import { describe, expect, it, vi } from "vitest";

import { definePlugin, defineStorageRuntime, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig, MachineManagerSnapshot, Middleware } from "@lite-fsm/core";

type CounterEvent = FSMEvent<"GO"> | FSMEvent<"RESET">;
type CounterConfig = { IDLE: { GO: "ACTIVE" }; ACTIVE: { RESET: "IDLE" } };
type CounterContext = { count: number };
type CounterState = { state: "IDLE" | "ACTIVE"; context: { count: number } };
type CounterMachine = MachineConfig<CounterConfig, CounterContext, CounterEvent>;
type CounterStore = { counter: CounterMachine };

const createCounter = (effect: (deps: unknown) => void = () => {}): CounterMachine => ({
  config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { RESET: "IDLE" } },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (slice: CounterState, action: CounterEvent, { nextState }: { nextState: CounterState["state"] }) => ({
    state: nextState,
    context: { count: action.type === "GO" ? slice.context.count + 1 : slice.context.count },
  }),
  effects: {
    ACTIVE: effect,
  },
});

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

describe("plugins в MachineManager", () => {
  it("no-op plugin сохраняет поведение manager", async () => {
    const effect = vi.fn();
    const plugin = definePlugin().create({ name: "noop" });
    const middlewareTrace: string[] = [];
    const middleware: Middleware<{ counter: CounterState }, CounterEvent> = () => (next) => (action) => {
      middlewareTrace.push(`pre:${action.type}`);
      const result = next(action);
      middlewareTrace.push(`post:${result.type}`);
      return result;
    };
    const manager = MachineManager(
      { counter: createCounter(effect) },
      {
        middleware: [middleware],
        plugins: [plugin],
      },
    );
    const emptyPluginsManager = MachineManager({ counter: createCounter() }, { plugins: [] });

    expect(emptyPluginsManager.getState()).toEqual(manager.getState());
    expect(manager.getSnapshot()).toEqual({
      machines: { counter: { state: "IDLE", context: { count: 0 } } },
    });

    const subscriber = vi.fn();
    manager.onTransition(subscriber);

    manager.transition({ type: "GO" });

    expect(manager.getState()).toEqual({ counter: { state: "ACTIVE", context: { count: 1 } } });
    expect(middlewareTrace).toEqual(["pre:GO", "post:GO"]);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber.mock.calls[0][0]).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
    expect(subscriber.mock.calls[0][1]).toEqual({ counter: { state: "ACTIVE", context: { count: 1 } } });
    expect(manager.getSnapshot()).toEqual({
      machines: { counter: { state: "ACTIVE", context: { count: 1 } } },
    });
    expect(manager.dehydrate()).toEqual({
      machines: { counter: { state: "ACTIVE", context: { count: 1 } } },
    });

    await vi.waitFor(() => {
      expect(effect).toHaveBeenCalledTimes(1);
    });

    const snapshot: MachineManagerSnapshot<CounterStore> = {
      machines: { counter: { state: "IDLE", context: { count: 10 } } },
    };
    manager.hydrate(snapshot);

    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 10 } } });
  });

  it("применяет final plugin sections в порядке tuple и не повторяет manager factories после init", () => {
    const order: string[] = [];
    const first = definePlugin().create({
      name: "first",
      manager: {
        first(ctx) {
          order.push(`manager:first:${Object.keys(ctx.getState()).join(",")}`);
          return "first" as const;
        },
      },
      intercept(ctx) {
        order.push(`intercept:first:${ctx.action.type}`);
      },
      hooks: {
        beforeReduce(ctx) {
          order.push(`beforeReduce:first:${ctx.action.type}`);
        },
        afterEffects(ctx) {
          order.push(`afterEffects:first:${ctx.action.type}`);
        },
      },
    });
    const second = definePlugin().create({
      name: "second",
      manager: {
        second(ctx) {
          order.push(`manager:second:${Object.keys(ctx.getState()).join(",")}`);
          return "second" as const;
        },
      },
      intercept(ctx) {
        order.push(`intercept:second:${ctx.action.type}`);
      },
      hooks: {
        beforeReduce(ctx) {
          order.push(`beforeReduce:second:${ctx.action.type}`);
        },
        afterEffects(ctx) {
          order.push(`afterEffects:second:${ctx.action.type}`);
        },
      },
    });
    const manager = MachineManager({ counter: createCounter() }, { plugins: [first, second] });

    expect(manager.first).toBe("first");
    expect(manager.second).toBe("second");
    expect(order).toEqual(["manager:first:counter", "manager:second:counter"]);

    manager.transition({ type: "GO" });
    manager.hydrate({ machines: { counter: { state: "IDLE", context: { count: 2 } } } });

    expect(order).toEqual([
      "manager:first:counter",
      "manager:second:counter",
      "intercept:first:GO",
      "intercept:second:GO",
      "beforeReduce:first:GO",
      "beforeReduce:second:GO",
      "afterEffects:first:GO",
      "afterEffects:second:GO",
    ]);
  });

  it("регистрирует storage runtime через final storage section до compile templates", () => {
    const storage = defineStorageRuntime().create({
      kind: "plugin-counter",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return { state: "READY", context: { count: 5 } };
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });
    const plugin = definePlugin().create({
      name: "storage-plugin",
      storage: [storage],
    });
    const manager = MachineManager(
      {
        counter: {
          storage: "plugin-counter",
          config: { READY: {} },
          initialState: "READY",
          initialContext: { count: 0 },
        } as never,
      },
      { plugins: [plugin] },
    );

    expect(manager.getState().counter).toEqual({ state: "READY", context: { count: 5 } });
  });

  it("duplicate plugin names бросают понятную ошибку на init", () => {
    const first = definePlugin().create({ name: "duplicate" });
    const second = definePlugin().create({ name: "duplicate" });

    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [first, second] }),
      "LITE_FSM_DUPLICATE_PLUGIN",
      "duplicate plugin name 'duplicate'",
    );
  });

  it("отклоняет structural plugin-like objects без вызова callback", () => {
    const callback = vi.fn();

    expectLiteFsmError(
      () =>
        MachineManager(
          { counter: createCounter() },
          {
            plugins: [
              {
                name: "structural",
                setup: callback,
              },
            ],
          } as never,
        ),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expect(callback).not.toHaveBeenCalled();
  });
});
