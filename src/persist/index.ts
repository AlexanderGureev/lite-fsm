import type { IMachineManager } from "../core/interfaces";
import type {
  DehydrateOptions,
  HydrateStrategy,
  MachineManagerSnapshot,
  MachinesState,
  MachineStore,
  ManagerCommitAction,
} from "../core/types";
import { HYDRATE_ACTION_TYPE } from "../core/utils";
import { createTaskScope, isTaskCancelledError, type TaskContext } from "./taskScope";

export type MaybePromise<T> = T | Promise<T>;

export type PersistedRecord<S extends MachineStore> = {
  timestamp: number;
  storageVersion?: string | number;
  snapshot: MachineManagerSnapshot<S>;
};

export type PersistStorage<S extends MachineStore> = {
  get(): MaybePromise<PersistedRecord<S> | undefined>;
  set(record: PersistedRecord<S>): MaybePromise<void>;
  remove(): MaybePromise<void>;
  subscribe?(cb: () => void): () => void;
};

export type PersistStatus =
  | { phase: "idle" }
  | { phase: "restoring" }
  | { phase: "ready"; restored: boolean }
  | { phase: "error"; error: unknown };

export type PersistRestoreSettledResult =
  | { phase: "ready"; restored: boolean }
  | { phase: "error"; error: unknown };

export type PersistManagerOptions<S extends MachineStore> = {
  storage: PersistStorage<S>;
  machines?: DehydrateOptions<S>["machines"];
  strategy?: HydrateStrategy;
  storageVersion?: string | number;
  maxAge?: number;
  throttleMs?: number;
  shouldSave?: (ctx: {
    prevState: MachinesState<S>;
    currentState: MachinesState<S>;
    action: ManagerCommitAction<S>;
  }) => boolean;
  migrate?: (record: PersistedRecord<S>) => MaybePromise<MachineManagerSnapshot<S> | undefined>;
  onRestoreSettled?: (result: PersistRestoreSettledResult) => void;
  onError?: (err: unknown, phase: "restore" | "save" | "clear") => void;
};

export type PersistController = {
  start(): () => void;
  restore(): Promise<PersistStatus>;
  save(): Promise<void>;
  flush(): Promise<void>;
  clear(): Promise<void>;
  getStatus(): PersistStatus;
  subscribeStatus(cb: () => void): () => void;
};

type PersistManagerTarget<S extends MachineStore> = Pick<
  IMachineManager<S, any>,
  "dehydrate" | "hydrate" | "onTransition"
>;

type RestorePlan<S extends MachineStore> =
  | { kind: "skip" }
  | { kind: "remove"; error?: unknown }
  | { kind: "hydrate"; snapshot: MachineManagerSnapshot<S>; writeBack: boolean };

type PersistRunMode = "direct" | "background";

type JsonStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const IDLE_STATUS: PersistStatus = { phase: "idle" };
const RESTORING_STATUS: PersistStatus = { phase: "restoring" };

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isPersistedRecord = <S extends MachineStore>(value: unknown): value is PersistedRecord<S> =>
  isObjectRecord(value) && typeof value.timestamp === "number" && isObjectRecord(value.snapshot);

const createInvalidRecordError = () =>
  new Error(
    "[lite-fsm/persist] restore: persisted record must be an object with numeric timestamp and object snapshot.",
  );

const isSameStatus = (prev: PersistStatus, next: PersistStatus): boolean => {
  if (prev.phase !== next.phase) return false;
  if (prev.phase === "ready" && next.phase === "ready") return prev.restored === next.restored;
  if (prev.phase === "error" && next.phase === "error") return prev.error === next.error;
  return true;
};

export const persistManager = <S extends MachineStore>(
  manager: PersistManagerTarget<S>,
  options: PersistManagerOptions<S>,
): PersistController => {
  const throttleMs = options.throttleMs ?? 0;
  const strategy = options.strategy ?? "merge";
  let status: PersistStatus = IDLE_STATUS;
  let statusSubscribers: Array<() => void> = [];
  let startRefs = 0;
  let stopManagerSubscription: (() => void) | undefined;
  let stopStorageSubscription: (() => void) | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingSave = false;
  let activeSave: Promise<void> | undefined;
  let dirtyDuringRestore = false;
  const taskScope = createTaskScope();
  const restoreTask = taskScope.latest();
  const saveTask = taskScope.latest();

  const reportError = (err: unknown, phase: "restore" | "save" | "clear") => {
    try {
      options.onError?.(err, phase);
    } catch {
      // Error handlers are observational; persist keeps the original failure path.
    }
  };

  const reportRestoreSettled = (result: PersistRestoreSettledResult) => {
    try {
      options.onRestoreSettled?.(result);
    } catch {
      // Restore-settled handlers are observational; persist keeps its own result.
    }
  };

  const emitStatus = (next: PersistStatus) => {
    if (isSameStatus(status, next)) return;
    status = next;
    for (const cb of statusSubscribers) cb();
  };

  const handleAsyncError = (
    err: unknown,
    task: TaskContext,
    mode: PersistRunMode,
    phase: "restore" | "save",
  ): void => {
    if (isTaskCancelledError(err)) return;

    const current = task.isCurrent();
    if (!current && mode === "background") return;

    if (current) {
      const errorStatus: PersistStatus = { phase: "error", error: err };
      emitStatus(errorStatus);
      if (phase === "restore") reportRestoreSettled(errorStatus);
    }
    reportError(err, phase);
    if (mode === "direct") throw err;
  };

  const cancelPendingSave = () => {
    pendingSave = false;
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = undefined;
  };

  const invalidateInFlightWork = () => {
    taskScope.cancelAll();
    dirtyDuringRestore = false;
    activeSave = undefined;
    cancelPendingSave();
  };

  const writeCurrentSnapshot = (mode: PersistRunMode) =>
    saveTask.run(async (task) => {
      try {
        task.checkpoint();
        const record: PersistedRecord<S> = {
          timestamp: Date.now(),
          storageVersion: options.storageVersion,
          snapshot: manager.dehydrate({ machines: options.machines } as DehydrateOptions<S>),
        };
        task.checkpoint();

        await task.step(() => options.storage.set(record));
      } catch (err) {
        handleAsyncError(err, task, mode, "save");
      }
    });

  const runSave = (mode: PersistRunMode) => {
    cancelPendingSave();
    const tracked = writeCurrentSnapshot(mode).finally(() => {
      if (activeSave === tracked) activeSave = undefined;
    });
    activeSave = tracked;
    return tracked;
  };

  const scheduleSave = () => {
    pendingSave = true;
    if (throttleMs === 0) {
      void runSave("background");
      return;
    }
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      void runSave("background");
    }, throttleMs);
  };

  const maybeSaveAfterRestore = async (
    writeBack: boolean,
    task: TaskContext,
    mode: PersistRunMode,
  ) => {
    const shouldWrite = writeBack || dirtyDuringRestore;
    dirtyDuringRestore = false;
    if (!shouldWrite || !task.isCurrent()) return;
    await runSave(mode);
  };

  const finishRestore = (restored: boolean, task: TaskContext) => {
    const nextStatus: PersistStatus = { phase: "ready", restored };
    if (task.isCurrent()) {
      emitStatus(nextStatus);
      reportRestoreSettled(nextStatus);
    }
    return nextStatus;
  };

  const resolveRestorePlan = async (stored: unknown): Promise<RestorePlan<S>> => {
    if (stored === undefined) return { kind: "skip" };

    if (!isPersistedRecord<S>(stored)) {
      return { kind: "remove", error: createInvalidRecordError() };
    }

    if (options.maxAge !== undefined && Date.now() - stored.timestamp > options.maxAge) {
      return { kind: "remove" };
    }

    if (stored.storageVersion === options.storageVersion) {
      return { kind: "hydrate", snapshot: stored.snapshot, writeBack: false };
    }

    if (!options.migrate) return { kind: "remove" };

    const migrated = await options.migrate(stored);
    if (!migrated) return { kind: "remove" };

    return { kind: "hydrate", snapshot: migrated, writeBack: true };
  };

  const applyRestorePlan = async (plan: RestorePlan<S>): Promise<boolean> => {
    if (plan.kind === "skip") return false;

    if (plan.kind === "remove") {
      if (plan.error !== undefined) reportError(plan.error, "restore");
      await options.storage.remove();
      return false;
    }

    manager.hydrate(plan.snapshot, { strategy });
    return true;
  };

  const restoreRecord = async (mode: PersistRunMode): Promise<PersistStatus> => {
    // dirtyDuringRestore сохраняется между chained restores: stale `maybeSaveAfterRestore`
    // не сработает, поэтому транзишены, накопленные во время старого restore, обязан
    // дописать новый restore.
    const hadActiveRestore = restoreTask.isActive();

    return restoreTask.run(async (task) => {
      if (!hadActiveRestore) dirtyDuringRestore = false;
      emitStatus(RESTORING_STATUS);

      let restored = false;
      let writeBack = false;

      try {
        const stored = await task.step(() => options.storage.get());
        const plan = await task.step(() => resolveRestorePlan(stored));
        restored = await task.step(() => applyRestorePlan(plan));
        writeBack = plan.kind === "hydrate" && plan.writeBack;
      } catch (err) {
        handleAsyncError(err, task, mode, "restore");
        return status;
      }

      const nextStatus = finishRestore(restored, task);
      await maybeSaveAfterRestore(writeBack, task, mode);
      return nextStatus;
    });
  };

  const runBackgroundRestore = () => {
    void restoreRecord("background");
  };

  const shouldPersistTransition = (
    prevState: MachinesState<S>,
    currentState: MachinesState<S>,
    action: ManagerCommitAction<S>,
  ) => {
    try {
      return options.shouldSave?.({ prevState, currentState, action }) ?? true;
    } catch (err) {
      emitStatus({ phase: "error", error: err });
      reportError(err, "save");
      return false;
    }
  };

  const handleManagerTransition = (
    prevState: MachinesState<S>,
    currentState: MachinesState<S>,
    action: ManagerCommitAction<S>,
  ) => {
    if (action.type === HYDRATE_ACTION_TYPE) return;
    if (!shouldPersistTransition(prevState, currentState, action)) return;
    if (restoreTask.isActive()) {
      dirtyDuringRestore = true;
      return;
    }
    scheduleSave();
  };

  const start = () => {
    startRefs += 1;
    if (startRefs === 1) {
      stopManagerSubscription = manager.onTransition((prevState, currentState, action) => {
        handleManagerTransition(prevState, currentState, action as ManagerCommitAction<S>);
      });
      stopStorageSubscription = options.storage.subscribe?.(runBackgroundRestore);
      runBackgroundRestore();
    }

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      startRefs -= 1;
      if (startRefs > 0) return;

      invalidateInFlightWork();
      stopManagerSubscription?.();
      stopStorageSubscription?.();
      stopManagerSubscription = undefined;
      stopStorageSubscription = undefined;
      emitStatus(IDLE_STATUS);
    };
  };

  const restore = () => restoreRecord("direct");

  const save = async () => {
    cancelPendingSave();
    await runSave("direct");
  };

  const flush = async () => {
    if (pendingSave) {
      await runSave("direct");
      return;
    }
    await activeSave;
  };

  const clear = async () => {
    const saveToDrain = activeSave;
    invalidateInFlightWork();

    try {
      await saveToDrain?.catch(() => undefined);
      await options.storage.remove();
      emitStatus({ phase: "ready", restored: false });
    } catch (err) {
      emitStatus({ phase: "error", error: err });
      reportError(err, "clear");
      throw err;
    }
  };

  return {
    start,
    restore,
    save,
    flush,
    clear,
    getStatus: () => status,
    subscribeStatus: (cb: () => void) => {
      statusSubscribers.push(cb);
      return () => {
        statusSubscribers = statusSubscribers.filter((subscriber) => subscriber !== cb);
      };
    },
  };
};

export const createJsonStorage = <S extends MachineStore>({
  key,
  storage,
}: {
  key: string;
  storage: JsonStorageLike;
}): PersistStorage<S> => ({
  get: () => {
    const raw = storage.getItem(key);
    return raw == null ? undefined : (JSON.parse(raw) as PersistedRecord<S>);
  },
  set: (record) => {
    storage.setItem(key, JSON.stringify(record));
  },
  remove: () => {
    storage.removeItem(key);
  },
});
