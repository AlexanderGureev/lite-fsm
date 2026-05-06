// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, renderHook, act } from "@testing-library/react";

import { defineMachine } from "@lite-fsm/react";

describe("defineMachine для React", () => {
  it("создаёт hook-машину: use/getState/transition/onTransition/addMiddleware", () => {
    const machine = defineMachine<{ type: "GO" } | { type: "STOP" }>().create({
      config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { STOP: "IDLE" } },
      initialState: "IDLE",
      initialContext: { n: 0 },
    });

    expect(typeof machine).toBe("function");
    expect(typeof machine.getState).toBe("function");
    expect(typeof machine.transition).toBe("function");
    expect(typeof machine.onTransition).toBe("function");
    expect(typeof machine.addMiddleware).toBe("function");

    expect(machine.getState().state).toBe("IDLE");
    machine.transition({ type: "GO" });
    expect(machine.getState().state).toBe("ACTIVE");
  });

  it("use(selector) возвращает slice и ререндерит компонент при изменении", () => {
    const machine = defineMachine<{ type: "GO" } | { type: "STOP" }>().create({
      config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { STOP: "IDLE" } },
      initialState: "IDLE",
      initialContext: {},
    });

    const Probe = (): React.JSX.Element => {
      const s = machine((state) => state.state);
      return <span data-testid="v">{s}</span>;
    };

    const { getByTestId } = render(<Probe />);
    expect(getByTestId("v").textContent).toBe("IDLE");

    act(() => {
      machine.transition({ type: "GO" });
    });
    expect(getByTestId("v").textContent).toBe("ACTIVE");
  });

  it("addMiddleware влияет на transition и итоговый slice из use(selector)", () => {
    type Action = { type: "INC"; payload?: { amount: number } };

    const machine = defineMachine<Action>().create({
      config: { IDLE: { INC: null } },
      initialState: "IDLE",
      initialContext: { n: 0 },
      reducer: (state, action) => {
        if (action.type === "INC") {
          return {
            state: state.state,
            context: { n: state.context.n + (action.payload?.amount ?? 0) },
          };
        }

        return state;
      },
    });

    machine.addMiddleware(() => (next) => (action) => {
      if (action.type === "INC" && action.payload === undefined) {
        return next({ ...action, payload: { amount: 5 } });
      }

      return next(action);
    });

    const { result } = renderHook(() => machine((state) => state.context.n));

    expect(result.current).toBe(0);

    act(() => {
      machine.transition({ type: "INC" });
    });

    expect(result.current).toBe(5);
  });

  it("use(selector, equalityFn) — использует кастомный сравниватель", () => {
    const machine = defineMachine<{ type: "INC" }>().create({
      config: { IDLE: { INC: null } },
      initialState: "IDLE",
      initialContext: { n: 0 },
      reducer: (s, a) => {
        if (a.type === "INC") return { state: s.state, context: { n: s.context.n + 1 } };
        return s;
      },
    });

    const eq = vi.fn((a: number, b: number) => a === b);
    const { result } = renderHook(() => machine((s) => s.context.n, eq));

    expect(result.current).toBe(0);

    act(() => {
      machine.transition({ type: "INC" });
    });
    expect(result.current).toBe(1);
    expect(eq).toHaveBeenCalled();
  });

  it("use(selector, equalityFn) не ререндерит компонент, когда equalityFn возвращает true", () => {
    const machine = defineMachine<{ type: "INC" }>().create({
      config: { IDLE: { INC: null } },
      initialState: "IDLE",
      initialContext: { n: 0 },
      reducer: (state, action) => {
        if (action.type === "INC") {
          return { state: state.state, context: { n: state.context.n + 1 } };
        }

        return state;
      },
    });

    const eq = vi.fn(() => true);
    let renderCount = 0;

    const Probe = (): React.JSX.Element => {
      renderCount++;
      const value = machine((state) => ({ n: state.context.n }), eq);
      return <span data-testid="v">{value.n}</span>;
    };

    const { getByTestId } = render(<Probe />);
    const initial = renderCount;

    act(() => {
      machine.transition({ type: "INC" });
    });

    expect(renderCount).toBe(initial);
    expect(getByTestId("v").textContent).toBe("0");
    expect(eq).toHaveBeenCalled();
  });

  it("onError в defineMachine (react) ловит ошибки эффектов", async () => {
    const onError = vi.fn();
    const machine = defineMachine<{ type: "GO" }>({ onError }).create({
      config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: async () => {
          throw new Error("fail");
        },
      },
    });

    machine.transition({ type: "GO" });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("dependencies прокидываются в эффекты", async () => {
    const fn = vi.fn();
    const machine = defineMachine<{ type: "GO" }, { services: { fn: () => void } }>({
      dependencies: { services: { fn } },
    }).create({
      config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
      initialState: "IDLE",
      initialContext: {},
      effects: {
        ACTIVE: ({ services }) => services.fn(),
      },
    });

    machine.transition({ type: "GO" });
    await vi.waitFor(() => {
      expect(fn).toHaveBeenCalledOnce();
    });
  });
});
