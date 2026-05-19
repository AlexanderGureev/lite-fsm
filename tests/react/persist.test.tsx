// @vitest-environment jsdom
import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { MachineConfig, MachineReducer } from "@lite-fsm/core";
import { FSMContextProvider, useSelector } from "@lite-fsm/react";
import { persistManager, type PersistController, type PersistStatus, type PersistStorage } from "@lite-fsm/persist";
import { useIsPersistRestoring, usePersistStatus } from "@lite-fsm/persist/react";

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

const PERSIST_PROVIDER_ERROR =
  "Hooks from @lite-fsm/persist/react require a PersistController argument or FSMContextProvider persist context.";

const createStatusController = (initialStatus: PersistStatus = { phase: "idle" }) => {
  let status: PersistStatus = initialStatus;
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

const expectRenderToThrowPersistProviderError = (element: React.ReactElement) => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    expect(() => render(element)).toThrow(PERSIST_PROVIDER_ERROR);
  } finally {
    consoleError.mockRestore();
  }
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

describe("@lite-fsm/persist/react", () => {
  it("создаёт shared context при импорте persist/react раньше react provider", async () => {
    const persistContextKey = Symbol.for("@lite-fsm/react.persistContext");
    const contextStore = globalThis as typeof globalThis & { [key: symbol]: unknown };
    const previousContext = contextStore[persistContextKey];
    const specifier = "../../packages/persist/src/react.ts?persist-first";

    delete contextStore[persistContextKey];

    try {
      const imported = (await import(specifier)) as typeof import("../../packages/persist/src/react");

      expect(imported.usePersistStatus).toBeTypeOf("function");
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

  it("usePersistStatus читает controller из FSMContextProvider persist", () => {
    const manager = createManager();
    const controller = createStatusController();

    const Readout = () => {
      const status = usePersistStatus();
      return <span data-testid="status">{status.phase}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={controller}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("status").textContent).toBe("idle");
    act(() => {
      controller.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("status").textContent).toBe("restoring");
  });

  it("usePersistStatus читает единственный status controller из persist array", async () => {
    const manager = createManager();
    const controller = createStatusController();
    const stop = vi.fn();
    const lifecycle = { start: vi.fn(() => stop) };

    const Readout = () => {
      const status = usePersistStatus();
      return <span data-testid="status">{status.phase}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={[lifecycle, controller]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("status").textContent).toBe("idle");
    act(() => {
      controller.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("status").textContent).toBe("restoring");

    await waitFor(() => {
      expect(lifecycle.start).toHaveBeenCalledOnce();
    });
    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("usePersistStatus переподписывается при смене status controller в provider", () => {
    const manager = createManager();
    const first = createStatusController();
    const second = createStatusController({ phase: "ready", restored: false });

    const Readout = () => {
      const status = usePersistStatus();
      return <span data-testid="status">{status.phase}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={first}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("status").textContent).toBe("idle");

    view.rerender(
      <FSMContextProvider machineManager={manager} persist={second}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("status").textContent).toBe("ready");

    act(() => {
      first.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("status").textContent).toBe("ready");

    act(() => {
      second.setStatus({ phase: "error", error: new Error("restore failed") });
    });
    expect(view.getByTestId("status").textContent).toBe("error");
  });

  it("явный controller имеет приоритет над provider context", () => {
    const manager = createManager();
    const contextController = createStatusController({ phase: "restoring" });
    const explicitController = createStatusController({ phase: "ready", restored: true });

    const Readout = () => {
      const status = usePersistStatus(explicitController);
      return <span data-testid="status">{status.phase}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={contextController}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("status").textContent).toBe("ready");

    act(() => {
      contextController.setStatus({ phase: "error", error: new Error("context failed") });
    });
    expect(view.getByTestId("status").textContent).toBe("ready");

    act(() => {
      explicitController.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("status").textContent).toBe("restoring");
  });

  it("usePersistStatus без controller и provider бросает понятную ошибку", () => {
    const Readout = () => {
      const status = usePersistStatus();
      return <span>{status.phase}</span>;
    };

    expectRenderToThrowPersistProviderError(<Readout />);
  });

  it("plain lifecycle persist не создаёт status context", () => {
    const manager = createManager();
    const lifecycle = { start: vi.fn(() => () => {}) };

    const Readout = () => {
      const status = usePersistStatus();
      return <span>{status.phase}</span>;
    };

    expectRenderToThrowPersistProviderError(
      <FSMContextProvider machineManager={manager} persist={lifecycle}>
        <Readout />
      </FSMContextProvider>,
    );
  });

  it("несколько status controllers в persist array не выбираются неявно", () => {
    const manager = createManager();
    const first = createStatusController();
    const second = createStatusController();

    const Readout = () => {
      const restoring = useIsPersistRestoring();
      return <span>{restoring ? "yes" : "no"}</span>;
    };

    expectRenderToThrowPersistProviderError(
      <FSMContextProvider machineManager={manager} persist={[first, second]}>
        <Readout />
      </FSMContextProvider>,
    );
  });

  it("useIsPersistRestoring читает controller из FSMContextProvider persist", () => {
    const manager = createManager();
    const controller = createStatusController();

    const Readout = () => {
      const restoring = useIsPersistRestoring();
      return <span data-testid="restoring">{restoring ? "yes" : "no"}</span>;
    };

    const view = render(
      <FSMContextProvider machineManager={manager} persist={controller}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(view.getByTestId("restoring").textContent).toBe("no");
    act(() => {
      controller.setStatus({ phase: "restoring" });
    });
    expect(view.getByTestId("restoring").textContent).toBe("yes");
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
