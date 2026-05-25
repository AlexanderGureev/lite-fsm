import { describe, expect, it, vi } from "vitest";

import { definePlugin, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type {
  FSMEvent,
  MachineConfig,
  MachineManagerSnapshot,
  Middleware,
  PluginInstallContext,
  ScopedDepsFactory,
} from "@lite-fsm/core";

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

describe("plugins в MachineManager", () => {
  it("no-op plugin сохраняет поведение manager", async () => {
    const effect = vi.fn();
    const install = vi.fn((ctx) => {
      expect(Object.isFrozen(ctx)).toBe(true);
      expect(Object.keys(ctx)).toEqual(["actions", "storage", "dispatch", "routing", "manager", "deps"]);
      expect(ctx.storage.get("instance")?.kind).toBe("instance");
    });
    const plugin = definePlugin({ name: "noop", install });
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
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("устанавливает plugins в порядке массива и не повторяет install после init", () => {
    const order: string[] = [];
    const first = definePlugin({ name: "first", install: () => order.push("first") });
    const second = definePlugin({ name: "second", install: () => order.push("second") });
    const manager = MachineManager({ counter: createCounter() }, { plugins: [first, second] });

    manager.transition({ type: "GO" });
    manager.hydrate({ machines: { counter: { state: "IDLE", context: { count: 2 } } } });

    expect(order).toEqual(["first", "second"]);
  });

  it("устанавливает plugin до проверки машин", () => {
    const calls: string[] = [];
    const plugin = definePlugin({ name: "before-compile", install: () => calls.push("install") });

    expect(() =>
      MachineManager(
        {
          bad: {
            config: { IDLE: {} },
            initialState: "IDLE",
            initialContext: {},
            persistence: "runtime",
          } as never,
        },
        { plugins: [plugin] },
      ),
    ).toThrow(LiteFsmError);
    expect(calls).toEqual(["install"]);
  });

  it("duplicate plugin names бросают понятную ошибку на init", () => {
    const firstInstall = vi.fn();
    const secondInstall = vi.fn();
    const first = definePlugin({ name: "duplicate", install: firstInstall });
    const second = definePlugin({ name: "duplicate", install: secondInstall });

    expect(() => MachineManager({ counter: createCounter() }, { plugins: [first, second] })).toThrow(
      "[lite-fsm] duplicate plugin name 'duplicate'.",
    );
    expect(firstInstall).toHaveBeenCalledTimes(1);
    expect(secondInstall).not.toHaveBeenCalled();
  });

  it("пробрасывает ошибку из install", () => {
    const failure = new Error("install failed");
    const plugin = definePlugin({
      name: "failing",
      install: () => {
        throw failure;
      },
    });

    expect(() => MachineManager({ counter: createCounter() }, { plugins: [plugin] })).toThrow(failure);
  });

  it("не разрешает менять registry после завершения install", () => {
    let captured!: PluginInstallContext;
    const plugin = definePlugin({
      name: "capture-context",
      install(ctx) {
        captured = ctx;
      },
    });

    const manager = MachineManager({ counter: createCounter() }, { plugins: [plugin] });

    expect(() => captured.actions.intercept(() => undefined)).toThrow(
      "[lite-fsm] plugin registry 'actions' can only be changed during plugin install.",
    );
    expect(() => captured.storage.register("late", undefined as never)).toThrow(
      "[lite-fsm] plugin registry 'storage' can only be changed during plugin install.",
    );
    expect(() => captured.dispatch.beforeReduce(() => undefined)).toThrow(
      "[lite-fsm] plugin registry 'dispatch' can only be changed during plugin install.",
    );
    expect(() => captured.routing.registerMetaKey("late", () => "late")).toThrow(
      "[lite-fsm] plugin registry 'routing' can only be changed during plugin install.",
    );
    expect(() =>
      captured.deps.extendDeps(Object.assign(() => ({}), { keys: ["late"] }) as ScopedDepsFactory),
    ).toThrow("[lite-fsm] plugin registry 'deps' can only be changed during plugin install.");
    expect(() => captured.manager.extend("late", () => ({}))).toThrow(
      "[lite-fsm] plugin registry 'manager' can only be changed during plugin install.",
    );

    manager.transition({ type: "GO" });

    expect(manager.getState()).toEqual({ counter: { state: "ACTIVE", context: { count: 1 } } });
  });
});
