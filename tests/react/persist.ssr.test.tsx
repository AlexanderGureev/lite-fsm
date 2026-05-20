// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { MachineConfig } from "@lite-fsm/core";
import { FSMContextProvider } from "@lite-fsm/react";
import { createJsonStorage, persistManager, type PersistController, type PersistStatus } from "@lite-fsm/persist";
import { useIsPersistRestoring, usePersistStatuses } from "@lite-fsm/persist/react";
import {
  arePersistLifecycleSequencesEqual,
  resolvePersistStatusSources,
  type FSMPersistLifecycle,
} from "../../packages/react/src/persistContext";

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

const createStatusController = (initialStatus: PersistStatus = { phase: "idle" }): PersistController => ({
  start: () => () => {},
  restore: async () => initialStatus,
  save: async () => {},
  flush: async () => {},
  clear: async () => {},
  getStatus: () => initialStatus,
  subscribeStatus: () => () => {},
});

const formatStatuses = (statuses: readonly (PersistStatus | null)[]) =>
  statuses.map((status) => status?.phase ?? "none").join("|");

describe("SSR persist statuses в FSMContextProvider", () => {
  it("сравнивает последовательности persist entries по длине, порядку и identity", () => {
    const first = { start: () => () => {} };
    const second = { start: () => () => {} };
    const replacement = { start: () => () => {} };

    expect(arePersistLifecycleSequencesEqual([], [])).toBe(true);
    expect(arePersistLifecycleSequencesEqual([first, second], [first, second])).toBe(true);
    expect(arePersistLifecycleSequencesEqual([first], [first, second])).toBe(false);
    expect(arePersistLifecycleSequencesEqual([first, second], [second, first])).toBe(false);
    expect(arePersistLifecycleSequencesEqual([first], [replacement])).toBe(false);
  });

  it("resolvePersistStatusSources строит entries для всех вариантов массива", () => {
    const lifecycle: FSMPersistLifecycle = { start: () => () => {} };
    const first = createStatusController({ phase: "ready", restored: false });
    const second = createStatusController({ phase: "restoring" });

    expect(resolvePersistStatusSources(undefined)).toEqual([]);
    expect(resolvePersistStatusSources([])).toEqual([]);
    expect(resolvePersistStatusSources([lifecycle])).toEqual([null]);
    expect(resolvePersistStatusSources([first])).toEqual([first]);
    expect(resolvePersistStatusSources([lifecycle, first, second])).toEqual([null, first, second]);
  });

  it("provider без persist на server render отдаёт пустой массив статусов", () => {
    const manager = createManager();

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span>{statuses.length}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">0<");
  });

  it("persist=[] на server render отдаёт пустой массив статусов", () => {
    const manager = createManager();

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span>{statuses.length}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager} persist={[]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">0<");
  });

  it("один controller в persist array отдаёт массив из одного статуса", () => {
    const manager = createManager();
    const controller = createStatusController({ phase: "ready", restored: true });

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span>{formatStatuses(statuses)}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager} persist={[controller]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">ready<");
  });

  it("несколько controllers на server render сохраняют порядок persist", () => {
    const manager = createManager();
    const first = createStatusController({ phase: "restoring" });
    const second = createStatusController({ phase: "ready", restored: false });

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span>{formatStatuses(statuses)}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager} persist={[first, second]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">restoring|ready<");
  });

  it("lifecycle-only entry на server render отдаёт null на своей позиции", () => {
    const manager = createManager();
    const lifecycle = { start: () => () => {} };
    const controller = createStatusController({ phase: "ready", restored: true });

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span>{formatStatuses(statuses)}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager} persist={[lifecycle, controller]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">none|ready<");
  });

  it("useIsPersistRestoring на server render возвращает false для пустого массива", () => {
    const manager = createManager();

    const Readout = () => {
      const restoring = useIsPersistRestoring();
      return <span>{restoring ? "yes" : "no"}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager} persist={[]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">no<");
  });

  it("persistManager с ленивым window storage не вызывает storage factory во время server render", () => {
    const manager = createManager();
    const storageFactory = vi.fn(() => window.localStorage);
    const persist = persistManager(manager, {
      storage: createJsonStorage<Store>({
        key: "fsm",
        storage: storageFactory,
      }),
    });

    const Readout = () => {
      const statuses = usePersistStatuses();
      return <span>{formatStatuses(statuses)}</span>;
    };

    const html = renderToString(
      <FSMContextProvider machineManager={manager} persist={[persist]}>
        <Readout />
      </FSMContextProvider>,
    );

    expect(html).toContain(">idle<");
    expect(storageFactory).not.toHaveBeenCalled();
  });
});
