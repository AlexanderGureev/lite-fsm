import { describe, expect, test } from "tstyche";
import {
  defineMachine,
  type AnyEvent,
  type FSMEvent,
  type IMachine,
  type IMachineManager,
  Machine,
  MachineManager,
  type MachineReducer,
  type MachineConfig,
  type MachineManagerDehydratedSnapshot,
  type MachineManagerRuntimeSnapshot,
  type MachineManagerSnapshot,
  type Middleware,
  type MachineEvents,
  type MachineDependencies,
  type MachineStore,
  type ManagerAction,
  type ManagerCommitAction,
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

describe("Machine(cfg) — чистая фабрика", () => {
  test("возвращает IMachine<C, T, P, D>", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    expect(m).type.toBe<IMachine<CounterCfg, CounterCtx, CounterEvt, CounterDeps>>();
  });

  test("экспортирует ровно { transition, invokeEffect, config }", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    type _Keys = Assert<Equal<keyof typeof m, "transition" | "invokeEffect" | "config">>;
  });

  test("config сохраняет исходный CFG literal", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    expect(m.config).type.toBe<CounterCfg>();
  });

  test("transition возвращает суженный StateType", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    const result = m.transition({ state: "idle", context: { count: 0 } }, { type: "START" });
    expect(result).type.toBe<{ state: "idle" | "running"; context: CounterCtx }>();
  });

  test("transition отклоняет неизвестный state literal", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    m.transition(
      // @ts-expect-error!
      { state: "missing", context: { count: 0 } },
      { type: "START" },
    );
  });

  test("invokeEffect требует полные merged deps и возвращает Promise<void>", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    const p = m.invokeEffect("idle", "running", {
      clock: () => 0,
      transition: (a) => a,
      action: { type: "START" },
      condition: async () => true,
    });
    expect(p).type.toBe<Promise<void>>();
  });

  test("invokeEffect отклоняет неполные deps", () => {
    const m = Machine<CounterCfg, CounterCtx, CounterEvt["type"], CounterEvt, CounterDeps>(counterCfg);
    // @ts-expect-error!
    m.invokeEffect("idle", "running", {
      transition: (a) => a,
      action: { type: "START" },
      condition: async () => true,
    });
  });
});

describe("stateful runtime для defineMachine(opts).create(cfg)", () => {
  test("возвращает API с transition, getState, onTransition, addMiddleware", () => {
    const runtime = defineMachine<CounterEvt, CounterDeps>({
      dependencies: { clock: () => 0 },
    }).create(counterCfg);
    type _Keys = Assert<
      Equal<keyof typeof runtime, "transition" | "getState" | "onTransition" | "addMiddleware">
    >;
  });

  test("getState возвращает StateType<C, T>", () => {
    const runtime = defineMachine<CounterEvt, CounterDeps>({
      dependencies: { clock: () => 0 },
    }).create(counterCfg);
    expect(runtime.getState()).type.toBe<StateType<CounterCfg, CounterCtx>>();
  });

  test("сигнатура transition равна (action: P) => P", () => {
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

  test("onTransition принимает Subscriber<C, T, P>", () => {
    const runtime = defineMachine<CounterEvt, CounterDeps>({
      dependencies: { clock: () => 0 },
    }).create(counterCfg);
    expect(runtime.onTransition).type.toBe<(cb: Subscriber<CounterCfg, CounterCtx, CounterEvt>) => () => void>();
  });

  test("addMiddleware вариативный и принимает Middleware<StateType<C,T>, P>", () => {
    const runtime = defineMachine<CounterEvt, CounterDeps>({
      dependencies: { clock: () => 0 },
    }).create(counterCfg);
    expect(runtime.addMiddleware).type.toBe<
      (...middleware: Middleware<StateType<CounterCfg, CounterCtx>, CounterEvt>[]) => void
    >();
  });

  test("опция dependencies должна соответствовать D", () => {
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

  test("onError принимает ошибку любого типа", () => {
    defineMachine<CounterEvt, CounterDeps>({
      dependencies: { clock: () => 0 },
      onError: (err: unknown) => {
        expect(err).type.toBe<unknown>();
      },
    });
  });

  test("по умолчанию dependencies не требуются, когда D пустой", () => {
    const runtime = defineMachine<CounterEvt>({}).create({
      ...counterCfg,
    } as MachineConfig<CounterCfg, CounterCtx, CounterEvt>);
    void runtime;
  });

  test("overload без options работает", () => {
    const factory = defineMachine<CounterEvt, CounterDeps>();
    expect(factory).type.toHaveProperty("create");
  });
});

describe("MachineManager(machines, opts?)", () => {
  const machines = {
    counter: counterCfg,
  };
  type Machines = typeof machines;

  test("возвращает IMachineManager<S, P> с выведенным S", () => {
    const manager = MachineManager(machines);
    expect(manager).type.toBe<IMachineManager<Machines, MachineEvents<Machines>>>();
  });

  test("явные generics фиксируют переданный event union", () => {
    const manager = MachineManager<Machines, CounterEvt>(machines);
    expect(manager).type.toBe<IMachineManager<Machines, CounterEvt>>();
  });

  test("экспортирует ровно 9 ключей", () => {
    const manager = MachineManager(machines);
    type _Keys = Assert<
      Equal<
        keyof typeof manager,
        | "transition"
        | "getState"
        | "getSnapshot"
        | "getHydratedState"
        | "hydrate"
        | "dehydrate"
        | "onTransition"
        | "replaceReducer"
        | "setDependencies"
      >
    >;
  });

  test("snapshot-методы раскрывают runtime и dehydrated envelopes", () => {
    const manager = MachineManager<Machines, CounterEvt>(machines);
    expect(manager.getSnapshot()).type.toBe<MachineManagerRuntimeSnapshot<Machines>>();
    expect(manager.getHydratedState).type.toBe<
      (
        snapshot: MachineManagerSnapshot<Machines>,
        opts?: { strategy?: "replace" | "merge"; baseState?: MachinesState<Machines> },
      ) => MachinesState<Machines>
    >();
    expect(manager.dehydrate()).type.toBe<MachineManagerDehydratedSnapshot<Machines>>();
    expect(manager.dehydrate({ machines: ["counter"] }).machines.counter).type.toBe<StateType<CounterCfg, CounterCtx>>();
    expect(manager.dehydrate({}).machines.counter).type.toBe<StateType<CounterCfg, CounterCtx>>();
    expect(manager.hydrate).type.toBe<
      (snapshot: MachineManagerSnapshot<Machines>, opts?: { strategy?: "replace" | "merge" }) => void
    >();
  });

  test("пустая machines map по умолчанию даёт IMachineManager с never events", () => {
    const empty = MachineManager({});
    expect(empty).type.toBe<IMachineManager<{}, never>>();
  });

  test("опция middleware требует совместимую пару state/event", () => {
    const mw: Middleware<MachinesState<Machines>, CounterEvt> = (api) => (next) => (action) => {
      expect(api.getState()).type.toBe<MachinesState<Machines>>();
      api.onTransition((_prev, _current, committed) => {
        expect(committed).type.toBe<ManagerCommitAction<MachineStore, AnyEvent>>();
      });
      return next(action);
    };
    MachineManager<Machines, CounterEvt>(machines, { middleware: [mw] });

    const wrongMw: Middleware<{ wrong: true }, CounterEvt> = () => (next) => (action) => next(action);
    MachineManager<Machines, CounterEvt>(machines, {
      // @ts-expect-error!
      middleware: [wrongMw],
    });
  });

  test("опция onError типизирована permissive", () => {
    MachineManager<Machines, CounterEvt>(machines, {
      onError: (err: unknown) => {
        expect(err).type.toBe<unknown>();
      },
    });
  });

  test("setDependencies принимает MachineDependencies<S> и updater", () => {
    const manager = MachineManager<Machines, CounterEvt>(machines);
    expect<MachineDependencies<Machines>>().type.toBe<CounterDeps>();
    expect(manager.setDependencies).type.toBe<
      (d: CounterDeps | ((deps: CounterDeps) => CounterDeps)) => void
    >();
    manager.setDependencies({ clock: () => 0 });
    manager.setDependencies((deps: CounterDeps) => ({ ...deps, clock: () => deps.clock() + 1 }));
  });

  test("transition отклоняет events, которых нет в P", () => {
    const manager = MachineManager<Machines, CounterEvt>(machines);
    expect(manager.transition).type.toBe<(payload: ManagerAction<CounterEvt>) => ManagerAction<CounterEvt>>();
    manager.transition({ type: "INC", payload: { amount: 1 } });
    // @ts-expect-error!
    manager.transition({ type: "START" }, {});
    // @ts-expect-error!
    manager.transition({ type: "UNKNOWN" });
  });
});
