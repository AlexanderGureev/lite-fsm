import type {
  ActorSnapshotEntry,
  AnyRecord,
  FSMEvent,
  MachineConfig,
  MachinesState,
  PublicActorSlice,
} from "lite-fsm";

export type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type MachineNo = `${Digit}${Digit}${Digit}`;
export type MachineKey = `machine${MachineNo}`;

export type PerfEvent =
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

export type PerfStep =
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

export type PerfState<K extends MachineKey, S extends PerfStep> = `${K}:${S}`;

export type LargeConfig<K extends MachineKey> = {
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

export type MachineContext<K extends MachineKey> = {
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

export type PerfMachines<D extends AnyRecord = {}> = {
  [K in MachineKey]: MachineConfig<LargeConfig<K>, MachineContext<K>, PerfEvent, D>;
};

export type BasePerfState = MachinesState<PerfMachines>;
export type PerfDeps = {
  getState: () => BasePerfState;
};
export type AppMachines = PerfMachines<PerfDeps>;
export type AppState = MachinesState<AppMachines>;

export declare const machines: AppMachines;

export type ActorConfig<K extends MachineKey> = {
  __INIT: {
    PERF_QUEUE: PerfState<K, "queued">;
  };
} & LargeConfig<K>;

export type ActorContext<K extends MachineKey> = MachineContext<K> & {
  actorOwner: K;
};

export type ActorSnapshot<K extends MachineKey> = {
  state: PerfState<K, PerfStep>;
  context: ActorContext<K>;
  savedAt: `${K}:saved`;
};

export type SnapshotActorMachine<K extends MachineKey> = MachineConfig<
  ActorConfig<K>,
  ActorContext<K>,
  PerfEvent,
  {},
  ActorSnapshot<K>
> & {
  persistence: "snapshot";
};

export type ActorPerfMachines = {
  [K in MachineKey]: SnapshotActorMachine<K>;
};

export type ActorRuntimeState<K extends MachineKey> = Record<string, PublicActorSlice<ActorConfig<K>, ActorContext<K>>>;
export type ActorSnapshotRecord<K extends MachineKey> = Record<string, ActorSnapshotEntry<ActorSnapshot<K>>>;

export declare const actorMachines: ActorPerfMachines;
