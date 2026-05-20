// @vitest-environment jsdom
import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { MachineConfig, MachineReducer } from "@lite-fsm/core";
import { FSMContextProvider, useSelector } from "@lite-fsm/react";
import { persistManager, type PersistController, type PersistStatus, type PersistStorage } from "@lite-fsm/persist";
import { useIsPersistRestoring, usePersistStatuses } from "@lite-fsm/persist/react";
import { FSMPersistStatusesContext } from "../../packages/react/src/persistContext";

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

const PERSIST_PROVIDER_ERROR = "Hooks from @lite-fsm/persist/react require FSMContextProvider from @lite-fsm/react.";

const createStatusController = (initialStatus: PersistStatus = { phase: "idle" }) => {
  let status: PersistStatus = initialStatus;
  const listeners = new Set<() => void>();
  const controller: PersistController & { listenerCount(): number; setStatus(next: PersistStatus): void } = {
    start: () => () => {},
    restore: async () => status,
    save: async () => {},
    flush: async () => {},
    clear: async () => {},
    getStatus: () => status,
    subscribeStatus: vi.fn((cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    }),
    listenerCount: () => listeners.size,
    setStatus: (next) => {
      status = next;
      for (const cb of listeners) cb();
    },
  };
  return controller;
};

const expectRenderToThrowPersistProviderError = (element: React.ReactElement) => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    expect(() => render(element)).toThrow(PERSIST_PROVIDER_ERROR);
  } finally {
    consoleError.mockRestore();
  }
};

const formatStatuses = (statuses: readonly (PersistStatus | null)[]) =>
  statuses.map((status) => status?.phase ?? "none").join("|");

describe("FSMContextProvider persist", () => {
  it("запускает persist array на mount и останавливает на unmount", async () => {
    const manager = createManager();
    const stop = vi.fn();
    const persist = { start: vi.fn(() => stop) };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[persist]}>
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
        <FSMContextProvider machineManager={manager} persist={[persist]}>
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

  it("запускает и останавливает все entries из persist array", async () => {
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

  it("inline persist array не перезапускает lifecycle при неизменной последовательности", async () => {
    const manager = createManager();
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    const first = { start: vi.fn(() => firstStop) };
    const second = { start: vi.fn(() => secondStop) };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[first, second]}>
        <span>child</span>
      </FSMContextProvider>,
    );
    await waitFor(() => {
      expect(first.start).toHaveBeenCalledOnce();
      expect(second.start).toHaveBeenCalledOnce();
    });

    view.rerender(
      <FSMContextProvider machineManager={manager} persist={[first, second]}>
        <span>child</span>
      </FSMContextProvider>,
    );

    expect(first.start).toHaveBeenCalledOnce();
    expect(second.start).toHaveBeenCalledOnce();
    expect(firstStop).not.toHaveBeenCalled();
    expect(secondStop).not.toHaveBeenCalled();

    view.unmount();
    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();
  });

  it("смена длины persist array перезапускает lifecycle", async () => {
    const manager = createManager();
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    const first = { start: vi.fn(() => firstStop) };
    const second = { start: vi.fn(() => secondStop) };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[first]}>
        <span>child</span>
      </FSMContextProvider>,
    );
    await waitFor(() => {
      expect(first.start).toHaveBeenCalledOnce();
    });

    view.rerender(
      <FSMContextProvider machineManager={manager} persist={[first, second]}>
        <span>child</span>
      </FSMContextProvider>,
    );

    await waitFor(() => {
      expect(second.start).toHaveBeenCalledOnce();
    });
    expect(firstStop).toHaveBeenCalledOnce();
    expect(first.start).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(firstStop).toHaveBeenCalledTimes(2);
    expect(secondStop).toHaveBeenCalledOnce();
  });

  it("смена порядка persist array перезапускает lifecycle", async () => {
    const manager = createManager();
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    const first = { start: vi.fn(() => firstStop) };
    const second = { start: vi.fn(() => secondStop) };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[first, second]}>
        <span>child</span>
      </FSMContextProvider>,
    );
    await waitFor(() => {
      expect(first.start).toHaveBeenCalledOnce();
      expect(second.start).toHaveBeenCalledOnce();
    });

    view.rerender(
      <FSMContextProvider machineManager={manager} persist={[second, first]}>
        <span>child</span>
      </FSMContextProvider>,
    );

    await waitFor(() => {
      expect(first.start).toHaveBeenCalledTimes(2);
      expect(second.start).toHaveBeenCalledTimes(2);
    });
    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();

    view.unmount();
    expect(firstStop).toHaveBeenCalledTimes(2);
    expect(secondStop).toHaveBeenCalledTimes(2);
  });

  it("замена entry по identity перезапускает lifecycle", async () => {
    const manager = createManager();
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    const first = { start: vi.fn(() => firstStop) };
    const second = { start: vi.fn(() => secondStop) };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[first]}>
        <span>child</span>
      </FSMContextProvider>,
    );
    await waitFor(() => {
      expect(first.start).toHaveBeenCalledOnce();
    });

    view.rerender(
      <FSMContextProvider machineManager={manager} persist={[second]}>
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
      <FSMContextProvider machineManager={manager} persist={[persist]}>
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

  it("без persist prop provider сохраняет SSR snapshot fallback для manager state", () => {
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
      <FSMContextProvider machineManager={manager} persist={[persist]}>
        <Counter />
      </FSMContextProvider>,
    );

    expect(renders[0]).toBe(0);
    await waitFor(() => {
      expect(view.getByTestId("count").textContent).toBe("5");
    });
  });
});

describe("@lite-fsm/persist/react", () => {
  it("создаёт shared statuses context при импорте persist/react раньше react provider", async () => {
    const persistContextKey = Symbol.for("@lite-fsm/react.persistStatusesContext");
    const contextStore = globalThis as typeof globalThis & { [key: symbol]: unknown };
    const previousContext = contextStore[persistContextKey];
    const specifier = "../../packages/persist/src/react.ts?persist-statuses-first";

    delete contextStore[persistContextKey];

    try {
      const imported = (await import(specifier)) as typeof import("../../packages/persist/src/react");

      expect(imported.usePersistStatuses).toBeTypeOf("function");
      expect(imported.useIsPersistRestoring).toBeTypeOf("function");
      expect(contextStore[persistContextKey]).toBeDefined();
    } finally {
      if (previousContext === undefined) {
        delete contextStore[persistContextKey];
      } else {
        contextStore[persistContextKey] = previousContext;
      }
    }
  });

  it("usePersistStatuses вне provider бросает provider error", () => {
    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span>{statuses.length}</span>;
    };

    expectRenderToThrowPersistProviderError(<Readout />);
  });

  it("useIsPersistRestoring вне provider бросает provider error", () => {
    const Readout = () => {
      const restoring = useIsPersistRestoring();
      return <span>{restoring ? "yes" : "no"}</span>;
    };

    expectRenderToThrowPersistProviderError(<Readout />);
  });

  it("provider без persist отдаёт пустой массив статусов", () => {
    const manager = createManager();

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span data-testid="statuses">{statuses.length}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("0");
  });

  it("persist=[] не запускает lifecycle и отдаёт пустой массив статусов", () => {
    const manager = createManager();

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span data-testid="statuses">{statuses.length}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("0");
  });

  it("форма массива статусов меняется на render вместе с persist prop", () => {
    const manager = createManager();
    const first = createStatusController();
    const second = createStatusController({ phase: "ready", restored: false });

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span data-testid="statuses">{`${statuses.length}:${formatStatuses(statuses)}`}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[first, second]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("2:idle|ready");

    view.rerender(
      <FSMContextProvider machineManager={manager} persist={[first]}>
        <Readout />
      </FSMContextProvider>,
    );
    expect(view.getByTestId("statuses").textContent).toBe("1:idle");

    view.rerender(
      <FSMContextProvider machineManager={manager} persist={[]}>
        <Readout />
      </FSMContextProvider>,
    );
    expect(view.getByTestId("statuses").textContent).toBe("0:");

    view.rerender(
      <FSMContextProvider machineManager={manager}>
        <Readout />
      </FSMContextProvider>,
    );
    expect(view.getByTestId("statuses").textContent).toBe("0:");
  });

  it("возвращает статус одного controller и обновляется по подписке", () => {
    const manager = createManager();
    const controller = createStatusController();

    const Readout = () => {
      const [status] = usePersistStatuses();
      return <span data-testid="status">{status?.phase}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[controller]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("status").textContent).toBe("idle");
    act(() => {
      controller.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("status").textContent).toBe("restoring");
  });

  it("возвращает статусы нескольких controllers в порядке persist array", () => {
    const manager = createManager();
    const first = createStatusController({ phase: "ready", restored: false });
    const second = createStatusController({ phase: "restoring" });

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span data-testid="statuses">{formatStatuses(statuses)}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[first, second]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("ready|restoring");
  });

  it("возвращает null для lifecycle-only entry и сохраняет индекс", () => {
    const manager = createManager();
    const lifecycle = { start: vi.fn(() => () => {}) };
    const controller = createStatusController({ phase: "ready", restored: true });

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span data-testid="statuses">{formatStatuses(statuses)}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[lifecycle, controller]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("none|ready");
  });

  it("возвращает null для entries с неполным status source contract", () => {
    const manager = createManager();
    const statusOnly = {
      start: vi.fn(() => () => {}),
      getStatus: () => ({ phase: "idle" }) satisfies PersistStatus,
    };
    const subscribeOnly = {
      start: vi.fn(() => () => {}),
      subscribeStatus: vi.fn(() => () => {}),
    };
    const controller = createStatusController({ phase: "ready", restored: true });

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span data-testid="statuses">{formatStatuses(statuses)}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[statusOnly, subscribeOnly, controller]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("none|none|ready");
    expect(subscribeOnly.subscribeStatus).not.toHaveBeenCalled();
  });

  it("глубокий компонент читает статусы через ближайший provider", () => {
    const manager = createManager();
    const controller = createStatusController({ phase: "ready", restored: true });

    const DeepReadout = () => {
      const [status] = usePersistStatuses();
      return <span data-testid="status">{status?.phase}</span>;
    };
    const Shell = () => (
      <section>
        <div>
          <DeepReadout />
        </div>
      </section>
    );

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[controller]}>
        <Shell />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("status").textContent).toBe("ready");
  });

  it("обновляется при изменении любого source", () => {
    const manager = createManager();
    const first = createStatusController();
    const second = createStatusController({ phase: "ready", restored: false });

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span data-testid="statuses">{formatStatuses(statuses)}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[first, second]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("idle|ready");

    act(() => {
      second.setStatus({ phase: "error", error: new Error("save failed") });
    });
    expect(view.getByTestId("statuses").textContent).toBe("idle|error");

    act(() => {
      first.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("statuses").textContent).toBe("restoring|error");
  });

  it("сохраняет тот же array reference без изменения status entries", () => {
    const manager = createManager();
    const controller = createStatusController();
    const snapshots: Array<readonly (PersistStatus | null)[]> = [];

    const Readout = () => {
      const statuses = usePersistStatuses();
      snapshots.push(statuses);
      return <span data-testid="status">{statuses[0]?.phase}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[controller]}>
        <Readout />
      </FSMContextProvider>,
    );

    const initialSnapshot = snapshots[0];

    view.rerender(
      <FSMContextProvider machineManager={manager} persist={[controller]}>
        <Readout />
      </FSMContextProvider>,
    );
    expect(snapshots[snapshots.length - 1]).toBe(initialSnapshot);

    const renders = snapshots.length;
    act(() => {
      controller.setStatus(controller.getStatus());
    });
    expect(snapshots).toHaveLength(renders);

    act(() => {
      controller.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("status").textContent).toBe("restoring");
    expect(snapshots[snapshots.length - 1]).not.toBe(initialSnapshot);
  });

  it("переподписывается при смене persist prop и игнорирует старый controller", () => {
    const manager = createManager();
    const first = createStatusController();
    const second = createStatusController({ phase: "ready", restored: false });

    const Readout = () => {
      const [status] = usePersistStatuses();
      return <span data-testid="status">{status?.phase}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[first]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("status").textContent).toBe("idle");

    view.rerender(
      <FSMContextProvider machineManager={manager} persist={[second]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("status").textContent).toBe("ready");
    expect(first.listenerCount()).toBe(0);
    expect(second.listenerCount()).toBe(1);

    act(() => {
      first.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("status").textContent).toBe("ready");

    act(() => {
      second.setStatus({ phase: "error", error: new Error("restore failed") });
    });
    expect(view.getByTestId("status").textContent).toBe("error");
  });

  it("отписывается от всех status sources при unmount", () => {
    const manager = createManager();
    const first = createStatusController();
    const second = createStatusController({ phase: "ready", restored: false });

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span data-testid="statuses">{formatStatuses(statuses)}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[first, second]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(first.listenerCount()).toBe(1);
    expect(second.listenerCount()).toBe(1);

    view.unmount();

    expect(first.listenerCount()).toBe(0);
    expect(second.listenerCount()).toBe(0);
  });

  it("переключение на пустой persist array отписывает старые sources и игнорирует их updates", () => {
    const manager = createManager();
    const controller = createStatusController();

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span data-testid="statuses">{`${statuses.length}:${formatStatuses(statuses)}`}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[controller]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("1:idle");

    view.rerender(
      <FSMContextProvider machineManager={manager} persist={[]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("0:");
    expect(controller.listenerCount()).toBe(0);

    act(() => {
      controller.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("statuses").textContent).toBe("0:");
  });

  it("переключение на undefined persist отписывает старые sources и игнорирует их updates", () => {
    const manager = createManager();
    const controller = createStatusController();

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span data-testid="statuses">{`${statuses.length}:${formatStatuses(statuses)}`}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[controller]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("1:idle");

    view.rerender(
      <FSMContextProvider machineManager={manager}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("0:");
    expect(controller.listenerCount()).toBe(0);

    act(() => {
      controller.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("statuses").textContent).toBe("0:");
  });

  it("пересчитывает snapshot, если mutable context entries изменили длину до notification", () => {
    const first = createStatusController();
    const second = createStatusController({ phase: "ready", restored: false });
    const entries = [first];

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span data-testid="statuses">{formatStatuses(statuses)}</span>;
    };

    const view = render(
      <FSMPersistStatusesContext.Provider value={entries}>
        <Readout />
      </FSMPersistStatusesContext.Provider>,
    );

    expect(view.getByTestId("statuses").textContent).toBe("idle");

    act(() => {
      entries.push(second);
      first.setStatus({ phase: "restoring" });
    });

    expect(view.getByTestId("statuses").textContent).toBe("restoring|ready");
  });

  it("useIsPersistRestoring возвращает true для любого restoring status и игнорирует null", () => {
    const manager = createManager();
    const lifecycle = { start: vi.fn(() => () => {}) };
    const first = createStatusController({ phase: "ready", restored: true });
    const second = createStatusController({ phase: "restoring" });

    const Readout = () => {
      const restoring = useIsPersistRestoring();
      return <span data-testid="restoring">{restoring ? "yes" : "no"}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[lifecycle, first, second]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("restoring").textContent).toBe("yes");

    act(() => {
      second.setStatus({ phase: "ready", restored: false });
    });
    expect(view.getByTestId("restoring").textContent).toBe("no");
  });

  it("useIsPersistRestoring возвращает false для пустого массива", () => {
    const manager = createManager();

    const Readout = () => {
      const restoring = useIsPersistRestoring();
      return <span data-testid="restoring">{restoring ? "yes" : "no"}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("restoring").textContent).toBe("no");
  });
});
