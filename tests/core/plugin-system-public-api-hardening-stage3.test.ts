import { describe, expect, it } from "vitest";

import { definePlugin, defineStorageRuntime, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig, ManagerAction } from "@lite-fsm/core";

type CounterEvent =
  | FSMEvent<"INC", { readonly value?: number; readonly nested?: { readonly count: number } }>
  | FSMEvent<"REPLACED">;
type CounterConfig = { readonly IDLE: { readonly INC: "IDLE"; readonly REPLACED: "IDLE" } };
type CounterMachine = MachineConfig<CounterConfig, { readonly count: number }, CounterEvent>;
type RoutedEvent = FSMEvent<"RAW"> | FSMEvent<"REPLACED">;

type MetaRecord = {
  actorId?: string;
  slot?: string;
};

const createCounter = (): CounterMachine => ({
  config: { IDLE: { INC: "IDLE", REPLACED: "IDLE" } },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (state, action) => ({
    state: "IDLE",
    context: { count: state.context.count + (action.type === "REPLACED" ? 2 : 1) },
  }),
});

const createActionStorage = (kind: string, mutate: (ctx: { readonly action: ManagerAction<CounterEvent> }) => void) =>
  defineStorageRuntime<{ readonly observedEvents: CounterEvent; readonly runtimeState: object }>().create({
    kind,
    validateTemplate() {},
    compileTemplate() {},
    createRuntimeState() {
      return {};
    },
    createPublicInitialState() {
      return {};
    },
    prepareAction(ctx) {
      mutate(ctx as { readonly action: ManagerAction<CounterEvent> });
    },
    acceptsEvent() {
      return false;
    },
    reduce() {},
    commit() {},
  });

const createStorageManager = (kind: string, mutate: (ctx: { readonly action: ManagerAction<CounterEvent> }) => void) => {
  const storage = createActionStorage(kind, mutate);
  const plugin = definePlugin().create({ name: `${kind}-plugin`, storage: [storage] });

  return MachineManager(
    {
      box: {
        storage: kind,
        config: { IDLE: { INC: "IDLE", REPLACED: "IDLE" } },
        initialState: "IDLE",
        initialContext: { count: 0 },
      },
    } as never,
    { plugins: [plugin] },
  ) as { transition(action: ManagerAction<CounterEvent, MetaRecord>): unknown };
};

describe("plugin system public API hardening — этап 3 runtime", () => {
  it("бросает runtime error при мутации ctx.action.type в interceptor и hook в dev mode", () => {
    const interceptorPlugin = definePlugin().create({
      name: "stage-three-interceptor-mutation",
      intercept(ctx) {
        (ctx.action as ManagerAction<CounterEvent>).type = "REPLACED";
      },
    });
    const hookPlugin = definePlugin().create({
      name: "stage-three-hook-mutation",
      hooks: {
        beforeReduce(ctx) {
          (ctx.action as ManagerAction<CounterEvent>).type = "REPLACED";
        },
      },
    });

    expect(() =>
      MachineManager({ counter: createCounter() }, { plugins: [interceptorPlugin] }).transition({
        type: "INC",
        payload: {},
      }),
    ).toThrow(TypeError);
    expect(() =>
      MachineManager({ counter: createCounter() }, { plugins: [hookPlugin] }).transition({ type: "INC", payload: {} }),
    ).toThrow(TypeError);
  });

  it("бросает runtime error при мутации ctx.action.meta.actorId в route resolver и storage callback", () => {
    const routePlugin = definePlugin().create({
      name: "stage-three-route-mutation",
      routeMeta: {
        slot(value: string, ctx) {
          (ctx.action.meta as MetaRecord).actorId = "next";
          return value;
        },
      },
    });
    const storageManager = createStorageManager("stage-three-storage-mutation", (ctx) => {
      (ctx.action.meta as MetaRecord).actorId = "next";
    });

    expect(() =>
      MachineManager({ counter: createCounter() }, { plugins: [routePlugin] }).transition({
        type: "INC",
        payload: {},
        meta: { slot: "counter" },
      } as ManagerAction<CounterEvent, MetaRecord>),
    ).toThrow(TypeError);
    expect(() =>
      storageManager.transition({
        type: "INC",
        payload: {},
        meta: { actorId: "box" },
      } as ManagerAction<CounterEvent, MetaRecord>),
    ).toThrow(TypeError);
  });

  it("передает shallow action view и не замораживает исходный action или payload", () => {
    const userAction = {
      type: "INC",
      payload: { value: 1, nested: { count: 1 } },
      meta: { slot: "counter" },
    } satisfies ManagerAction<CounterEvent, MetaRecord>;
    const plugin = definePlugin().create({
      name: "stage-three-shallow-action-view",
      routeMeta: {
        slot(value: string) {
          return value;
        },
      },
      intercept(ctx) {
        expect(ctx.action).toEqual(userAction);
        expect(ctx.action).not.toBe(userAction);
        expect(ctx.action.payload).toBe(userAction.payload);
        expect(Object.isFrozen(ctx.action)).toBe(true);
        expect(Object.isFrozen(ctx.action.meta)).toBe(true);
        expect(Object.isFrozen(ctx.action.payload)).toBe(false);
        expect(Object.isFrozen(userAction)).toBe(false);
        expect(Object.isFrozen(userAction.meta)).toBe(false);
      },
    });

    const returned = MachineManager({ counter: createCounter() }, { plugins: [plugin] }).transition(userAction);

    expect(returned).toEqual(userAction);
    expect(Object.isFrozen(userAction)).toBe(false);
    expect(Object.isFrozen(userAction.meta)).toBe(false);
    expect(Object.isFrozen(userAction.payload)).toBe(false);
    expect(Object.isFrozen(userAction.payload.nested)).toBe(false);
  });

  it("сохраняет route recalculation и committed action при replacement protocol", () => {
    const routedLog: string[] = [];
    const routeStorage = defineStorageRuntime<{
      readonly observedEvents: RoutedEvent;
      readonly routeMeta: { readonly slot: string };
      readonly runtimeState: { readonly log: string[] };
      readonly publicState: { readonly hits: number; readonly last: string | null };
      readonly templateData: { readonly slot: string };
    }>().create({
      kind: "stage-three-route-storage",
      routeMetaKeys: ["slot"],
      validateTemplate() {},
      compileTemplate(ctx) {
        return { data: { slot: ctx.key } };
      },
      createRuntimeState() {
        return { log: routedLog };
      },
      createPublicInitialState() {
        return { hits: 0, last: null };
      },
      acceptsEvent(ctx) {
        return (ctx.dispatch.route.targetSet as readonly string[]).includes(ctx.template.key);
      },
      reduce(ctx) {
        const current = ctx.dispatch.nextState[ctx.template.key] as { readonly hits: number };
        ctx.dispatch.nextState = {
          ...ctx.dispatch.nextState,
          [ctx.template.key]: { hits: current.hits + 1, last: ctx.action.type },
        };
        ctx.state.log.push(`${ctx.dispatch.route.scope}:${ctx.dispatch.route.targetSet.join(",")}:${ctx.action.type}`);
      },
      commit() {},
    });
    const plugin = definePlugin().create({
      name: "stage-three-route-replacement",
      storage: [routeStorage],
      routeMeta: {
        slot(value: string, ctx) {
          routedLog.push(`route:${value}:${ctx.action.type}`);
          return value;
        },
      },
      intercept() {
        return { action: { type: "REPLACED", meta: { slot: "second" } } as never };
      },
    });
    const manager = MachineManager(
      {
        first: {
          storage: "stage-three-route-storage",
          config: { IDLE: { REPLACED: "IDLE" } },
          initialState: "IDLE",
          initialContext: {},
        },
        second: {
          storage: "stage-three-route-storage",
          config: { IDLE: { REPLACED: "IDLE" } },
          initialState: "IDLE",
          initialContext: {},
        },
      } as never,
      { plugins: [plugin] },
    ) as {
      transition(action: ManagerAction<RoutedEvent, MetaRecord>): ManagerAction<RoutedEvent, MetaRecord>;
      getState(): Record<string, unknown>;
    };

    const returned = manager.transition({ type: "RAW", meta: { slot: "first" } } as ManagerAction<
      RoutedEvent,
      MetaRecord
    >);

    expect(returned).toEqual({ type: "REPLACED", meta: { slot: "second" } });
    expect(manager.getState()).toEqual({
      first: { hits: 0, last: null },
      second: { hits: 1, last: "REPLACED" },
    });
    const lastEntries = routedLog.slice(-2);
    expect(lastEntries).toEqual(["route:second:REPLACED", "plugin:second:REPLACED"]);
  });
});
