import { describe, expect, it, vi } from "vitest";

import { definePlugin, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig, MachineManagerSnapshot, Middleware } from "@lite-fsm/core";
import { INSTANCE_RUNTIME_PLUGIN_NAME, instanceRuntimePlugin } from "@lite-fsm/core/internal/runtime/instance/plugin";
import { instanceStorageRuntime } from "@lite-fsm/core/internal/runtime/instance/storage";

type CounterEvent = FSMEvent<"INC"> | FSMEvent<"RESET">;
type CounterConfig = { IDLE: { INC: "ACTIVE" }; ACTIVE: { RESET: "IDLE" } };
type CounterContext = { count: number };
type CounterState = { state: "IDLE" | "ACTIVE"; context: CounterContext };
type CounterMachine = MachineConfig<CounterConfig, CounterContext, CounterEvent>;
type CounterStore = { counter: CounterMachine };

const createCounter = (effect: (deps: unknown) => void = () => {}, storage?: "instance"): CounterMachine => ({
  ...(storage === undefined ? {} : { storage }),
  config: { IDLE: { INC: "ACTIVE" }, ACTIVE: { RESET: "IDLE" } },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (slice, action, { nextState }) => ({
    state: nextState,
    context: { count: action.type === "INC" ? slice.context.count + 1 : slice.context.count },
  }),
  effects: {
    ACTIVE: effect,
  },
});

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

describe("plugin system — этап 3", () => {
  it("регистрирует instance storage через normalized preset", () => {
    expect(instanceRuntimePlugin.name).toBe(INSTANCE_RUNTIME_PLUGIN_NAME);
    expect("install" in instanceRuntimePlugin).toBe(false);
    expect(instanceRuntimePlugin.storage).toEqual([
      {
        owner: INSTANCE_RUNTIME_PLUGIN_NAME,
        kind: "instance",
        value: instanceStorageRuntime,
      },
    ]);

    const implicit = MachineManager({ counter: createCounter() });
    const explicit = MachineManager({ counter: createCounter(undefined, "instance") });
    const emptyPlugins = MachineManager({ counter: createCounter() }, { plugins: [] });

    implicit.transition({ type: "INC" });
    explicit.transition({ type: "INC" });
    emptyPlugins.transition({ type: "INC" });

    expect(explicit.getState()).toEqual(implicit.getState());
    expect(emptyPlugins.getState()).toEqual(implicit.getState());
    expect(explicit.dehydrate()).toEqual(implicit.dehydrate());
    expect(emptyPlugins.dehydrate()).toEqual(implicit.dehydrate());
  });

  it("принимает no-op plugin value и не меняет наблюдаемое поведение manager", async () => {
    const effect = vi.fn();
    const plugin = definePlugin().create({ name: "stage-three-noop" });
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
    const baseline = MachineManager({ counter: createCounter() });

    expect(manager.getState()).toEqual(baseline.getState());
    expect(manager.getSnapshot()).toEqual({
      machines: { counter: { state: "IDLE", context: { count: 0 } } },
    });

    const subscriber = vi.fn();
    manager.onTransition(subscriber);

    manager.transition({ type: "INC" });
    baseline.transition({ type: "INC" });

    expect(manager.getState()).toEqual(baseline.getState());
    expect(middlewareTrace).toEqual(["pre:INC", "post:INC"]);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber.mock.calls[0][0]).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
    expect(subscriber.mock.calls[0][1]).toEqual({ counter: { state: "ACTIVE", context: { count: 1 } } });
    expect(manager.getSnapshot()).toEqual({
      machines: { counter: { state: "ACTIVE", context: { count: 1 } } },
    });
    expect(manager.dehydrate()).toEqual(baseline.dehydrate());

    await vi.waitFor(() => {
      expect(effect).toHaveBeenCalledTimes(1);
    });

    const snapshot: MachineManagerSnapshot<CounterStore> = {
      machines: { counter: { state: "IDLE", context: { count: 10 } } },
    };
    manager.hydrate(snapshot);

    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 10 } } });
  });

  it("отклоняет structural plugin-like objects без вызова их callback", () => {
    const callback = vi.fn();

    expectLiteFsmError(
      () =>
        MachineManager({ counter: createCounter() }, {
          plugins: [
            {
              name: "structural",
              setup: callback,
            },
          ],
        } as never),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expect(callback).not.toHaveBeenCalled();
  });

  it("диагностирует duplicate plugin names до повторной регистрации entries", () => {
    const first = definePlugin().create({ name: "duplicate-stage-three" });
    const second = definePlugin().create({ name: "duplicate-stage-three" });

    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [first, second] }),
      "LITE_FSM_DUPLICATE_PLUGIN",
    );
  });

});
