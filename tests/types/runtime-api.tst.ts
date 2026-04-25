import { describe, expect, test } from "tstyche";
import {
  defineMachine,
  type FSMEvent,
  type IMachine,
  type IMachineManager,
  Machine,
  MachineManager,
  type MachineReducer,
  type MachineConfig,
  type Middleware,
  type MachineEvents,
  type MachineDependencies,
  type StateType,
  type Subscriber,
  type MachinesState,
} from "lite-fsm";

import type { Assert, Equal } from "./_helpers";

type CounterCfg = {
  idle: { INC: "running"; START: "running" };
  running: { STOP: "idle" };
};

type CounterEvt = FSMEvent<"INC", { amount: number }> | FSMEvent<"START"> | FSMEvent<"STOP">;
type CounterCtx = { count: number };
type CounterDeps = { clock: () => number };

const counterReducer: MachineReducer<CounterCfg, CounterEvt, CounterCtx> = (state, action, meta) => {
  if (action.type === "INC") {
    return { state: state.state, context: { count: state.context.count + action.payload.amount } };
  }
  return { state: meta.nextState, context: state.context };
};

const counterCfg = {
  config: { idle: { INC: "running", START: "running" }, running: { STOP: "idle" } } as CounterCfg,
  initialState: "idle" as const,
  initialContext: { count: 0 } as CounterCtx,
  reducer: counterReducer,
  effects: {
    running: ({ clock }) => {
      void clock();
    },
  },
} satisfies MachineConfig<CounterCfg, CounterCtx, CounterEvt, CounterDeps>;

describe("Machine(cfg) — pure factory", () => {
  test("returns an IMachine<C, T, P, D>", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    expect(m).type.toBe<IMachine<CounterCfg, CounterCtx, CounterEvt, CounterDeps>>();
  });

  test("exposes exactly { transition, invokeEffect, config }", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    type _Keys = Assert<Equal<keyof typeof m, "transition" | "invokeEffect" | "config">>;
  });

  test("config preserves the original CFG literal", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    expect(m.config).type.toBe<CounterCfg>();
  });

  test("transition returns narrowed StateType", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    const result = m.transition({ state: "idle", context: { count: 0 } }, { type: "START" });
    expect(result).type.toBe<{ state: "idle" | "running"; context: CounterCtx }>();
  });

  test("transition rejects unknown state literal", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    m.transition(
      // @ts-expect-error!
      { state: "missing", context: { count: 0 } },
      { type: "START" },
    );
  });

  test("invokeEffect demands full merged deps and returns Promise<void>", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    const p = m.invokeEffect("idle", "running", {
      clock: () => 0,
      transition: (a) => a,
      action: { type: "START" },
      condition: async () => true,
    });
    expect(p).type.toBe<Promise<void>>();
  });

  test("invokeEffect rejects partial deps", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    // @ts-expect-error!
    m.invokeEffect("idle", "running", {
      transition: (a) => a,
      action: { type: "START" },
      condition: async () => true,
    });
  });
});

describe("defineMachine(opts).create(cfg) — stateful runtime", () => {
  test("returns an API with transition, getState, onTransition, addMiddleware", () => {
    const runtime = defineMachine<CounterEvt, CounterDeps>({
      dependencies: { clock: () => 0 },
    }).create(counterCfg);
    type _Keys = Assert<
      Equal<keyof typeof runtime, "transition" | "getState" | "onTransition" | "addMiddleware">
    >;
  });

  test("getState returns StateType<C, T>", () => {
    const runtime = defineMachine<CounterEvt, CounterDeps>({
      dependencies: { clock: () => 0 },
    }).create(counterCfg);
    expect(runtime.getState()).type.toBe<StateType<CounterCfg, CounterCtx>>();
  });

  test("transition signature is (action: P) => P", () => {
    const runtime = defineMachine<CounterEvt, CounterDeps>({
      dependencies: { clock: () => 0 },
    }).create(counterCfg);
    expect(runtime.transition).type.toBe<(action: CounterEvt) => CounterEvt>();
    runtime.transition({ type: "INC", payload: { amount: 1 } });
    runtime.transition({ type: "START" });
    runtime.transition({ type: "STOP" });
    // @ts-expect-error!
    runtime.transition({ type: "INC" });
    // @ts-expect-error!
    runtime.transition({ type: "UNKNOWN" });
  });

  test("onTransition accepts Subscriber<C, T, P>", () => {
    const runtime = defineMachine<CounterEvt, CounterDeps>({
      dependencies: { clock: () => 0 },
    }).create(counterCfg);
    expect(runtime.onTransition).type.toBe<(cb: Subscriber<CounterCfg, CounterCtx, CounterEvt>) => () => void>();
  });

  test("addMiddleware is variadic and accepts Middleware<StateType<C,T>, P>", () => {
    const runtime = defineMachine<CounterEvt, CounterDeps>({
      dependencies: { clock: () => 0 },
    }).create(counterCfg);
    expect(runtime.addMiddleware).type.toBe<
      (...middleware: Middleware<StateType<CounterCfg, CounterCtx>, CounterEvt>[]) => void
    >();
  });

  test("dependencies option is required to match D", () => {
    defineMachine<CounterEvt, CounterDeps>({
      // @ts-expect-error!
      dependencies: {},
    });

    defineMachine<CounterEvt, CounterDeps>({
      dependencies: {
        // @ts-expect-error!
        clock: "wrong",
      },
    });
  });

  test("onError receives any", () => {
    defineMachine<CounterEvt, CounterDeps>({
      dependencies: { clock: () => 0 },
      onError: (err: unknown) => {
        expect(err).type.toBe<unknown>();
      },
    });
  });

  test("defaults: no dependencies required when D is empty", () => {
    const runtime = defineMachine<CounterEvt>({}).create({
      ...counterCfg,
    } as MachineConfig<CounterCfg, CounterCtx, CounterEvt>);
    void runtime;
  });

  test("no options overload works", () => {
    const factory = defineMachine<CounterEvt, CounterDeps>();
    expect(factory).type.toHaveProperty("create");
  });
});

describe("MachineManager(machines, opts?)", () => {
  const machines = {
    counter: counterCfg,
  };
  type Machines = typeof machines;

  test("returns IMachineManager<S, P> with S inferred", () => {
    const manager = MachineManager(machines);
    expect(manager).type.toBe<IMachineManager<Machines, MachineEvents<Machines>>>();
  });

  test("explicit generics enforce given event union", () => {
    const manager = MachineManager<Machines, CounterEvt>(machines);
    expect(manager).type.toBe<IMachineManager<Machines, CounterEvt>>();
  });

  test("exposes exactly 5 keys", () => {
    const manager = MachineManager(machines);
    type _Keys = Assert<
      Equal<keyof typeof manager, "transition" | "getState" | "onTransition" | "replaceReducer" | "setDependencies">
    >;
  });

  test("empty machines map yields IMachineManager with never events by default", () => {
    const empty = MachineManager({});
    expect(empty).type.toBe<IMachineManager<{}, never>>();
  });

  test("middleware option requires compatible state/event pair", () => {
    const mw: Middleware<MachinesState<Machines>, CounterEvt> = (api) => (next) => (action) => {
      expect(api.getState()).type.toBe<MachinesState<Machines>>();
      return next(action);
    };
    MachineManager<Machines, CounterEvt>(machines, { middleware: [mw] });

    const wrongMw: Middleware<{ wrong: true }, CounterEvt> = () => (next) => (action) => next(action);
    MachineManager<Machines, CounterEvt>(machines, {
      // @ts-expect-error!
      middleware: [wrongMw],
    });
  });

  test("onError option is typed permissively", () => {
    MachineManager<Machines, CounterEvt>(machines, {
      onError: (err: unknown) => {
        expect(err).type.toBe<unknown>();
      },
    });
  });

  test("setDependencies accepts MachineDependencies<S> and updater", () => {
    const manager = MachineManager<Machines, CounterEvt>(machines);
    expect<MachineDependencies<Machines>>().type.toBe<CounterDeps>();
    expect(manager.setDependencies).type.toBe<
      (d: CounterDeps | ((deps: CounterDeps) => CounterDeps)) => void
    >();
    manager.setDependencies({ clock: () => 0 });
    manager.setDependencies((deps: CounterDeps) => ({ ...deps, clock: () => deps.clock() + 1 }));
  });

  test("transition rejects events not in P", () => {
    const manager = MachineManager<Machines, CounterEvt>(machines);
    manager.transition({ type: "INC", payload: { amount: 1 } });
    // @ts-expect-error!
    manager.transition({ type: "UNKNOWN" });
  });
});
