import { describe, expect, test } from "tstyche";
import type {
  FSMEvent,
  IMachine,
  IMachineManager,
  MachineConfig,
  MachineManagerDehydrateFn,
  MachineManagerRuntimeSnapshot,
  MachineManagerSnapshot,
  MachineDependencies,
  MachineEvents,
  ManagerAction,
  ManagerCommitAction,
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
  test("пустой store даёт never", () => {
    type _Empty = Assert<Equal<MachineEvents<{}>, never>>;
  });

  test("одна machine даёт свой union events", () => {
    expect<MachineEvents<{ x: MachineX }>>().type.toBe<XEvent>();
    expect<MachineEvents<{ y: MachineY }>>().type.toBe<YEvent>();
  });

  test("несколько machines дают общий union всех events", () => {
    expect<MachineEvents<{ x: MachineX; y: MachineY; z: MachineZ }>>().type.toBe<XEvent | YEvent | ZEvent>();
  });

  test("одна и та же machine, использованная дважды, сохраняет тот же event", () => {
    type Reused = MachineEvents<{ x1: MachineX; x2: MachineX }>;
    expect<XEvent>().type.toBeAssignableTo<Reused>();
    expect<Reused>().type.toBeAssignableTo<XEvent>();
  });
});

describe("MachineDependencies<S>", () => {
  test("пустой store не имеет dependencies", () => {
    type _Empty = Assert<Equal<MachineDependencies<{}>, {}>>;
  });

  test("deps одной machine отражают форму параметров её effect", () => {
    type Deps = MachineDependencies<{ x: MachineX }>;
    type _HasApi = Assert<Equal<Deps["api"], { load: () => void }>>;
  });

  test("несколько machines пересекают deps по ключам", () => {
    type Deps = MachineDependencies<{ x: MachineX; y: MachineY }>;
    type _HasApi = Assert<Equal<Deps["api"], { load: () => void }>>;
    type _HasLogger = Assert<Equal<Deps["logger"], (s: string) => void>>;
  });

  test("пересекающиеся deps схлопываются, и общий ключ появляется один раз", () => {
    type Deps = MachineDependencies<{ x: MachineX; shared: MachineWithClock }>;
    expect<Deps["api"]>().type.toBe<{ load: () => void }>();
    expect<Deps["clock"]>().type.toBe<() => number>();
  });

  test("machine без effects добавляет пустое intersection", () => {
    type Deps = MachineDependencies<{ m: MachineNoEffects }>;
    type _NoKeys = Assert<Equal<keyof Deps, never>>;
  });

  test("machine с effects и machine без effects вместе оставляют только реальные deps", () => {
    type Deps = MachineDependencies<{ x: MachineX; n: MachineNoEffects }>;
    type _HasApi = Assert<Equal<Deps["api"], { load: () => void }>>;
  });
});

describe("MachinesState<S>", () => {
  test("мапит каждую machine в её literal state и context", () => {
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

  test("map с одной machine сохраняет её ключ", () => {
    type State = MachinesState<{ only: MachineZ }>;
    type _Shape = Assert<Equal<State, { only: { state: "p" | "q"; context: CtxZ } }>>;
  });

  test("пустая map даёт пустой объект", () => {
    expect<MachinesState<{}>>().type.toBe<{}>();
  });
});

describe("Subscriber<C, T, P>", () => {
  type Cfg = { a: { E: "b" }; b: {} };
  type Ctx = { n: number };
  type Evt = FSMEvent<"E">;

  test("явная сигнатура равна (prevState, currentState, action) => void", () => {
    type S = Subscriber<Cfg, Ctx, Evt>;
    type _Shape = Assert<
      Equal<S, (prevState: StateType<Cfg, Ctx>, currentState: StateType<Cfg, Ctx>, action: Evt) => void>
    >;
  });

  test("prevState и currentState используют один StateType", () => {
    type S = Subscriber<Cfg, Ctx, Evt>;
    expect<Parameters<S>[0]>().type.toBe<StateType<Cfg, Ctx>>();
    expect<Parameters<S>[1]>().type.toBe<StateType<Cfg, Ctx>>();
  });

  test("возвращает void", () => {
    type S = Subscriber<Cfg, Ctx, Evt>;
    expect<ReturnType<S>>().type.toBe<void>();
  });
});

describe("TransitionSubscriber<S, P>", () => {
  type M = { x: MachineX; y: MachineY };
  type Evt = XEvent | YEvent;

  test("явная сигнатура использует MachinesState", () => {
    type T = TransitionSubscriber<M, Evt>;
    expect<Parameters<T>[0]>().type.toBe<MachinesState<M>>();
    expect<Parameters<T>[1]>().type.toBe<MachinesState<M>>();
    expect<Parameters<T>[2]>().type.toBe<ManagerCommitAction<M, ManagerAction<Evt>>>();
  });

  test("возвращает void и получает MachinesState с обеих сторон", () => {
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

  test("форма содержит ровно три ключа: transition, invokeEffect, config", () => {
    type _Keys = Assert<Equal<keyof M, "transition" | "invokeEffect" | "config">>;
  });

  test("поле config сохраняет исходный CFG literal", () => {
    expect<M["config"]>().type.toBe<Cfg>();
  });

  test("сигнатура transition совпадает с документированным контрактом", () => {
    type _Sig = Assert<
      Equal<
        M["transition"],
        (state: { state: "a" | "b"; context: Ctx }, action: Evt) => { state: "a" | "b"; context: Ctx }
      >
    >;
  });

  test("сигнатура invokeEffect принимает prev/current state и merged deps, возвращая Promise<void>", () => {
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

  test("пустые deps по умолчанию сводятся только к DefaultDeps", () => {
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

  test("форма содержит ровно 9 ключей", () => {
    type _Keys = Assert<
      Equal<
        keyof Manager,
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

  test("сигнатура getState возвращает MachinesState", () => {
    expect<Manager["getState"]>().type.toBe<() => State>();
  });

  test("сигнатуры snapshot-методов типизируют runtime и dehydrated envelopes", () => {
    expect<Manager["getSnapshot"]>().type.toBe<() => MachineManagerRuntimeSnapshot<M>>();
    expect<Manager["getHydratedState"]>().type.toBe<
      (
        snapshot: MachineManagerSnapshot<M>,
        opts?: { strategy?: "replace" | "merge"; baseState?: MachinesState<M> },
      ) => MachinesState<M>
    >();
    expect<Manager["hydrate"]>().type.toBe<(snapshot: MachineManagerSnapshot<M>, opts?: { strategy?: "replace" | "merge" }) => void>();
    expect<Manager["dehydrate"]>().type.toBe<MachineManagerDehydrateFn<M>>();
  });

  test("сигнатура transition возвращает тот же event type", () => {
    expect<Manager["transition"]>().type.toBe<(payload: ManagerAction<Evt>) => ManagerAction<Evt>>();
  });

  test("сигнатура onTransition возвращает функцию unsubscribe", () => {
    expect<Manager["onTransition"]>().type.toBe<(cb: TransitionSubscriber<M, Evt>) => () => void>();
  });

  test("сигнатура replaceReducer композирует reducer", () => {
    expect<Manager["replaceReducer"]>().type.toBe<
      (cb: (reducer: Reducer<State, ManagerAction<Evt>>) => Reducer<State, ManagerAction<Evt>>) => void
    >();
  });

  test("setDependencies принимает объект и updater-функцию", () => {
    expect<Manager["setDependencies"]>().type.toBe<(d: Deps | ((deps: Deps) => Deps)) => void>();
  });

  test("P по умолчанию совпадает с явным MachineEvents<S>", () => {
    type Default = IMachineManager<M>;
    type Explicit = IMachineManager<M, MachineEvents<M>>;
    type _SameShape = Assert<Equal<Default, Explicit>>;
  });
});
