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

describe("createConfig без типизированной обёртки", () => {
  test("работает как identity для литерала, совместимого с CFG", () => {
    const cfg = createConfig({
      idle: { PING: "busy", SAVE: "busy" },
      busy: {},
    });
    expect(cfg).type.toBe<{
      idle: { PING: "busy"; SAVE: "busy" };
      busy: {};
    }>();
  });

  test("отклоняет переход в несуществующее состояние", () => {
    createConfig({
      // @ts-expect-error!
      idle: {
        PING: "missing",
      },
      busy: {},
    });
  });

  test("принимает null transition как self-transition", () => {
    const cfg = createConfig({
      idle: { PING: null },
    });
    expect(cfg).type.toBe<{ idle: { PING: null } }>();
  });
});

describe("createReducer без типизированной обёртки", () => {
  test("работает как identity и сохраняет тип reducer", () => {
    const reducer = createReducer<Cfg, Ctx>((state, action, meta) => {
      expect(state.state).type.toBe<"idle" | "busy">();
      expect(meta.nextState).type.toBe<"idle" | "busy">();
      expect(action).type.toBe<AnyEvent>();
      return { state: meta.nextState, context: state.context };
    });
    expect(reducer).type.toBe<MachineReducer<Cfg, AnyEvent, Ctx>>();
  });

  test("отклоняет возврат несуществующего state", () => {
    // @ts-expect-error!
    createReducer<Cfg, Ctx>((state) => ({ state: "missing", context: state.context }));
  });

  test("разрешает reducer, который возвращает void", () => {
    const reducer = createReducer<Cfg, Ctx>(() => {});
    expect(reducer).type.toBe<MachineReducer<Cfg, AnyEvent, Ctx>>();
  });
});

describe("createMachine без типизированной обёртки", () => {
  test("возвращает MachineConfig с сохранёнными generics", () => {
    const machine = createMachine<Evt, Deps, Cfg, Ctx>({
      config: { idle: { PING: "busy", SAVE: "busy" }, busy: {} },
      initialState: "idle",
      initialContext: { calls: 0 },
    });
    expect(machine).type.toBe<MachineConfig<Cfg, Ctx, Evt, Deps>>();
  });

  test("без явных generics выводит C и T из литерала", () => {
    const machine = createMachine({
      config: { idle: {} },
      initialState: "idle",
      initialContext: { calls: 0 },
    });
    expect(machine.initialState).type.toBe<"idle">();
    expect(machine.initialContext).type.toBe<{ calls: number }>();
    expect(machine.config).type.toBe<{ idle: {} }>();
  });

  test("отклоняет невалидный initialState", () => {
    createMachine<Evt, Deps, Cfg, Ctx>({
      config: { idle: { PING: "busy", SAVE: "busy" }, busy: {} },
      // @ts-expect-error!
      initialState: "missing",
      initialContext: { calls: 0 },
    });
  });

  test("отклоняет initialState = wildcard", () => {
    createMachine<Evt, Deps, Cfg, Ctx>({
      config: { idle: { PING: "busy", SAVE: "busy" }, busy: {} },
      // @ts-expect-error!
      initialState: "*",
      initialContext: { calls: 0 },
    });
  });
});

describe("createEffect без типизированной обёртки", () => {
  test("возвращает MachineEffect, привязанный к ключу state", () => {
    const fx = createEffect<Evt, Deps, Cfg, "busy">({
      effect: ({ action, log }) => {
        expect(action).type.toBe<Ping | Save>();
        expect(log).type.toBe<(s: string) => void>();
      },
    });
    expect(fx).type.toBe<MachineEffect<"busy", Cfg, Evt, Deps>>();
  });

  test("принимает type: 'latest' и cancelFn", () => {
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

  test("принимает type: 'every'", () => {
    const fx = createEffect<Evt, Deps, Cfg, "idle">({
      type: "every",
      effect: () => {},
    });
    expect(fx).type.toBe<MachineEffect<"idle", Cfg, Evt, Deps>>();
  });

  test("отклоняет неизвестный литерал type", () => {
    createEffect<Evt, Deps, Cfg, "busy">({
      // @ts-expect-error!
      type: "once",
      effect: () => {},
    });
  });

  test("wildcard effect получает все actions", () => {
    const fx = createEffect<Evt, Deps, Cfg, "*">({
      effect: ({ action }) => {
        expect(action).type.toBe<Evt>();
      },
    });
    expect(fx).type.toBe<MachineEffect<"*", Cfg, Evt, Deps>>();
  });
});

describe("TypedCreateConfigFn<P>", () => {
  test("сужает допустимые transitions до P['type']", () => {
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
  test("возвращает MachineConfig<C, T, P, D>", () => {
    const typed: TypedCreateMachineFn<Evt, Deps> = createMachine;
    const machine = typed<Cfg, Ctx>({
      config: { idle: { PING: "busy", SAVE: "busy" }, busy: {} },
      initialState: "idle",
      initialContext: { calls: 0 },
    });
    expect(machine).type.toBe<MachineConfig<Cfg, Ctx, Evt, Deps>>();
  });

  test("выводит C и T из свойств cfg", () => {
    const typed: TypedCreateMachineFn<Evt> = createMachine;
    const machine = typed({
      config: { idle: { PING: "busy", SAVE: "busy" }, busy: {} },
      initialState: "idle",
      initialContext: { calls: 0 },
    });
    expect(machine.initialState).type.toBe<"idle" | "busy">();
    expect(machine.initialContext).type.toBe<{ calls: number }>();
  });

  test("отклоняет event types, которых нет в P", () => {
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
  test("тело reducer видит суженный union actions", () => {
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

  test("отклоняет return state, которого нет в ключах Cfg", () => {
    const typed: TypedCreateReducerFn<Evt> = createReducer;
    // @ts-expect-error!
    typed<Cfg, Ctx>((state) => ({ state: "missing", context: state.context }));
  });
});

describe("TypedCreateEffectFn<P, D>", () => {
  test("сигнатура effect совпадает с MachineEffect<N, C, P, D>", () => {
    const typed: TypedCreateEffectFn<Evt, Deps> = createEffect;
    const fx = typed<Cfg, "busy">({
      effect: ({ action, log }) => {
        expect(action).type.toBe<Evt>();
        expect(log).type.toBe<(s: string) => void>();
      },
    });
    expect(fx).type.toBe<MachineEffect<"busy", Cfg, Evt, Deps>>();
  });

  test("отклоняет transition с неизвестным event", () => {
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

describe("совместимость фабрик", () => {
  test("результат createReducer напрямую присваивается в MachineConfig.reducer", () => {
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

  test("результат createEffect напрямую присваивается в MachineConfig.effects[key]", () => {
    const fx = createEffect<Evt, Deps, Cfg, "idle">({ effect: () => {} });
    type _Shape = Assert<Equal<typeof fx, MachineEffect<"idle", Cfg, Evt, Deps>>>;
  });
});
