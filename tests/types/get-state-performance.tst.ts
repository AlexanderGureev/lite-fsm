import { describe, expect, test } from "tstyche";
import {
  MachineManager,
  type AnyRecord,
  type FSMEvent,
  type MachineConfig,
  type MachineEffect,
  type MachinesState,
} from "@lite-fsm/core";

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type MachineNo = `${Digit}${Digit}${Digit}`;
type MachineKey = `machine${MachineNo}`;

type PerfEvent =
  | FSMEvent<"PERF_QUEUE">
  | FSMEvent<"PERF_START">
  | FSMEvent<"PERF_VALIDATE">
  | FSMEvent<"PERF_PERSIST">
  | FSMEvent<"PERF_SYNC">
  | FSMEvent<"PERF_READY">
  | FSMEvent<"PERF_DIRTY">
  | FSMEvent<"PERF_SAVE">
  | FSMEvent<"PERF_RETRY">
  | FSMEvent<"PERF_FAIL">
  | FSMEvent<"PERF_ARCHIVE">
  | FSMEvent<"PERF_RESTORE">
  | FSMEvent<"PERF_HYDRATE">
  | FSMEvent<"PERF_PAUSE">
  | FSMEvent<"PERF_RESUME">
  | FSMEvent<"PERF_LOCK">
  | FSMEvent<"PERF_UNLOCK">
  | FSMEvent<"PERF_REVIEW">
  | FSMEvent<"PERF_PUBLISH">
  | FSMEvent<"PERF_COOLDOWN">
  | FSMEvent<"PERF_DONE">
  | FSMEvent<"PERF_RESET">
  | FSMEvent<"PERF_PATCH", { value: number }>;

type PerfStep =
  | "idle"
  | "queued"
  | "loading"
  | "validating"
  | "persisting"
  | "syncing"
  | "ready"
  | "dirty"
  | "saving"
  | "retrying"
  | "failed"
  | "archived"
  | "restoring"
  | "hydrating"
  | "paused"
  | "locked"
  | "reviewing"
  | "publishing"
  | "published"
  | "cooldown"
  | "done";

type PerfState<K extends MachineKey, S extends PerfStep> = `${K}:${S}`;

type LargeConfig<K extends MachineKey> = {
  [S in PerfState<K, "idle">]: {
    PERF_QUEUE: PerfState<K, "queued">;
    PERF_PATCH: null;
    PERF_RESET: null;
  };
} & {
  [S in PerfState<K, "queued">]: {
    PERF_START: PerfState<K, "loading">;
    PERF_PAUSE: PerfState<K, "paused">;
    PERF_RESET: PerfState<K, "idle">;
  };
} & {
  [S in PerfState<K, "loading">]: {
    PERF_VALIDATE: PerfState<K, "validating">;
    PERF_FAIL: PerfState<K, "failed">;
    PERF_RESET: PerfState<K, "idle">;
  };
} & {
  [S in PerfState<K, "validating">]: {
    PERF_PERSIST: PerfState<K, "persisting">;
    PERF_FAIL: PerfState<K, "failed">;
    PERF_PATCH: null;
  };
} & {
  [S in PerfState<K, "persisting">]: {
    PERF_SYNC: PerfState<K, "syncing">;
    PERF_FAIL: PerfState<K, "failed">;
    PERF_RESET: PerfState<K, "idle">;
  };
} & {
  [S in PerfState<K, "syncing">]: {
    PERF_READY: PerfState<K, "ready">;
    PERF_RETRY: PerfState<K, "retrying">;
    PERF_FAIL: PerfState<K, "failed">;
  };
} & {
  [S in PerfState<K, "ready">]: {
    PERF_DIRTY: PerfState<K, "dirty">;
    PERF_ARCHIVE: PerfState<K, "archived">;
    PERF_LOCK: PerfState<K, "locked">;
  };
} & {
  [S in PerfState<K, "dirty">]: {
    PERF_SAVE: PerfState<K, "saving">;
    PERF_RESET: PerfState<K, "idle">;
    PERF_PATCH: null;
  };
} & {
  [S in PerfState<K, "saving">]: {
    PERF_SYNC: PerfState<K, "syncing">;
    PERF_FAIL: PerfState<K, "failed">;
    PERF_RETRY: PerfState<K, "retrying">;
  };
} & {
  [S in PerfState<K, "retrying">]: {
    PERF_START: PerfState<K, "loading">;
    PERF_FAIL: PerfState<K, "failed">;
    PERF_RESET: PerfState<K, "idle">;
  };
} & {
  [S in PerfState<K, "failed">]: {
    PERF_RETRY: PerfState<K, "retrying">;
    PERF_RESET: PerfState<K, "idle">;
    PERF_PATCH: null;
  };
} & {
  [S in PerfState<K, "archived">]: {
    PERF_RESTORE: PerfState<K, "restoring">;
    PERF_DONE: PerfState<K, "done">;
    PERF_RESET: PerfState<K, "idle">;
  };
} & {
  [S in PerfState<K, "restoring">]: {
    PERF_HYDRATE: PerfState<K, "hydrating">;
    PERF_FAIL: PerfState<K, "failed">;
    PERF_RESET: PerfState<K, "idle">;
  };
} & {
  [S in PerfState<K, "hydrating">]: {
    PERF_READY: PerfState<K, "ready">;
    PERF_FAIL: PerfState<K, "failed">;
    PERF_PAUSE: PerfState<K, "paused">;
  };
} & {
  [S in PerfState<K, "paused">]: {
    PERF_RESUME: PerfState<K, "queued">;
    PERF_RESET: PerfState<K, "idle">;
    PERF_LOCK: PerfState<K, "locked">;
  };
} & {
  [S in PerfState<K, "locked">]: {
    PERF_UNLOCK: PerfState<K, "idle">;
    PERF_REVIEW: PerfState<K, "reviewing">;
    PERF_RESET: PerfState<K, "idle">;
  };
} & {
  [S in PerfState<K, "reviewing">]: {
    PERF_PUBLISH: PerfState<K, "publishing">;
    PERF_FAIL: PerfState<K, "failed">;
    PERF_RESET: PerfState<K, "idle">;
  };
} & {
  [S in PerfState<K, "publishing">]: {
    PERF_READY: PerfState<K, "published">;
    PERF_FAIL: PerfState<K, "failed">;
    PERF_COOLDOWN: PerfState<K, "cooldown">;
  };
} & {
  [S in PerfState<K, "published">]: {
    PERF_DIRTY: PerfState<K, "dirty">;
    PERF_ARCHIVE: PerfState<K, "archived">;
    PERF_COOLDOWN: PerfState<K, "cooldown">;
  };
} & {
  [S in PerfState<K, "cooldown">]: {
    PERF_READY: PerfState<K, "ready">;
    PERF_DONE: PerfState<K, "done">;
    PERF_RESET: PerfState<K, "idle">;
  };
} & {
  [S in PerfState<K, "done">]: {
    PERF_RESET: PerfState<K, "idle">;
    PERF_RESTORE: PerfState<K, "restoring">;
    PERF_PATCH: null;
  };
};

type MachineContext<K extends MachineKey> = {
  id: K;
  storageKey: `storage:${K}`;
  revision: `${K}:revision`;
  payload: {
    owner: K;
    title: `title:${K}`;
    counters: Record<"queued" | "ready" | "failed" | "done", number>;
    flags: {
      dirty: boolean;
      locked: boolean;
      archived: boolean;
    };
  };
};

type PerfMachines<D extends AnyRecord = {}> = {
  [K in MachineKey]: MachineConfig<LargeConfig<K>, MachineContext<K>, PerfEvent, D>;
};

type BasePerfState = MachinesState<PerfMachines>;
type PerfDeps = {
  getState: () => BasePerfState;
};
type AppMachines = PerfMachines<PerfDeps>;
type AppState = MachinesState<AppMachines>;

declare const machines: AppMachines;

describe("type performance getState для большой карты machines", () => {
  test("MachineManager.getState раскрывает 1000 machines с крупным config", () => {
    const manager = MachineManager<AppMachines, PerfEvent>(machines);
    const state = manager.getState();

    expect(state).type.toBe<AppState>();
    expect(state.machine000.state).type.toBe<PerfState<"machine000", PerfStep>>();
    expect(state.machine123.context.storageKey).type.toBe<"storage:machine123">();
    expect(state.machine500.context.payload.owner).type.toBe<"machine500">();
    expect(state.machine999.state).type.toBe<PerfState<"machine999", PerfStep>>();
    expect(state.machine999.context.revision).type.toBe<"machine999:revision">();
  });

  test("effect deps getState раскрывает state всех machines", () => {
    const effect = (({ getState }) => {
      const state = getState();

      expect(state).type.toBe<BasePerfState>();
      expect(state.machine001.state).type.toBe<PerfState<"machine001", PerfStep>>();
      expect(state.machine250.context.id).type.toBe<"machine250">();
      expect(state.machine750.context.payload.title).type.toBe<"title:machine750">();
      expect(state.machine999.context.payload.counters.done).type.toBe<number>();
    }) satisfies MachineEffect<PerfState<"machine999", "ready">, LargeConfig<"machine999">, PerfEvent, PerfDeps>;

    expect(effect).type.toBeAssignableTo<
      MachineEffect<PerfState<"machine999", "ready">, LargeConfig<"machine999">, PerfEvent, PerfDeps>
    >();
  });
});
