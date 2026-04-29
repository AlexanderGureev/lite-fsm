import { describe, expect, test } from "tstyche";
import type {
  AnyEvent,
  FSMEvent,
  GenericMiddleware,
  MachineStore,
  ManagerAction,
  ManagerCommitAction,
  Middleware,
  MiddlewareApi,
  Reducer,
  VoidReducerMiddleware,
} from "lite-fsm";
import { devToolsMiddleware as devToolsFromBarrel, immerMiddleware as immerFromBarrel } from "lite-fsm/middleware";
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
      Equal<
        M,
        (api: MiddlewareApi<State, Evt>) => (
          next: (action: ManagerAction<Evt>) => ManagerAction<Evt>
        ) => (action: ManagerAction<Evt>) => ManagerAction<Evt>
      >
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
    expect<Wrapper>().type.toBe<
      (next: (action: ManagerAction<Evt>) => ManagerAction<Evt>) => (action: ManagerAction<Evt>) => ManagerAction<Evt>
    >();
  });

  test("dispatch обёрнутого action остаётся типизированным", () => {
    const mw: Middleware<State, Evt> = (api) => (next) => (action) => {
      expect(api.getState()).type.toBe<State>();
      expect(action).type.toBe<ManagerAction<Evt>>();
      expect(next(action)).type.toBe<ManagerAction<Evt>>();
      return next(action);
    };
    void mw;
  });
});

describe("GenericMiddleware", () => {
  test("generic contract использует raw P для next/action, в отличие от Middleware", () => {
    const generic: GenericMiddleware = <S, P extends AnyEvent>(api: MiddlewareApi<S, P>) => (next: (action: P) => P) => (action: P) => {
      expect(api.transition).type.toBe<(action: ManagerAction<P>) => ManagerAction<P>>();
      expect(next(action)).type.toBe<P>();
      return action;
    };
    const typed: Middleware<State, Evt> = (_api) => (next) => (action) => {
      expect(next(action)).type.toBe<ManagerAction<Evt>>();
      return action;
    };

    expect(generic).type.toBe<GenericMiddleware>();
    expect(typed).type.toBe<Middleware<State, Evt>>();
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
    expect<Api["transition"]>().type.toBe<(action: ManagerAction<Evt>) => ManagerAction<Evt>>();
  });

  test("replaceReducer принимает updater для reducer", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["replaceReducer"]>().type.toBe<
      (cb: (reducer: Reducer<State, ManagerAction<Evt>>) => Reducer<State, ManagerAction<Evt>>) => void
    >();
  });

  test("onTransition подписывается на prev/current/action", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["onTransition"]>().type.toBe<
      (
        cb: (prevState: State, currentState: State, action: ManagerCommitAction<MachineStore, AnyEvent>) => void,
      ) => () => void
    >();
  });

  test("condition принимает predicate и возвращает Promise<boolean>", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["condition"]>().type.toBe<(predicate: (a: ManagerAction<Evt>) => boolean) => Promise<boolean>>();
  });
});

describe("immerMiddleware", () => {
  test("присваивается к Middleware для совместимой пары state/event", () => {
    expect(immerMiddleware).type.toBeAssignableTo<Middleware<State, Evt>>();
    expect(immerMiddleware).type.toBeAssignableTo<Middleware>();
  });

  test("несёт brand VOID_REDUCER_MIDDLEWARE_MARKER для runtime-детекта", () => {
    expect(immerMiddleware.__liteFsmAllowVoidReducer).type.toBe<true>();
    expect(immerMiddleware).type.toBe<VoidReducerMiddleware>();
  });

  test("вызванная форма возвращает следующий wrapper", () => {
    const wrapped = immerMiddleware({} as MiddlewareApi<State, Evt>);
    expect<ReturnType<typeof wrapped>>().type.toBe<(action: Evt) => Evt>();
  });
});

describe("middleware barrels", () => {
  test("immerMiddleware из всех entrypoints сохраняет brand и Middleware assignability", () => {
    expect(immerFromBarrel.__liteFsmAllowVoidReducer).type.toBe<true>();
    expect(immerFromBarrel).type.toBe<VoidReducerMiddleware>();
    expect(immerFromBarrel).type.toBeAssignableTo<Middleware<State, Evt>>();
    expect(immerMiddleware).type.toBe<typeof immerFromBarrel>();
  });

  test("devToolsMiddleware из root middleware barrel сохраняет GenericMiddleware contract", () => {
    expect(devToolsFromBarrel()).type.toBe<GenericMiddleware>();
    expect(devToolsFromBarrel).type.toBe<typeof devToolsMiddleware>();
    devToolsFromBarrel({
      // @ts-expect-error!
      unknownOption: true,
    });
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
