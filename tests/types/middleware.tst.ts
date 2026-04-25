import { describe, expect, test } from "tstyche";
import type {
  AnyEvent,
  FSMEvent,
  GenericMiddleware,
  MachineStore,
  ManagerCommitAction,
  Middleware,
  MiddlewareApi,
  Reducer,
} from "lite-fsm";
import { devToolsMiddleware } from "lite-fsm/middleware/devTools";
import { immerMiddleware } from "lite-fsm/middleware/immer";

import type { Assert, Equal } from "./_helpers";

type State = { count: number };
type IncEvent = FSMEvent<"INC", { amount: number }>;
type ResetEvent = FSMEvent<"RESET">;
type Evt = IncEvent | ResetEvent;

describe("Middleware<S, P>", () => {
  test("раскрывается в (api) => (next) => (action) => action", () => {
    type M = Middleware<State, Evt>;
    type _Shape = Assert<
      Equal<M, (api: MiddlewareApi<State, Evt>) => (next: (action: Evt) => Evt) => (action: Evt) => Evt>
    >;
  });

  test("по умолчанию S равен unknown, а P равен AnyEvent", () => {
    type M = Middleware;
    type _Api = Parameters<M>[0];
    expect<_Api>().type.toBe<MiddlewareApi<unknown, AnyEvent>>();
  });

  test("return value становится следующей wrapper-функцией", () => {
    type M = Middleware<State, Evt>;
    type Wrapper = ReturnType<M>;
    expect<Wrapper>().type.toBe<(next: (action: Evt) => Evt) => (action: Evt) => Evt>();
  });

  test("dispatch обёрнутого action остаётся типизированным", () => {
    const mw: Middleware<State, Evt> = (api) => (next) => (action) => {
      expect(api.getState()).type.toBe<State>();
      expect(action).type.toBe<Evt>();
      expect(next(action)).type.toBe<Evt>();
      return next(action);
    };
    void mw;
  });
});

describe("MiddlewareApi<S, P>", () => {
  test("содержит ровно 5 ключей", () => {
    type Api = MiddlewareApi<State, Evt>;
    type _Keys = Assert<
      Equal<keyof Api, "getState" | "transition" | "replaceReducer" | "onTransition" | "condition">
    >;
  });

  test("getState возвращает S", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["getState"]>().type.toBe<() => State>();
  });

  test("transition возвращает P", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["transition"]>().type.toBe<(action: Evt) => Evt>();
  });

  test("replaceReducer принимает updater для reducer", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["replaceReducer"]>().type.toBe<(cb: (reducer: Reducer<State, Evt>) => Reducer<State, Evt>) => void>();
  });

  test("onTransition подписывается на prev/current/action", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["onTransition"]>().type.toBe<
      (cb: (prevState: State, currentState: State, action: ManagerCommitAction<MachineStore, Evt>) => void) => () => void
    >();
  });

  test("condition принимает predicate и возвращает Promise<boolean>", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["condition"]>().type.toBe<(predicate: (a: Evt) => boolean) => Promise<boolean>>();
  });
});

describe("immerMiddleware", () => {
  test("присваивается к Middleware для совместимой пары state/event", () => {
    expect(immerMiddleware).type.toBeAssignableTo<Middleware<State, Evt>>();
    expect(immerMiddleware).type.toBeAssignableTo<Middleware>();
  });

  test("несёт brand VOID_REDUCER_MIDDLEWARE_MARKER для runtime-детекта", () => {
    expect(immerMiddleware.__liteFsmAllowVoidReducer).type.toBe<true>();
  });

  test("вызванная форма возвращает следующий wrapper", () => {
    const wrapped = immerMiddleware({} as MiddlewareApi<State, Evt>);
    expect<ReturnType<typeof wrapped>>().type.toBe<(action: Evt) => Evt>();
  });
});

describe("devToolsMiddleware", () => {
  test("без options возвращает Middleware", () => {
    const mw = devToolsMiddleware();
    expect(mw).type.toBe<GenericMiddleware>();
  });

  test("принимает blacklistActions: string[]", () => {
    const mw = devToolsMiddleware({ blacklistActions: ["INC"] });
    expect(mw).type.toBe<GenericMiddleware>();
  });

  test("отклоняет blacklistActions не из string", () => {
    devToolsMiddleware({
      // @ts-expect-error!
      blacklistActions: [1],
    });
  });

  test("отклоняет неизвестные options", () => {
    devToolsMiddleware({
      // @ts-expect-error!
      unknownOption: true,
    });
  });

  test("не несёт VOID_REDUCER_MIDDLEWARE_MARKER", () => {
    const mw = devToolsMiddleware();
    expect(mw).type.not.toHaveProperty("__liteFsmAllowVoidReducer");
  });

  test("результат присваивается к Middleware<State, Evt>", () => {
    const mw = devToolsMiddleware();
    expect(mw).type.toBeAssignableTo<Middleware<State, Evt>>();
  });
});
