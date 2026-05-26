import { describe, expect, it, vi } from "vitest";

import { definePlugin, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, GenericMiddleware, MachineConfig, ManagerAction } from "@lite-fsm/core";
import type { NormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import { createMachineManagerFactory } from "@lite-fsm/core/internal/runtime/kernel/createMachineManagerFactory";
import { createPluginRegistry } from "@lite-fsm/core/internal/runtime/kernel/registry";
import type { StorageRouteMetaDependencyKeys, StorageRuntime } from "@lite-fsm/core/internal/runtime/kernel/storage";

type CounterEvent =
  | FSMEvent<"INC">
  | FSMEvent<"STOPPED">
  | FSMEvent<"APP_EVENT">
  | FSMEvent<"PLUGIN_EVENT", { readonly id: string }>;
type CounterConfig = {
  readonly IDLE: {
    readonly INC: "IDLE";
    readonly STOPPED: "IDLE";
    readonly APP_EVENT: "IDLE";
    readonly PLUGIN_EVENT: "IDLE";
  };
};
type CounterContext = { readonly count: number };
type CounterMachine = MachineConfig<CounterConfig, CounterContext, CounterEvent>;
type EffectCounterConfig = {
  readonly IDLE: {
    readonly INC: "ACTIVE";
    readonly STOPPED: "ACTIVE";
    readonly APP_EVENT: "ACTIVE";
    readonly PLUGIN_EVENT: "ACTIVE";
  };
  readonly ACTIVE: {
    readonly INC: "ACTIVE";
    readonly STOPPED: "ACTIVE";
    readonly APP_EVENT: "ACTIVE";
    readonly PLUGIN_EVENT: "ACTIVE";
  };
};
type EffectCounterMachine = MachineConfig<EffectCounterConfig, CounterContext, CounterEvent>;

type RoutedEvent = FSMEvent<"RAW"> | FSMEvent<"PREPARED"> | FSMEvent<"REPLACED">;
type RoutedSlice = { readonly state: "IDLE"; readonly context: { readonly hits: number; readonly last: string | null } };
type RoutedMachine = {
  readonly storage: typeof ROUTE_STORAGE_KIND;
  readonly routeId: string;
  readonly config: { readonly IDLE: { readonly REPLACED: "IDLE" } };
  readonly initialState: "IDLE";
  readonly initialContext: { readonly hits: number; readonly last: string | null };
};

const ROUTE_STORAGE_KIND = "stage5-route";

const createCounter = (effect: (deps: unknown) => void = () => {}): CounterMachine => ({
  config: {
    IDLE: {
      INC: "IDLE",
      STOPPED: "IDLE",
      APP_EVENT: "IDLE",
      PLUGIN_EVENT: "IDLE",
    },
  },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (slice) => ({
    state: "IDLE",
    context: { count: slice.context.count + 1 },
  }),
  effects: {
    IDLE: effect,
  },
});

const createEffectCounter = (effect: (deps: unknown) => void): EffectCounterMachine => ({
  config: {
    IDLE: {
      INC: "ACTIVE",
      STOPPED: "ACTIVE",
      APP_EVENT: "ACTIVE",
      PLUGIN_EVENT: "ACTIVE",
    },
    ACTIVE: {
      INC: "ACTIVE",
      STOPPED: "ACTIVE",
      APP_EVENT: "ACTIVE",
      PLUGIN_EVENT: "ACTIVE",
    },
  },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (slice, _action, { nextState }) => ({
    state: nextState,
    context: { count: slice.context.count + 1 },
  }),
  effects: {
    ACTIVE: effect,
  },
});

const createRoutedMachine = (routeId: string): RoutedMachine => ({
  storage: ROUTE_STORAGE_KIND,
  routeId,
  config: { IDLE: { REPLACED: "IDLE" } },
  initialState: "IDLE",
  initialContext: { hits: 0, last: null },
});

const createRouteStoragePlugin = (runtime: StorageRuntime): NormalizedPlugin => ({
  name: "stage-five-route-storage",
  storage: [
    {
      owner: "stage-five-route-storage",
      kind: ROUTE_STORAGE_KIND,
      value: runtime,
    },
  ],
  routeMeta: [],
  scopedDeps: [],
  scopedTransition: [],
  manager: [],
  hooks: {},
});

const createRoutedManager = (runtime: StorageRuntime) =>
  createMachineManagerFactory({
    name: "stage-five-route-preset",
    defaultStorageKind: ROUTE_STORAGE_KIND,
    plugins: [createRouteStoragePlugin(runtime)],
  });

const createRouteRuntime = (log: string[]): StorageRuntime => ({
  kind: ROUTE_STORAGE_KIND,
  routeMetaKeys: ["entityId"],
  validateTemplate() {},
  compileTemplate(ctx) {
    const machine = ctx.machine as Partial<RoutedMachine>;
    return {
      key: ctx.key,
      kind: ROUTE_STORAGE_KIND,
      data: { routeId: machine.routeId },
    };
  },
  createRuntimeState() {
    return undefined;
  },
  createPublicInitialState() {
    return { state: "IDLE", context: { hits: 0, last: null } } satisfies RoutedSlice;
  },
  prepareAction({ action }) {
    log.push(`prepare:${action.type}`);
    if (action.type !== "RAW") return;

    const meta = { actorId: undefined, entityId: "first" };
    const prepared = { type: "PREPARED", meta };
    return { type: "replace", action: prepared };
  },
  acceptsEvent({ action }) {
    return action.type === "REPLACED";
  },
  reduce({ action, dispatch, template }) {
    const data = template.data as { readonly routeId: string };
    if (dispatch.route.scope !== "plugin" || !dispatch.route.targetSet.includes(data.routeId)) {
      return { type: "skip" };
    }

    const prev = dispatch.nextState[template.key] as RoutedSlice;
    dispatch.nextState = {
      ...dispatch.nextState,
      [template.key]: {
        state: "IDLE",
        context: { hits: prev.context.hits + 1, last: action.type },
      } satisfies RoutedSlice,
    };
    log.push(`reduce:${data.routeId}:${action.type}`);
  },
  commit({ action }) {
    log.push(`commit:${action.type}`);
  },
  effects: {
    resolveInvocations({ action }) {
      return [action];
    },
    invoke({ invocation }) {
      const action = invocation as { readonly type: string };
      log.push(`effect:${action.type}`);
    },
  },
});

const createMinimalStorageRuntime = (kind: string, routeMetaKeys?: StorageRouteMetaDependencyKeys): StorageRuntime => ({
  kind,
  routeMetaKeys,
  validateTemplate() {},
  compileTemplate(ctx) {
    return { key: ctx.key, kind };
  },
  createRuntimeState() {
    return undefined;
  },
  createPublicInitialState() {
    return {};
  },
  acceptsEvent() {
    return false;
  },
  reduce() {
    return { type: "skip" };
  },
  commit() {},
});

const expectLiteFsmError = (run: () => unknown, code: string): LiteFsmError => {
  let caught: unknown;

  try {
    run();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(LiteFsmError);
  expect((caught as LiteFsmError).code).toBe(code);
  return caught as LiteFsmError;
};

describe("plugin system — этап 5 — intercept", () => {
  it("выполняет interceptors после prepareAction, сохраняет originalAction и применяет replacement ко всем фазам", () => {
    const log: string[] = [];
    const routeResolver = vi.fn((value: unknown) => String(value));
    const originalAction = { type: "RAW" } satisfies ManagerAction<RoutedEvent>;
    const routePlugin = definePlugin().create({
      name: "stage-five-route-meta",
      routeMeta: { entityId: routeResolver },
    });
    const firstPlugin = definePlugin().create({
      name: "stage-five-intercept-first",
      intercept(ctx) {
        log.push(`intercept:first:${ctx.action.type}:${ctx.originalAction.type}`);
        expect(ctx.originalAction).toBe(originalAction);
        expect(ctx.action).toEqual({ type: "PREPARED", meta: { entityId: "first" } });

        return { action: { type: "REPLACED", meta: { entityId: "second" } } as never };
      },
      hooks: {
        beforeReduce(ctx) {
          log.push(`hook:first:${ctx.action.type}`);
          return { action: { type: "IGNORED" }, skipDelivery: true };
        },
        beforeEffects(ctx) {
          log.push(`hook:beforeEffects:${ctx.action.type}`);
        },
      },
    });
    const secondPlugin = definePlugin().create({
      name: "stage-five-intercept-second",
      intercept(ctx) {
        log.push(`intercept:second:${ctx.action.type}:${ctx.originalAction.type}`);
      },
      hooks: {
        beforeReduce(ctx) {
          log.push(`hook:second:${ctx.action.type}`);
        },
        afterEffects(ctx) {
          log.push(`hook:afterEffects:${ctx.action.type}`);
        },
      },
    });
    const manager = createRoutedManager(createRouteRuntime(log))(
      {
        first: createRoutedMachine("first"),
        second: createRoutedMachine("second"),
      } as never,
      { plugins: [routePlugin, firstPlugin, secondPlugin] },
    );
    manager.onTransition((_prev, current, action) => {
      const second = (current as Record<string, RoutedSlice>).second;
      log.push(`subscriber:${action.type}:${second.context.hits}`);
    });

    const returned = manager.transition(originalAction as never);

    expect(returned).toEqual({ type: "REPLACED", meta: { entityId: "second" } });
    expect(routeResolver).toHaveBeenCalledWith(
      "second",
      expect.objectContaining({
        action: { type: "REPLACED", meta: { entityId: "second" } },
      }),
    );
    expect(manager.getState()).toEqual({
      first: { state: "IDLE", context: { hits: 0, last: null } },
      second: { state: "IDLE", context: { hits: 1, last: "REPLACED" } },
    });
    expect(log).toEqual([
      "prepare:RAW",
      "intercept:first:PREPARED:RAW",
      "intercept:second:REPLACED:RAW",
      "hook:first:REPLACED",
      "hook:second:REPLACED",
      "reduce:second:REPLACED",
      "commit:REPLACED",
      "subscriber:REPLACED:1",
      "hook:beforeEffects:REPLACED",
      "effect:REPLACED",
      "hook:afterEffects:REPLACED",
    ]);
  });

  it("применяет replacement перед stopInterceptors и останавливает только следующие interceptors", () => {
    const secondInterceptor = vi.fn();
    const hook = vi.fn();
    const firstPlugin = definePlugin().create({
      name: "stage-five-stop-first",
      intercept() {
        return { action: { type: "STOPPED" }, stopInterceptors: true };
      },
      hooks: {
        beforeReduce: hook,
      },
    });
    const secondPlugin = definePlugin().create({
      name: "stage-five-stop-second",
      intercept: secondInterceptor,
    });
    const manager = MachineManager({ counter: createCounter() }, { plugins: [firstPlugin, secondPlugin] });

    const returned = manager.transition({ type: "INC" });

    expect(returned).toEqual({ type: "STOPPED" });
    expect(secondInterceptor).not.toHaveBeenCalled();
    expect(hook).toHaveBeenCalledWith(expect.objectContaining({ action: { type: "STOPPED" } }));
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 1 } } });
  });

  it("skipDelivery не доставляет action в machines и не запускает effects", () => {
    const effect = vi.fn();
    const hook = vi.fn();
    const plugin = definePlugin().create({
      name: "stage-five-skip",
      intercept(ctx) {
        expect(ctx.skipDelivery).toBe(false);
        return { skipDelivery: true };
      },
      hooks: {
        beforeReduce(ctx) {
          hook(ctx.skipDelivery);
        },
      },
    });
    const manager = MachineManager({ counter: createCounter(effect) }, { plugins: [plugin] });

    const returned = manager.transition({ type: "INC" });

    expect(returned).toEqual({ type: "INC" });
    expect(hook).toHaveBeenCalledWith(true);
    expect(effect).not.toHaveBeenCalled();
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
  });

  it("не фильтрует runtime callbacks по HostEvents и PluginEvents", () => {
    type HostEvent = FSMEvent<"HOST_EVENT">;
    type PluginEvent = FSMEvent<"PLUGIN_EVENT", { readonly id: string }>;

    const interceptor = vi.fn();
    const hook = vi.fn();
    const plugin = definePlugin<PluginEvent, HostEvent>().create({
      name: "stage-five-generic-runtime",
      intercept(ctx) {
        interceptor(ctx.action.type);
      },
      hooks: {
        beforeReduce(ctx) {
          hook(ctx.action.type);
        },
      },
    });
    const manager = MachineManager({ counter: createCounter() }, { plugins: [plugin] });

    manager.transition({ type: "APP_EVENT" });

    expect(interceptor).toHaveBeenCalledWith("APP_EVENT");
    expect(hook).toHaveBeenCalledWith("APP_EVENT");
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 1 } } });
  });
});

describe("plugin system — этап 5 — hooks и ошибки", () => {
  it("reportError вызывает onError и не меняет control flow", () => {
    const reportedFromInterceptor = new Error("reported from interceptor");
    const reportedFromHook = new Error("reported from hook");
    const onError = vi.fn();
    const plugin = definePlugin().create({
      name: "stage-five-report-error",
      intercept(ctx) {
        ctx.reportError(reportedFromInterceptor);
      },
      hooks: {
        beforeReduce(ctx) {
          ctx.reportError(reportedFromHook);
        },
      },
    });
    const manager = MachineManager({ counter: createCounter() }, { plugins: [plugin], onError });

    manager.transition({ type: "INC" });

    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(1, reportedFromInterceptor);
    expect(onError).toHaveBeenNthCalledWith(2, reportedFromHook);
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 1 } } });
  });

  it("пробрасывает ошибку из interceptor без onError и без изменения state", () => {
    const onError = vi.fn();
    const error = new Error("interceptor failed");
    const plugin = definePlugin().create({
      name: "stage-five-interceptor-error",
      intercept() {
        throw error;
      },
    });
    const manager = MachineManager({ counter: createCounter() }, { plugins: [plugin], onError });

    expect(() => manager.transition({ type: "INC" })).toThrow(error);
    expect(onError).not.toHaveBeenCalled();
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
  });

  it("пробрасывает ошибку из hook до commit без изменения state", () => {
    const onError = vi.fn();
    const error = new Error("beforeCommit failed");
    const plugin = definePlugin().create({
      name: "stage-five-before-commit-error",
      hooks: {
        beforeCommit() {
          throw error;
        },
      },
    });
    const manager = MachineManager({ counter: createCounter() }, { plugins: [plugin], onError });

    expect(() => manager.transition({ type: "INC" })).toThrow(error);
    expect(onError).not.toHaveBeenCalled();
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
  });

  it("пробрасывает ошибку из hook после commit без rollback и останавливает оставшиеся фазы", () => {
    const onError = vi.fn();
    const subscriber = vi.fn();
    const effect = vi.fn();
    const skippedHook = vi.fn();
    const afterEffects = vi.fn();
    const error = new Error("beforeSubscribers failed");
    const firstPlugin = definePlugin().create({
      name: "stage-five-after-commit-error-first",
      hooks: {
        beforeSubscribers() {
          throw error;
        },
        afterEffects,
      },
    });
    const secondPlugin = definePlugin().create({
      name: "stage-five-after-commit-error-second",
      hooks: {
        beforeSubscribers: skippedHook,
      },
    });
    const manager = MachineManager(
      { counter: createCounter(effect) },
      { plugins: [firstPlugin, secondPlugin], onError },
    );
    manager.onTransition(subscriber);

    expect(() => manager.transition({ type: "INC" })).toThrow(error);
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 1 } } });
    expect(onError).not.toHaveBeenCalled();
    expect(skippedHook).not.toHaveBeenCalled();
    expect(subscriber).not.toHaveBeenCalled();
    expect(effect).not.toHaveBeenCalled();
    expect(afterEffects).not.toHaveBeenCalled();
  });

  it("запрещает transition из dispatch hook и восстанавливает guard после ошибки", () => {
    let shouldCallNestedTransition = true;
    let manager!: {
      transition(action: ManagerAction<CounterEvent>): ManagerAction<CounterEvent>;
      getState(): { readonly counter: { readonly state: "IDLE"; readonly context: { readonly count: number } } };
    };
    const plugin = definePlugin().create({
      name: "stage-five-reentrant-hook",
      hooks: {
        beforeReduce() {
          if (!shouldCallNestedTransition) return;

          shouldCallNestedTransition = false;
          manager.transition({ type: "INC" });
        },
      },
    });
    manager = MachineManager({ counter: createCounter() }, { plugins: [plugin] });

    expectLiteFsmError(() => manager.transition({ type: "INC" }), "LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN");
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });

    manager.transition({ type: "INC" });

    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 1 } } });
  });
});

describe("plugin system — этап 5 — guard interceptors", () => {
  it("запрещает transition из interceptor до запуска вложенного dispatch и восстанавливает guard", () => {
    const onError = vi.fn();
    const subscriber = vi.fn();
    const effect = vi.fn();
    const firstInterceptor = vi.fn();
    const secondInterceptor = vi.fn();
    const reported = new Error("reported from interceptor");
    const middlewareLog: string[] = [];
    let shouldCallNestedTransition = true;
    let manager!: {
      transition(action: ManagerAction<CounterEvent>): ManagerAction<CounterEvent>;
      getState(): {
        readonly counter: { readonly state: "IDLE" | "ACTIVE"; readonly context: { readonly count: number } };
      };
      onTransition(
        cb: (
          prevState: {
            readonly counter: { readonly state: "IDLE" | "ACTIVE"; readonly context: { readonly count: number } };
          },
          currentState: {
            readonly counter: { readonly state: "IDLE" | "ACTIVE"; readonly context: { readonly count: number } };
          },
          action: ManagerAction<CounterEvent>,
        ) => void,
      ): () => void;
    };
    const middleware: GenericMiddleware = () => (next) => (action) => {
      middlewareLog.push(`middleware:${action.type}`);
      return next(action);
    };
    const firstPlugin = definePlugin().create({
      name: "stage-five-interceptor-guard-first",
      intercept(ctx) {
        firstInterceptor(ctx.action.type);
        if (!shouldCallNestedTransition) return;

        shouldCallNestedTransition = false;
        ctx.reportError(reported);
        manager.transition({ type: "PLUGIN_EVENT", payload: { id: "nested" } });
      },
    });
    const secondPlugin = definePlugin().create({
      name: "stage-five-interceptor-guard-second",
      intercept(ctx) {
        secondInterceptor(ctx.action.type);
      },
    });
    manager = MachineManager(
      { counter: createEffectCounter(effect) },
      { plugins: [firstPlugin, secondPlugin], middleware: [middleware], onError },
    ) as typeof manager;
    manager.onTransition(subscriber);

    const error = expectLiteFsmError(
      () => manager.transition({ type: "INC" }),
      "LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN",
    );

    expect(error.message).toContain("plugin.intercept");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(reported);
    expect(middlewareLog).toEqual(["middleware:INC"]);
    expect(firstInterceptor).toHaveBeenCalledTimes(1);
    expect(firstInterceptor).toHaveBeenCalledWith("INC");
    expect(secondInterceptor).not.toHaveBeenCalled();
    expect(subscriber).not.toHaveBeenCalled();
    expect(effect).not.toHaveBeenCalled();
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });

    manager.transition({ type: "INC" });

    expect(middlewareLog).toEqual(["middleware:INC", "middleware:INC"]);
    expect(firstInterceptor).toHaveBeenCalledTimes(2);
    expect(secondInterceptor).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(manager.getState()).toEqual({ counter: { state: "ACTIVE", context: { count: 1 } } });
  });

  it("запрещает transition из interceptor через manager extension", () => {
    let manager!: {
      transition(action: ManagerAction<CounterEvent>): ManagerAction<CounterEvent>;
      getState(): { readonly counter: { readonly state: "IDLE"; readonly context: { readonly count: number } } };
      dispatchNested(): ManagerAction<CounterEvent>;
    };
    const plugin = definePlugin().create({
      name: "stage-five-interceptor-manager-extension",
      manager: {
        dispatchNested: (ctx) => () => ctx.transition({ type: "PLUGIN_EVENT", payload: { id: "nested" } }),
      },
      intercept() {
        manager.dispatchNested();
      },
    });
    manager = MachineManager({ counter: createCounter() }, { plugins: [plugin] }) as typeof manager;

    expectLiteFsmError(() => manager.transition({ type: "INC" }), "LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN");
    expect(manager.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
  });
});

describe("plugin system — этап 5 — registry coverage", () => {
  it("диагностирует storage registry errors", () => {
    const registry = createPluginRegistry({ defaultStorageKind: "instance" });
    const runtime = createMinimalStorageRuntime("instance");

    expectLiteFsmError(() => registry.assertDefaultStorageRegistered(), "LITE_FSM_MISSING_DEFAULT_STORAGE_KIND");

    registry.storage.register("instance", runtime, "stage-five-registry");
    registry.assertDefaultStorageRegistered();

    expect(registry.storage.get("instance")).toBe(runtime);
    expect(registry.listStorageRuntimes()).toEqual([{ kind: "instance", runtime }]);
    expectLiteFsmError(
      () => registry.storage.register("instance", runtime, "stage-five-conflict"),
      "LITE_FSM_DUPLICATE_STORAGE_KIND",
    );
    expectLiteFsmError(
      () => registry.storage.register("declared", createMinimalStorageRuntime("actual"), "stage-five-mismatch"),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );
  });

  it("диагностирует storage route resolver, отсутствующий в plugin tuple", () => {
    const registry = createPluginRegistry({ defaultStorageKind: "custom" });

    registry.storage.register("custom", createMinimalStorageRuntime("custom", ["entityId"]), "stage-five-routed");

    expectLiteFsmError(
      () => registry.assertStorageRouteResolversRegistered(),
      "LITE_FSM_MISSING_ROUTE_META_RESOLVER",
    );
  });
});
