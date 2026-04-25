import React from "react";
import { describe, expect, test } from "tstyche";
import {
  Machine,
  MachineManager,
  createConfig,
  createEffect,
  createMachine,
  createReducer,
  defineMachine,
  type CFG,
  type DefaultDeps,
  type EffectType,
  type FSMEvent,
  type IMachine,
  type IMachineManager,
  type MachineConfig,
  type MachineDependencies,
  type MachineEvents,
  type MachineEffect,
  type ManagerCommitAction,
  type MachineReducer,
  type MachinesState,
  type Middleware,
  type MiddlewareApi,
  type Reducer,
  type SType,
  type State,
  type StateType,
  type Subscriber,
  type TransitionSubscriber,
  type TypedCreateConfigFn,
  type TypedCreateEffectFn,
  type TypedCreateMachineFn,
  type TypedCreateReducerFn,
  type WILDCARD,
} from "lite-fsm";
import { devToolsMiddleware as devToolsFromAll, immerMiddleware as immerFromAll } from "lite-fsm/middleware";
import { devToolsMiddleware } from "lite-fsm/middleware/devTools";
import { immerMiddleware } from "lite-fsm/middleware/immer";
import {
  FSMContext,
  FSMContextProvider,
  defineMachine as defineReactMachine,
  useManager,
  useSelector,
  useTransition,
  type FSMContextType,
  type TypedUseMachineHook,
  type TypedUseSelectorHook,
  type TypedUseTransitionHook,
} from "lite-fsm/react";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;
type NotAny<T> = IsAny<T> extends true ? false : true;

type PingEvent = FSMEvent<"PING">;
type SaveEvent = FSMEvent<"SAVE", { id: string; draft?: boolean }>;
type AnyPayloadEvent = FSMEvent<"ANY_PAYLOAD", any>;
type ExplicitUndefinedEvent = FSMEvent<"UNDEFINED_PAYLOAD", undefined>;
type OptionalPayloadEvent = FSMEvent<"OPTIONAL", { value?: string }>;

type AuthEvent =
  | FSMEvent<"LOGIN", { userId: string }>
  | FSMEvent<"LOGIN_RESOLVE", { name: string }>
  | FSMEvent<"LOGIN_REJECT", { message: string }>
  | FSMEvent<"LOGOUT">
  | FSMEvent<"REFRESH", { force?: boolean }>
  | FSMEvent<"RESET">;

type AuthContext = {
  userId: string | null;
  name: string | null;
  error: string | null;
  refreshes: number;
};

type AuthDeps = {
  api: {
    loadUser: (userId: string) => Promise<{ name: string }>;
  };
  clock: () => number;
};

const authInitialContext: AuthContext = {
  userId: null,
  name: null,
  error: null,
  refreshes: 0,
};

const createAuthConfig: TypedCreateConfigFn<AuthEvent> = createConfig;
const createAuthMachine: TypedCreateMachineFn<AuthEvent> = createMachine;
const createAuthReducer: TypedCreateReducerFn<AuthEvent> = createReducer;
const createAuthMachineWithDeps: TypedCreateMachineFn<AuthEvent, AuthDeps> = createMachine;
const createAuthEffectWithDeps: TypedCreateEffectFn<AuthEvent, AuthDeps> = createEffect;

const authConfig = createAuthConfig({
  "*": {
    RESET: "anonymous",
  },
  anonymous: {
    LOGIN: "loading",
  },
  loading: {
    LOGIN_RESOLVE: "authenticated",
    LOGIN_REJECT: "failed",
    LOGOUT: "anonymous",
  },
  authenticated: {
    LOGOUT: "anonymous",
    REFRESH: "loading",
  },
  failed: {
    LOGIN: "loading",
  },
});

const authReducer = createAuthReducer<typeof authConfig, AuthContext>((state, action, meta) => {
  expect(state.context).type.toBe<AuthContext>();
  expect(meta.config).type.toBe<typeof authConfig>();

  switch (action.type) {
    case "LOGIN":
      expect(action.payload.userId).type.toBe<string>();
      return {
        state: meta.nextState,
        context: {
          ...state.context,
          userId: action.payload.userId,
          error: null,
        },
      };

    case "LOGIN_RESOLVE":
      expect(action.payload.name).type.toBe<string>();
      return {
        state: meta.nextState,
        context: {
          ...state.context,
          name: action.payload.name,
          error: null,
        },
      };

    case "LOGIN_REJECT":
      expect(action.payload.message).type.toBe<string>();
      return {
        state: meta.nextState,
        context: {
          ...state.context,
          error: action.payload.message,
        },
      };

    case "REFRESH":
      expect(action.payload.force).type.toBe<boolean | undefined>();
      return {
        state: meta.nextState,
        context: {
          ...state.context,
          refreshes: state.context.refreshes + (action.payload.force ? 2 : 1),
        },
      };

    case "LOGOUT":
    case "RESET":
      // @ts-expect-error!
      action.payload;
      return {
        state: meta.nextState,
        context: authInitialContext,
      };
  }
});

const loadingEffect = (async ({ action, transition, condition, api, clock }) => {
  expect(action.type).type.toBe<"LOGIN" | "REFRESH">();
  expect(clock()).type.toBe<number>();

  if (action.type === "LOGIN") {
    const user = await api.loadUser(action.payload.userId);
    transition({ type: "LOGIN_RESOLVE", payload: { name: user.name } });
  }

  if (action.type === "REFRESH") {
    expect(action.payload.force).type.toBe<boolean | undefined>();
  }

  await condition((nextAction) => nextAction.type === "LOGIN_REJECT");

  // @ts-expect-error!
  transition({ type: "UNKNOWN_EVENT" });

  // @ts-expect-error!
  transition({ type: "LOGIN_RESOLVE" });
}) satisfies MachineEffect<"loading", typeof authConfig, AuthEvent, AuthDeps>;

const loadingCancelFn = (({ action }) => {
  expect(action.type).type.toBe<"LOGIN" | "REFRESH">();
  return () => action.type === "REFRESH";
}) satisfies (deps: Parameters<MachineEffect<"loading", typeof authConfig, AuthEvent, AuthDeps>>[0]) => () => boolean;

const wildcardEffect = (({ action, transition }) => {
  expect(action).type.toBe<AuthEvent>();
  transition({ type: "RESET" });
}) satisfies MachineEffect<"*", typeof authConfig, AuthEvent, AuthDeps>;

const authMachineConfig = {
  config: authConfig,
  initialState: "anonymous",
  initialContext: authInitialContext,
  reducer: authReducer,
  effects: {
    loading: loadingEffect,
    "*": wildcardEffect,
  },
} satisfies MachineConfig<typeof authConfig, AuthContext, AuthEvent, AuthDeps>;

type AuthMachineConfig = MachineConfig<typeof authConfig, AuthContext, AuthEvent, AuthDeps>;
type AuthState = StateType<typeof authConfig, AuthContext>;
type AuthPureMachine = IMachine<typeof authConfig, AuthContext, AuthEvent, AuthDeps>;

type CounterConfig = {
  idle: {
    INC: null;
    START: "running";
  };
  running: {
    STOP: "idle";
  };
};

type CounterEvent = FSMEvent<"INC", { amount: number }> | FSMEvent<"START"> | FSMEvent<"STOP">;

const counterMachineConfig = {
  config: {
    idle: {
      INC: null,
      START: "running",
    },
    running: {
      STOP: "idle",
    },
  },
  initialState: "idle",
  initialContext: { count: 0 },
  reducer: ((state, action, meta) => {
    if (action.type === "INC") {
      return { state: state.state, context: { count: state.context.count + action.payload.amount } };
    }

    return { state: meta.nextState, context: state.context };
  }) satisfies MachineReducer<CounterConfig, CounterEvent, { count: number }>,
} satisfies MachineConfig<CounterConfig, { count: number }, CounterEvent>;

type AppEvent = AuthEvent | CounterEvent;
type AppDeps = AuthDeps & {
  audit: (event: AppEvent) => void;
};

const createAppMachine: TypedCreateMachineFn<AppEvent> = createMachine;
const createAppReducer: TypedCreateReducerFn<AppEvent> = createReducer;

const appCounterReducer = createAppReducer<CounterConfig, { count: number }>((state, action, meta) => {
  if (action.type === "INC") {
    return { state: state.state, context: { count: state.context.count + action.payload.amount } };
  }

  return { state: meta.nextState, context: state.context };
});

const appCounterMachine = createAppMachine({
  config: counterMachineConfig.config,
  initialState: counterMachineConfig.initialState,
  initialContext: counterMachineConfig.initialContext,
  reducer: appCounterReducer,
});

const machines = {
  auth: authMachineConfig,
  counter: appCounterMachine,
};

type AppMachines = typeof machines;
type AppState = MachinesState<AppMachines>;
type AppContext = FSMContextType<AppMachines, AppEvent>;

describe("экспортируемые core-типы", () => {
  test("literal utility types остаются точными", () => {
    expect<SType>().type.toBe<string | number | symbol>();
    expect<WILDCARD>().type.toBe<"*">();
    expect<State<"idle" | "*" | 1 | symbol>>().type.toBe<"idle">();
    expect<EffectType>().type.toBe<"every" | "latest">();
    expect<Reducer<{ count: number }, FSMEvent<"INC">>>().type.toBe<
      (state: { count: number }, action: FSMEvent<"INC">) => { count: number }
    >();
  });

  test("FSMEvent сохраняет строгую типизацию payload", () => {
    type UnknownPayloadEvent = FSMEvent<"UNKNOWN_PAYLOAD", unknown>;
    type VoidPayloadEvent = FSMEvent<"VOID_PAYLOAD", void>;
    type NullPayloadEvent = FSMEvent<"NULL_PAYLOAD", null>;
    type MaybePayloadEvent = FSMEvent<"MAYBE_PAYLOAD", { id: string } | undefined>;
    type ReadonlyArrayPayloadEvent = FSMEvent<"ARRAY_PAYLOAD", readonly string[]>;
    type UnionNameEvent = FSMEvent<"LEFT" | "RIGHT">;
    type ReusedNameEvent = FSMEvent<"SET", { value: string }> | FSMEvent<"SET", { value: number }>;

    expect<PingEvent>().type.toBe<{ type: "PING" }>();
    expect<SaveEvent>().type.toBe<{ type: "SAVE"; payload: { id: string; draft?: boolean } }>();
    type _AnyPayloadIsRequired = Assert<Equal<AnyPayloadEvent, { type: "ANY_PAYLOAD"; payload: any }>>;
    expect<ExplicitUndefinedEvent>().type.toBe<{ type: "UNDEFINED_PAYLOAD"; payload: undefined }>();
    expect<OptionalPayloadEvent>().type.toBe<{ type: "OPTIONAL"; payload: { value?: string } }>();
    expect<UnknownPayloadEvent>().type.toBe<{ type: "UNKNOWN_PAYLOAD"; payload: unknown }>();
    expect<VoidPayloadEvent>().type.toBe<{ type: "VOID_PAYLOAD"; payload: void }>();
    expect<NullPayloadEvent>().type.toBe<{ type: "NULL_PAYLOAD"; payload: null }>();
    expect<MaybePayloadEvent>().type.toBe<{ type: "MAYBE_PAYLOAD"; payload: { id: string } | undefined }>();
    expect<ReadonlyArrayPayloadEvent>().type.toBe<{ type: "ARRAY_PAYLOAD"; payload: readonly string[] }>();
    expect<UnionNameEvent>().type.toBe<{ type: "LEFT" } | { type: "RIGHT" }>();
    expect<NotAny<PingEvent | SaveEvent | OptionalPayloadEvent>>().type.toBe<true>();

    const pingEvent: PingEvent = { type: "PING" };
    const saveEvent: SaveEvent = { type: "SAVE", payload: { id: "item-1" } };
    const anyPayloadEventWithoutPayload: AnyPayloadEvent = { type: "ANY_PAYLOAD", payload: undefined };
    const anyPayloadEventWithPayload: AnyPayloadEvent = { type: "ANY_PAYLOAD", payload: 123 };
    const unknownPayloadEvent: UnknownPayloadEvent = { type: "UNKNOWN_PAYLOAD", payload: "anything" };
    const voidPayloadEvent: VoidPayloadEvent = { type: "VOID_PAYLOAD", payload: undefined };
    const nullPayloadEvent: NullPayloadEvent = { type: "NULL_PAYLOAD", payload: null };
    const maybePayloadEvent: MaybePayloadEvent = { type: "MAYBE_PAYLOAD", payload: undefined };
    const readonlyArrayPayloadEvent: ReadonlyArrayPayloadEvent = { type: "ARRAY_PAYLOAD", payload: ["a", "b"] };
    const reusedNameEvent: ReusedNameEvent = { type: "SET", payload: { value: 1 } };

    expect(pingEvent).type.toBe<PingEvent>();
    expect(saveEvent).type.toBe<SaveEvent>();
    expect(anyPayloadEventWithoutPayload).type.toBe<AnyPayloadEvent>();
    expect(anyPayloadEventWithPayload).type.toBe<AnyPayloadEvent>();
    expect(unknownPayloadEvent.payload).type.toBe<unknown>();
    expect(voidPayloadEvent).type.toBe<VoidPayloadEvent>();
    expect(nullPayloadEvent).type.toBe<NullPayloadEvent>();
    expect(maybePayloadEvent.payload).type.toBe<{ id: string } | undefined>();
    expect(readonlyArrayPayloadEvent.payload).type.toBe<readonly string[]>();
    expect(reusedNameEvent.payload.value).type.toBe<number>();

    // @ts-expect-error!
    const pingWithPayload: PingEvent = { type: "PING", payload: undefined };

    // @ts-expect-error!
    const saveWithoutPayload: SaveEvent = { type: "SAVE" };

    // @ts-expect-error!
    const optionalPayloadWithoutPayload: OptionalPayloadEvent = { type: "OPTIONAL" };

    // @ts-expect-error!
    const unknownPayloadWithoutPayload: UnknownPayloadEvent = { type: "UNKNOWN_PAYLOAD" };

    // @ts-expect-error!
    const voidPayloadWithoutPayload: VoidPayloadEvent = { type: "VOID_PAYLOAD" };

    // @ts-expect-error!
    const nullPayloadWithUndefined: NullPayloadEvent = { type: "NULL_PAYLOAD", payload: undefined };

    // @ts-expect-error!
    const maybePayloadWithoutPayload: MaybePayloadEvent = { type: "MAYBE_PAYLOAD" };

    // @ts-expect-error!
    const reusedNameEventWithWrongPayload: ReusedNameEvent = { type: "SET", payload: { value: true } };
  });
});

describe("config, reducers и effects", () => {
  test("createConfig сохраняет states и отклоняет невалидные transitions", () => {
    expect<typeof authConfig>().type.toBe<{
      "*": { RESET: "anonymous" };
      anonymous: { LOGIN: "loading" };
      loading: { LOGIN_RESOLVE: "authenticated"; LOGIN_REJECT: "failed"; LOGOUT: "anonymous" };
      authenticated: { LOGOUT: "anonymous"; REFRESH: "loading" };
      failed: { LOGIN: "loading" };
    }>();
    expect<NotAny<typeof authConfig>>().type.toBe<true>();
    expect<typeof authConfig extends CFG<typeof authConfig, AuthEvent, keyof typeof authConfig> ? true : false>().type.toBe<true>();

    createAuthConfig({
      anonymous: {
        // @ts-expect-error!
        UNKNOWN_EVENT: "loading",
      },
      loading: {},
    });

    createAuthConfig({
      anonymous: {
        // @ts-expect-error!
        LOGIN: "missing",
      },
      loading: {},
    });

    createAuthConfig({
      anonymous: {
        // @ts-expect-error!
        LOGIN: "*",
      },
      loading: {},
    });

    createAuthConfig({
      anonymous: {
        LOGIN: null,
      },
      loading: {},
    });

    const partialAuthConfig = createAuthConfig({
      anonymous: {},
      loading: {
        LOGOUT: "anonymous",
      },
    });

    expect(partialAuthConfig.loading.LOGOUT).type.toBe<"anonymous">();
  });

  test("DefaultDeps сужает action по target state", () => {
    expect<DefaultDeps<"loading", typeof authConfig, AuthEvent>["action"]>().type.toBe<
      Extract<AuthEvent, { type: "LOGIN" | "REFRESH" }>
    >();
    expect<DefaultDeps<"anonymous", typeof authConfig, AuthEvent>["action"]>().type.toBe<
      Extract<AuthEvent, { type: "LOGOUT" | "RESET" }>
    >();
    expect<DefaultDeps<"*", typeof authConfig, AuthEvent>["action"]>().type.toBe<AuthEvent>();

    type OrphanEvent = FSMEvent<"START"> | FSMEvent<"STOP">;
    type OrphanConfig = {
      idle: {
        START: "done";
      };
      done: {
        STOP: "idle";
      };
      orphan: {};
    };

    type _OrphanActionIsNever = Assert<IsNever<DefaultDeps<"orphan", OrphanConfig, OrphanEvent>["action"]>>;
    expect<DefaultDeps<"done", OrphanConfig, OrphanEvent>["action"]>().type.toBe<FSMEvent<"START">>();
  });

  test("MachineConfig строго типизирует context, reducer, effects и deps", () => {
    const authMachineCreatedWithDeps = createAuthMachineWithDeps(authMachineConfig);

    expect<typeof authMachineConfig>().type.toBeAssignableTo<AuthMachineConfig>();
    expect(authMachineCreatedWithDeps).type.toBe<AuthMachineConfig>();
    expect<AuthState>().type.toBe<{
      context: AuthContext;
      state: "anonymous" | "loading" | "authenticated" | "failed";
    }>();
    expect<NotAny<typeof authMachineConfig>>().type.toBe<true>();
    expect<NotAny<AuthState>>().type.toBe<true>();

    const authMachineConfigWithInvalidEffectKey = {
      config: authConfig,
      initialState: "anonymous",
      initialContext: authInitialContext,
      effects: {
        // @ts-expect-error!
        missing: wildcardEffect,
      },
    } satisfies MachineConfig<typeof authConfig, AuthContext, AuthEvent, AuthDeps>;

    // @ts-expect-error!
    const invalidLoadingCancelFn: (
      deps: Parameters<MachineEffect<"loading", typeof authConfig, AuthEvent, AuthDeps>>[0],
    ) => () => boolean = (deps) => {
      expect(deps.action.type).type.toBe<"LOGIN" | "REFRESH">();
      return true;
    };

    createAuthMachine({
      config: authConfig,
      // @ts-expect-error!
      initialState: "*",
      initialContext: authInitialContext,
    });

    createAuthMachine({
      config: authConfig,
      // @ts-expect-error!
      initialState: "missing",
      initialContext: authInitialContext,
    });

    const invalidAuthContextMachine = {
      config: authConfig,
      initialState: "anonymous",
      initialContext: {
        userId: null,
        name: null,
        error: null,
        // @ts-expect-error!
        refreshes: "wrong",
      },
    } satisfies MachineConfig<typeof authConfig, AuthContext, AuthEvent, AuthDeps>;

    expect(invalidAuthContextMachine.config).type.toBe<typeof authConfig>();

    const authMachineWithSpecificEffects = {
      config: authConfig,
      initialState: "anonymous",
      initialContext: authInitialContext,
      effects: {
        anonymous: (({ action }) => {
          expect(action.type).type.toBe<"LOGOUT" | "RESET">();
        }) satisfies MachineEffect<"anonymous", typeof authConfig, AuthEvent, AuthDeps>,
        failed: (({ action }) => {
          expect(action.type).type.toBe<"LOGIN_REJECT">();
        }) satisfies MachineEffect<"failed", typeof authConfig, AuthEvent, AuthDeps>,
      },
    } satisfies MachineConfig<typeof authConfig, AuthContext, AuthEvent, AuthDeps>;

    expect(authMachineWithSpecificEffects.effects.failed).type.toBeAssignableTo<
      MachineEffect<"failed", typeof authConfig, AuthEvent, AuthDeps>
    >();
  });

  test("createReducer отклоняет невалидный return для state и context", () => {
    expect(appCounterReducer).type.toBe<MachineReducer<CounterConfig, AppEvent, { count: number }>>();

    // @ts-expect-error!
    createAppReducer<CounterConfig, { count: number }>((state, action) => {
      if (action.type === "INC") {
        return { state: state.state, context: { total: action.payload.amount } };
      }

      return state;
    });

    // @ts-expect-error!
    createAppReducer<CounterConfig, { count: number }>((state) => {
      return { state: "missing", context: state.context };
    });
  });

  test("createEffect сохраняет actions, специфичные для state", () => {
    type TimerEvent = FSMEvent<"TICK"> | FSMEvent<"DONE">;
    const createTimerConfig: TypedCreateConfigFn<TimerEvent> = createConfig;
    const createTimerEffect: TypedCreateEffectFn<TimerEvent> = createEffect;

    const timerConfig = createTimerConfig({
      idle: {
        TICK: "done",
      },
      done: {
        DONE: null,
      },
    });

    const timerDoneEffect = createTimerEffect<typeof timerConfig, "done">({
      effect: ({ action, transition }) => {
        expect(action.type).type.toBe<"TICK">();
        transition({ type: "DONE" });

        // @ts-expect-error!
        transition({ type: "UNKNOWN_EVENT" });
      },
    });

    const timerLatestEffect = createTimerEffect<typeof timerConfig, "done">({
      type: "latest",
      effect: async ({ action, condition }) => {
        expect(action.type).type.toBe<"TICK">();
        expect(await condition((nextAction) => nextAction.type === "DONE")).type.toBe<boolean>();
      },
      cancelFn: ({ action }) => {
        expect(action.type).type.toBe<"TICK">();
        return () => false;
      },
    });

    const timerEveryEffect = createTimerEffect<typeof timerConfig, "*">({
      type: "every",
      effect: ({ action }) => {
        expect(action).type.toBe<TimerEvent>();
      },
    });

    createTimerEffect<typeof timerConfig, "done">({
      // @ts-expect-error!
      type: "first",
      effect: () => undefined,
    });

    createTimerEffect<typeof timerConfig, "done">({
      effect: () => undefined,
      // @ts-expect-error!
      cancelFn: () => true,
    });

    expect(timerDoneEffect).type.toBe<MachineEffect<"done", typeof timerConfig, TimerEvent>>();
    expect(timerLatestEffect).type.toBe<MachineEffect<"done", typeof timerConfig, TimerEvent>>();
    expect(timerEveryEffect).type.toBe<MachineEffect<"*", typeof timerConfig, TimerEvent>>();

    const authLoadingEffectWithDeps = createAuthEffectWithDeps<typeof authConfig, "loading">({
      effect: ({ action, api, clock }) => {
        expect(action.type).type.toBe<"LOGIN" | "REFRESH">();
        expect(api.loadUser).type.toBe<(userId: string) => Promise<{ name: string }>>();
        expect(clock()).type.toBe<number>();
      },
    });

    expect(authLoadingEffectWithDeps).type.toBe<MachineEffect<"loading", typeof authConfig, AuthEvent, AuthDeps>>();
  });
});

describe("Machine и defineMachine", () => {
  test("чистая Machine раскрывает точные типы transition и invokeEffect", () => {
    const pureAuthMachine = Machine<typeof authConfig, AuthContext, AuthEvent["type"], AuthEvent, AuthDeps>(authMachineConfig);
    const inferredCounterMachine = Machine(counterMachineConfig);
    const pureAuthNext = pureAuthMachine.transition(
      { state: "anonymous", context: authInitialContext },
      { type: "LOGIN", payload: { userId: "u1" } },
    );

    expect(pureAuthMachine).type.toBeAssignableTo<AuthPureMachine>();
    expect(inferredCounterMachine).type.toBeAssignableTo<IMachine<CounterConfig, { count: number }, CounterEvent>>();
    expect<ReturnType<AuthPureMachine["transition"]>>().type.toBe<AuthState>();
    expect(pureAuthNext).type.toBeAssignableTo<AuthState>();
    expect(pureAuthNext.state).type.toBe<"anonymous" | "loading" | "authenticated" | "failed">();

    // @ts-expect-error!
    pureAuthMachine.transition({ state: "anonymous", context: authInitialContext }, { type: "UNKNOWN_EVENT" });

    // @ts-expect-error!
    pureAuthMachine.transition({ state: "missing", context: authInitialContext }, { type: "RESET" });

    // @ts-expect-error!
    inferredCounterMachine.transition({ state: "idle", context: { count: 0 } }, { type: "INC" });

    inferredCounterMachine.transition(
      {
        state: "idle",
        context: {
          // @ts-expect-error!
          count: "wrong",
        },
      },
      { type: "START" },
    );

    pureAuthMachine.invokeEffect("anonymous", "loading", {
      api: { loadUser: async () => ({ name: "Hedy" }) },
      clock: () => 0,
      action: { type: "LOGIN", payload: { userId: "u5" } },
      transition: (action) => action,
      condition: async (predicate) => predicate({ type: "LOGIN_REJECT", payload: { message: "x" } }),
    });

    // @ts-expect-error!
    pureAuthMachine.invokeEffect("anonymous", "loading", {
      action: { type: "LOGIN", payload: { userId: "u5" } },
      transition: (action) => action,
      condition: async () => true,
    });

    // @ts-expect-error!
    pureAuthMachine.invokeEffect("missing", "loading", {
      api: { loadUser: async () => ({ name: "Hedy" }) },
      clock: () => 0,
      action: { type: "LOGIN", payload: { userId: "u5" } },
      transition: (action) => action,
      condition: async () => true,
    });
  });

  test("defineMachine возвращает stateful API, типизированный events и deps", () => {
    const authRuntimeMachine = defineMachine<AuthEvent, AuthDeps>({
      dependencies: {
        api: { loadUser: async () => ({ name: "Ada" }) },
        clock: () => Date.now(),
      },
      onError: (error: unknown) => {
        expect(error).type.toBe<unknown>();
      },
    }).create(authMachineConfig);

    expect(authRuntimeMachine.getState()).type.toBe<AuthState>();
    expect(authRuntimeMachine.onTransition).type.toBe<
      (cb: Subscriber<typeof authConfig, AuthContext, AuthEvent>) => () => void
    >();
    expect(authRuntimeMachine.transition).type.toBeCallableWith({ type: "LOGIN", payload: { userId: "u2" } } as const);
    expect(authRuntimeMachine.transition).type.toBeCallableWith({ type: "LOGOUT" } as const);

    // @ts-expect-error!
    authRuntimeMachine.transition({ type: "LOGIN" });

    defineMachine<AuthEvent, AuthDeps>({
      // @ts-expect-error!
      dependencies: {
        api: { loadUser: async () => ({ name: "Ada" }) },
      },
    });
  });
});

describe("MachineManager и middleware", () => {
  test("MachinesState мапит каждую machine в её literal state и context", () => {
    expect<AppState>().type.toBe<{
      auth: {
        state: "anonymous" | "loading" | "authenticated" | "failed";
        context: AuthContext;
      };
      counter: {
        state: "idle" | "running";
        context: { count: number };
      };
    }>();
    expect<NotAny<AppMachines>>().type.toBe<true>();
    expect<NotAny<AppState>>().type.toBe<true>();
    expect<MachineEvents<AppMachines>>().type.toBe<AppEvent>();
    expect<MachineDependencies<AppMachines>>().type.toBe<AuthDeps>();
  });

  test("manager сохраняет типы transition, subscribers, deps и replaceReducer", () => {
    const manager = MachineManager<AppMachines, AppEvent>(machines, {
      onError: (error: unknown) => {
        expect(error).type.toBe<unknown>();
      },
      middleware: [immerMiddleware, devToolsMiddleware()],
    });

    const inferredManager = MachineManager(machines);
    const appState = manager.getState();

    expect(manager).type.toBeAssignableTo<IMachineManager<AppMachines, AppEvent>>();
    expect(inferredManager).type.toBe<IMachineManager<AppMachines, AppEvent>>();
    expect(appState).type.toBe<AppState>();
    expect(appState.auth.context).type.toBe<AuthContext>();
    expect(appState.counter.context).type.toBe<{ count: number }>();
    expect(appState.counter.state).type.toBe<"idle" | "running">();
    expect(manager.transition).type.toBeCallableWith({ type: "INC", payload: { amount: 1 } } as const);
    expect(manager.transition).type.toBeCallableWith({ type: "LOGIN", payload: { userId: "u3" } } as const);
    expect(manager.transition).type.toBeCallableWith({ type: "RESET" } as const);

    // @ts-expect-error!
    manager.transition({ type: "INC" });

    // @ts-expect-error!
    manager.transition({ type: "UNKNOWN_EVENT" });

    inferredManager.transition({ type: "LOGIN", payload: { userId: "u3" } });

    // @ts-expect-error!
    inferredManager.transition({ type: "LOGIN" });

    const appTransitionSubscriber: TransitionSubscriber<AppMachines, AppEvent> = (prevState, currentState, action) => {
      expect(prevState).type.toBe<AppState>();
      expect(currentState).type.toBe<AppState>();
      expect(action).type.toBe<ManagerCommitAction<AppMachines, AppEvent>>();
    };

    manager.onTransition(appTransitionSubscriber);
    manager.onTransition((prevState, currentState, action) => {
      expect(prevState).type.toBe<AppState>();
      expect(currentState).type.toBe<AppState>();
      expect(action).type.toBe<ManagerCommitAction<AppMachines, AppEvent>>();

      if (action.type === "INC") {
        expect(action.payload.amount).type.toBe<number>();
      }
    });

    // @ts-expect-error!
    manager.onTransition((_prevState, _currentState, action: FSMEvent<"UNKNOWN_EVENT">) => {
      expect(action.type).type.toBe<"UNKNOWN_EVENT">();
    });

    manager.replaceReducer((original) => (state, action) => {
      if (action.type === "RESET") {
        return {
          ...state,
          auth: { state: "anonymous", context: authInitialContext },
          counter: { state: "idle", context: { count: 0 } },
        };
      }

      return original(state, action);
    });

    manager.setDependencies({
      api: { loadUser: async () => ({ name: "Lin" }) },
      clock: () => 0,
    });

    manager.setDependencies((deps) => ({
      ...deps,
      clock: () => deps.clock() + 1,
    }));

    manager.setDependencies({
      api: { loadUser: async () => ({ name: "Lin" }) },
      clock: () => 0,
      // @ts-expect-error!
      audit: (_event: AppEvent) => undefined,
    });

    manager.setDependencies({
      api: { loadUser: async () => ({ name: "Lin" }) },
      // @ts-expect-error!
      clock: "wrong",
    });
  });

  test("middleware API сохраняет контракты state и event", () => {
    const authRuntimeMachine = defineMachine<AuthEvent, AuthDeps>({
      dependencies: {
        api: { loadUser: async () => ({ name: "Ada" }) },
        clock: () => Date.now(),
      },
    }).create(authMachineConfig);

    const authSubscriber: Subscriber<typeof authConfig, AuthContext, AuthEvent> = (prevState, currentState, action) => {
      expect(prevState).type.toBe<AuthState>();
      expect(currentState).type.toBe<AuthState>();
      expect(action).type.toBe<AuthEvent>();
    };

    const authMiddlewareApi: MiddlewareApi<AuthState, AuthEvent> = {
      getState: authRuntimeMachine.getState,
      transition: authRuntimeMachine.transition,
      replaceReducer: () => undefined,
      onTransition: authRuntimeMachine.onTransition,
      condition: async () => true,
    };

    const authMiddleware: Middleware<AuthState, AuthEvent> = (api) => {
      expect(api.getState()).type.toBe<AuthState>();

      api.replaceReducer((original) => (state, action) => {
        if (action.type === "RESET") {
          return { state: "anonymous", context: authInitialContext };
        }

        return original(state, action);
      });

      api.condition((action) => {
        if (action.type === "LOGIN") {
          expect(action.payload.userId).type.toBe<string>();
        }

        return action.type === "LOGOUT";
      });

      return (next) => (action) => {
        expect(next(action)).type.toBe<AuthEvent>();

        // @ts-expect-error!
        api.transition({ type: "UNKNOWN_EVENT" });

        // @ts-expect-error!
        next({ type: "LOGIN" });

        return next(action);
      };
    };

    const invalidAuthMiddleware: Middleware<AuthState, AuthEvent> = (api) => {
      api.replaceReducer(() =>
        // @ts-expect-error!
        () => ({ state: "missing", context: authInitialContext }),
      );

      return (next) => (action) => next(action);
    };

    authRuntimeMachine.onTransition(authSubscriber);
    authRuntimeMachine.addMiddleware(authMiddleware);
    authRuntimeMachine.addMiddleware(immerMiddleware);
    authRuntimeMachine.addMiddleware(immerFromAll);
    authRuntimeMachine.addMiddleware(devToolsMiddleware());
    authRuntimeMachine.addMiddleware(devToolsMiddleware({ blacklistActions: ["RESET"] }));
    authRuntimeMachine.addMiddleware(devToolsFromAll());

    // @ts-expect-error!
    authRuntimeMachine.addMiddleware(devToolsMiddleware({ blacklistActions: [1] }));

    expect(authMiddlewareApi).type.toBe<MiddlewareApi<AuthState, AuthEvent>>();
    expect(invalidAuthMiddleware).type.toBe<Middleware<AuthState, AuthEvent>>();

    const managerMiddleware: Middleware<AppState, AppEvent> = (api) => (next) => (action) => {
      expect(api.getState()).type.toBe<AppState>();
      return next(action);
    };

    const incompatibleMiddleware: Middleware<{ ready: boolean }, AppEvent> = (api) => (next) => (action) => {
      expect(api.getState()).type.toBe<{ ready: boolean }>();
      return next(action);
    };

    MachineManager<AppMachines, AppEvent>(machines, {
      middleware: [managerMiddleware, immerFromAll, devToolsFromAll()],
    });

    MachineManager<AppMachines, AppEvent>(machines, {
      // @ts-expect-error!
      middleware: [incompatibleMiddleware],
    });
  });
});

describe("React API в lite-fsm", () => {
  test("provider hooks можно специализировать под app machines и events", () => {
    const manager = MachineManager<AppMachines, AppEvent>(machines, {
      middleware: [immerMiddleware],
    });

    const useAppTransition: TypedUseTransitionHook<AppEvent> = useTransition;
    const useAppSelector: TypedUseSelectorHook<AppMachines> = useSelector;
    const useAppManager: TypedUseMachineHook<AppMachines, AppEvent> = useManager;

    function useProviderHooksExamples() {
      const currentManager = useManager<AppMachines, AppEvent>();
      const transition = useTransition<AppEvent>();
      const authName = useSelector<AppMachines, string | null>((state) => state.auth.context.name);
      const selected = useSelector(
        (state: AppState) => ({
          authState: state.auth.state,
          count: state.counter.context.count,
        }),
        (left, right) => left.authState === right.authState && left.count === right.count,
      );

      expect(currentManager).type.toBe<AppContext>();
      expect(authName).type.toBe<string | null>();
      expect(selected.authState).type.toBe<"anonymous" | "loading" | "authenticated" | "failed">();

      transition({ type: "START" });
      transition({ type: "LOGIN", payload: { userId: "u4" } });

      // @ts-expect-error!
      transition({ type: "LOGIN" });

      // @ts-expect-error!
      useSelector<AppMachines, number>((state) => state.missing.context.count);

      useSelector<AppMachines, number>(
        (state) => state.counter.context.count,
        // @ts-expect-error!
        (left: string, right: string) => left === right,
      );

      return selected;
    }

    function useTypedHookAliasExamples() {
      const currentManager = useAppManager();
      const transition = useAppTransition();
      const count = useAppSelector((state) => state.counter.context.count);

      expect(currentManager).type.toBe<AppContext>();
      expect(count).type.toBe<number>();

      transition({ type: "INC", payload: { amount: 2 } });

      // @ts-expect-error!
      useAppSelector((state) => state.missing);

      return count;
    }

    const providerElement = (
      <FSMContextProvider machineManager={manager}>
        <span>typed provider</span>
      </FSMContextProvider>
    );

    const invalidProviderElement = (
      // @ts-expect-error!
      <FSMContextProvider machineManager={{ transition: () => ({ type: "RESET" }) }}>
        <span>invalid provider</span>
      </FSMContextProvider>
    );

    expect(providerElement).type.toBeAssignableTo<React.JSX.Element>();
    expect(invalidProviderElement).type.toBeAssignableTo<React.JSX.Element>();
    expect(FSMContext).type.toBeAssignableTo<React.Context<unknown>>();
    expect(useProviderHooksExamples).type.toBe<() => { authState: "anonymous" | "loading" | "authenticated" | "failed"; count: number }>();
    expect(useTypedHookAliasExamples).type.toBe<() => number>();
  });

  test("react defineMachine возвращает hook и методы machine", () => {
    const reactAuthMachine = defineReactMachine<AuthEvent, AuthDeps>({
      dependencies: {
        api: { loadUser: async () => ({ name: "Katherine" }) },
        clock: () => 1,
      },
    }).create(authMachineConfig);

    function useReactDefineMachineExamples() {
      const name = reactAuthMachine((state) => state.context.name);
      const stateAndRefreshes = reactAuthMachine(
        (state) => ({
          state: state.state,
          refreshes: state.context.refreshes,
        }),
        (left, right) => left.state === right.state && left.refreshes === right.refreshes,
      );

      expect(name).type.toBe<string | null>();
      expect(stateAndRefreshes.state).type.toBe<"anonymous" | "loading" | "authenticated" | "failed">();
      expect(reactAuthMachine.getState()).type.toBe<AuthState>();

      reactAuthMachine.transition({ type: "REFRESH", payload: {} });

      // @ts-expect-error!
      reactAuthMachine.transition({ type: "UNKNOWN_EVENT" });

      // @ts-expect-error!
      reactAuthMachine((state) => state.context.missing);

      // @ts-expect-error!
      reactAuthMachine((state) => state.context.refreshes, () => "same");

      return stateAndRefreshes;
    }

    expect(reactAuthMachine.transition).type.toBeCallableWith({ type: "LOGIN", payload: { userId: "u6" } } as const);
    expect(useReactDefineMachineExamples).type.toBe<() => {
      state: "anonymous" | "loading" | "authenticated" | "failed";
      refreshes: number;
    }>();
  });
});

describe("пограничные случаи", () => {
  test("inline createMachine выводит state и context без project aliases", () => {
    const inlineMachineConfig = createMachine({
      config: {
        idle: {
          START: "running",
          PATCH: null,
        },
        running: {
          STOP: "idle",
        },
      },
      initialState: "idle",
      initialContext: {
        count: 0,
        label: "draft",
      },
    });

    type InlineMachineState = StateType<typeof inlineMachineConfig.config, typeof inlineMachineConfig.initialContext>;

    expect<InlineMachineState>().type.toBe<{
      context: {
        count: number;
        label: string;
      };
      state: "idle" | "running";
    }>();

    expect(
      Machine(inlineMachineConfig).transition(
        { state: "idle", context: { count: 0, label: "draft" } },
        { type: "START" },
      ),
    ).type.toBeAssignableTo<InlineMachineState>();

    // @ts-expect-error!
    Machine(inlineMachineConfig).transition({ state: "missing", context: { count: 0, label: "draft" } }, { type: "START" });
  });

  test("self-transition мержит payload и сохраняет state literal", () => {
    type PatchEvent = FSMEvent<"PATCH", Partial<AuthContext>>;
    const createPatchMachine: TypedCreateMachineFn<PatchEvent> = createMachine;

    const patchMachineConfig = createPatchMachine({
      config: {
        idle: {
          PATCH: null,
        },
      },
      initialState: "idle",
      initialContext: authInitialContext,
    });

    const patchedState = Machine<typeof patchMachineConfig.config, AuthContext, PatchEvent["type"], PatchEvent>(patchMachineConfig).transition(
      { state: "idle", context: authInitialContext },
      { type: "PATCH", payload: { name: "Grace" } },
    );

    expect(patchedState.context).type.toBe<AuthContext>();
    expect(patchedState.state).type.toBe<"idle">();
  });

  test("wildcard key в config не входит в public state union", () => {
    type LiteralStates = StateType<
      {
        "*": {
          RESET: "idle";
        };
        idle: {
          START: "running";
        };
        running: {
          STOP: "idle";
        };
      },
      { ok: boolean }
    >["state"];

    expect<LiteralStates>().type.toBe<"idle" | "running">();
  });

  test("machine manager выводит event unions из machine configs", () => {
    const inferredManager = MachineManager(machines);

    inferredManager.transition({ type: "INC", payload: { amount: 1 } });
    inferredManager.transition({ type: "LOGIN", payload: { userId: "u7" } });
    inferredManager.transition({ type: "LOGOUT" });

    expect(inferredManager.transition).type.toBe<(payload: AppEvent) => AppEvent>();
    expect(inferredManager.onTransition).type.toBe<(cb: TransitionSubscriber<AppMachines, AppEvent>) => () => void>();

    // @ts-expect-error!
    inferredManager.transition({ type: "UNKNOWN_EVENT" });

    // @ts-expect-error!
    inferredManager.transition({ type: "INC" });
  });
});
