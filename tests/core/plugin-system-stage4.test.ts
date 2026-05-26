import { describe, expect, it, vi } from "vitest";

import { definePlugin, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig } from "@lite-fsm/core";
import type { NormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import { instanceRuntimePlugin } from "@lite-fsm/core/internal/runtime/instance/plugin";
import { createMachineManagerFactory } from "@lite-fsm/core/internal/runtime/kernel/createMachineManagerFactory";
import type { StorageRuntime } from "@lite-fsm/core/internal/runtime/kernel/storage";

type RouteMachine = {
  readonly storage: "route-test";
  readonly routeId?: string;
  readonly config: { readonly IDLE: { readonly HIT: "IDLE" } };
  readonly initialState: "IDLE";
  readonly initialContext: { readonly hits: number };
};
type RouteRuntimeState = {
  readonly routes: Array<{ readonly key: string | undefined; readonly targetSet: string[] }>;
  reduces: number;
  commits: number;
};

type CounterEvent = FSMEvent<"INC">;
type CounterConfig = { readonly IDLE: { readonly INC: "IDLE" } };
type CounterContext = { readonly count: number };
type CounterMachine = MachineConfig<CounterConfig, CounterContext, CounterEvent>;

const createRouteMachine = (routeId: string): RouteMachine =>
  ({
    storage: "route-test",
    routeId,
    config: { IDLE: { HIT: "IDLE" } },
    initialState: "IDLE",
    initialContext: { hits: 0 },
  }) as never;

const createRouteRuntime = () => {
  const runtimeState: RouteRuntimeState = { routes: [], reduces: 0, commits: 0 };
  const runtime: StorageRuntime = {
    kind: "route-test",
    validateTemplate() {},
    compileTemplate(ctx) {
      const machine = ctx.machine as Partial<RouteMachine>;
      return {
        key: ctx.key,
        kind: "route-test",
        data: { routeId: machine.routeId },
      };
    },
    createRuntimeState() {
      return runtimeState;
    },
    createPublicInitialState() {
      return { state: "IDLE", context: { hits: 0 } };
    },
    acceptsEvent({ action }) {
      return action.type === "HIT";
    },
    reduce({ template, dispatch, state }) {
      const routeState = state as RouteRuntimeState;
      const route = dispatch.route;
      const data = template.data as { readonly routeId?: string };

      routeState.routes.push({ key: route.key, targetSet: [...route.targetSet] });
      if (route.scope !== "plugin" || data.routeId === undefined || !route.targetSet.includes(data.routeId)) {
        return { type: "skip" };
      }

      routeState.reduces += 1;
      const prev = dispatch.nextState[template.key] as { readonly state: "IDLE"; readonly context: { hits: number } };
      dispatch.nextState = {
        ...dispatch.nextState,
        [template.key]: {
          state: "IDLE",
          context: { hits: prev.context.hits + 1 },
        },
      };
    },
    commit({ state }) {
      (state as RouteRuntimeState).commits += 1;
    },
  };

  return { runtime, runtimeState };
};

const createRouteStoragePlugin = (runtime: StorageRuntime): NormalizedPlugin => ({
  name: "stage-four-route-storage",
  storage: [
    {
      owner: "stage-four-route-storage",
      kind: "route-test",
      value: runtime,
    },
  ],
  routeMeta: [],
  scopedDeps: [],
  scopedTransition: [],
  manager: [],
  hooks: {},
});

const createRouteMachineManager = (runtime: StorageRuntime) =>
  createMachineManagerFactory({
    name: "stage-four-route-preset",
    defaultStorageKind: "instance",
    plugins: [instanceRuntimePlugin, createRouteStoragePlugin(runtime)],
  });

const createCounter = (): CounterMachine => ({
  config: { IDLE: { INC: "IDLE" } },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (slice) => ({
    state: "IDLE",
    context: { count: slice.context.count + 1 },
  }),
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

describe("plugin system — этап 4 — routeMeta", () => {
  it("подключает route resolver к routing runtime без проверки input value", () => {
    const { runtime, runtimeState } = createRouteRuntime();
    const RouteManager = createRouteMachineManager(runtime);
    const resolver = vi.fn((value, ctx) => {
      expect(value).toBe(42);
      expect(ctx.key).toBe("entityId");
      expect(ctx.action.type).toBe("HIT");
      expect(ctx.meta.entityId).toBe(42);
      return ["entity/a", "entity/a"];
    });
    const plugin = definePlugin().create({
      name: "stage-four-route-meta",
      routeMeta: { entityId: resolver },
    });
    const manager = RouteManager({ entity: createRouteMachine("entity/a") }, { plugins: [plugin] });

    manager.transition({ type: "HIT", meta: { entityId: 42, groupId: "ignored-group" } } as never);

    expect(resolver).toHaveBeenCalled();
    expect(resolver.mock.calls.every(([value]) => value === 42)).toBe(true);
    expect(runtimeState.routes).toEqual([{ key: "entityId", targetSet: ["entity/a"] }]);
    expect(runtimeState.reduces).toBe(1);
    expect(runtimeState.commits).toBe(1);
    expect(manager.getState()).toEqual({ entity: { state: "IDLE", context: { hits: 1 } } });
  });

  it("валидирует только result resolver", () => {
    const objectResult = definePlugin().create({
      name: "stage-four-bad-object-route",
      routeMeta: { entityId: () => ({ id: "entity/a" }) as never },
    });
    const arrayResult = definePlugin().create({
      name: "stage-four-bad-array-route",
      routeMeta: { entityId: () => ["entity/a", 1] as never },
    });

    const createManager = (plugin: typeof objectResult | typeof arrayResult) => {
      const { runtime } = createRouteRuntime();
      const RouteManager = createRouteMachineManager(runtime);
      return RouteManager({ entity: createRouteMachine("entity/a") }, { plugins: [plugin] });
    };

    expectLiteFsmError(
      () => createManager(objectResult).transition({ type: "HIT", meta: { entityId: "entity/a" } } as never),
      "LITE_FSM_INVALID_ROUTE_RESOLVER_RESULT",
    );
    expectLiteFsmError(
      () => createManager(arrayResult).transition({ type: "HIT", meta: { entityId: "entity/a" } } as never),
      "LITE_FSM_INVALID_ROUTE_RESOLVER_RESULT",
    );
  });

  it("диагностирует duplicate и reserved route keys", () => {
    const first = definePlugin().create({
      name: "stage-four-route-first",
      routeMeta: { entityId: () => "entity/a" },
    });
    const second = definePlugin().create({
      name: "stage-four-route-second",
      routeMeta: { entityId: () => "entity/a" },
    });
    const reserved = definePlugin().create({
      name: "stage-four-route-reserved",
      routeMeta: { actorId: () => "entity/a" },
    });

    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [first, second] }),
      "LITE_FSM_DUPLICATE_ROUTE_META_KEY",
    );
    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [reserved] }),
      "LITE_FSM_DUPLICATE_ROUTE_META_KEY",
    );
  });
});

describe("plugin system — этап 4 — manager", () => {
  it("добавляет manager extension и вызывает factory один раз после initial state", () => {
    const factory = vi.fn((ctx) => {
      expect(ctx.getState()).toEqual({ counter: { state: "IDLE", context: { count: 0 } } });
      expect(ctx.getDependencies()).toEqual({});
      ctx.transition({ type: "INC" });
      return {
        readCount: () => ctx.getState().counter.context.count,
        readDeps: () => ctx.getDependencies(),
        bump: () => ctx.transition({ type: "INC" }),
      };
    });
    const plugin = definePlugin().create({
      name: "stage-four-manager",
      manager: { audit: factory },
    });
    const manager = MachineManager({ counter: createCounter() }, { plugins: [plugin] }) as unknown as ReturnType<
      typeof MachineManager
    > & {
      readonly audit: {
        readCount(): number;
        readDeps(): Record<string, unknown>;
        bump(): unknown;
      };
    };

    manager.setDependencies({ api: "ready" } as never);
    manager.audit.bump();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(manager.audit.readCount()).toBe(2);
    expect(manager.audit.readDeps()).toEqual({ api: "ready" });
  });

  it("диагностирует duplicate manager key и core manager key", () => {
    const first = definePlugin().create({
      name: "stage-four-manager-first",
      manager: { audit: () => ({ ready: true }) },
    });
    const second = definePlugin().create({
      name: "stage-four-manager-second",
      manager: { audit: () => ({ ready: true }) },
    });
    const core = definePlugin().create({
      name: "stage-four-manager-core",
      manager: { transition: () => ({ ready: true }) },
    });

    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [first, second] }),
      "LITE_FSM_DUPLICATE_MANAGER_EXTENSION_KEY",
    );
    expectLiteFsmError(
      () => MachineManager({ counter: createCounter() }, { plugins: [core] }),
      "LITE_FSM_MANAGER_EXTENSION_CORE_KEY",
    );
  });
});
