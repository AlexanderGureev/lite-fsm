import { describe, expect, test } from "tstyche";
import type {
  FSMEvent,
  IMachine,
  IMachineManager,
  MachineConfig,
  MachineDependencies,
  MachineEvents,
  MachineReducer,
  MachinesState,
  Reducer,
  StateType,
  Subscriber,
  TransitionSubscriber,
} from "lite-fsm";

import type { Assert, Equal } from "./_helpers";

type XEvent = FSMEvent<"X">;
type YEvent = FSMEvent<"Y", { id: string }>;
type ZEvent = FSMEvent<"Z", { flag: boolean }>;

type CfgX = { a: { X: "b" }; b: {} };
type CfgY = { on: { Y: "off" }; off: {} };
type CfgZ = { p: { Z: "q" }; q: {} };

type CtxX = { v: number };
type CtxY = { label: string };
type CtxZ = { ok: boolean };

type DepsX = { api: { load: () => void } };
type DepsY = { logger: (s: string) => void };
type DepsShared = { api: { load: () => void }; clock: () => number };

const xReducer: MachineReducer<CfgX, XEvent, CtxX> = (state, _a, meta) => ({
  state: meta.nextState,
  context: state.context,
});

const yReducer: MachineReducer<CfgY, YEvent, CtxY> = (state, _a, meta) => ({
  state: meta.nextState,
  context: state.context,
});

const zReducer: MachineReducer<CfgZ, ZEvent, CtxZ> = (state, _a, meta) => ({
  state: meta.nextState,
  context: state.context,
});

const sharedReducer: MachineReducer<CfgX, XEvent, {}> = (state, _a, meta) => ({
  state: meta.nextState,
  context: state.context,
});

const noFxReducer: MachineReducer<{ a: {} }, XEvent, {}> = (state, _a, meta) => ({
  state: meta.nextState,
  context: state.context,
});

const initialCtxX: CtxX = { v: 0 };
const initialCtxY: CtxY = { label: "" };
const initialCtxZ: CtxZ = { ok: false };

const machineX = {
  config: { a: { X: "b" }, b: {} },
  initialState: "a",
  initialContext: initialCtxX,
  reducer: xReducer,
  effects: {
    a: ({ api }) => {
      void api;
    },
  },
} satisfies MachineConfig<CfgX, CtxX, XEvent, DepsX>;

const machineY = {
  config: { on: { Y: "off" }, off: {} },
  initialState: "on",
  initialContext: initialCtxY,
  reducer: yReducer,
  effects: {
    on: ({ logger }) => {
      void logger;
    },
  },
} satisfies MachineConfig<CfgY, CtxY, YEvent, DepsY>;

const machineZ = {
  config: { p: { Z: "q" }, q: {} },
  initialState: "p",
  initialContext: initialCtxZ,
  reducer: zReducer,
} satisfies MachineConfig<CfgZ, CtxZ, ZEvent>;

const machineWithClock = {
  config: { a: { X: "b" }, b: {} },
  initialState: "a",
  initialContext: {},
  reducer: sharedReducer,
  effects: {
    a: ({ api, clock }) => {
      void api;
      void clock;
    },
  },
} satisfies MachineConfig<CfgX, {}, XEvent, DepsShared>;

const machineNoEffects = {
  config: { a: {} },
  initialState: "a",
  initialContext: {},
  reducer: noFxReducer,
} satisfies MachineConfig<{ a: {} }, {}, XEvent>;

type MachineX = typeof machineX;
type MachineY = typeof machineY;
type MachineZ = typeof machineZ;
type MachineWithClock = typeof machineWithClock;
type MachineNoEffects = typeof machineNoEffects;

describe("MachineEvents<S>", () => {
  test("empty store yields never", () => {
    type _Empty = Assert<Equal<MachineEvents<{}>, never>>;
  });

  test("single machine yields its event union", () => {
    expect<MachineEvents<{ x: MachineX }>>().type.toBe<XEvent>();
    expect<MachineEvents<{ y: MachineY }>>().type.toBe<YEvent>();
  });

  test("multiple machines yield the union across all events", () => {
    expect<MachineEvents<{ x: MachineX; y: MachineY; z: MachineZ }>>().type.toBe<XEvent | YEvent | ZEvent>();
  });

  test("same machine reused twice still yields that event", () => {
    type Reused = MachineEvents<{ x1: MachineX; x2: MachineX }>;
    expect<XEvent>().type.toBeAssignableTo<Reused>();
    expect<Reused>().type.toBeAssignableTo<XEvent>();
  });
});

describe("MachineDependencies<S>", () => {
  test("empty store has no dependencies", () => {
    type _Empty = Assert<Equal<MachineDependencies<{}>, {}>>;
  });

  test("single machine's deps reflect its effect parameter shape", () => {
    type Deps = MachineDependencies<{ x: MachineX }>;
    type _HasApi = Assert<Equal<Deps["api"], { load: () => void }>>;
  });

  test("multiple machines INTERSECT their deps key-by-key", () => {
    type Deps = MachineDependencies<{ x: MachineX; y: MachineY }>;
    type _HasApi = Assert<Equal<Deps["api"], { load: () => void }>>;
    type _HasLogger = Assert<Equal<Deps["logger"], (s: string) => void>>;
  });

  test("overlapping deps collapse (shared key appears once)", () => {
    type Deps = MachineDependencies<{ x: MachineX; shared: MachineWithClock }>;
    expect<Deps["api"]>().type.toBe<{ load: () => void }>();
    expect<Deps["clock"]>().type.toBe<() => number>();
  });

  test("machine without effects contributes empty intersection", () => {
    type Deps = MachineDependencies<{ m: MachineNoEffects }>;
    type _NoKeys = Assert<Equal<keyof Deps, never>>;
  });

  test("combining machine-with-effects and machine-without keeps only the effective deps", () => {
    type Deps = MachineDependencies<{ x: MachineX; n: MachineNoEffects }>;
    type _HasApi = Assert<Equal<Deps["api"], { load: () => void }>>;
  });
});

describe("MachinesState<S>", () => {
  test("maps every machine to its literal state and context", () => {
    type State = MachinesState<{ x: MachineX; y: MachineY }>;
    type _Shape = Assert<
      Equal<
        State,
        {
          x: { state: "a" | "b"; context: CtxX };
          y: { state: "on" | "off"; context: CtxY };
        }
      >
    >;
  });

  test("single machine map keeps the key", () => {
    type State = MachinesState<{ only: MachineZ }>;
    type _Shape = Assert<Equal<State, { only: { state: "p" | "q"; context: CtxZ } }>>;
  });

  test("empty map yields empty object", () => {
    expect<MachinesState<{}>>().type.toBe<{}>();
  });
});

describe("Subscriber<C, T, P>", () => {
  type Cfg = { a: { E: "b" }; b: {} };
  type Ctx = { n: number };
  type Evt = FSMEvent<"E">;

  test("explicit signature (prevState, currentState, action) => void", () => {
    type S = Subscriber<Cfg, Ctx, Evt>;
    type _Shape = Assert<
      Equal<S, (prevState: StateType<Cfg, Ctx>, currentState: StateType<Cfg, Ctx>, action: Evt) => void>
    >;
  });

  test("prevState and currentState share the same StateType", () => {
    type S = Subscriber<Cfg, Ctx, Evt>;
    expect<Parameters<S>[0]>().type.toBe<StateType<Cfg, Ctx>>();
    expect<Parameters<S>[1]>().type.toBe<StateType<Cfg, Ctx>>();
  });

  test("returns void", () => {
    type S = Subscriber<Cfg, Ctx, Evt>;
    expect<ReturnType<S>>().type.toBe<void>();
  });
});

describe("TransitionSubscriber<S, P>", () => {
  type M = { x: MachineX; y: MachineY };
  type Evt = XEvent | YEvent;

  test("explicit signature with MachinesState", () => {
    type T = TransitionSubscriber<M, Evt>;
    type _Shape = Assert<
      Equal<T, (prevState: MachinesState<M>, currentState: MachinesState<M>, action: Evt) => void>
    >;
  });

  test("returns void and receives MachinesState on both sides", () => {
    type T = TransitionSubscriber<M, Evt>;
    expect<Parameters<T>[0]>().type.toBe<MachinesState<M>>();
    expect<Parameters<T>[1]>().type.toBe<MachinesState<M>>();
    expect<ReturnType<T>>().type.toBe<void>();
  });
});

describe("IMachine<C, T, P, D>", () => {
  type Cfg = { a: { E: "b" }; b: {} };
  type Ctx = { n: number };
  type Evt = FSMEvent<"E">;
  type Deps = { api: { load: () => void } };
  type M = IMachine<Cfg, Ctx, Evt, Deps>;

  test("shape has exactly three keys: transition, invokeEffect, config", () => {
    type _Keys = Assert<Equal<keyof M, "transition" | "invokeEffect" | "config">>;
  });

  test("config field preserves original CFG literal", () => {
    expect<M["config"]>().type.toBe<Cfg>();
  });

  test("transition signature matches the documented contract", () => {
    type _Sig = Assert<
      Equal<
        M["transition"],
        (state: { state: "a" | "b"; context: Ctx }, action: Evt) => { state: "a" | "b"; context: Ctx }
      >
    >;
  });

  test("invokeEffect signature accepts prev/current state + merged deps, returns Promise<void>", () => {
    expect<M["invokeEffect"]>().type.toBe<
      (
        prevState: "a" | "b",
        currentState: "a" | "b",
        deps: Deps & {
          transition: (data: Evt) => Evt;
          action: Evt;
          condition: (predicate: (a: Evt) => boolean) => Promise<boolean>;
        },
      ) => Promise<void>
    >();
  });

  test("empty deps default to DefaultDeps only", () => {
    type Bare = IMachine<Cfg, Ctx, Evt>;
    expect<Parameters<Bare["invokeEffect"]>[2]>().type.toBe<{
      transition: (data: Evt) => Evt;
      action: Evt;
      condition: (predicate: (a: Evt) => boolean) => Promise<boolean>;
    }>();
  });
});

describe("IMachineManager<S, P>", () => {
  type M = { x: MachineX; y: MachineY };
  type Evt = XEvent | YEvent;
  type Deps = MachineDependencies<M>;
  type State = MachinesState<M>;
  type Manager = IMachineManager<M, Evt>;

  test("shape has exactly 5 keys", () => {
    type _Keys = Assert<
      Equal<keyof Manager, "transition" | "getState" | "onTransition" | "replaceReducer" | "setDependencies">
    >;
  });

  test("getState signature", () => {
    expect<Manager["getState"]>().type.toBe<() => State>();
  });

  test("transition signature echoes the event type", () => {
    expect<Manager["transition"]>().type.toBe<(payload: Evt) => Evt>();
  });

  test("onTransition signature returns unsubscribe function", () => {
    expect<Manager["onTransition"]>().type.toBe<(cb: TransitionSubscriber<M, Evt>) => () => void>();
  });

  test("replaceReducer signature composes reducer", () => {
    expect<Manager["replaceReducer"]>().type.toBe<
      (cb: (reducer: Reducer<State, Evt>) => Reducer<State, Evt>) => void
    >();
  });

  test("setDependencies accepts both object and updater forms", () => {
    expect<Manager["setDependencies"]>().type.toBe<(d: Deps | ((deps: Deps) => Deps)) => void>();
  });

  test("default P equals explicit MachineEvents<S>", () => {
    type Default = IMachineManager<M>;
    type Explicit = IMachineManager<M, MachineEvents<M>>;
    type _SameShape = Assert<Equal<Default, Explicit>>;
  });
});
