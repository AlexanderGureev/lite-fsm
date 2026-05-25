import { describe, expect, it } from "vitest";

import { definePlugin, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachineConfig, ManagerRuntimeContext } from "@lite-fsm/core";
import type { StorageRuntime } from "@lite-fsm/core/internal/runtime/kernel/storage";

type Start = FSMEvent<"START">;
type Stop = FSMEvent<"STOP">;
type Touch = FSMEvent<"TOUCH">;
type Event = Start | Stop | Touch;
type Config = { idle: { START: "active"; TOUCH: null }; active: { STOP: "idle"; TOUCH: null } };
type Ctx = { count: number };
type State = { state: "idle" | "active"; context: Ctx };

const baseMachine = (): MachineConfig<Config, Ctx, Event> => ({
  config: { idle: { START: "active", TOUCH: null }, active: { STOP: "idle", TOUCH: null } },
  initialState: "idle",
  initialContext: { count: 0 },
  reducer: (state, action, meta) => ({
    state: meta.nextState,
    context: { count: action.type === "TOUCH" ? state.context.count + 1 : state.context.count },
  }),
});

type CustomMachine = {
  storage: "manager-extension-test";
  config: { IDLE: { PING: "IDLE" } };
  initialState: "IDLE";
  initialContext: { ready: true };
};
type CustomState = { state: "IDLE"; context: { ready: boolean } };

const customMachine = (): CustomMachine => ({
  storage: "manager-extension-test",
  config: { IDLE: { PING: "IDLE" } },
  initialState: "IDLE",
  initialContext: { ready: true },
});

const createManagerExtensionStorage = (order: string[]): StorageRuntime => ({
  kind: "manager-extension-test",
  validateTemplate() {
    order.push("validate");
  },
  compileTemplate(ctx) {
    order.push("compile");
    return { key: ctx.key, kind: "manager-extension-test" };
  },
  createRuntimeState() {
    order.push("runtime");
    return {};
  },
  createPublicInitialState() {
    order.push("initial");
    return { state: "IDLE", context: { ready: true } };
  },
  acceptsEvent({ action }) {
    return action.type === "PING";
  },
  reduce({ template, dispatch }) {
    dispatch.nextState = {
      ...dispatch.nextState,
      [template.key]: { state: "IDLE", context: { ready: false } },
    };
  },
  commit() {},
});

describe("plugin system stage 8 — manager extensions", () => {
  it("добавляет plugin manager extension на returned manager object", () => {
    const plugin = definePlugin<{
      readonly manager: {
        readonly audit: {
          readonly state: () => State;
          readonly start: () => Event;
        };
      };
    }>({
      name: "manager-audit",
      install(ctx) {
        ctx.manager.extend("audit", (runtime) => ({
          state: () => runtime.getState().counter as unknown as State,
          start: () => runtime.transition({ type: "START" }) as Event,
        }));
      },
    });
    const manager = MachineManager({ counter: baseMachine() }, { plugins: [plugin] as const });

    expect(manager.audit.state()).toEqual({ state: "idle", context: { count: 0 } });
    expect(manager.audit.start()).toEqual({ type: "START" });
    expect(manager.getState().counter).toEqual({ state: "active", context: { count: 0 } });
  });

  it("вызывает extension factory после compile machines и runtime init", () => {
    const order: string[] = [];
    const contexts: ManagerRuntimeContext[] = [];
    const plugin = definePlugin<{
      readonly manager: {
        readonly inspect: {
          readonly context: () => ManagerRuntimeContext;
          readonly state: () => unknown;
        };
      };
    }>({
      name: "manager-factory-order",
      install(ctx) {
        ctx.storage.register("manager-extension-test", createManagerExtensionStorage(order));
        ctx.manager.extend("inspect", (runtime) => {
          contexts.push(runtime);
          order.push(`factory:${(runtime.getState().custom as unknown as CustomState).state}`);
          return {
            context: () => runtime,
            state: () => runtime.getState().custom,
          };
        });
      },
    });
    const manager = MachineManager({ custom: customMachine() }, { plugins: [plugin] as const });

    expect(order).toEqual(["validate", "compile", "runtime", "initial", "factory:IDLE"]);
    expect(contexts).toHaveLength(1);
    expect(manager.inspect.context()).toBe(contexts[0]);
    expect(manager.inspect.state()).toEqual({ state: "IDLE", context: { ready: true } });

    manager.transition({ type: "PING" });

    expect(manager.inspect.context()).toBe(contexts[0]);
    expect(manager.inspect.state()).toEqual({ state: "IDLE", context: { ready: false } });
  });

  it("бросает init error при duplicate manager extension key", () => {
    const first = definePlugin({
      name: "manager-extension-a",
      install(ctx) {
        ctx.manager.extend("tools", () => ({ first: true }));
      },
    });
    const second = definePlugin({
      name: "manager-extension-b",
      install(ctx) {
        ctx.manager.extend("tools", () => ({ second: true }));
      },
    });

    expect(() => MachineManager({ counter: baseMachine() }, { plugins: [first, second] as const })).toThrow(
      LiteFsmError,
    );
    expect(() => MachineManager({ counter: baseMachine() }, { plugins: [first, second] as const })).toThrow(
      "[lite-fsm] duplicate manager extension key 'tools'.",
    );
  });

  it("запрещает manager extension перезаписать core manager method", () => {
    const plugin = definePlugin({
      name: "replace-manager-method",
      install(ctx) {
        ctx.manager.extend("transition", () => () => undefined);
      },
    });

    expect(() => MachineManager({ counter: baseMachine() }, { plugins: [plugin] as const })).toThrow(LiteFsmError);
    expect(() => MachineManager({ counter: baseMachine() }, { plugins: [plugin] as const })).toThrow(
      "[lite-fsm] plugin 'replace-manager-method' cannot override core manager method 'transition'.",
    );
  });

  it("no-op manager extension registry не меняет manager shape", () => {
    const plugin = definePlugin({
      name: "noop-manager-extension",
      install(ctx) {
        expect(Object.keys(ctx)).toEqual(["actions", "storage", "dispatch", "routing", "manager", "deps"]);
      },
    });
    const plain = MachineManager({ counter: baseMachine() });
    const manager = MachineManager({ counter: baseMachine() }, { plugins: [plugin] as const });

    expect(Object.keys(manager)).toEqual(Object.keys(plain));
    expect("entities" in manager).toBe(false);
    expect(manager.getState()).toEqual(plain.getState());

    manager.transition({ type: "TOUCH" });

    expect(manager.getState().counter).toEqual({ state: "idle", context: { count: 1 } });
  });
});
