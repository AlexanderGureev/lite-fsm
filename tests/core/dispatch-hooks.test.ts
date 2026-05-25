import { describe, expect, it, vi } from "vitest";

import { definePlugin, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, IMachineManager, MachineConfig, Middleware } from "@lite-fsm/core";
import type { StorageRuntime } from "@lite-fsm/core/internal/runtime/kernel/storage";

type CounterEvent = FSMEvent<"GO"> | FSMEvent<"ALT"> | FSMEvent<"RESET"> | FSMEvent<"NOOP">;
type CounterConfig = {
  IDLE: { GO: "ACTIVE"; ALT: "DONE"; NOOP: "IDLE" };
  ACTIVE: { RESET: "IDLE" };
  DONE: { RESET: "IDLE" };
};
type CounterContext = { count: number; last?: string };
type CounterState = { counter: { state: "IDLE" | "ACTIVE" | "DONE"; context: CounterContext } };
type CounterMachine = MachineConfig<CounterConfig, CounterContext, CounterEvent>;

const createCounter = (options: {
  readonly reducer?: (action: CounterEvent) => void;
  readonly effect?: (action: CounterEvent) => void;
} = {}): CounterMachine => ({
  config: {
    IDLE: { GO: "ACTIVE", ALT: "DONE", NOOP: "IDLE" },
    ACTIVE: { RESET: "IDLE" },
    DONE: { RESET: "IDLE" },
  },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (slice, action, { nextState }) => {
    options.reducer?.(action);
    return {
      state: nextState,
      context: { count: slice.context.count + 1, last: action.type },
    };
  },
  effects: options.effect
    ? {
        ACTIVE: ({ action }) => options.effect?.(action),
        DONE: ({ action }) => options.effect?.(action),
      }
    : undefined,
});

type TickEvent = FSMEvent<"TICK">;
type RuntimeMachine = {
  storage: "hook-test";
  config: { IDLE: { TICK: "IDLE" } };
  initialState: "IDLE";
  initialContext: { count: number };
};
type RuntimeStore = { counter: RuntimeMachine };
type RuntimeState = { counter: { state: "IDLE"; context: { count: number } } };

const createRuntimeMachine = (): RuntimeMachine => ({
  storage: "hook-test",
  config: { IDLE: { TICK: "IDLE" } },
  initialState: "IDLE",
  initialContext: { count: 0 },
});

const createHookRuntime = (
  order: string[],
  options: { readonly reactions?: boolean; readonly effects?: boolean } = {},
): StorageRuntime => ({
  kind: "hook-test",
  validateTemplate() {},
  compileTemplate(ctx) {
    return { key: ctx.key, kind: "hook-test" };
  },
  createRuntimeState() {
    return {};
  },
  createPublicInitialState() {
    return { state: "IDLE", context: { count: 0 } };
  },
  acceptsEvent({ action }) {
    return action.type === "TICK";
  },
  reduce({ template, dispatch }) {
    order.push("runtime:reduce");
    const prev = dispatch.nextState[template.key] as { state: "IDLE"; context: { count: number } };
    dispatch.nextState = {
      ...dispatch.nextState,
      [template.key]: { state: "IDLE", context: { count: prev.context.count + 1 } },
    };
  },
  commit() {
    order.push("runtime:commit");
  },
  ...(options.reactions
    ? {
        reactions: {
          run() {
            order.push("runtime:reaction");
          },
        },
      }
    : {}),
  ...(options.effects
    ? {
        effects: {
          resolveInvocations() {
            order.push("runtime:resolveEffects");
            return [{}];
          },
          invoke() {
            order.push("runtime:effect");
          },
        },
      }
    : {}),
});

describe("action interceptors и dispatch hooks", () => {
  it("no-op hooks не меняют state и выполняются в порядке регистрации фаз", () => {
    const order: string[] = [];
    const plugin = definePlugin({
      name: "hooks/noop",
      install(ctx) {
        ctx.dispatch.beforeReduce(() => order.push("beforeReduce:first"));
        ctx.dispatch.beforeReduce(() => order.push("beforeReduce:second"));
        ctx.dispatch.afterReduce(() => order.push("afterReduce"));
        ctx.dispatch.beforeCommit(() => order.push("beforeCommit"));
        ctx.dispatch.beforeSubscribers(() => order.push("beforeSubscribers"));
        ctx.dispatch.beforeEffects(() => order.push("beforeEffects"));
        ctx.dispatch.afterEffects(() => order.push("afterEffects"));
      },
    });
    const manager = MachineManager({ counter: createCounter() }, { plugins: [plugin] });

    manager.transition({ type: "GO" });

    expect(manager.getState()).toEqual({ counter: { state: "ACTIVE", context: { count: 1, last: "GO" } } });
    expect(order).toEqual([
      "beforeReduce:first",
      "beforeReduce:second",
      "afterReduce",
      "beforeCommit",
      "beforeSubscribers",
      "beforeEffects",
      "afterEffects",
    ]);
  });

  it("interceptors выполняются по порядку, skipDelivery не останавливает цепочку, а stopInterceptors останавливает", () => {
    const order: string[] = [];
    const reducer = vi.fn();
    const plugin = definePlugin({
      name: "interceptors/order",
      install(ctx) {
        ctx.actions.intercept(() => {
          order.push("first");
        });
        ctx.actions.intercept(() => {
          order.push("second");
          return { skipDelivery: true };
        });
        ctx.actions.intercept(() => {
          order.push("third");
          return { stopInterceptors: true };
        });
        ctx.actions.intercept(() => {
          order.push("fourth");
        });
      },
    });
    const manager = MachineManager({ counter: createCounter({ reducer }) }, { plugins: [plugin] });

    manager.transition({ type: "GO" });

    expect(order).toEqual(["first", "second", "third"]);
    expect(reducer).not.toHaveBeenCalled();
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
  });

  it("interceptor заменяет committed action для reducer, subscribers, effects, middleware post-next и return value", async () => {
    const reducerActions: string[] = [];
    const subscriberActions: string[] = [];
    const effectActions: string[] = [];
    const middlewareOrder: string[] = [];
    const plugin = definePlugin({
      name: "interceptors/replace",
      install(ctx) {
        ctx.actions.intercept(() => ({ action: { type: "ALT" } }));
      },
    });
    const middleware: Middleware<CounterState, CounterEvent> = () => (next) => (action) => {
      middlewareOrder.push(`before:${action.type}`);
      const result = next(action);
      middlewareOrder.push(`after:${result.type}`);
      return result;
    };
    const manager = MachineManager(
      { counter: createCounter({ reducer: (action) => reducerActions.push(action.type), effect: (action) => effectActions.push(action.type) }) },
      { middleware: [middleware], plugins: [plugin] },
    );
    manager.onTransition((_prev, _current, action) => subscriberActions.push(action.type));

    const committed = manager.transition({ type: "GO" });

    expect(committed).toEqual({ type: "ALT" });
    expect(manager.getState()).toEqual({ counter: { state: "DONE", context: { count: 1, last: "ALT" } } });
    expect(reducerActions).toEqual(["ALT"]);
    expect(subscriberActions).toEqual(["ALT"]);
    expect(middlewareOrder).toEqual(["before:GO", "after:ALT"]);
    await vi.waitFor(() => expect(effectActions).toEqual(["ALT"]));
  });

  it("skipDelivery пропускает machine delivery, но сохраняет subscribers для committed action", () => {
    const reducer = vi.fn();
    const effect = vi.fn();
    const subscriber = vi.fn();
    const plugin = definePlugin({
      name: "interceptors/skip-delivery",
      install(ctx) {
        ctx.actions.intercept(() => ({ skipDelivery: true }));
      },
    });
    const manager = MachineManager({ counter: createCounter({ reducer, effect }) }, { plugins: [plugin] });
    manager.onTransition(subscriber);

    const committed = manager.transition({ type: "GO" });

    expect(committed).toEqual({ type: "GO" });
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
    expect(reducer).not.toHaveBeenCalled();
    expect(effect).not.toHaveBeenCalled();
    expect(subscriber).toHaveBeenCalledOnce();
    expect(subscriber.mock.calls[0][2]).toEqual({ type: "GO" });
  });

  it("stopInterceptors не отменяет staged operations и без skipDelivery сохраняет delivery", () => {
    const order: string[] = [];
    const plugin = definePlugin({
      name: "interceptors/stop-staged",
      install(ctx) {
        ctx.actions.intercept((dispatch) => {
          order.push("interceptor:first");
          dispatch.runtime.set("operation", "staged");
          return { stopInterceptors: true };
        });
        ctx.actions.intercept(() => {
          order.push("interceptor:second");
        });
        ctx.dispatch.beforeReduce((dispatch) => {
          order.push(`hook:${String(dispatch.runtime.get("operation"))}`);
        });
      },
    });
    const manager = MachineManager({ counter: createCounter({ reducer: () => order.push("reducer") }) }, { plugins: [plugin] });

    manager.transition({ type: "GO" });

    expect(order).toEqual(["interceptor:first", "hook:staged", "reducer"]);
    expect(manager.getState()).toEqual({ counter: { state: "ACTIVE", context: { count: 1, last: "GO" } } });
  });

  it("middleware без next не запускает interceptors, hooks, reducers и effects", () => {
    const interceptor = vi.fn();
    const hook = vi.fn();
    const reducer = vi.fn();
    const effect = vi.fn();
    const middleware: Middleware<CounterState, CounterEvent> = () => () => (action) => action;
    const plugin = definePlugin({
      name: "middleware/no-next",
      install(ctx) {
        ctx.actions.intercept(interceptor);
        ctx.dispatch.beforeReduce(hook);
        ctx.dispatch.beforeEffects(hook);
      },
    });
    const manager = MachineManager({ counter: createCounter({ reducer, effect }) }, { middleware: [middleware], plugins: [plugin] });

    const committed = manager.transition({ type: "GO" });

    expect(committed).toEqual({ type: "GO" });
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
    expect(interceptor).not.toHaveBeenCalled();
    expect(hook).not.toHaveBeenCalled();
    expect(reducer).not.toHaveBeenCalled();
    expect(effect).not.toHaveBeenCalled();
  });

  it("hooks окружают storage reduce/commit, reactions идут перед subscribers, effects остаются после middleware chain", () => {
    const order: string[] = [];
    const plugin = definePlugin({
      name: "storage/hooks-order",
      install(ctx) {
        ctx.storage.register("hook-test", createHookRuntime(order, { reactions: true, effects: true }));
        ctx.dispatch.beforeReduce(() => order.push("hook:beforeReduce"));
        ctx.dispatch.afterReduce(() => order.push("hook:afterReduce"));
        ctx.dispatch.beforeCommit(() => order.push("hook:beforeCommit"));
        ctx.dispatch.beforeSubscribers(() => order.push("hook:beforeSubscribers"));
        ctx.dispatch.beforeEffects(() => order.push("hook:beforeEffects"));
        ctx.dispatch.afterEffects(() => order.push("hook:afterEffects"));
      },
    });
    const middleware: Middleware<RuntimeState, TickEvent> = () => (next) => (action) => {
      order.push("middleware:before");
      const result = next(action);
      order.push("middleware:after");
      return result;
    };
    const manager = MachineManager<RuntimeStore, TickEvent>(
      { counter: createRuntimeMachine() },
      { middleware: [middleware], plugins: [plugin] },
    );
    manager.onTransition(() => order.push("subscriber"));

    manager.transition({ type: "TICK" });

    expect(order).toEqual([
      "middleware:before",
      "hook:beforeReduce",
      "runtime:reduce",
      "hook:afterReduce",
      "hook:beforeCommit",
      "runtime:commit",
      "hook:beforeSubscribers",
      "runtime:reaction",
      "subscriber",
      "middleware:after",
      "hook:beforeEffects",
      "runtime:resolveEffects",
      "runtime:effect",
      "hook:afterEffects",
    ]);
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 1 } } });
  });

  it("fatal error до commit не меняет state и не вызывает onError", () => {
    const failure = new Error("before commit failed");
    const onError = vi.fn();
    const subscriber = vi.fn();
    const plugin = definePlugin({
      name: "hooks/error-before-commit",
      install(ctx) {
        ctx.dispatch.beforeCommit(() => {
          throw failure;
        });
      },
    });
    const manager = MachineManager({ counter: createCounter() }, { onError, plugins: [plugin] });
    manager.onTransition(subscriber);

    expect(() => manager.transition({ type: "GO" })).toThrow(failure);
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
    expect(subscriber).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("fatal error после commit не откатывает state и останавливает оставшиеся фазы", () => {
    const failure = new Error("after commit failed");
    const order: string[] = [];
    const onError = vi.fn();
    const plugin = definePlugin({
      name: "hooks/error-after-commit",
      install(ctx) {
        ctx.storage.register("hook-test", createHookRuntime(order, { reactions: true, effects: true }));
        ctx.dispatch.beforeSubscribers(() => {
          order.push("hook:beforeSubscribers");
          throw failure;
        });
        ctx.dispatch.beforeEffects(() => order.push("hook:beforeEffects"));
      },
    });
    const manager = MachineManager<RuntimeStore, TickEvent>(
      { counter: createRuntimeMachine() },
      { onError, plugins: [plugin] },
    );
    manager.onTransition(() => order.push("subscriber"));

    expect(() => manager.transition({ type: "TICK" })).toThrow(failure);
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 1 } } });
    expect(order).toEqual(["runtime:reduce", "runtime:commit", "hook:beforeSubscribers"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reportError вызывает onError и не меняет control flow", () => {
    const reported = new Error("reported");
    const onError = vi.fn();
    const plugin = definePlugin({
      name: "hooks/report-error",
      install(ctx) {
        ctx.dispatch.beforeReduce((dispatch) => {
          dispatch.reportError(reported);
        });
      },
    });
    const manager = MachineManager({ counter: createCounter() }, { onError, plugins: [plugin] });

    expect(() => manager.transition({ type: "GO" })).not.toThrow();
    expect(onError).toHaveBeenCalledWith(reported);
    expect(manager.getState()).toEqual({ counter: { state: "ACTIVE", context: { count: 1, last: "GO" } } });
  });

  it("reentrant dispatch внутри hook запрещен", () => {
    let manager!: IMachineManager<{ counter: CounterMachine }, CounterEvent>;
    const plugin = definePlugin({
      name: "hooks/reentrant",
      install(ctx) {
        ctx.dispatch.beforeReduce(() => {
          manager.transition({ type: "GO" });
        });
      },
    });
    manager = MachineManager({ counter: createCounter() }, { plugins: [plugin] });

    expect(() => manager.transition({ type: "GO" })).toThrow(
      "[lite-fsm] transition cannot be called from a dispatch hook.",
    );
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
  });
});
