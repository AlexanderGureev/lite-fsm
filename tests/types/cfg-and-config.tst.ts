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

describe("структурные ограничения CFG", () => {
  test("пустой CFG можно присвоить", () => {
    const empty = createFlowConfig({});
    expect<typeof empty>().type.toBe<object>();
    expect<typeof empty>().type.toBeAssignableTo<CFG<typeof empty, FlowEvent>>();
  });

  test("CFG только с wildcard принимается и раскрывает wildcard key", () => {
    const wildcardOnly = createFlowConfig({
      "*": { RESET: "idle" },
      idle: {},
    });
    expect(wildcardOnly["*"]).type.toBe<{ RESET: "idle" }>();
  });

  test("self-transition через null принимается для каждого event", () => {
    const selfOnly = createFlowConfig({
      idle: { START: null, RESOLVE: null, REJECT: null, STOP: null, RESET: null },
    });
    expect(selfOnly.idle.START).type.toBe<null>();
    expect(selfOnly.idle.RESOLVE).type.toBe<null>();
  });

  test("разрешены частичные event maps, где перечислены не все events", () => {
    const partial = createFlowConfig({
      idle: { START: "running" },
      running: {},
    });
    expect(partial.idle.START).type.toBe<"running">();
  });

  test("state может ссылаться на себя по имени", () => {
    const loop = createFlowConfig({
      idle: { START: "idle" },
    });
    expect(loop.idle.START).type.toBe<"idle">();
  });

  test("неизвестные имена events отклоняются", () => {
    createFlowConfig({
      idle: {
        // @ts-expect-error!
        UNKNOWN: "running",
      },
    });
  });

  test("target state должен быть объявлен в map или быть null", () => {
    createFlowConfig({
      idle: {
        // @ts-expect-error!
        START: "missing",
      },
    });
  });

  test("wildcard не является валидным target для transition", () => {
    createFlowConfig({
      idle: {
        // @ts-expect-error!
        START: "*",
      },
    });
  });

  test("числовые и symbol targets отклоняются", () => {
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

  test("type-параметр K в CFG управляет разрешёнными target states", () => {
    type Map = { idle?: { X: "done" | null }; done?: { X: null } };
    type _IsCfg = Assert<
      Equal<CFG<Map, FSMEvent<"X">, "idle" | "done">, CFG<Map, FSMEvent<"X">, "idle" | "done">>
    >;
  });
});

describe("минимальные формы MachineConfig", () => {
  test("принимает минимальный config без reducer и effects", () => {
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

  test("принимает config с пустым объектом effects", () => {
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

  test("принимает config только с wildcard effect", () => {
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

  test("отклоняет initialState === \"*\", потому что wildcard не public state", () => {
    createFlowMachine({
      config: { idle: {} },
      // @ts-expect-error!
      initialState: "*",
      initialContext: { runs: 0, error: null },
    });
  });

  test("отклоняет initialState, которого нет в config map", () => {
    createFlowMachine({
      config: { idle: {} },
      // @ts-expect-error!
      initialState: "missing",
      initialContext: { runs: 0, error: null },
    });
  });

  test("отклоняет initialContext с неправильной формой через satisfies", () => {
    const badContext = {
      // @ts-expect-error!
      runs: "wrong",
      error: null,
    } satisfies FlowContext;
    void badContext;
  });

  test("отклоняет неизвестный ключ effect, которого нет в config и который не wildcard", () => {
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

  test("форма MachineConfig раскрывает все ожидаемые ключи", () => {
    type M = MachineConfig<{ a: {} }, { x: 1 }, FSMEvent<"E">>;
    type _Keys = Assert<
      Equal<keyof M, "config" | "initialState" | "initialContext" | "reducer" | "hydrate" | "dehydrate" | "effects">
    >;
  });
});

describe("структурный контракт DefaultDeps", () => {
  type Cfg = {
    "*": { RESET: "idle" };
    idle: { START: "running" };
    running: { STOP: "idle"; TICK: null };
    done: {};
  };
  type Evt = FSMEvent<"START"> | FSMEvent<"STOP"> | FSMEvent<"TICK"> | FSMEvent<"RESET">;

  test("содержит ровно 3 ключа: transition, action, condition", () => {
    type _Keys = Assert<Equal<keyof DefaultDeps<"running", Cfg, Evt>, "transition" | "action" | "condition">>;
  });

  test("сигнатура transition возвращает тот же event type", () => {
    expect<DefaultDeps<"running", Cfg, Evt>["transition"]>().type.toBe<(data: Evt) => Evt>();
    expect<DefaultDeps<"*", Cfg, Evt>["transition"]>().type.toBe<(data: Evt) => Evt>();
  });

  test("сигнатура condition: predicate → Promise<boolean>", () => {
    expect<DefaultDeps<"running", Cfg, Evt>["condition"]>().type.toBe<
      (predicate: (a: Evt) => boolean) => Promise<boolean>
    >();
  });

  test("action сужается по incoming events, которые ведут в state", () => {
    expect<DefaultDeps<"running", Cfg, Evt>["action"]>().type.toBe<Extract<Evt, { type: "START" }>>();
    expect<DefaultDeps<"idle", Cfg, Evt>["action"]>().type.toBe<Extract<Evt, { type: "STOP" | "RESET" }>>();
    expect<DefaultDeps<"*", Cfg, Evt>["action"]>().type.toBe<Evt>();
  });

  test("orphan state без incoming transitions сужает action до never", () => {
    type _OrphanActionIsNever = Assert<IsNever<DefaultDeps<"done", Cfg, Evt>["action"]>>;
  });

  test("union target states собирает events, ведущие в любой из target", () => {
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

describe("контракт return у MachineReducer", () => {
  type Cfg = { idle: { INC: null; NEXT: "done" }; done: {} };
  type Evt = FSMEvent<"INC", { amount: number }> | FSMEvent<"NEXT">;
  type Ctx = { count: number };

  const createEvtReducer: TypedCreateReducerFn<Evt> = (r) => r;

  test("return type равен `{ state, context } | void`, где void валиден для immer", () => {
    type R = MachineReducer<Cfg, Evt, Ctx>;
    type _Ret = Assert<Equal<ReturnType<R>, { state: "idle" | "done"; context: Ctx } | void>>;
  });

  test("reducer может вернуть void для mutating style с immer", () => {
    const voidReducer = createEvtReducer<Cfg, Ctx>((state, action, _meta) => {
      if (action.type === "INC") {
        state.context.count += action.payload.amount;
        return;
      }
    });
    expect(voidReducer).type.toBeAssignableTo<MachineReducer<Cfg, Evt, Ctx>>();
  });

  test("reducer может вернуть объект next state", () => {
    const nextReducer = createEvtReducer<Cfg, Ctx>((state, action, meta) => {
      if (action.type === "INC") {
        return { state: state.state, context: { count: state.context.count + action.payload.amount } };
      }
      return { state: meta.nextState, context: state.context };
    });
    expect(nextReducer).type.toBeAssignableTo<MachineReducer<Cfg, Evt, Ctx>>();
  });

  test("reducer может смешивать void и объектные return в разных ветках", () => {
    const mixed = createEvtReducer<Cfg, Ctx>((state, action, meta) => {
      if (action.type === "INC") {
        state.context.count += action.payload.amount;
        return;
      }
      return { state: meta.nextState, context: state.context };
    });
    expect(mixed).type.toBeAssignableTo<MachineReducer<Cfg, Evt, Ctx>>();
  });

  test("reducer meta раскрывает nextState как union target literals", () => {
    createEvtReducer<Cfg, Ctx>((_state, _action, meta) => {
      expect(meta.nextState).type.toBe<"idle" | "done">();
      expect(meta.config).type.toBe<Cfg>();
    });
  });

  test("возврат объекта не той формы отклоняется", () => {
    // @ts-expect-error!
    createEvtReducer<Cfg, Ctx>((state, action) => {
      if (action.type === "INC") {
        return { state: state.state, context: { total: action.payload.amount } };
      }
      return state;
    });
  });

  test("возврат невалидного state literal отклоняется", () => {
    // @ts-expect-error!
    createEvtReducer<Cfg, Ctx>((state) => {
      return { state: "nonexistent", context: state.context };
    });
  });

  test("возврат wildcard как state отклоняется", () => {
    // @ts-expect-error!
    createEvtReducer<Cfg, Ctx>((state) => {
      return { state: "*", context: state.context };
    });
  });

  test("params reducer строго типизированы: state, action, meta", () => {
    type R = MachineReducer<Cfg, Evt, Ctx>;
    expect<Parameters<R>[0]>().type.toBe<StateType<Cfg, Ctx>>();
    expect<Parameters<R>[1]>().type.toBe<Evt>();
    expect<Parameters<R>[2]>().type.toBe<{ nextState: "idle" | "done"; config: Cfg }>();
  });
});

describe("return type у MachineEffect", () => {
  type Cfg = { idle: { GO: "done" }; done: {} };
  type Evt = FSMEvent<"GO">;

  test("return type равен `Promise<void> | void`, разрешая sync и async", () => {
    type E = MachineEffect<"done", Cfg, Evt>;
    type _Ret = Assert<Equal<ReturnType<E>, Promise<void> | void>>;
  });

  test("sync effect с void принимается", () => {
    const syncEffect: MachineEffect<"done", Cfg, Evt> = ({ action }) => {
      void action;
    };
    expect(syncEffect).type.toBe<MachineEffect<"done", Cfg, Evt>>();
  });

  test("async effect с Promise<void> принимается", () => {
    const asyncEffect: MachineEffect<"done", Cfg, Evt> = async ({ action }) => {
      void action;
    };
    expect(asyncEffect).type.toBe<MachineEffect<"done", Cfg, Evt>>();
  });

  test("effect получает DefaultDeps, смерженные с user deps", () => {
    type Deps = { api: { load: () => Promise<void> } };
    const effect: MachineEffect<"done", Cfg, Evt, Deps> = ({ action, transition, condition, api }) => {
      expect(action).type.toBe<FSMEvent<"GO">>();
      expect(transition).type.toBe<(data: Evt) => Evt>();
      expect(condition).type.toBe<(predicate: (a: Evt) => boolean) => Promise<boolean>>();
      expect(api.load).type.toBe<() => Promise<void>>();
    };
    expect(effect).type.toBe<MachineEffect<"done", Cfg, Evt, Deps>>();
  });

  test("user deps мержатся с DefaultDeps через intersection", () => {
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

  test("пустые user deps (D = {}) оставляют только ключи DefaultDeps", () => {
    type E = MachineEffect<"done", Cfg, Evt>;
    const effect: E = ({ action, transition, condition }) => {
      expect(action).type.toBe<FSMEvent<"GO">>();
      expect(transition).type.toBe<(data: Evt) => Evt>();
      expect(condition).type.toBe<(predicate: (a: Evt) => boolean) => Promise<boolean>>();
    };
    expect(effect).type.toBe<E>();
  });

  test("wildcard effect получает полный union events", () => {
    type Wider = FSMEvent<"GO"> | FSMEvent<"STOP">;
    const wild: MachineEffect<"*", { idle: { GO: "done" }; done: { STOP: "idle" } }, Wider> = ({ action }) => {
      expect(action).type.toBe<Wider>();
    };
    expect(wild).type.toBe<MachineEffect<"*", { idle: { GO: "done" }; done: { STOP: "idle" } }, Wider>>();
  });
});
