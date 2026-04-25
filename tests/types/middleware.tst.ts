import { describe, expect, test } from "tstyche";
import type { AnyEvent, FSMEvent, GenericMiddleware, Middleware, MiddlewareApi, Reducer } from "lite-fsm";
import { devToolsMiddleware } from "lite-fsm/middleware/devTools";
import { immerMiddleware } from "lite-fsm/middleware/immer";

import type { Assert, Equal } from "./_helpers";

type State = { count: number };
type IncEvent = FSMEvent<"INC", { amount: number }>;
type ResetEvent = FSMEvent<"RESET">;
type Evt = IncEvent | ResetEvent;

describe("Middleware<S, P>", () => {
  test("resolves to (api) => (next) => (action) => action", () => {
    type M = Middleware<State, Evt>;
    type _Shape = Assert<
      Equal<M, (api: MiddlewareApi<State, Evt>) => (next: (action: Evt) => Evt) => (action: Evt) => Evt>
    >;
  });

  test("default S is unknown, default P is AnyEvent", () => {
    type M = Middleware;
    type _Api = Parameters<M>[0];
    expect<_Api>().type.toBe<MiddlewareApi<unknown, AnyEvent>>();
  });

  test("return value becomes the next wrapper", () => {
    type M = Middleware<State, Evt>;
    type Wrapper = ReturnType<M>;
    expect<Wrapper>().type.toBe<(next: (action: Evt) => Evt) => (action: Evt) => Evt>();
  });

  test("wrapped action dispatch stays typed", () => {
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
  test("has exactly 5 keys", () => {
    type Api = MiddlewareApi<State, Evt>;
    type _Keys = Assert<
      Equal<keyof Api, "getState" | "transition" | "replaceReducer" | "onTransition" | "condition">
    >;
  });

  test("getState returns S", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["getState"]>().type.toBe<() => State>();
  });

  test("transition echoes P", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["transition"]>().type.toBe<(action: Evt) => Evt>();
  });

  test("replaceReducer accepts reducer updater", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["replaceReducer"]>().type.toBe<(cb: (reducer: Reducer<State, Evt>) => Reducer<State, Evt>) => void>();
  });

  test("onTransition subscribes to prev/current/action", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["onTransition"]>().type.toBe<
      (cb: (prevState: State, currentState: State, action: Evt) => void) => () => void
    >();
  });

  test("condition takes predicate and returns Promise<boolean>", () => {
    type Api = MiddlewareApi<State, Evt>;
    expect<Api["condition"]>().type.toBe<(predicate: (a: Evt) => boolean) => Promise<boolean>>();
  });
});

describe("immerMiddleware", () => {
  test("assignable to Middleware for matching state/event pair", () => {
    expect(immerMiddleware).type.toBeAssignableTo<Middleware<State, Evt>>();
    expect(immerMiddleware).type.toBeAssignableTo<Middleware>();
  });

  test("carries VOID_REDUCER_MIDDLEWARE_MARKER brand so runtime detection works", () => {
    expect(immerMiddleware.__liteFsmAllowVoidReducer).type.toBe<true>();
  });

  test("invoked shape returns the next wrapper", () => {
    const wrapped = immerMiddleware({} as MiddlewareApi<State, Evt>);
    expect<ReturnType<typeof wrapped>>().type.toBe<(action: Evt) => Evt>();
  });
});

describe("devToolsMiddleware", () => {
  test("called without options returns Middleware", () => {
    const mw = devToolsMiddleware();
    expect(mw).type.toBe<GenericMiddleware>();
  });

  test("accepts blacklistActions: string[]", () => {
    const mw = devToolsMiddleware({ blacklistActions: ["INC"] });
    expect(mw).type.toBe<GenericMiddleware>();
  });

  test("rejects non-string blacklistActions", () => {
    devToolsMiddleware({
      // @ts-expect-error!
      blacklistActions: [1],
    });
  });

  test("rejects unknown options", () => {
    devToolsMiddleware({
      // @ts-expect-error!
      unknownOption: true,
    });
  });

  test("does NOT carry VOID_REDUCER_MIDDLEWARE_MARKER", () => {
    const mw = devToolsMiddleware();
    expect(mw).type.not.toHaveProperty("__liteFsmAllowVoidReducer");
  });

  test("result is assignable to Middleware<State, Evt>", () => {
    const mw = devToolsMiddleware();
    expect(mw).type.toBeAssignableTo<Middleware<State, Evt>>();
  });
});
