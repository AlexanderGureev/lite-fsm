import { describe, expect, test } from "tstyche";
import {
  createConfig,
  createEffect,
  createMachine,
  createReducer,
  type AnyEvent,
  type FSMEvent,
  type MachineConfig,
  type MachineEffect,
  type MachineReducer,
  type TypedCreateConfigFn,
  type TypedCreateEffectFn,
  type TypedCreateMachineFn,
  type TypedCreateReducerFn,
} from "lite-fsm";

import type { Assert, Equal, IsNever } from "./_helpers";

type Ping = FSMEvent<"PING">;
type Save = FSMEvent<"SAVE", { id: string }>;
type Evt = Ping | Save;

type Cfg = {
  idle: { PING: "busy"; SAVE: "busy" };
  busy: {};
};

type Ctx = { calls: number };
type Deps = { log: (s: string) => void };

describe("createConfig (untyped)", () => {
  test("acts as identity on CFG-compatible literal", () => {
    const cfg = createConfig({
      idle: { PING: "busy", SAVE: "busy" },
      busy: {},
    });
    expect(cfg).type.toBe<{
      idle: { PING: "busy"; SAVE: "busy" };
      busy: {};
    }>();
  });

  test("rejects invalid target state", () => {
    createConfig({
      // @ts-expect-error!
      idle: {
        PING: "missing",
      },
      busy: {},
    });
  });

  test("accepts null transition (dead-end)", () => {
    const cfg = createConfig({
      idle: { PING: null },
    });
    expect(cfg).type.toBe<{ idle: { PING: null } }>();
  });
});

describe("createReducer (untyped)", () => {
  test("is identity: returns same reducer type", () => {
    const reducer = createReducer<Cfg, Ctx>((state, action, meta) => {
      expect(state.state).type.toBe<"idle" | "busy">();
      expect(meta.nextState).type.toBe<"idle" | "busy">();
      expect(action).type.toBe<AnyEvent>();
      return { state: meta.nextState, context: state.context };
    });
    expect(reducer).type.toBe<MachineReducer<Cfg, AnyEvent, Ctx>>();
  });

  test("rejects wrong return state", () => {
    // @ts-expect-error!
    createReducer<Cfg, Ctx>((state) => ({ state: "missing", context: state.context }));
  });

  test("allows void reducer return", () => {
    const reducer = createReducer<Cfg, Ctx>(() => {});
    expect(reducer).type.toBe<MachineReducer<Cfg, AnyEvent, Ctx>>();
  });
});

describe("createMachine (untyped)", () => {
  test("returns MachineConfig with preserved generics", () => {
    const machine = createMachine<Evt, Deps, Cfg, Ctx>({
      config: { idle: { PING: "busy", SAVE: "busy" }, busy: {} },
      initialState: "idle",
      initialContext: { calls: 0 },
    });
    expect(machine).type.toBe<MachineConfig<Cfg, Ctx, Evt, Deps>>();
  });

  test("without explicit generics still infers C and T from literal", () => {
    const machine = createMachine({
      config: { idle: {} },
      initialState: "idle",
      initialContext: { calls: 0 },
    });
    expect(machine.initialState).type.toBe<"idle">();
    expect(machine.initialContext).type.toBe<{ calls: number }>();
    expect(machine.config).type.toBe<{ idle: {} }>();
  });

  test("rejects invalid initialState", () => {
    createMachine<Evt, Deps, Cfg, Ctx>({
      config: { idle: { PING: "busy", SAVE: "busy" }, busy: {} },
      // @ts-expect-error!
      initialState: "missing",
      initialContext: { calls: 0 },
    });
  });

  test("rejects initialState = wildcard", () => {
    createMachine<Evt, Deps, Cfg, Ctx>({
      config: { idle: { PING: "busy", SAVE: "busy" }, busy: {} },
      // @ts-expect-error!
      initialState: "*",
      initialContext: { calls: 0 },
    });
  });
});

describe("createEffect (untyped)", () => {
  test("returns MachineEffect bound to state key", () => {
    const fx = createEffect<Evt, Deps, Cfg, "busy">({
      effect: ({ action, log }) => {
        expect(action).type.toBe<Ping | Save>();
        expect(log).type.toBe<(s: string) => void>();
      },
    });
    expect(fx).type.toBe<MachineEffect<"busy", Cfg, Evt, Deps>>();
  });

  test("accepts type: 'latest' and cancelFn", () => {
    const fx = createEffect<Evt, Deps, Cfg, "busy">({
      type: "latest",
      effect: () => {},
      cancelFn: ({ action }) => {
        expect(action).type.toBe<Ping | Save>();
        return () => false;
      },
    });
    expect(fx).type.toBe<MachineEffect<"busy", Cfg, Evt, Deps>>();
  });

  test("accepts type: 'every'", () => {
    const fx = createEffect<Evt, Deps, Cfg, "idle">({
      type: "every",
      effect: () => {},
    });
    expect(fx).type.toBe<MachineEffect<"idle", Cfg, Evt, Deps>>();
  });

  test("rejects unknown type literal", () => {
    createEffect<Evt, Deps, Cfg, "busy">({
      // @ts-expect-error!
      type: "once",
      effect: () => {},
    });
  });

  test("wildcard effect receives all actions", () => {
    const fx = createEffect<Evt, Deps, Cfg, "*">({
      effect: ({ action }) => {
        expect(action).type.toBe<Evt>();
      },
    });
    expect(fx).type.toBe<MachineEffect<"*", Cfg, Evt, Deps>>();
  });
});

describe("TypedCreateConfigFn<P>", () => {
  test("narrows accepted transitions to P['type']", () => {
    const typed: TypedCreateConfigFn<Ping> = createConfig;
    const cfg = typed({ idle: { PING: null } });
    expect(cfg).type.toBe<{ idle: { PING: null } }>();

    typed({
      idle: {
        // @ts-expect-error!
        SAVE: null,
      },
    });
  });
});

describe("TypedCreateMachineFn<P, D>", () => {
  test("returns MachineConfig<C, T, P, D>", () => {
    const typed: TypedCreateMachineFn<Evt, Deps> = createMachine;
    const machine = typed<Cfg, Ctx>({
      config: { idle: { PING: "busy", SAVE: "busy" }, busy: {} },
      initialState: "idle",
      initialContext: { calls: 0 },
    });
    expect(machine).type.toBe<MachineConfig<Cfg, Ctx, Evt, Deps>>();
  });

  test("infers C and T from cfg properties", () => {
    const typed: TypedCreateMachineFn<Evt> = createMachine;
    const machine = typed({
      config: { idle: { PING: "busy", SAVE: "busy" }, busy: {} },
      initialState: "idle",
      initialContext: { calls: 0 },
    });
    expect(machine.initialState).type.toBe<"idle" | "busy">();
    expect(machine.initialContext).type.toBe<{ calls: number }>();
  });

  test("rejects event types not in P", () => {
    const typed: TypedCreateMachineFn<Ping, Deps> = createMachine;
    typed<Cfg, Ctx>({
      config: {
        idle: {
          PING: "busy",
          // @ts-expect-error!
          SAVE: "busy",
        },
        busy: {},
      },
      initialState: "idle",
      initialContext: { calls: 0 },
    });
  });
});

describe("TypedCreateReducerFn<P>", () => {
  test("reducer body sees narrowed action union", () => {
    const typed: TypedCreateReducerFn<Evt> = createReducer;
    const reducer = typed<Cfg, Ctx>((state, action, meta) => {
      expect(action).type.toBe<Evt>();
      if (action.type === "SAVE") {
        expect(action.payload.id).type.toBe<string>();
      }
      return { state: meta.nextState, context: state.context };
    });
    expect(reducer).type.toBe<MachineReducer<Cfg, Evt, Ctx>>();
  });

  test("rejects return state that is not in Cfg keys", () => {
    const typed: TypedCreateReducerFn<Evt> = createReducer;
    // @ts-expect-error!
    typed<Cfg, Ctx>((state) => ({ state: "missing", context: state.context }));
  });
});

describe("TypedCreateEffectFn<P, D>", () => {
  test("effect signature matches MachineEffect<N, C, P, D>", () => {
    const typed: TypedCreateEffectFn<Evt, Deps> = createEffect;
    const fx = typed<Cfg, "busy">({
      effect: ({ action, log }) => {
        expect(action).type.toBe<Evt>();
        expect(log).type.toBe<(s: string) => void>();
      },
    });
    expect(fx).type.toBe<MachineEffect<"busy", Cfg, Evt, Deps>>();
  });

  test("rejects transition with unknown event", () => {
    type PingCfg = { idle: { PING: "done" }; done: {} };
    const typed: TypedCreateEffectFn<Ping> = createEffect;
    typed<PingCfg, "idle">({
      effect: ({ transition }) => {
        // @ts-expect-error!
        transition({ type: "SAVE", payload: { id: "1" } });
      },
    });
  });
});

describe("factory interop", () => {
  test("result of createReducer is directly assignable to MachineConfig.reducer", () => {
    const reducer = createReducer<Cfg, Ctx>((state, _a, meta) => ({
      state: meta.nextState,
      context: state.context,
    }));
    const _machine: MachineConfig<Cfg, Ctx, Evt, Deps> = {
      config: { idle: { PING: "busy", SAVE: "busy" }, busy: {} },
      initialState: "idle",
      initialContext: { calls: 0 },
      reducer,
    };
    void _machine;
  });

  test("result of createEffect is directly assignable to MachineConfig.effects[key]", () => {
    const fx = createEffect<Evt, Deps, Cfg, "idle">({ effect: () => {} });
    type _Shape = Assert<Equal<typeof fx, MachineEffect<"idle", Cfg, Evt, Deps>>>;
  });
});
