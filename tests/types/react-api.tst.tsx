import React from "react";
import { describe, expect, test } from "tstyche";
import type {
  FSMEvent,
  IMachineManager,
  AnyEvent,
  MachineConfig,
  MachineDependencies,
  MachineStore,
  MachineReducer,
  MachinesState,
  StateType,
  Subscriber,
} from "lite-fsm";
import { MachineManager } from "lite-fsm";
import {
  defineMachine,
  FSMContext,
  type FSMContextType,
  FSMContextProvider,
  type TypedUseMachineHook,
  type TypedUseManagerHook,
  type TypedUseSelectorHook,
  type TypedUseTransitionHook,
  useManager,
  useSelector,
  useTransition,
} from "lite-fsm/react";

import type { Assert, Equal } from "./_helpers";

type Cfg = {
  idle: { PING: "busy" };
  busy: { DONE: "idle" };
};

type Ctx = { requests: number };
type Deps = { api: { call: () => Promise<void> } };
type Evt = FSMEvent<"PING"> | FSMEvent<"DONE">;

const reducer: MachineReducer<Cfg, Evt, Ctx> = (state, _a, meta) => ({
  state: meta.nextState,
  context: state.context,
});

const machineCfg = {
  config: { idle: { PING: "busy" }, busy: { DONE: "idle" } } as Cfg,
  initialState: "idle" as const,
  initialContext: { requests: 0 } as Ctx,
  reducer,
  effects: {
    busy: ({ api }) => {
      void api.call();
    },
  },
} satisfies MachineConfig<Cfg, Ctx, Evt, Deps>;

const store = { x: machineCfg };
type Store = typeof store;
type StoreState = MachinesState<Store>;

describe("FSMContextType<S, P>", () => {
  test("is an alias of IMachineManager<S, P>", () => {
    type FC = FSMContextType<Store, Evt>;
    type MM = IMachineManager<Store, Evt>;
    type _SameShape = Assert<Equal<FC, MM>>;
  });

  test("defaults to safe MachineStore/AnyEvent manager", () => {
    type Default = FSMContextType;
    expect<Default>().type.toBe<IMachineManager<MachineStore, AnyEvent>>();
  });
});

describe("FSMContext", () => {
  test("stores an erased context value; useManager restores the typed manager", () => {
    expect(FSMContext).type.toBe<React.Context<unknown>>();
  });
});

describe("FSMContextProvider", () => {
  test("accepts machineManager of matching IMachineManager<S, P>", () => {
    const manager = MachineManager<Store, Evt>(store);
    const el = (
      <FSMContextProvider<Store, Evt> machineManager={manager}>
        <span>child</span>
      </FSMContextProvider>
    );
    expect(el).type.toBeAssignableTo<React.JSX.Element>();
  });

  test("rejects bogus machineManager shape", () => {
    const el = (
      <FSMContextProvider<Store, Evt>
        // @ts-expect-error!
        machineManager={{ transition: (a: Evt) => a }}
      >
        <span>invalid</span>
      </FSMContextProvider>
    );
    void el;
  });

  test("requires children via PropsWithChildren", () => {
    const manager = MachineManager<Store, Evt>(store);
    const elWithChildren = (
      <FSMContextProvider<Store, Evt> machineManager={manager}>
        <span>child</span>
      </FSMContextProvider>
    );
    expect(elWithChildren).type.toBeAssignableTo<React.JSX.Element>();

    const elWithoutChildren = <FSMContextProvider<Store, Evt> machineManager={manager} />;
    expect(elWithoutChildren).type.toBeAssignableTo<React.JSX.Element>();
  });
});

describe("useManager<S, P>", () => {
  test("returns IMachineManager<S, P>", () => {
    const m = useManager<Store, Evt>();
    expect(m).type.toBe<IMachineManager<Store, Evt>>();
  });

  test("defaults to safe MachineStore/AnyEvent manager", () => {
    const m = useManager();
    expect(m).type.toBe<IMachineManager<MachineStore, AnyEvent>>();
  });

  test("aliasing through TypedUseMachineHook narrows it", () => {
    const typed: TypedUseMachineHook<Store, Evt> = useManager;
    const m = typed();
    expect(m).type.toBe<IMachineManager<Store, Evt>>();
  });

  test("aliasing through TypedUseManagerHook narrows it", () => {
    const typed: TypedUseManagerHook<Store, Evt> = useManager;
    const m = typed();
    expect(m).type.toBe<IMachineManager<Store, Evt>>();
  });
});

describe("useSelector<S, R>", () => {
  test("returns R extracted by selector", () => {
    const count = useSelector<Store, number>((state) => state.x.context.requests);
    expect(count).type.toBe<number>();
  });

  test("selector receives MachinesState<S>", () => {
    useSelector<Store, string>((state) => {
      expect(state).type.toBe<StoreState>();
      return state.x.state;
    });
  });

  test("equalityFn is optional and typed (oldValue, newValue) => boolean", () => {
    useSelector<Store, number>(
      (state) => state.x.context.requests,
      (a, b) => a === b,
    );
  });

  test("rejects selector that reads missing key", () => {
    useSelector<Store, number>(
      // @ts-expect-error!
      (state) => state.missing.context.requests,
    );
  });

  test("rejects equalityFn with wrong R", () => {
    useSelector<Store, number>(
      (state) => state.x.context.requests,
      // @ts-expect-error!
      (a: string, b: string) => a === b,
    );
  });

  test("TypedUseSelectorHook<S> pins store state but keeps R generic", () => {
    const typed: TypedUseSelectorHook<Store> = useSelector;
    const r = typed((state) => state.x.state);
    expect(r).type.toBe<"idle" | "busy">();
  });
});

describe("useTransition<P>", () => {
  test("returns a dispatch function (payload: P) => P", () => {
    const dispatch = useTransition<Evt>();
    expect(dispatch).type.toBe<(payload: Evt) => Evt>();
    dispatch({ type: "PING" });
    dispatch({ type: "DONE" });
  });

  test("rejects events outside P", () => {
    const dispatch = useTransition<Evt>();
    // @ts-expect-error!
    dispatch({ type: "UNKNOWN" });
  });

  test("defaults to dispatch for AnyEvent", () => {
    const dispatch = useTransition();
    expect(dispatch).type.toBe<(payload: AnyEvent) => AnyEvent>();
  });

  test("TypedUseTransitionHook<P> narrows transition signature", () => {
    const typed: TypedUseTransitionHook<Evt> = useTransition;
    const dispatch = typed();
    expect(dispatch).type.toBe<(payload: Evt) => Evt>();
  });
});

describe("defineMachine (react)", () => {
  test("returns { create } factory that yields a hook with machine API", () => {
    const factory = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    });
    type _Keys = Assert<Equal<keyof typeof factory, "create">>;

    const use = factory.create(machineCfg);
    expect(use).type.toHaveProperty("transition");
    expect(use).type.toHaveProperty("getState");
    expect(use).type.toHaveProperty("onTransition");
    expect(use).type.toHaveProperty("addMiddleware");
  });

  test("invoking the hook with selector returns R", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    const r = use((state) => state.context.requests);
    expect(r).type.toBe<number>();
  });

  test("hook selector sees StateType<C, T>", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    use((state) => {
      expect(state).type.toBe<StateType<Cfg, Ctx>>();
      return state.state;
    });
  });

  test("hook accepts optional equalityFn", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    use(
      (state) => state.context.requests,
      (a, b) => a === b,
    );
  });

  test("hook rejects equality for wrong R", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    use<number>(
      (state) => state.context.requests,
      // @ts-expect-error!
      (a: string) => a === "x",
    );
  });

  test("machine.transition enforces P", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    use.transition({ type: "PING" });
    // @ts-expect-error!
    use.transition({ type: "UNKNOWN" });
  });

  test("machine.onTransition accepts Subscriber<C, T, P>", () => {
    const use = defineMachine<Evt, Deps>({
      dependencies: { api: { call: async () => {} } },
    }).create(machineCfg);

    expect(use.onTransition).type.toBe<(cb: Subscriber<Cfg, Ctx, Evt>) => () => void>();
  });

  test("defineMachine() with no deps still works when D = {}", () => {
    const use = defineMachine<Evt>().create({
      config: { idle: { PING: "busy" }, busy: { DONE: "idle" } } as Cfg,
      initialState: "idle" as const,
      initialContext: { requests: 0 } as Ctx,
      reducer,
    } satisfies MachineConfig<Cfg, Ctx, Evt>);
    expect(use.transition).type.toBe<(action: Evt) => Evt>();
  });

  test("dependencies must match D", () => {
    defineMachine<Evt, Deps>({
      // @ts-expect-error!
      dependencies: {},
    });
  });
});

describe("store-dependency inference via hooks", () => {
  test("useSelector inside provider reads MachineDependencies<S> via manager", () => {
    const Example = () => {
      const manager = useManager<Store, Evt>();
      expect(manager.setDependencies).type.toBe<(d: Deps | ((deps: Deps) => Deps)) => void>();
      expect<MachineDependencies<Store>>().type.toBe<Deps>();
      return null;
    };
    void Example;
  });
});
