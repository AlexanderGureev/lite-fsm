import { describe, it, expect, vi } from "vitest";

import { createMachine } from "../../src/core/Machine";
import { immerMiddleware } from "../../src/middleware/immer";
import { MiddlewareApi, Reducer } from "../../src/core/types";

type UnitState = { count: number; stable?: number };
type UnitAction = { type: "PATCH" | "NOOP" };

const createWrappedReducer = (initialState: UnitState, reducer: Reducer<UnitState, UnitAction>) => {
  let wrapped: Reducer<UnitState, UnitAction> | undefined;

  const api: MiddlewareApi<UnitState, UnitAction> = {
    getState: () => initialState,
    transition: (action) => action,
    replaceReducer: (cb) => {
      wrapped = cb(reducer);
    },
    onTransition: () => () => {},
    condition: () => Promise.resolve(true),
  };

  immerMiddleware(api);

  if (!wrapped) {
    throw new Error("replaceReducer was not called");
  }

  return wrapped;
};

describe("immerMiddleware — unit тесты", () => {
  it("возвращает noop enhancer ((next) => next)", () => {
    const api: MiddlewareApi<UnitState, UnitAction> = {
      getState: () => ({ count: 0 }),
      transition: (action) => action,
      replaceReducer: () => {},
      onTransition: () => () => {},
      condition: () => Promise.resolve(true),
    };

    const next = vi.fn((action: UnitAction) => action);
    const dispatch = immerMiddleware(api)(next);

    const action: UnitAction = { type: "NOOP" };
    const result = dispatch(action);

    expect(next).toHaveBeenCalledWith(action);
    expect(result).toBe(action);
  });

  it("replaceReducer применяет top-level поля результата и игнорирует undefined", () => {
    const reducer = createWrappedReducer({ count: 1, stable: 2 }, (state, action) => {
      if (action.type === "PATCH") {
        return { count: 10, stable: undefined };
      }

      return state;
    });

    expect(reducer({ count: 1, stable: 2 }, { type: "PATCH" })).toEqual({ count: 10, stable: 2 });
  });

  it("не копирует поля в draft, если обёрнутый reducer вернул не-объект", () => {
    const reducer = createWrappedReducer(
      { count: 1 },
      (() => undefined) as unknown as Reducer<UnitState, UnitAction>,
    );

    expect(reducer({ count: 5 }, { type: "NOOP" })).toEqual({ count: 5 });
  });
});

describe("immerMiddleware — интеграция с createMachine", () => {
  it("не ломает встроенный reducer: payload по-прежнему мержится в context", () => {
    const machine = createMachine({
      config: { IDLE: { UPDATE: null } },
      initialState: "IDLE",
      initialContext: { n: 0 },
    });

    machine.addMiddleware(immerMiddleware);
    machine.transition({ type: "UPDATE", payload: { n: 42 } });

    expect(machine.getState()).toEqual({ state: "IDLE", context: { n: 42 } });
  });

  it("reducer без return может мутировать draft context", () => {
    type Action = { type: "UPDATE"; payload?: { amount: number } };

    const machine = createMachine({
      config: { IDLE: { UPDATE: null } },
      initialState: "IDLE",
      initialContext: { counter: { n: 0 }, stable: { untouched: true } },
      reducer: (state, action: Action) => {
        if (action.type === "UPDATE") {
          state.context.counter.n += action.payload?.amount ?? 0;
        }
      },
    });

    machine.addMiddleware(immerMiddleware);
    machine.transition({ type: "UPDATE", payload: { amount: 2 } });

    expect(machine.getState()).toEqual({
      state: "IDLE",
      context: { counter: { n: 2 }, stable: { untouched: true } },
    });
  });

  it("меняет ссылки только у изменённых вложенных объектов", () => {
    type Action = { type: "RENAME"; payload?: { name: string } };

    const machine = createMachine({
      config: { IDLE: { RENAME: null } },
      initialState: "IDLE",
      initialContext: { user: { name: "a" }, meta: { version: 1 } },
      reducer: (state, action: Action) => {
        if (action.type === "RENAME" && action.payload) {
          state.context.user.name = action.payload.name;
        }
      },
    });

    machine.addMiddleware(immerMiddleware);

    const before = machine.getState().context;

    machine.transition({ type: "RENAME", payload: { name: "b" } });

    const after = machine.getState().context;

    expect(after).toEqual({ user: { name: "b" }, meta: { version: 1 } });
    expect(after).not.toBe(before);
    expect(after.user).not.toBe(before.user);
    expect(after.meta).toBe(before.meta);
  });
});
