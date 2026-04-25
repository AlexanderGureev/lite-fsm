import { describe, expect, test } from "tstyche";
import {
  createConfig,
  createMachine,
  type CFG,
  type DefaultDeps,
  type FSMEvent,
  type MachineConfig,
  type MachineEffect,
  type MachineReducer,
  type StateType,
  type TypedCreateConfigFn,
  type TypedCreateMachineFn,
  type TypedCreateReducerFn,
} from "lite-fsm";

import type { Assert, Equal, IsNever } from "./_helpers";

type FlowEvent =
  | FSMEvent<"START">
  | FSMEvent<"RESOLVE", { payload: number }>
  | FSMEvent<"REJECT", { error: string }>
  | FSMEvent<"STOP">
  | FSMEvent<"RESET">;

type FlowContext = { runs: number; error: string | null };
type FlowDeps = { logger: (e: FlowEvent) => void };

const createFlowConfig: TypedCreateConfigFn<FlowEvent> = createConfig;
const createFlowMachine: TypedCreateMachineFn<FlowEvent, FlowDeps> = createMachine;

describe("CFG structural constraints", () => {
  test("empty CFG is assignable", () => {
    const empty = createFlowConfig({});
    expect<typeof empty>().type.toBe<object>();
    expect<typeof empty>().type.toBeAssignableTo<CFG<typeof empty, FlowEvent>>();
  });

  test("wildcard-only CFG is accepted and exposes the wildcard key", () => {
    const wildcardOnly = createFlowConfig({
      "*": { RESET: "idle" },
      idle: {},
    });
    expect(wildcardOnly["*"]).type.toBe<{ RESET: "idle" }>();
  });

  test("self-transition via null is accepted for every event", () => {
    const selfOnly = createFlowConfig({
      idle: { START: null, RESOLVE: null, REJECT: null, STOP: null, RESET: null },
    });
    expect(selfOnly.idle.START).type.toBe<null>();
    expect(selfOnly.idle.RESOLVE).type.toBe<null>();
  });

  test("partial event maps are allowed (not every event must be listed)", () => {
    const partial = createFlowConfig({
      idle: { START: "running" },
      running: {},
    });
    expect(partial.idle.START).type.toBe<"running">();
  });

  test("state may point to itself by name", () => {
    const loop = createFlowConfig({
      idle: { START: "idle" },
    });
    expect(loop.idle.START).type.toBe<"idle">();
  });

  test("unknown event names are rejected", () => {
    createFlowConfig({
      idle: {
        // @ts-expect-error!
        UNKNOWN: "running",
      },
    });
  });

  test("target state must be declared in the map or be null", () => {
    createFlowConfig({
      idle: {
        // @ts-expect-error!
        START: "missing",
      },
    });
  });

  test("wildcard is NOT a valid transition target", () => {
    createFlowConfig({
      idle: {
        // @ts-expect-error!
        START: "*",
      },
    });
  });

  test("numeric or symbol targets are rejected", () => {
    createFlowConfig({
      idle: {
        // @ts-expect-error!
        START: 1,
      },
    });
    createFlowConfig({
      idle: {
        // @ts-expect-error!
        START: Symbol(),
      },
    });
  });

  test("CFG type parameter K controls allowed target states", () => {
    type Map = { idle?: { X: "done" | null }; done?: { X: null } };
    type _IsCfg = Assert<
      Equal<CFG<Map, FSMEvent<"X">, "idle" | "done">, CFG<Map, FSMEvent<"X">, "idle" | "done">>
    >;
  });
});

describe("MachineConfig minimal shapes", () => {
  test("accepts minimal config without reducer and without effects", () => {
    type MinEvent = FSMEvent<"E">;
    const min: MachineConfig<{ a: { E: "b" }; b: {} }, { v: number }, MinEvent> = {
      config: { a: { E: "b" }, b: {} },
      initialState: "a",
      initialContext: { v: 0 },
    };
    expect(min.reducer).type.toBe<MachineReducer<{ a: { E: "b" }; b: {} }, MinEvent, { v: number }> | undefined>();
    expect(min.effects).type.toBe<
      { a?: MachineEffect<"a", { a: { E: "b" }; b: {} }, MinEvent, {}>; b?: MachineEffect<"b", { a: { E: "b" }; b: {} }, MinEvent, {}>; "*"?: MachineEffect<"*", { a: { E: "b" }; b: {} }, MinEvent, {}> } | undefined
    >();
  });

  test("accepts config with empty effects object", () => {
    const machine = createFlowMachine({
      config: { idle: { START: "running" }, running: {} },
      initialState: "idle",
      initialContext: { runs: 0, error: null },
      effects: {},
    });
    expect(machine.effects).type.toBeAssignableTo<
      Record<string, MachineEffect<any, typeof machine.config, FlowEvent, FlowDeps> | undefined> | undefined
    >();
  });

  test("accepts config with only wildcard effect", () => {
    const machine = createFlowMachine({
      config: { idle: { START: "running" }, running: {} },
      initialState: "idle",
      initialContext: { runs: 0, error: null },
      effects: {
        "*": ({ action }) => {
          expect(action).type.toBe<FlowEvent>();
        },
      },
    });
    expect(machine.effects).type.toBeAssignableTo<
      { "*"?: MachineEffect<"*", typeof machine.config, FlowEvent, FlowDeps> } | undefined
    >();
  });

  test("rejects initialState === \"*\" (wildcard is not a public state)", () => {
    createFlowMachine({
      config: { idle: {} },
      // @ts-expect-error!
      initialState: "*",
      initialContext: { runs: 0, error: null },
    });
  });

  test("rejects initialState not present in config map", () => {
    createFlowMachine({
      config: { idle: {} },
      // @ts-expect-error!
      initialState: "missing",
      initialContext: { runs: 0, error: null },
    });
  });

  test("rejects initialContext with wrong shape (checked via satisfies)", () => {
    const badContext = {
      // @ts-expect-error!
      runs: "wrong",
      error: null,
    } satisfies FlowContext;
    void badContext;
  });

  test("rejects unknown effect key (not in config and not wildcard)", () => {
    createFlowMachine({
      config: { idle: {} },
      initialState: "idle",
      initialContext: { runs: 0, error: null },
      effects: {
        // @ts-expect-error!
        missing: () => {},
      },
    });
  });

  test("MachineConfig shape exposes all expected keys", () => {
    type M = MachineConfig<{ a: {} }, { x: 1 }, FSMEvent<"E">>;
    type _Keys = Assert<Equal<keyof M, "config" | "initialState" | "initialContext" | "reducer" | "effects">>;
  });
});

describe("DefaultDeps structural contract", () => {
  type Cfg = {
    "*": { RESET: "idle" };
    idle: { START: "running" };
    running: { STOP: "idle"; TICK: null };
    done: {};
  };
  type Evt = FSMEvent<"START"> | FSMEvent<"STOP"> | FSMEvent<"TICK"> | FSMEvent<"RESET">;

  test("has exactly 3 keys: transition, action, condition", () => {
    type _Keys = Assert<Equal<keyof DefaultDeps<"running", Cfg, Evt>, "transition" | "action" | "condition">>;
  });

  test("transition signature echoes the event type", () => {
    expect<DefaultDeps<"running", Cfg, Evt>["transition"]>().type.toBe<(data: Evt) => Evt>();
    expect<DefaultDeps<"*", Cfg, Evt>["transition"]>().type.toBe<(data: Evt) => Evt>();
  });

  test("condition signature is predicate → Promise<boolean>", () => {
    expect<DefaultDeps<"running", Cfg, Evt>["condition"]>().type.toBe<
      (predicate: (a: Evt) => boolean) => Promise<boolean>
    >();
  });

  test("action narrows by incoming events that target the state", () => {
    expect<DefaultDeps<"running", Cfg, Evt>["action"]>().type.toBe<Extract<Evt, { type: "START" }>>();
    expect<DefaultDeps<"idle", Cfg, Evt>["action"]>().type.toBe<Extract<Evt, { type: "STOP" | "RESET" }>>();
    expect<DefaultDeps<"*", Cfg, Evt>["action"]>().type.toBe<Evt>();
  });

  test("orphan state (no incoming transitions) narrows action to never", () => {
    type _OrphanActionIsNever = Assert<IsNever<DefaultDeps<"done", Cfg, Evt>["action"]>>;
  });

  test("union of target states collects events that hit either", () => {
    type TwoPaths = {
      a: { X: "b" };
      b: { Y: "c" };
      c: {};
    };
    type TwoEvents = FSMEvent<"X"> | FSMEvent<"Y">;
    expect<DefaultDeps<"b", TwoPaths, TwoEvents>["action"]>().type.toBe<FSMEvent<"X">>();
    expect<DefaultDeps<"c", TwoPaths, TwoEvents>["action"]>().type.toBe<FSMEvent<"Y">>();
  });
});

describe("MachineReducer return contract", () => {
  type Cfg = { idle: { INC: null; NEXT: "done" }; done: {} };
  type Evt = FSMEvent<"INC", { amount: number }> | FSMEvent<"NEXT">;
  type Ctx = { count: number };

  const createEvtReducer: TypedCreateReducerFn<Evt> = (r) => r;

  test("return type is `{ state, context } | void` (void is valid for immer)", () => {
    type R = MachineReducer<Cfg, Evt, Ctx>;
    type _Ret = Assert<Equal<ReturnType<R>, { state: "idle" | "done"; context: Ctx } | void>>;
  });

  test("reducer may return void (mutating style for immer)", () => {
    const voidReducer = createEvtReducer<Cfg, Ctx>((state, action, _meta) => {
      if (action.type === "INC") {
        state.context.count += action.payload.amount;
        return;
      }
    });
    expect(voidReducer).type.toBeAssignableTo<MachineReducer<Cfg, Evt, Ctx>>();
  });

  test("reducer may return next state object", () => {
    const nextReducer = createEvtReducer<Cfg, Ctx>((state, action, meta) => {
      if (action.type === "INC") {
        return { state: state.state, context: { count: state.context.count + action.payload.amount } };
      }
      return { state: meta.nextState, context: state.context };
    });
    expect(nextReducer).type.toBeAssignableTo<MachineReducer<Cfg, Evt, Ctx>>();
  });

  test("reducer may mix void and object returns in different branches", () => {
    const mixed = createEvtReducer<Cfg, Ctx>((state, action, meta) => {
      if (action.type === "INC") {
        state.context.count += action.payload.amount;
        return;
      }
      return { state: meta.nextState, context: state.context };
    });
    expect(mixed).type.toBeAssignableTo<MachineReducer<Cfg, Evt, Ctx>>();
  });

  test("reducer meta exposes nextState typed by target literal union", () => {
    createEvtReducer<Cfg, Ctx>((_state, _action, meta) => {
      expect(meta.nextState).type.toBe<"idle" | "done">();
      expect(meta.config).type.toBe<Cfg>();
    });
  });

  test("returning non-state object is rejected", () => {
    // @ts-expect-error!
    createEvtReducer<Cfg, Ctx>((state, action) => {
      if (action.type === "INC") {
        return { state: state.state, context: { total: action.payload.amount } };
      }
      return state;
    });
  });

  test("returning invalid state literal is rejected", () => {
    // @ts-expect-error!
    createEvtReducer<Cfg, Ctx>((state) => {
      return { state: "nonexistent", context: state.context };
    });
  });

  test("returning wildcard as state is rejected", () => {
    // @ts-expect-error!
    createEvtReducer<Cfg, Ctx>((state) => {
      return { state: "*", context: state.context };
    });
  });

  test("reducer params are strictly typed (state, action, meta)", () => {
    type R = MachineReducer<Cfg, Evt, Ctx>;
    expect<Parameters<R>[0]>().type.toBe<StateType<Cfg, Ctx>>();
    expect<Parameters<R>[1]>().type.toBe<Evt>();
    expect<Parameters<R>[2]>().type.toBe<{ nextState: "idle" | "done"; config: Cfg }>();
  });
});

describe("MachineEffect return type", () => {
  type Cfg = { idle: { GO: "done" }; done: {} };
  type Evt = FSMEvent<"GO">;

  test("return type is `Promise<void> | void` (sync and async allowed)", () => {
    type E = MachineEffect<"done", Cfg, Evt>;
    type _Ret = Assert<Equal<ReturnType<E>, Promise<void> | void>>;
  });

  test("sync effect (void) is accepted", () => {
    const syncEffect: MachineEffect<"done", Cfg, Evt> = ({ action }) => {
      void action;
    };
    expect(syncEffect).type.toBe<MachineEffect<"done", Cfg, Evt>>();
  });

  test("async effect (Promise<void>) is accepted", () => {
    const asyncEffect: MachineEffect<"done", Cfg, Evt> = async ({ action }) => {
      void action;
    };
    expect(asyncEffect).type.toBe<MachineEffect<"done", Cfg, Evt>>();
  });

  test("effect receives DefaultDeps merged with user deps", () => {
    type Deps = { api: { load: () => Promise<void> } };
    const effect: MachineEffect<"done", Cfg, Evt, Deps> = ({ action, transition, condition, api }) => {
      expect(action).type.toBe<FSMEvent<"GO">>();
      expect(transition).type.toBe<(data: Evt) => Evt>();
      expect(condition).type.toBe<(predicate: (a: Evt) => boolean) => Promise<boolean>>();
      expect(api.load).type.toBe<() => Promise<void>>();
    };
    expect(effect).type.toBe<MachineEffect<"done", Cfg, Evt, Deps>>();
  });

  test("user deps are merged with DefaultDeps via intersection", () => {
    type Deps = { api: string; clock: () => number };
    const effect: MachineEffect<"done", Cfg, Evt, Deps> = ({ api, clock, transition, action, condition }) => {
      expect(api).type.toBe<string>();
      expect(clock).type.toBe<() => number>();
      expect(transition).type.toBe<(data: Evt) => Evt>();
      expect(action).type.toBe<FSMEvent<"GO">>();
      expect(condition).type.toBe<(predicate: (a: Evt) => boolean) => Promise<boolean>>();
    };
    expect(effect).type.toBe<MachineEffect<"done", Cfg, Evt, Deps>>();
  });

  test("empty user deps (D = {}) keeps only DefaultDeps keys", () => {
    type E = MachineEffect<"done", Cfg, Evt>;
    const effect: E = ({ action, transition, condition }) => {
      expect(action).type.toBe<FSMEvent<"GO">>();
      expect(transition).type.toBe<(data: Evt) => Evt>();
      expect(condition).type.toBe<(predicate: (a: Evt) => boolean) => Promise<boolean>>();
    };
    expect(effect).type.toBe<E>();
  });

  test("wildcard effect receives the full event union", () => {
    type Wider = FSMEvent<"GO"> | FSMEvent<"STOP">;
    const wild: MachineEffect<"*", { idle: { GO: "done" }; done: { STOP: "idle" } }, Wider> = ({ action }) => {
      expect(action).type.toBe<Wider>();
    };
    expect(wild).type.toBe<MachineEffect<"*", { idle: { GO: "done" }; done: { STOP: "idle" } }, Wider>>();
  });
});
