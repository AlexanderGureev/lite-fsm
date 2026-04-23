// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, renderHook, act } from "@testing-library/react";

import { FSMContextProvider, useManager, useSelector, useTransition } from "../../src/react";
import { MachineManager } from "../../src/core/MachineManager";
import { MachineReducer } from "../../src/core/types";

type CounterConfig = { readonly IDLE: { readonly INC: null; readonly GO: "ACTIVE" }; readonly ACTIVE: {} };
type CounterAction = { type: "INC" } | { type: "GO" };
type CounterContext = { n: number };

const counterReducer: MachineReducer<CounterConfig, CounterAction, CounterContext> = (state, action, meta) => {
  if (action.type === "INC") return { state: state.state, context: { n: state.context.n + 1 } };
  return { state: meta.nextState, context: state.context };
};

const machineSchema = {
  counter: {
    config: { IDLE: { INC: null, GO: "ACTIVE" }, ACTIVE: {} },
    initialState: "IDLE",
    initialContext: { n: 0 },
    reducer: counterReducer,
  },
} as const;

type Schema = typeof machineSchema;

const createManager = () => MachineManager(machineSchema);

const wrap =
  (manager: ReturnType<typeof createManager>) =>
  ({ children }: { children: React.ReactNode }) => (
    <FSMContextProvider machineManager={manager}>{children}</FSMContextProvider>
  );

describe("hooks без provider", () => {
  it("useManager бросает явную ошибку интеграции", () => {
    expect(() => renderHook(() => useManager())).toThrow(/FSMContextProvider/);
  });

  it("useTransition бросает явную ошибку интеграции", () => {
    expect(() => renderHook(() => useTransition())).toThrow(/FSMContextProvider/);
  });

  it("useSelector бросает явную ошибку интеграции", () => {
    expect(() => renderHook(() => useSelector<Schema, number>((s) => s.counter.context.n))).toThrow(/FSMContextProvider/);
  });
});

describe("useManager", () => {
  it("возвращает MachineManager из контекста", () => {
    const manager = createManager();
    const { result } = renderHook(() => useManager(), { wrapper: wrap(manager) });
    expect(result.current).toBe(manager);
  });
});

describe("useTransition", () => {
  it("возвращает функцию transition из контекста, меняющую state", () => {
    const manager = createManager();
    const { result } = renderHook(() => useTransition(), { wrapper: wrap(manager) });

    act(() => {
      result.current({ type: "INC" });
    });
    expect(manager.getState().counter.context.n).toBe(1);
  });
});

describe("useSelector", () => {
  it("возвращает начальное значение и ререндерится при изменении", () => {
    const manager = createManager();
    const renders: number[] = [];

    const Counter = () => {
      const n = useSelector<Schema, number>((s) => s.counter.context.n);
      renders.push(n);
      return <div data-testid="n">{n}</div>;
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Counter />
      </FSMContextProvider>,
    );

    expect(getByTestId("n").textContent).toBe("0");

    act(() => {
      manager.transition({ type: "INC" });
    });
    expect(getByTestId("n").textContent).toBe("1");

    act(() => {
      manager.transition({ type: "INC" });
    });
    expect(getByTestId("n").textContent).toBe("2");
  });

  it("не ререндерит компонент, если выбранное значение не изменилось (по ===)", () => {
    const manager = createManager();

    let renderCount = 0;
    const Status = () => {
      renderCount++;
      const state = useSelector<Schema, string>((s) => s.counter.state);
      return <span>{state}</span>;
    };

    render(
      <FSMContextProvider machineManager={manager}>
        <Status />
      </FSMContextProvider>,
    );

    const initial = renderCount;

    act(() => {
      manager.transition({ type: "INC" });
      manager.transition({ type: "INC" });
    });

    expect(renderCount).toBe(initial);

    act(() => {
      manager.transition({ type: "GO" });
    });
    expect(renderCount).toBeGreaterThan(initial);
  });

  it("использует кастомный equalityFn", () => {
    const manager = createManager();
    const eq = vi.fn((a: { n: number }, b: { n: number }) => JSON.stringify(a) === JSON.stringify(b));

    const Probe = () => {
      const ctx = useSelector<Schema, { n: number }>((s) => ({ n: s.counter.context.n }), eq);
      return <span data-testid="v">{ctx.n}</span>;
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    expect(getByTestId("v").textContent).toBe("0");

    act(() => {
      manager.transition({ type: "INC" });
    });
    expect(getByTestId("v").textContent).toBe("1");
    expect(eq).toHaveBeenCalled();
  });

  it("кастомный equalityFn может подавить ререндер, если считает значения равными", () => {
    const manager = createManager();
    const eq = vi.fn(() => true);

    let renderCount = 0;
    const Probe = () => {
      renderCount++;
      const ctx = useSelector<Schema, { n: number }>((s) => ({ n: s.counter.context.n }), eq);
      return <span data-testid="v">{ctx.n}</span>;
    };

    const { getByTestId } = render(
      <FSMContextProvider machineManager={manager}>
        <Probe />
      </FSMContextProvider>,
    );

    const initial = renderCount;

    act(() => {
      manager.transition({ type: "INC" });
    });

    expect(renderCount).toBe(initial);
    expect(getByTestId("v").textContent).toBe("0");
    expect(eq).toHaveBeenCalled();
  });
});
