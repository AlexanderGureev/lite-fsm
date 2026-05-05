// @vitest-environment jsdom
import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "../../src/core/MachineManager";
import type { MachineConfig, MachineReducer } from "../../src/core/types";
import { FSMContextProvider, useSelector } from "../../src/react";
import { persistManager, type PersistController, type PersistStatus, type PersistStorage } from "../../src/persist";
import { useIsPersistRestoring, usePersistStatus } from "../../src/persist/react";

type Config = { IDLE: { INC: null } };
type Action = { type: "INC" };
type Context = { count: number };
type Snapshot = { count: number };

const reducer: MachineReducer<Config, Action, Context> = (state, action) => {
  if (action.type !== "INC") return state;
  return { state: state.state, context: { count: state.context.count + 1 } };
};

const counter = {
  config: { IDLE: { INC: null } },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer,
  hydrate: (prev, snapshot: Snapshot) => {
    if (prev.context.count === snapshot.count) return prev;
    return { state: prev.state, context: { count: snapshot.count } };
  },
  dehydrate: (state) => ({ count: state.context.count }),
} satisfies MachineConfig<Config, Context, Action, {}, Snapshot>;

const machines = { counter };
type Store = typeof machines;

const createManager = () => MachineManager<Store, Action>(machines);

const createStatusController = () => {
  let status: PersistStatus = { phase: "idle" };
  const listeners = new Set<() => void>();
  const controller: PersistController & { setStatus(next: PersistStatus): void } = {
    start: () => () => {},
    restore: async () => status,
    save: async () => {},
    flush: async () => {},
    clear: async () => {},
    getStatus: () => status,
    subscribeStatus: vi.fn((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
    setStatus: (next) => {
      status = next;
      for (const cb of listeners) cb();
    },
  };
  return controller;
};

describe("FSMContextProvider persist", () => {
  it("запускает persist на mount и останавливает на unmount", async () => {
    const manager = createManager();
    const stop = vi.fn();
    const persist = { start: vi.fn(() => stop) };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={persist}>
        <span>child</span>
      </FSMContextProvider>,
    );

    await waitFor(() => {
      expect(persist.start).toHaveBeenCalledOnce();
    });
    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("StrictMode не оставляет duplicate active subscriptions", async () => {
    const manager = createManager();
    let active = 0;
    const persist = {
      start: vi.fn(() => {
        active += 1;
        return () => {
          active -= 1;
        };
      }),
    };

    const view = render(
      <React.StrictMode>
        <FSMContextProvider machineManager={manager} persist={persist}>
          <span>child</span>
        </FSMContextProvider>
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(active).toBe(1);
    });
    view.unmount();
    expect(active).toBe(0);
  });

  it("persist array запускает и останавливает все controllers", async () => {
    const manager = createManager();
    const stopA = vi.fn();
    const stopB = vi.fn();
    const first = { start: vi.fn(() => stopA) };
    const second = { start: vi.fn(() => stopB) };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[first, second]}>
        <span>child</span>
      </FSMContextProvider>,
    );

    await waitFor(() => {
      expect(first.start).toHaveBeenCalledOnce();
      expect(second.start).toHaveBeenCalledOnce();
    });
    view.unmount();
    expect(stopA).toHaveBeenCalledOnce();
    expect(stopB).toHaveBeenCalledOnce();
  });

  it("при смене persist prop останавливает старый lifecycle и запускает новый", async () => {
    const manager = createManager();
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    const first = { start: vi.fn(() => firstStop) };
    const second = { start: vi.fn(() => secondStop) };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={first}>
        <span>child</span>
      </FSMContextProvider>,
    );
    await waitFor(() => {
      expect(first.start).toHaveBeenCalledOnce();
    });

    view.rerender(
      <FSMContextProvider machineManager={manager} persist={second}>
        <span>child</span>
      </FSMContextProvider>,
    );

    await waitFor(() => {
      expect(second.start).toHaveBeenCalledOnce();
    });
    expect(firstStop).toHaveBeenCalledOnce();

    view.unmount();
    expect(secondStop).toHaveBeenCalledOnce();
  });

  it("смена persist prop на undefined останавливает старый lifecycle и не запускает новый", async () => {
    const manager = createManager();
    const stop = vi.fn();
    const persist = { start: vi.fn(() => stop) };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={persist}>
        <span>child</span>
      </FSMContextProvider>,
    );
    await waitFor(() => {
      expect(persist.start).toHaveBeenCalledOnce();
    });

    view.rerender(
      <FSMContextProvider machineManager={manager}>
        <span>child</span>
      </FSMContextProvider>,
    );

    expect(stop).toHaveBeenCalledOnce();
    expect(persist.start).toHaveBeenCalledOnce();

    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("без persist prop provider не запускает lifecycle и сохраняет SSR snapshot fallback", () => {
    const manager = createManager();
    manager.transition({ type: "INC" });

    const Counter = () => {
      const count = useSelector<Store, number>((state) => state.counter.context.count);
      return <span>{count}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager}>
        <Counter />
      </FSMContextProvider>,
    );

    expect(html).toContain(">1<");
  });

  it("без persist prop client effect завершается без lifecycle cleanup", () => {
    const manager = createManager();
    const view = render(
      <FSMContextProvider machineManager={manager}>
        <span>child</span>
      </FSMContextProvider>,
    );

    view.unmount();
  });

  it("getServerSnapshot prop имеет приоритет над live manager state при SSR render", () => {
    const manager = createManager();

    const Counter = () => {
      const count = useSelector<Store, number>((state) => state.counter.context.count);
      return <span>{count}</span>;
    };

    const html = renderToString(
      <FSMContextProvider
        machineManager={manager}
        getServerSnapshot={() => ({ counter: { state: "IDLE" as const, context: { count: 7 } } })}
      >
        <Counter />
      </FSMContextProvider>,
    );

    expect(html).toContain(">7<");
  });

  it("persist restore стартует после mount и не влияет на первый render", async () => {
    const manager = createManager();
    const renders: number[] = [];
    const storage: PersistStorage<Store> = {
      get: () => ({
        timestamp: Date.now(),
        snapshot: {
          machines: {
            counter: { count: 5 },
          },
        },
      }),
      set: () => {},
      remove: () => {},
    };
    const persist = persistManager(manager, { storage });

    const Counter = () => {
      const count = useSelector<Store, number>((state) => state.counter.context.count);
      renders.push(count);
      return <span data-testid="count">{count}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={persist}>
        <Counter />
      </FSMContextProvider>,
    );

    expect(renders[0]).toBe(0);
    await waitFor(() => {
      expect(view.getByTestId("count").textContent).toBe("5");
    });
  });
});

describe("lite-fsm/persist/react", () => {
  it("usePersistStatus возвращает stable snapshot и обновляется по подписке", () => {
    const controller = createStatusController();
    const seen: PersistStatus[] = [];

    const Readout = () => {
      const status = usePersistStatus(controller);
      seen.push(status);
      return <span data-testid="status">{status.phase}</span>;
    };

    const view = render(<Readout />);

    expect(view.getByTestId("status").textContent).toBe("idle");
    act(() => {
      controller.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("status").textContent).toBe("restoring");

    const renders = seen.length;
    act(() => {
      controller.setStatus(controller.getStatus());
    });
    expect(seen).toHaveLength(renders);
  });

  it("useIsPersistRestoring отражает phase restoring", () => {
    const controller = createStatusController();

    const Readout = () => {
      const restoring = useIsPersistRestoring(controller);
      return <span data-testid="restoring">{restoring ? "yes" : "no"}</span>;
    };

    const view = render(<Readout />);
    expect(view.getByTestId("restoring").textContent).toBe("no");

    act(() => {
      controller.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("restoring").textContent).toBe("yes");
  });
});
