// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { MachineConfig } from "@lite-fsm/core";
import { FSMContextProvider } from "@lite-fsm/react";
import { createJsonStorage, persistManager, type PersistController, type PersistStatus } from "@lite-fsm/persist";
import { useIsPersistRestoring, usePersistStatus } from "@lite-fsm/persist/react";
import { resolvePersistStatusSource, type FSMPersistLifecycle } from "../../packages/react/src/persistContext";

type Config = { IDLE: { INC: null } };
type Action = { type: "INC" };
type Context = { count: number };

const counter = {
  config: { IDLE: { INC: null } },
  initialState: "IDLE",
  initialContext: { count: 0 },
} satisfies MachineConfig<Config, Context, Action>;

const machines = { counter };
type Store = typeof machines;

const createManager = () => MachineManager<Store, Action>(machines);

const PERSIST_PROVIDER_ERROR =
  "Hooks from @lite-fsm/persist/react require a PersistController argument or FSMContextProvider persist context.";

const createStatusController = (initialStatus: PersistStatus = { phase: "idle" }): PersistController => ({
  start: () => () => {},
  restore: async () => initialStatus,
  save: async () => {},
  flush: async () => {},
  clear: async () => {},
  getStatus: () => initialStatus,
  subscribeStatus: () => () => {},
});

describe("SSR persist в FSMContextProvider", () => {
  it("серверный запасной источник статуса отдаёт idle snapshot и no-op unsubscribe", () => {
    const source = resolvePersistStatusSource(undefined, { serverFallback: true });
    const unsubscribe = source?.subscribeStatus(() => {});

    expect(source?.getStatus()).toEqual({ phase: "idle" });
    expect(unsubscribe).toBeTypeOf("function");
    expect(() => unsubscribe?.()).not.toThrow();
  });

  it("resolvePersistStatusSource не включает запасной источник без serverFallback=true", () => {
    expect(resolvePersistStatusSource(undefined)).toBeNull();
    expect(resolvePersistStatusSource(undefined, { serverFallback: false })).toBeNull();
  });

  it("resolvePersistStatusSource не считает null отсутствующим persist prop", () => {
    const invalidPersist = null as unknown as FSMPersistLifecycle;

    expect(resolvePersistStatusSource(invalidPersist, { serverFallback: true })).toBeNull();
  });

  it("resolvePersistStatusSource возвращает null для обычного lifecycle даже с серверным fallback", () => {
    const lifecycle = { start: () => () => {} };

    expect(resolvePersistStatusSource(lifecycle, { serverFallback: true })).toBeNull();
    expect(resolvePersistStatusSource([lifecycle], { serverFallback: true })).toBeNull();
  });

  it("resolvePersistStatusSource выбирает единственный источник статуса", () => {
    const lifecycle = { start: () => () => {} };
    const controller = createStatusController({ phase: "ready", restored: false });

    expect(resolvePersistStatusSource(controller)).toBe(controller);
    expect(resolvePersistStatusSource([lifecycle, controller])).toBe(controller);
  });

  it("resolvePersistStatusSource возвращает null для нескольких источников статуса", () => {
    const first = createStatusController();
    const second = createStatusController();

    expect(resolvePersistStatusSource([first, second])).toBeNull();
  });

  it("без свойства persist даёт usePersistStatus() прочитать idle", () => {
    const manager = createManager();

    const Readout = () => {
      const status = usePersistStatus();
      return <span>{status.phase}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">idle<");
  });

  it("без свойства persist даёт useIsPersistRestoring() прочитать false", () => {
    const manager = createManager();

    const Readout = () => {
      const restoring = useIsPersistRestoring();
      return <span>{restoring ? "yes" : "no"}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">no<");
  });

  it("с persistManager и ленивым window storage не вызывает storage factory", () => {
    const manager = createManager();
    const storageFactory = vi.fn(() => window.localStorage);
    const persist = persistManager(manager, {
      storage: createJsonStorage<Store>({
        key: "fsm",
        storage: storageFactory,
      }),
    });

    const Readout = () => {
      const status = usePersistStatus();
      return <span>{status.phase}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager} persist={persist}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">idle<");
    expect(storageFactory).not.toHaveBeenCalled();
  });

  it("с настоящим PersistController читает неявный idle status", () => {
    const manager = createManager();
    const persist = persistManager(manager, {
      storage: {
        get: () => undefined,
        set: () => {},
        remove: () => {},
      },
    });

    const Readout = () => {
      const status = usePersistStatus();
      return <span>{status.phase}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager} persist={persist}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">idle<");
  });

  it("обычный lifecycle persist без источника статуса бросает provider error", () => {
    const manager = createManager();
    const lifecycle = { start: () => () => {} };

    const Readout = () => {
      const status = usePersistStatus();
      return <span>{status.phase}</span>;
    };

    expect(() =>
      renderToString(
        <FSMContextProvider machineManager={manager} persist={lifecycle}>
          <Readout />
        </FSMContextProvider>,
      ),
    ).toThrow(PERSIST_PROVIDER_ERROR);
  });

  it("несколько контроллеров с источником статуса в persist array бросают provider error", () => {
    const manager = createManager();
    const first = createStatusController();
    const second = createStatusController();

    const Readout = () => {
      const status = usePersistStatus();
      return <span>{status.phase}</span>;
    };

    expect(() =>
      renderToString(
        <FSMContextProvider machineManager={manager} persist={[first, second]}>
          <Readout />
        </FSMContextProvider>,
      ),
    ).toThrow(PERSIST_PROVIDER_ERROR);
  });

  it("один контроллер с источником статуса в persist array работает", () => {
    const manager = createManager();
    const lifecycle = { start: () => () => {} };
    const controller = createStatusController({ phase: "ready", restored: true });

    const Readout = () => {
      const status = usePersistStatus();
      return <span>{status.phase}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager} persist={[lifecycle, controller]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">ready<");
  });
});
