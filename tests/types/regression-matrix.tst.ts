import { describe, expect, test } from "tstyche";
import * as core from "lite-fsm";
import type {
  FSMEvent,
  IMachineManager,
  MachineConfig,
  MachineDependencies,
  MachineEvents,
  MachineReducer,
  ManagerAction,
  MachinesState,
  Middleware,
  StateType,
  TypedCreateEffectFn,
  TypedCreateMachineFn,
} from "lite-fsm";
import * as middleware from "lite-fsm/middleware";
import * as devToolsEntry from "lite-fsm/middleware/devTools";
import * as immerEntry from "lite-fsm/middleware/immer";
import * as react from "lite-fsm/react";
import { FSMContextProvider } from "lite-fsm/react";
import type { TypedUseMachineHook } from "lite-fsm/react";

import type { Assert, Equal, IsNever } from "./_helpers";

describe("регрессионная матрица public entry points", () => {
  test("core entry экспортирует ровно публичный runtime API", () => {
    type _CoreKeys = Assert<
      Equal<
        keyof typeof core,
        | "Machine"
        | "MachineManager"
        | "createActorMeta"
        | "createConfig"
        | "createEffect"
        | "createMachine"
        | "createReducer"
        | "defineMachine"
        | "LiteFsmError"
      >
    >;
  });

  test("react entry экспортирует ровно публичный runtime API", () => {
    type _ReactKeys = Assert<
      Equal<
        keyof typeof react,
        | "FSMContext"
        | "FSMContextProvider"
        | "FSMHydrationBoundary"
        | "defineMachine"
        | "useHydrateSnapshot"
        | "useManager"
        | "useSelector"
        | "useTransition"
      >
    >;
  });

  test("middleware entries сохраняют согласованность root и subpath exports", () => {
    type _MiddlewareKeys = Assert<Equal<keyof typeof middleware, "devToolsMiddleware" | "immerMiddleware">>;
    type _DevToolsKeys = Assert<Equal<keyof typeof devToolsEntry, "devToolsMiddleware">>;
    type _ImmerKeys = Assert<Equal<keyof typeof immerEntry, "immerMiddleware">>;

    expect(middleware.devToolsMiddleware).type.toBe<typeof devToolsEntry.devToolsMiddleware>();
    expect(middleware.immerMiddleware).type.toBe<typeof immerEntry.immerMiddleware>();
  });

  test("internal coordination symbols не доступны из public entry points", () => {
    type InternalSymbolName = "LATE_DISPATCH" | "DEVTOOLS_API" | "ACTOR_RESTORE" | "REGISTER_BAG_DISPOSE";
    type _NoCoreInternals = Assert<IsNever<Extract<keyof typeof core, InternalSymbolName>>>;
    type _NoMiddlewareInternals = Assert<IsNever<Extract<keyof typeof middleware, InternalSymbolName>>>;
    type _NoDevToolsInternals = Assert<IsNever<Extract<keyof typeof devToolsEntry, InternalSymbolName>>>;
  });
});

describe("регрессионная матрица стилей объявления machine", () => {
  type Start = FSMEvent<"START">;
  type Patch = FSMEvent<"PATCH", { count?: number }>;
  type Finish = FSMEvent<"FINISH", { result: "ok" }>;
  type Event = Start | Patch | Finish;

  type Config = {
    idle: { START: "running"; PATCH: null };
    running: { PATCH: null; FINISH: "done" };
    done: {};
  };

  type Context = { count: number; result?: "ok" };
  type Deps = { audit: (message: string) => void };

  const reducer: MachineReducer<Config, Event, Context> = (state, action, meta) => {
    if (action.type === "PATCH") {
      return {
        state: meta.nextState,
        context: { ...state.context, ...action.payload },
      };
    }

    if (action.type === "FINISH") {
      return {
        state: meta.nextState,
        context: { ...state.context, result: action.payload.result },
      };
    }

    return { state: meta.nextState, context: state.context };
  };

  const configLiteral = {
    idle: { START: "running", PATCH: null },
    running: { PATCH: null, FINISH: "done" },
    done: {},
  } satisfies Config;

  test("inline typed createMachine сохраняет выведенный контракт state/context/event", () => {
    const createTypedMachine: TypedCreateMachineFn<Event> = core.createMachine;
    const machine = createTypedMachine({
      config: {
        idle: { START: "running", PATCH: null },
        running: { PATCH: null, FINISH: "done" },
        done: {},
      },
      initialState: "idle",
      initialContext: { count: 0 },
      reducer,
    });

    expect(machine).type.toBe<MachineConfig<Config, Context, Event, {}>>();
    expect<StateType<typeof machine.config, typeof machine.initialContext>["state"]>().type.toBe<
      "idle" | "running" | "done"
    >();
  });

  test("satisfies MachineConfig сохраняет literals без расширения public state", () => {
    const machine = {
      config: configLiteral,
      initialState: "idle",
      initialContext: { count: 0, result: undefined },
      reducer,
      effects: {
        running: ({ action, audit }) => {
          expect(action).type.toBe<Start>();
          audit(action.type);
        },
        "*": ({ action }) => {
          expect(action).type.toBe<Event>();
        },
      },
    } satisfies MachineConfig<Config, Context, Event, Deps>;

    expect(machine.initialState).type.toBe<"idle">();
    expect<StateType<typeof machine.config, Context>["state"]>().type.toBe<"idle" | "running" | "done">();
  });

  test("typed factory отклоняет transitions вне объявленного event union", () => {
    const createTypedMachine: TypedCreateMachineFn<Event, Deps> = core.createMachine;

    createTypedMachine({
      config: configLiteral,
      initialState: "idle",
      initialContext: { count: 0 },
      reducer,
    });

    createTypedMachine({
      config: {
        idle: {
          START: "running",
          PATCH: null,
          // @ts-expect-error!
          UNKNOWN: "done",
        },
        running: { PATCH: null, FINISH: "done" },
        done: {},
      },
      initialState: "idle",
      initialContext: { count: 0 },
      reducer,
    });
  });

  test("runtime factory из typed config сохраняет строгий payload у transition", () => {
    const createTypedMachine: TypedCreateMachineFn<Event, Deps> = core.createMachine;
    const machineConfig = createTypedMachine<Config, Context>({
      config: configLiteral,
      initialState: "idle",
      initialContext: { count: 0 },
      reducer,
    });

    const machine = core.defineMachine<Event, Deps>({
      dependencies: { audit: () => {} },
    }).create(machineConfig);

    machine.transition({ type: "PATCH", payload: { count: 1 } });
    machine.transition({ type: "FINISH", payload: { result: "ok" } });

    // @ts-expect-error!
    machine.transition({ type: "PATCH" });
    // @ts-expect-error!
    machine.transition({ type: "FINISH", payload: { result: "bad" } });
  });
});

describe("регрессионная матрица events и dependencies для нескольких machines", () => {
  type SaveString = FSMEvent<"SAVE", { id: string }>;
  type SaveNumber = FSMEvent<"SAVE", { id: number }>;
  type Reset = FSMEvent<"RESET">;

  type StringCfg = { idle: { SAVE: "saved" }; saved: { RESET: "idle" } };
  type NumberCfg = { idle: { SAVE: "saved" }; saved: {} };
  type Ctx = { saved: boolean };

  type StringDeps = { service: { load: (id: string) => Promise<string> } };
  type NumberDeps = { service: { save: (id: number) => void } };
  type TokenStringDeps = { token: string };
  type TokenNumberDeps = { token: number };

  const stringReducer: MachineReducer<StringCfg, SaveString | Reset, Ctx> = (state, _action, meta) => ({
    state: meta.nextState,
    context: state.context,
  });

  const numberReducer: MachineReducer<NumberCfg, SaveNumber, Ctx> = (state, _action, meta) => ({
    state: meta.nextState,
    context: state.context,
  });

  const stringMachine = {
    config: { idle: { SAVE: "saved" }, saved: { RESET: "idle" } },
    initialState: "idle",
    initialContext: { saved: false },
    reducer: stringReducer,
    effects: {
      saved: ({ action, service }) => {
        const id: string = action.payload.id;
        void service.load(id);
      },
    },
  } satisfies MachineConfig<StringCfg, Ctx, SaveString | Reset, StringDeps>;

  const numberMachine = {
    config: { idle: { SAVE: "saved" }, saved: {} },
    initialState: "idle",
    initialContext: { saved: false },
    reducer: numberReducer,
    effects: {
      saved: ({ action, service }) => {
        const id: number = action.payload.id;
        service.save(id);
      },
    },
  } satisfies MachineConfig<NumberCfg, Ctx, SaveNumber, NumberDeps>;

  const tokenStringMachine = {
    config: { idle: { SAVE: "saved" }, saved: {} },
    initialState: "idle",
    initialContext: { saved: false },
    reducer: numberReducer,
    effects: {
      saved: ({ token }) => {
        const value: string = token;
        void value;
      },
    },
  } satisfies MachineConfig<NumberCfg, Ctx, SaveNumber, TokenStringDeps>;

  const tokenNumberMachine = {
    config: { idle: { SAVE: "saved" }, saved: {} },
    initialState: "idle",
    initialContext: { saved: false },
    reducer: numberReducer,
    effects: {
      saved: ({ token }) => {
        const value: number = token;
        void value;
      },
    },
  } satisfies MachineConfig<NumberCfg, Ctx, SaveNumber, TokenNumberDeps>;

  type Store = {
    byString: typeof stringMachine;
    byNumber: typeof numberMachine;
  };

  test("одинаковый event type с разными payloads остаётся настоящим event union", () => {
    type Events = MachineEvents<Store>;

    expect<Events>().type.toBe<SaveString | Reset | SaveNumber>();
    expect<Events>().type.toBeAssignableTo<FSMEvent<"SAVE", { id: string }> | FSMEvent<"SAVE", { id: number }> | Reset>();

    const manager = core.MachineManager<Store>({ byString: stringMachine, byNumber: numberMachine });
    manager.transition({ type: "SAVE", payload: { id: "a" } });
    manager.transition({ type: "SAVE", payload: { id: 1 } });
    manager.transition({ type: "RESET" });

    // @ts-expect-error!
    manager.transition({ type: "SAVE" });
    // @ts-expect-error!
    manager.transition({ type: "SAVE", payload: { id: true } });
  });

  test("вывод dependencies пересекает общие object keys вместо перезаписи", () => {
    type Deps = MachineDependencies<Store>;
    type Service = Deps["service"];

    type _Service = Assert<
      Equal<Service, { load: (id: string) => Promise<string> } & { save: (id: number) => void }>
    >;

    const manager = core.MachineManager<Store>({ byString: stringMachine, byNumber: numberMachine });
    manager.setDependencies({
      service: {
        load: async (id) => id,
        save: () => {},
      },
    });

    manager.setDependencies({
      service: {
        load: async (id) => id,
        // @ts-expect-error!
        save: (id: string) => {
          void id;
        },
      },
    });
  });

  test("несовместимые collisions dependencies остаются видимыми как never", () => {
    type BrokenStore = {
      a: typeof tokenStringMachine;
      b: typeof tokenNumberMachine;
    };

    type _TokenIsNever = Assert<IsNever<MachineDependencies<BrokenStore>["token"]>>;
  });

  test("MachinesState изолирует state и context каждой machine по ключу", () => {
    type State = MachinesState<Store>;

    type _State = Assert<
      Equal<
        State,
        {
          byString: { state: "idle" | "saved"; context: typeof stringMachine.initialContext };
          byNumber: { state: "idle" | "saved"; context: typeof numberMachine.initialContext };
        }
      >
    >;
  });
});

describe("регрессионная матрица строгости effect и middleware", () => {
  type Event = FSMEvent<"START"> | FSMEvent<"STOP">;
  type Config = { idle: { START: "running" }; running: { STOP: "idle" } };
  type Context = { active: boolean };
  type Deps = { log: (message: string) => void };

  test("createEffect cancelFn видит те же суженные deps, что и effect", () => {
    const createEffect: TypedCreateEffectFn<Event, Deps> = core.createEffect;

    createEffect<Config, "running">({
      type: "latest",
      effect: ({ action, log }) => {
        expect(action).type.toBe<FSMEvent<"START">>();
        log(action.type);
      },
      cancelFn: ({ action, log }) => {
        expect(action).type.toBe<FSMEvent<"START">>();
        log(action.type);
        return () => false;
      },
    });
  });

  test("createEffect отклоняет невалидную форму return у cancelFn", () => {
    const createEffect: TypedCreateEffectFn<Event, Deps> = core.createEffect;

    createEffect<Config, "running">({
      effect: () => {},
      // @ts-expect-error!
      cancelFn: () => true,
    });
  });

  test("middleware сохраняет state/event generics при присваивании до вызова", () => {
    const immer: Middleware<StateType<Config, Context>, Event> = middleware.immerMiddleware;
    const devTools: Middleware<StateType<Config, Context>, Event> = middleware.devToolsMiddleware();

    const api = {
      getState: () => ({ state: "idle" as const, context: { active: false } }),
      transition: (action: ManagerAction<Event>) => action,
      replaceReducer: (
        cb: (
          reducer: (state: StateType<Config, Context>, action: ManagerAction<Event>) => StateType<Config, Context>,
        ) => (
          state: StateType<Config, Context>,
          action: ManagerAction<Event>,
        ) => StateType<Config, Context>,
      ) => {
        void cb;
      },
      onTransition: (
        cb: (
          prevState: StateType<Config, Context>,
          currentState: StateType<Config, Context>,
          action: ManagerAction<Event>,
        ) => void,
      ) => {
        void cb;
        return () => {};
      },
      condition: async (predicate: (action: ManagerAction<Event>) => boolean) => {
        void predicate;
        return true;
      },
    };

    expect(immer(api)((action) => action)).type.toBe<(action: ManagerAction<Event>) => ManagerAction<Event>>();
    expect(devTools(api)((action) => action)).type.toBe<(action: ManagerAction<Event>) => ManagerAction<Event>>();
  });
});

describe("регрессионная матрица generics у React provider", () => {
  type Go = FSMEvent<"GO">;
  type Stop = FSMEvent<"STOP">;
  type Config = { idle: { GO: "done" }; done: {} };
  type Context = { done: boolean };
  type Store = {
    flow: MachineConfig<Config, Context, Go>;
  };

  const store = {
    flow: {
      config: { idle: { GO: "done" }, done: {} },
      initialState: "idle",
      initialContext: { done: false },
    },
  } satisfies Store;

  test("provider отклоняет manager с несовместимой machine map", () => {
    type OtherStore = {
      other: MachineConfig<Config, Context, Go>;
    };

    const manager = core.MachineManager<OtherStore, Go>({
      other: {
        config: { idle: { GO: "done" }, done: {} },
        initialState: "idle",
        initialContext: { done: false },
      },
    });

    const element = FSMContextProvider<Store, Go>({
      // @ts-expect-error!
      machineManager: manager,
    });
    void element;
  });

  test("provider отклоняет manager с несовместимым event contract", () => {
    const manager = core.MachineManager<Store, Stop>(store);

    const element = FSMContextProvider<Store, Go>({
      // @ts-expect-error!
      machineManager: manager,
    });
    void element;
  });

  test("typed alias useManager сохраняет точный contract manager", () => {
    const useFlowManager: TypedUseMachineHook<Store, Go> = react.useManager;
    const manager = useFlowManager();

    expect(manager).type.toBe<IMachineManager<Store, Go>>();
    expect(manager.transition).type.toBe<(payload: ManagerAction<Go>) => ManagerAction<Go>>();
  });
});
