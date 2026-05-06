import { afterEach, describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { MachineConfig, MachineManagerSnapshot, MachineReducer } from "@lite-fsm/core";
import { HYDRATE_ACTION_TYPE } from "@lite-fsm/core/internal/utils";
import {
  createJsonStorage,
  persistManager,
  type PersistStatus,
  type PersistedRecord,
  type PersistStorage,
} from "@lite-fsm/persist";

type CounterConfig = { IDLE: { INC: null } };
type FlagConfig = { OFF: { TOGGLE: "ON" }; ON: { TOGGLE: "OFF" } };
type Action = { type: "INC" } | { type: "TOGGLE" };
type CounterContext = { count: number };
type CounterSnapshot = { count: number };
type FlagContext = { enabled: boolean };

const counterReducer: MachineReducer<CounterConfig, Action, CounterContext> = (state, action) => {
  if (action.type !== "INC") return state;
  return { state: state.state, context: { count: state.context.count + 1 } };
};

const flagReducer: MachineReducer<FlagConfig, Action, FlagContext> = (_state, _action, meta) => ({
  state: meta.nextState,
  context: { enabled: meta.nextState === "ON" },
});

const counter = {
  config: { IDLE: { INC: null } },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: counterReducer,
  hydrate: (prev, snapshot: CounterSnapshot) => {
    if (prev.context.count === snapshot.count) return prev;
    return { state: prev.state, context: { count: snapshot.count } };
  },
  dehydrate: (state) => ({ count: state.context.count }),
} satisfies MachineConfig<CounterConfig, CounterContext, Action, {}, CounterSnapshot>;

const flag = {
  config: { OFF: { TOGGLE: "ON" }, ON: { TOGGLE: "OFF" } },
  initialState: "OFF",
  initialContext: { enabled: false },
  reducer: flagReducer,
} satisfies MachineConfig<FlagConfig, FlagContext, Action>;

const machines = { counter, flag };
type Store = typeof machines;

const createManager = () => MachineManager<Store, Action>(machines);

const createSnapshot = (count: number): MachineManagerSnapshot<Store> => ({
  machines: {
    counter: { count },
  },
});

const createRecord = (count: number, opts: { storageVersion?: string | number; timestamp?: number } = {}) =>
  ({
    timestamp: opts.timestamp ?? Date.now(),
    storageVersion: opts.storageVersion,
    snapshot: createSnapshot(count),
  }) satisfies PersistedRecord<Store>;

const createStorage = (initial?: unknown) => {
  let value = initial;
  const listeners = new Set<() => void>();
  const storage: PersistStorage<Store> = {
    get: vi.fn(() => value as PersistedRecord<Store> | undefined),
    set: vi.fn((record: PersistedRecord<Store>) => {
      value = record;
    }),
    remove: vi.fn(() => {
      value = undefined;
    }),
    subscribe: vi.fn((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
  };

  return {
    storage,
    emit: () => {
      for (const cb of listeners) cb();
    },
    listenerCount: () => listeners.size,
    read: () => value as PersistedRecord<Store> | undefined,
    write: (next: unknown) => {
      value = next;
    },
  };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("persistManager", () => {
  it("restore() восстанавливает валидную запись и пропускает отсутствующую", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(3));
    const controller = persistManager(manager, { storage: storage.storage });

    await expect(controller.restore()).resolves.toEqual({ phase: "ready", restored: true });
    expect(manager.getState().counter.context.count).toBe(3);
    expect(controller.getStatus()).toEqual({ phase: "ready", restored: true });

    const emptyManager = createManager();
    const emptyStorage = createStorage();
    const emptyController = persistManager(emptyManager, { storage: emptyStorage.storage });

    await expect(emptyController.restore()).resolves.toEqual({ phase: "ready", restored: false });
    expect(emptyManager.getState().counter.context.count).toBe(0);
  });

  it("onRestoreSettled вызывается для успешного restore и пропущенной записи, но не для clear()", async () => {
    const manager = createManager();
    const onRestoreSettled = vi.fn();
    const storage = createStorage(createRecord(3));
    const controller = persistManager(manager, {
      storage: storage.storage,
      onRestoreSettled,
    });

    await controller.restore();
    await controller.clear();

    const emptyManager = createManager();
    const emptySettled = vi.fn();
    const emptyStorage = createStorage();
    const emptyController = persistManager(emptyManager, {
      storage: emptyStorage.storage,
      onRestoreSettled: emptySettled,
    });

    await emptyController.restore();

    expect(onRestoreSettled).toHaveBeenCalledOnce();
    expect(onRestoreSettled).toHaveBeenCalledWith({ phase: "ready", restored: true });
    expect(emptySettled).toHaveBeenCalledOnce();
    expect(emptySettled).toHaveBeenCalledWith({ phase: "ready", restored: false });
  });

  it("onRestoreSettled получает restore error и не маскирует ошибку direct restore", async () => {
    const manager = createManager();
    const getError = new Error("get failed");
    const onRestoreSettled = vi.fn();
    const storage = createStorage();
    storage.storage.get = vi.fn(() => {
      throw getError;
    });
    const controller = persistManager(manager, {
      storage: storage.storage,
      onRestoreSettled,
    });

    await expect(controller.restore()).rejects.toBe(getError);

    expect(onRestoreSettled).toHaveBeenCalledOnce();
    expect(onRestoreSettled).toHaveBeenCalledWith({ phase: "error", error: getError });
  });

  it("onRestoreSettled получает restore error из background restore", async () => {
    const manager = createManager();
    const getError = new Error("background get failed");
    const onRestoreSettled = vi.fn();
    const storage = createStorage();
    storage.storage.get = vi.fn(() => {
      throw getError;
    });
    const controller = persistManager(manager, {
      storage: storage.storage,
      onRestoreSettled,
    });

    const stop = controller.start();

    await vi.waitFor(() => {
      expect(onRestoreSettled).toHaveBeenCalledWith({ phase: "error", error: getError });
    });
    expect(controller.getStatus()).toEqual({ phase: "error", error: getError });
    stop();
  });

  it("ошибка onRestoreSettled не маскирует результат restore", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(2));
    const controller = persistManager(manager, {
      storage: storage.storage,
      onRestoreSettled: () => {
        throw new Error("settled handler failed");
      },
    });

    await expect(controller.restore()).resolves.toEqual({ phase: "ready", restored: true });

    expect(manager.getState().counter.context.count).toBe(2);
    expect(controller.getStatus()).toEqual({ phase: "ready", restored: true });
  });

  it("invalid record: onRestoreSettled приходит как ready/false параллельно с onError(restore)", async () => {
    const manager = createManager();
    const onRestoreSettled = vi.fn();
    const onError = vi.fn();
    const storage = createStorage({ timestamp: "bad", snapshot: {} });
    const controller = persistManager(manager, {
      storage: storage.storage,
      onRestoreSettled,
      onError,
    });

    await expect(controller.restore()).resolves.toEqual({ phase: "ready", restored: false });

    expect(onRestoreSettled).toHaveBeenCalledOnce();
    expect(onRestoreSettled).toHaveBeenCalledWith({ phase: "ready", restored: false });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "restore");
  });

  it("write-back error после migrate: settled приходит как ready/true до save error", async () => {
    const manager = createManager();
    const onRestoreSettled = vi.fn();
    const writeError = new Error("write-back failed");
    const storage = createStorage(createRecord(1, { storageVersion: "old" }));
    storage.storage.set = vi.fn(() => {
      throw writeError;
    });
    const controller = persistManager(manager, {
      storage: storage.storage,
      storageVersion: "new",
      migrate: () => createSnapshot(7),
      onRestoreSettled,
    });

    await expect(controller.restore()).rejects.toBe(writeError);

    expect(onRestoreSettled).toHaveBeenCalledOnce();
    expect(onRestoreSettled).toHaveBeenCalledWith({ phase: "ready", restored: true });
    expect(controller.getStatus()).toEqual({ phase: "error", error: writeError });
  });

  it("некорректная запись удаляется и сообщает restore error", async () => {
    const manager = createManager();
    const onError = vi.fn();
    const storage = createStorage({ timestamp: "bad", snapshot: {} });
    const controller = persistManager(manager, { storage: storage.storage, onError });

    await expect(controller.restore()).resolves.toEqual({ phase: "ready", restored: false });

    expect(storage.storage.remove).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][1]).toBe("restore");
    expect(manager.getState().counter.context.count).toBe(0);
  });

  it("отклоняет все минимально невалидные формы record", async () => {
    const invalidRecords = [
      null,
      [],
      { timestamp: 1 },
      { snapshot: createSnapshot(1) },
      { timestamp: 1, snapshot: null },
      { timestamp: 1, snapshot: [] },
    ];

    for (const record of invalidRecords) {
      const manager = createManager();
      const onError = vi.fn();
      const storage = createStorage(record);
      const controller = persistManager(manager, { storage: storage.storage, onError });

      await expect(controller.restore()).resolves.toEqual({ phase: "ready", restored: false });

      expect(storage.storage.remove).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(expect.any(Error), "restore");
      expect(manager.getState().counter.context.count).toBe(0);
    }
  });

  it("storageVersion mismatch удаляет запись без migrate", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(5, { storageVersion: "old" }));
    const controller = persistManager(manager, { storage: storage.storage, storageVersion: "new" });

    await expect(controller.restore()).resolves.toEqual({ phase: "ready", restored: false });

    expect(storage.storage.remove).toHaveBeenCalledOnce();
    expect(manager.getState().counter.context.count).toBe(0);
  });

  it("migrate конвертирует snapshot, восстанавливает его и пишет обратно текущую storageVersion", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(1, { storageVersion: "v1" }));
    const migrate = vi.fn(() => createSnapshot(8));
    const controller = persistManager(manager, {
      storage: storage.storage,
      storageVersion: "v2",
      migrate,
    });

    await controller.restore();

    expect(migrate).toHaveBeenCalledOnce();
    expect(manager.getState().counter.context.count).toBe(8);
    expect(storage.storage.set).toHaveBeenCalledOnce();
    expect(storage.read()).toMatchObject({
      storageVersion: "v2",
      snapshot: { machines: { counter: { count: 8 } } },
    });
  });

  it("storageVersion с той же версией не вызывает migrate и write-back", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(6, { storageVersion: "v1" }));
    const migrate = vi.fn(() => createSnapshot(0));
    const controller = persistManager(manager, {
      storage: storage.storage,
      storageVersion: "v1",
      migrate,
    });

    await expect(controller.restore()).resolves.toEqual({ phase: "ready", restored: true });

    expect(migrate).not.toHaveBeenCalled();
    expect(storage.storage.set).not.toHaveBeenCalled();
    expect(manager.getState().counter.context.count).toBe(6);
  });

  it("migrate может вернуть undefined: запись удаляется и hydrate пропускается", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(1, { storageVersion: "old" }));
    const migrate = vi.fn(() => undefined);
    const controller = persistManager(manager, {
      storage: storage.storage,
      storageVersion: "new",
      migrate,
    });

    await expect(controller.restore()).resolves.toEqual({ phase: "ready", restored: false });

    expect(migrate).toHaveBeenCalledOnce();
    expect(storage.storage.remove).toHaveBeenCalledOnce();
    expect(storage.storage.set).not.toHaveBeenCalled();
    expect(manager.getState().counter.context.count).toBe(0);
  });

  it("ошибка migrate в direct restore пробрасывается и помечает restore error", async () => {
    const manager = createManager();
    const onError = vi.fn();
    const storage = createStorage(createRecord(1, { storageVersion: "old" }));
    const migrateError = new Error("migrate failed");
    const controller = persistManager(manager, {
      storage: storage.storage,
      storageVersion: "new",
      migrate: () => {
        throw migrateError;
      },
      onError,
    });

    await expect(controller.restore()).rejects.toThrow("migrate failed");

    expect(onError).toHaveBeenCalledWith(migrateError, "restore");
    expect(controller.getStatus()).toEqual({ phase: "error", error: migrateError });
    expect(manager.getState().counter.context.count).toBe(0);
  });

  it("ошибка write-back после migrate считается save error, а не restore error", async () => {
    const manager = createManager();
    const onError = vi.fn();
    const storage = createStorage(createRecord(1, { storageVersion: "old" }));
    const writeError = new Error("write-back failed");
    storage.storage.set = vi.fn(() => {
      throw writeError;
    });
    const controller = persistManager(manager, {
      storage: storage.storage,
      storageVersion: "new",
      migrate: () => createSnapshot(9),
      onError,
    });

    await expect(controller.restore()).rejects.toThrow("write-back failed");

    expect(manager.getState().counter.context.count).toBe(9);
    expect(onError).toHaveBeenCalledWith(writeError, "save");
    expect(onError).not.toHaveBeenCalledWith(writeError, "restore");
    expect(controller.getStatus()).toEqual({ phase: "error", error: writeError });
  });

  it("background write-back после migrate проглатывает save error после onError/status", async () => {
    const manager = createManager();
    const onError = vi.fn();
    const storage = createStorage(createRecord(1, { storageVersion: "old" }));
    const writeError = new Error("background write-back failed");
    storage.storage.set = vi.fn(() => {
      throw writeError;
    });
    const controller = persistManager(manager, {
      storage: storage.storage,
      storageVersion: "new",
      migrate: () => createSnapshot(4),
      onError,
    });

    const stop = controller.start();

    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "error", error: writeError });
    });
    expect(manager.getState().counter.context.count).toBe(4);
    expect(onError).toHaveBeenCalledWith(writeError, "save");
    expect(onError).not.toHaveBeenCalledWith(writeError, "restore");
    stop();
  });

  it("maxAge удаляет просроченную запись", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const manager = createManager();
    const storage = createStorage(createRecord(4, { timestamp: 1_000 }));
    const controller = persistManager(manager, { storage: storage.storage, maxAge: 1_000 });

    await expect(controller.restore()).resolves.toEqual({ phase: "ready", restored: false });

    expect(storage.storage.remove).toHaveBeenCalledOnce();
    expect(manager.getState().counter.context.count).toBe(0);
  });

  it("maxAge на границе TTL ещё восстанавливает запись", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const manager = createManager();
    const storage = createStorage(createRecord(4, { timestamp: 9_000 }));
    const controller = persistManager(manager, { storage: storage.storage, maxAge: 1_000 });

    await expect(controller.restore()).resolves.toEqual({ phase: "ready", restored: true });

    expect(storage.storage.remove).not.toHaveBeenCalled();
    expect(manager.getState().counter.context.count).toBe(4);
  });

  it("save() сохраняет только выбранные machines", async () => {
    const manager = createManager();
    const storage = createStorage();
    const controller = persistManager(manager, { storage: storage.storage, machines: ["counter"] });

    manager.transition({ type: "INC" });
    manager.transition({ type: "TOGGLE" });
    await controller.save();

    expect(storage.read()?.snapshot.machines).toEqual({ counter: { count: 1 } });
  });

  it("shouldSave получает prev/current/action и может запретить запись", async () => {
    const manager = createManager();
    const storage = createStorage();
    const shouldSave = vi.fn(({ action }) => action.type === "TOGGLE");
    const controller = persistManager(manager, { storage: storage.storage, shouldSave });
    const stop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });

    manager.transition({ type: "INC" });
    await Promise.resolve();
    expect(storage.storage.set).not.toHaveBeenCalled();

    manager.transition({ type: "TOGGLE" });
    await vi.waitFor(() => {
      expect(storage.storage.set).toHaveBeenCalledOnce();
    });

    expect(shouldSave).toHaveBeenCalledTimes(2);
    expect(shouldSave.mock.calls[0][0].prevState.counter.context.count).toBe(0);
    expect(shouldSave.mock.calls[0][0].currentState.counter.context.count).toBe(1);
    expect(shouldSave.mock.calls[0][0].action).toEqual({ type: "INC" });
    stop();
  });

  it("ошибка shouldSave не роняет transition, вызывает onError save и не пишет storage", async () => {
    const manager = createManager();
    const storage = createStorage();
    const shouldSaveError = new Error("shouldSave failed");
    const onError = vi.fn();
    const controller = persistManager(manager, {
      storage: storage.storage,
      shouldSave: () => {
        throw shouldSaveError;
      },
      onError,
    });
    const stop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });

    expect(() => manager.transition({ type: "INC" })).not.toThrow();

    expect(storage.storage.set).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(shouldSaveError, "save");
    expect(controller.getStatus()).toEqual({ phase: "error", error: shouldSaveError });
    stop();
  });

  it("@@lite-fsm/HYDRATE извне не планирует save", async () => {
    const manager = createManager();
    const storage = createStorage();
    const controller = persistManager(manager, { storage: storage.storage });
    const stop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });

    manager.hydrate(createSnapshot(2));
    await Promise.resolve();

    expect(manager.getState().counter.context.count).toBe(2);
    expect(storage.storage.set).not.toHaveBeenCalled();
    stop();
  });

  it("restore() прокидывает выбранную hydrate strategy", async () => {
    const manager = createManager();
    const hydrate = vi.spyOn(manager, "hydrate");
    const storage = createStorage(createRecord(3));
    const controller = persistManager(manager, { storage: storage.storage, strategy: "replace" });

    await controller.restore();

    expect(hydrate).toHaveBeenCalledWith(createSnapshot(3), { strategy: "replace" });
  });

  it("start() ставит записи на паузу во время async restore и сохраняет live state после него", async () => {
    const manager = createManager();
    const pendingGet = deferred<PersistedRecord<Store> | undefined>();
    const storage = createStorage();
    storage.storage.get = vi.fn(() => pendingGet.promise);
    const controller = persistManager(manager, { storage: storage.storage });

    controller.start();
    manager.transition({ type: "INC" });

    expect(storage.storage.set).not.toHaveBeenCalled();

    pendingGet.resolve(undefined);
    await vi.waitFor(() => {
      expect(storage.storage.set).toHaveBeenCalledOnce();
    });
    expect(storage.read()?.snapshot.machines.counter).toEqual({ count: 1 });
  });

  it("start() ref-counted: повторный start не создаёт подписки, первый stop не останавливает controller", async () => {
    const manager = createManager();
    const onTransition = vi.spyOn(manager, "onTransition");
    const storage = createStorage();
    const controller = persistManager(manager, { storage: storage.storage });

    const firstStop = controller.start();
    const secondStop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });

    expect(onTransition).toHaveBeenCalledOnce();
    expect(storage.storage.subscribe).toHaveBeenCalledOnce();
    expect(storage.listenerCount()).toBe(1);

    firstStop();
    firstStop();
    expect(storage.listenerCount()).toBe(1);

    manager.transition({ type: "INC" });
    await vi.waitFor(() => {
      expect(storage.storage.set).toHaveBeenCalledOnce();
    });

    secondStop();
    expect(storage.listenerCount()).toBe(0);

    manager.transition({ type: "INC" });
    await Promise.resolve();
    expect(storage.storage.set).toHaveBeenCalledOnce();
    expect(controller.getStatus()).toEqual({ phase: "idle" });
  });

  it("старый async restore не перезаписывает более новый restore", async () => {
    const manager = createManager();
    const first = deferred<PersistedRecord<Store> | undefined>();
    const second = deferred<PersistedRecord<Store> | undefined>();
    const storage = createStorage();
    storage.storage.get = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const controller = persistManager(manager, { storage: storage.storage });

    const firstRestore = controller.restore();
    const secondRestore = controller.restore();
    second.resolve(createRecord(2));
    await secondRestore;
    first.resolve(createRecord(1));
    await firstRestore;

    expect(manager.getState().counter.context.count).toBe(2);
  });

  it("onRestoreSettled не вызывается для stale restore", async () => {
    const manager = createManager();
    const first = deferred<PersistedRecord<Store> | undefined>();
    const second = deferred<PersistedRecord<Store> | undefined>();
    const onRestoreSettled = vi.fn();
    const storage = createStorage();
    storage.storage.get = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const controller = persistManager(manager, { storage: storage.storage, onRestoreSettled });

    const firstRestore = controller.restore();
    const secondRestore = controller.restore();
    second.resolve(createRecord(2));
    await secondRestore;
    first.resolve(createRecord(1));
    await firstRestore;

    expect(onRestoreSettled).toHaveBeenCalledOnce();
    expect(onRestoreSettled).toHaveBeenCalledWith({ phase: "ready", restored: true });
    expect(manager.getState().counter.context.count).toBe(2);
  });

  it("finishRestore не публикует status, если restore устарел после post-checkpoint", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(5));
    const onRestoreSettled = vi.fn();
    const controller = persistManager(manager, { storage: storage.storage, onRestoreSettled });
    const statuses: PersistStatus[] = [];

    controller.subscribeStatus(() => {
      statuses.push(controller.getStatus());
    });
    manager.onTransition((_prev, _current, action) => {
      if (action.type !== HYDRATE_ACTION_TYPE) return;
      void Promise.resolve().then(() => {
        void Promise.resolve().then(() => {
          void controller.clear();
        });
      });
    });

    await expect(controller.restore()).resolves.toEqual({ phase: "ready", restored: true });
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });

    expect(onRestoreSettled).not.toHaveBeenCalled();
    expect(statuses).toEqual([{ phase: "restoring" }, { phase: "ready", restored: false }]);
    expect(manager.getState().counter.context.count).toBe(5);
  });

  it("stale restore token очищается, и следующие transitions снова сохраняются", async () => {
    const manager = createManager();
    const first = deferred<PersistedRecord<Store> | undefined>();
    const second = deferred<PersistedRecord<Store> | undefined>();
    const storage = createStorage();
    storage.storage.get = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const controller = persistManager(manager, { storage: storage.storage });
    const stop = controller.start();
    await vi.waitFor(() => {
      expect(storage.storage.get).toHaveBeenCalledOnce();
    });

    const secondRestore = controller.restore();
    second.resolve(createRecord(2));
    await secondRestore;
    first.resolve(createRecord(1));
    await Promise.resolve();

    manager.transition({ type: "INC" });

    await vi.waitFor(() => {
      expect(storage.storage.set).toHaveBeenCalledOnce();
    });
    expect(storage.read()?.snapshot.machines.counter).toEqual({ count: 3 });
    stop();
  });

  it("stale migrate completion не hydrate manager и не меняет финальный status", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(1, { storageVersion: "old" }));
    const migrated = deferred<MachineManagerSnapshot<Store> | undefined>();
    const controller = persistManager(manager, {
      storage: storage.storage,
      storageVersion: "new",
      migrate: () => migrated.promise,
    });

    const restore = controller.restore();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "restoring" });
    });

    migrated.resolve(createSnapshot(11));
    await controller.clear();
    await restore;

    expect(manager.getState().counter.context.count).toBe(0);
    expect(storage.storage.set).not.toHaveBeenCalled();
    expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
  });

  it("последний stop() отменяет stale restore и возвращает статус в idle", async () => {
    const manager = createManager();
    const pendingGet = deferred<PersistedRecord<Store> | undefined>();
    const storage = createStorage();
    storage.storage.get = vi.fn(() => pendingGet.promise);
    const controller = persistManager(manager, { storage: storage.storage });

    const stop = controller.start();
    await vi.waitFor(() => {
      expect(storage.storage.get).toHaveBeenCalledOnce();
    });
    stop();
    pendingGet.resolve(createRecord(9));
    await Promise.resolve();

    expect(manager.getState().counter.context.count).toBe(0);
    expect(controller.getStatus()).toEqual({ phase: "idle" });
  });

  it("stop() не даёт stale background restore ошибке обновить status или вызвать onError", async () => {
    const manager = createManager();
    const pendingGet = deferred<PersistedRecord<Store> | undefined>();
    const onError = vi.fn();
    const storage = createStorage();
    storage.storage.get = vi.fn(() => pendingGet.promise);
    const controller = persistManager(manager, { storage: storage.storage, onError });

    const stop = controller.start();
    await vi.waitFor(() => {
      expect(storage.storage.get).toHaveBeenCalledOnce();
    });
    stop();
    pendingGet.reject(new Error("late get failed"));
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
    expect(controller.getStatus()).toEqual({ phase: "idle" });
  });

  it("stop() во время async restore не вызывает onRestoreSettled", async () => {
    const manager = createManager();
    const pendingGet = deferred<PersistedRecord<Store> | undefined>();
    const onRestoreSettled = vi.fn();
    const storage = createStorage();
    storage.storage.get = vi.fn(() => pendingGet.promise);
    const controller = persistManager(manager, { storage: storage.storage, onRestoreSettled });

    const stop = controller.start();
    await vi.waitFor(() => {
      expect(storage.storage.get).toHaveBeenCalledOnce();
    });
    stop();
    pendingGet.resolve(createRecord(5));
    await Promise.resolve();

    expect(onRestoreSettled).not.toHaveBeenCalled();
    expect(controller.getStatus()).toEqual({ phase: "idle" });
  });

  it("stop() во время async remove делает restore completion stale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const manager = createManager();
    const storage = createStorage(createRecord(1, { timestamp: 1 }));
    let stop: () => void = () => {};
    storage.storage.remove = vi.fn(() => {
      stop();
    });
    const controller = persistManager(manager, { storage: storage.storage, maxAge: 1 });
    stop = controller.start();

    await vi.waitFor(() => {
      expect(storage.storage.remove).toHaveBeenCalledOnce();
    });

    expect(manager.getState().counter.context.count).toBe(0);
    expect(controller.getStatus()).toEqual({ phase: "idle" });
  });

  it("clear() отменяет pending save и не даёт ему переписать storage", async () => {
    vi.useFakeTimers();
    const manager = createManager();
    const storage = createStorage();
    const controller = persistManager(manager, { storage: storage.storage, throttleMs: 100 });

    const stop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });

    manager.transition({ type: "INC" });
    await controller.clear();
    vi.advanceTimersByTime(100);

    expect(storage.storage.remove).toHaveBeenCalledOnce();
    expect(storage.storage.set).not.toHaveBeenCalled();
    stop();
  });

  it("clear() дожидается уже начатый async save и удаляет запись последним действием", async () => {
    const manager = createManager();
    const storage = createStorage();
    const pendingSet = deferred<void>();
    storage.storage.set = vi.fn((record) => pendingSet.promise.then(() => storage.write(record)));
    const controller = persistManager(manager, { storage: storage.storage });
    const stop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });

    manager.transition({ type: "INC" });
    await vi.waitFor(() => {
      expect(storage.storage.set).toHaveBeenCalledOnce();
    });

    let cleared = false;
    const clear = controller.clear().then(() => {
      cleared = true;
    });
    await Promise.resolve();
    expect(cleared).toBe(false);
    expect(storage.storage.remove).not.toHaveBeenCalled();

    pendingSet.resolve();
    await clear;

    expect(cleared).toBe(true);
    expect(storage.storage.remove).toHaveBeenCalledOnce();
    expect(storage.read()).toBeUndefined();
    stop();
  });

  it("clear() проглатывает ошибку уже начатого save и всё равно удаляет storage", async () => {
    const manager = createManager();
    const storage = createStorage();
    const pendingSet = deferred<void>();
    const writeError = new Error("late save failed");
    storage.storage.set = vi.fn(() => pendingSet.promise);
    const controller = persistManager(manager, { storage: storage.storage });

    const save = controller.save().catch((err: unknown) => err);
    await vi.waitFor(() => {
      expect(storage.storage.set).toHaveBeenCalledOnce();
    });

    const clear = controller.clear();
    pendingSet.reject(writeError);

    await expect(save).resolves.toBe(writeError);
    await expect(clear).resolves.toBeUndefined();
    expect(storage.storage.remove).toHaveBeenCalledOnce();
    expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
  });

  it("clear() во время async restore не даёт stale restore гидратировать manager", async () => {
    const manager = createManager();
    const pendingGet = deferred<PersistedRecord<Store> | undefined>();
    const storage = createStorage();
    storage.storage.get = vi.fn(() => pendingGet.promise);
    const controller = persistManager(manager, { storage: storage.storage });

    const restore = controller.restore();
    await vi.waitFor(() => {
      expect(storage.storage.get).toHaveBeenCalledOnce();
    });
    await controller.clear();
    pendingGet.resolve(createRecord(10));
    await restore;

    expect(manager.getState().counter.context.count).toBe(0);
    expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
  });

  it("clear() во время async restore не вызывает onRestoreSettled", async () => {
    const manager = createManager();
    const pendingGet = deferred<PersistedRecord<Store> | undefined>();
    const onRestoreSettled = vi.fn();
    const storage = createStorage();
    storage.storage.get = vi.fn(() => pendingGet.promise);
    const controller = persistManager(manager, { storage: storage.storage, onRestoreSettled });

    const restore = controller.restore();
    await vi.waitFor(() => {
      expect(storage.storage.get).toHaveBeenCalledOnce();
    });
    await controller.clear();
    pendingGet.resolve(createRecord(10));
    await restore;

    expect(onRestoreSettled).not.toHaveBeenCalled();
  });

  it("clear() пробрасывает remove errors и вызывает onError clear", async () => {
    const manager = createManager();
    const onError = vi.fn();
    const storage = createStorage();
    const clearError = new Error("clear failed");
    storage.storage.remove = vi.fn(() => {
      throw clearError;
    });
    const controller = persistManager(manager, { storage: storage.storage, onError });

    await expect(controller.clear()).rejects.toThrow("clear failed");

    expect(onError).toHaveBeenCalledWith(clearError, "clear");
    expect(controller.getStatus()).toEqual({ phase: "error", error: clearError });
  });

  it("direct errors reject, а background errors обновляют status и вызывают onError", async () => {
    const manager = createManager();
    const onError = vi.fn();
    const directStorage = createStorage();
    directStorage.storage.set = vi.fn(() => {
      throw new Error("write failed");
    });
    const directController = persistManager(manager, { storage: directStorage.storage, onError });

    await expect(directController.save()).rejects.toThrow("write failed");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "save");
    expect(directController.getStatus().phase).toBe("error");

    const backgroundStorage = createStorage();
    backgroundStorage.storage.set = vi.fn(() => {
      throw new Error("background failed");
    });
    const backgroundController = persistManager(manager, { storage: backgroundStorage.storage, onError });
    const stop = backgroundController.start();
    await vi.waitFor(() => {
      expect(backgroundController.getStatus()).toEqual({ phase: "ready", restored: false });
    });

    manager.transition({ type: "INC" });

    await vi.waitFor(() => {
      expect(backgroundController.getStatus().phase).toBe("error");
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "save");
    stop();
  });

  it("save() ловит ошибки dehydrate до storage.set", async () => {
    const manager = createManager();
    const dehydrateError = new Error("dehydrate failed");
    vi.spyOn(manager, "dehydrate").mockImplementation(() => {
      throw dehydrateError;
    });
    const storage = createStorage();
    const onError = vi.fn();
    const controller = persistManager(manager, { storage: storage.storage, onError });

    await expect(controller.save()).rejects.toThrow("dehydrate failed");

    expect(storage.storage.set).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(dehydrateError, "save");
    expect(controller.getStatus()).toEqual({ phase: "error", error: dehydrateError });
  });

  it("save() не вызывает storage.set, если dehydrate инвалидировал save guard", async () => {
    const manager = createManager();
    const storage = createStorage();
    const controller = persistManager(manager, { storage: storage.storage });
    vi.spyOn(manager, "dehydrate").mockImplementation(() => {
      void controller.clear();
      return createSnapshot(1);
    });

    await controller.save();

    expect(storage.storage.set).not.toHaveBeenCalled();
    expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
  });

  it("save() не обновляет status после storage.set, если set инвалидировал save guard", async () => {
    const manager = createManager();
    const storage = createStorage();
    const controller = persistManager(manager, { storage: storage.storage });
    storage.storage.set = vi.fn((record) => {
      storage.write(record);
      void controller.clear();
    });

    await controller.save();

    expect(storage.storage.set).toHaveBeenCalledOnce();
    expect(storage.read()).toBeUndefined();
    expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
  });

  it("stale direct save error вызывает onError без перезаписи status error", async () => {
    const manager = createManager();
    const storage = createStorage();
    const onError = vi.fn();
    const staleError = new Error("stale write failed");
    const controller = persistManager(manager, { storage: storage.storage, onError });
    storage.storage.set = vi.fn(() => {
      void controller.clear();
      throw staleError;
    });

    await expect(controller.save()).rejects.toThrow("stale write failed");

    expect(onError).toHaveBeenCalledWith(staleError, "save");
    expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
  });

  it("stale background save error после stop не вызывает onError и не меняет status", async () => {
    const manager = createManager();
    const storage = createStorage();
    const onError = vi.fn();
    const staleError = new Error("late write failed");
    const controller = persistManager(manager, { storage: storage.storage, onError });
    const stop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });
    storage.storage.set = vi.fn(() => {
      stop();
      throw staleError;
    });

    manager.transition({ type: "INC" });
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalledWith(staleError, "save");
    expect(controller.getStatus()).toEqual({ phase: "idle" });
  });

  it("onError не маскирует исходную direct save ошибку", async () => {
    const manager = createManager();
    const writeError = new Error("write failed");
    const storage = createStorage();
    storage.storage.set = vi.fn(() => {
      throw writeError;
    });
    const controller = persistManager(manager, {
      storage: storage.storage,
      onError: () => {
        throw new Error("handler failed");
      },
    });

    await expect(controller.save()).rejects.toBe(writeError);
  });

  it("одинаковый error status не уведомляет подписчиков повторно, другой error уведомляет", async () => {
    const manager = createManager();
    const storage = createStorage();
    const firstError = new Error("first");
    const secondError = new Error("second");
    storage.storage.set = vi.fn(() => {
      throw firstError;
    });
    const controller = persistManager(manager, { storage: storage.storage });
    const statuses: Array<ReturnType<typeof controller.getStatus>> = [];
    controller.subscribeStatus(() => {
      statuses.push(controller.getStatus());
    });

    await expect(controller.save()).rejects.toBe(firstError);
    await expect(controller.save()).rejects.toBe(firstError);

    storage.storage.set = vi.fn(() => {
      throw secondError;
    });
    await expect(controller.save()).rejects.toBe(secondError);

    expect(statuses).toEqual([
      { phase: "error", error: firstError },
      { phase: "error", error: secondError },
    ]);
  });

  it("restore() ловит storage.get errors в direct и background режимах", async () => {
    const getError = new Error("get failed");
    const manager = createManager();
    const directStorage = createStorage();
    directStorage.storage.get = vi.fn(() => {
      throw getError;
    });
    const onError = vi.fn();
    const directController = persistManager(manager, { storage: directStorage.storage, onError });

    await expect(directController.restore()).rejects.toThrow("get failed");
    expect(onError).toHaveBeenCalledWith(getError, "restore");
    expect(directController.getStatus()).toEqual({ phase: "error", error: getError });

    const backgroundStorage = createStorage();
    backgroundStorage.storage.get = vi.fn(() => {
      throw getError;
    });
    const backgroundController = persistManager(manager, { storage: backgroundStorage.storage, onError });
    const stop = backgroundController.start();

    await vi.waitFor(() => {
      expect(backgroundController.getStatus()).toEqual({ phase: "error", error: getError });
    });
    expect(onError).toHaveBeenCalledWith(getError, "restore");
    stop();
  });

  it("remove error во время invalid restore пробрасывается после initial shape error", async () => {
    const manager = createManager();
    const removeError = new Error("remove failed");
    const storage = createStorage({ timestamp: "bad", snapshot: {} });
    storage.storage.remove = vi.fn(() => {
      throw removeError;
    });
    const onError = vi.fn();
    const controller = persistManager(manager, { storage: storage.storage, onError });

    await expect(controller.restore()).rejects.toThrow("remove failed");

    expect(onError).toHaveBeenNthCalledWith(1, expect.any(Error), "restore");
    expect(onError).toHaveBeenNthCalledWith(2, removeError, "restore");
    expect(controller.getStatus()).toEqual({ phase: "error", error: removeError });
  });

  it("hydrate errors пробрасываются direct restore и проглатываются background restore", async () => {
    const hydrateError = new Error("hydrate failed");
    const manager = createManager();
    vi.spyOn(manager, "hydrate").mockImplementation(() => {
      throw hydrateError;
    });
    const onError = vi.fn();
    const directStorage = createStorage(createRecord(1));
    const directController = persistManager(manager, { storage: directStorage.storage, onError });

    await expect(directController.restore()).rejects.toThrow("hydrate failed");
    expect(onError).toHaveBeenCalledWith(hydrateError, "restore");
    expect(directController.getStatus()).toEqual({ phase: "error", error: hydrateError });

    const backgroundStorage = createStorage(createRecord(1));
    const backgroundController = persistManager(manager, { storage: backgroundStorage.storage, onError });
    const stop = backgroundController.start();

    await vi.waitFor(() => {
      expect(backgroundController.getStatus()).toEqual({ phase: "error", error: hydrateError });
    });
    stop();
  });

  it("throttleMs склеивает save, а flush() пишет pending save сразу", async () => {
    vi.useFakeTimers();
    const manager = createManager();
    const storage = createStorage();
    const controller = persistManager(manager, { storage: storage.storage, throttleMs: 100 });
    const stop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });

    manager.transition({ type: "INC" });
    manager.transition({ type: "INC" });
    vi.advanceTimersByTime(99);
    expect(storage.storage.set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => {
      expect(storage.storage.set).toHaveBeenCalledOnce();
    });
    expect(storage.read()?.snapshot.machines.counter).toEqual({ count: 2 });

    manager.transition({ type: "INC" });
    await controller.flush();
    expect(storage.storage.set).toHaveBeenCalledTimes(2);
    expect(storage.read()?.snapshot.machines.counter).toEqual({ count: 3 });
    stop();
  });

  it("flush() без pending save ждёт активный background save", async () => {
    const manager = createManager();
    const storage = createStorage();
    const pendingSet = deferred<void>();
    storage.storage.set = vi.fn((record) => {
      storage.write(record);
      return pendingSet.promise;
    });
    const controller = persistManager(manager, { storage: storage.storage });
    const stop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });

    manager.transition({ type: "INC" });
    await vi.waitFor(() => {
      expect(storage.storage.set).toHaveBeenCalledOnce();
    });

    let flushed = false;
    const flush = controller.flush().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);

    pendingSet.resolve();
    await flush;

    expect(flushed).toBe(true);
    expect(storage.read()?.snapshot.machines.counter).toEqual({ count: 1 });
    stop();
  });

  it("storage.subscribe запускает restore без echo-save", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(4));
    const controller = persistManager(manager, { storage: storage.storage });
    const stop = controller.start();

    await vi.waitFor(() => {
      expect(manager.getState().counter.context.count).toBe(4);
    });
    expect(storage.storage.set).not.toHaveBeenCalled();

    storage.write(createRecord(7));
    storage.emit();

    await vi.waitFor(() => {
      expect(manager.getState().counter.context.count).toBe(7);
    });
    expect(storage.storage.set).not.toHaveBeenCalled();
    stop();
  });

  it("status подписки получают только реальные смены status и корректно отписываются", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(2));
    const controller = persistManager(manager, { storage: storage.storage });
    const statuses: Array<ReturnType<typeof controller.getStatus>> = [];
    const subscriber = vi.fn(() => {
      statuses.push(controller.getStatus());
    });
    const unsubscribe = controller.subscribeStatus(subscriber);

    await controller.restore();
    await controller.clear();
    await controller.clear();

    expect(statuses).toEqual([
      { phase: "restoring" },
      { phase: "ready", restored: true },
      { phase: "ready", restored: false },
    ]);

    unsubscribe();
    await controller.restore();

    expect(subscriber).toHaveBeenCalledTimes(3);
  });

  it("subscribeStatus: подписчик может отписаться внутри своего callback без срыва итерации", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(1));
    const controller = persistManager(manager, { storage: storage.storage });

    const callsA: PersistStatus[] = [];
    const callsB: PersistStatus[] = [];
    let unsubscribeA: () => void = () => {};
    unsubscribeA = controller.subscribeStatus(() => {
      callsA.push(controller.getStatus());
      unsubscribeA();
    });
    controller.subscribeStatus(() => {
      callsB.push(controller.getStatus());
    });

    await controller.restore();

    expect(callsA).toEqual([{ phase: "restoring" }]);
    expect(callsB).toEqual([{ phase: "restoring" }, { phase: "ready", restored: true }]);
  });

  it("onError не маскирует исходную direct restore ошибку", async () => {
    const manager = createManager();
    const getError = new Error("get failed");
    const storage = createStorage();
    storage.storage.get = vi.fn(() => {
      throw getError;
    });
    const controller = persistManager(manager, {
      storage: storage.storage,
      onError: () => {
        throw new Error("handler failed");
      },
    });

    await expect(controller.restore()).rejects.toBe(getError);
  });

  it("onError не маскирует исходную clear ошибку", async () => {
    const manager = createManager();
    const removeError = new Error("remove failed");
    const storage = createStorage();
    storage.storage.remove = vi.fn(() => {
      throw removeError;
    });
    const controller = persistManager(manager, {
      storage: storage.storage,
      onError: () => {
        throw new Error("handler failed");
      },
    });

    await expect(controller.clear()).rejects.toBe(removeError);
  });

  it("повторный start() после полного stop() заново подписывается и запускает restore", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(3));
    const controller = persistManager(manager, { storage: storage.storage });

    const firstStop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: true });
    });
    expect(manager.getState().counter.context.count).toBe(3);
    expect(storage.listenerCount()).toBe(1);

    firstStop();
    expect(controller.getStatus()).toEqual({ phase: "idle" });
    expect(storage.listenerCount()).toBe(0);

    storage.write(createRecord(7));
    const secondStop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: true });
    });
    expect(manager.getState().counter.context.count).toBe(7);
    expect(storage.listenerCount()).toBe(1);

    secondStop();
    expect(controller.getStatus()).toEqual({ phase: "idle" });
    expect(storage.listenerCount()).toBe(0);
  });

  it("flush() без pending и без active save резолвится без побочных эффектов", async () => {
    const manager = createManager();
    const storage = createStorage();
    const controller = persistManager(manager, { storage: storage.storage });

    await expect(controller.flush()).resolves.toBeUndefined();
    expect(storage.storage.set).not.toHaveBeenCalled();
  });

  it("start() работает со storage без subscribe и stop() не падает", async () => {
    const manager = createManager();
    const storage = createStorage(createRecord(5));
    const subscribelessStorage: PersistStorage<Store> = {
      get: storage.storage.get,
      set: storage.storage.set,
      remove: storage.storage.remove,
    };
    const controller = persistManager(manager, { storage: subscribelessStorage });

    const stop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: true });
    });
    expect(manager.getState().counter.context.count).toBe(5);

    expect(() => stop()).not.toThrow();
    expect(controller.getStatus()).toEqual({ phase: "idle" });
  });

  it("direct save() после полного stop() пишет storage и не возобновляет subscriptions", async () => {
    const manager = createManager();
    const storage = createStorage();
    const controller = persistManager(manager, { storage: storage.storage });

    const stop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });
    stop();
    expect(storage.listenerCount()).toBe(0);

    manager.transition({ type: "INC" });
    await controller.save();

    expect(storage.storage.set).toHaveBeenCalledOnce();
    expect(storage.read()?.snapshot.machines.counter).toEqual({ count: 1 });
    expect(storage.listenerCount()).toBe(0);
  });

  it("@@lite-fsm/HYDRATE не вызывает shouldSave", async () => {
    const manager = createManager();
    const storage = createStorage();
    const shouldSave = vi.fn(() => true);
    const controller = persistManager(manager, { storage: storage.storage, shouldSave });
    const stop = controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus()).toEqual({ phase: "ready", restored: false });
    });

    manager.hydrate(createSnapshot(2));
    await Promise.resolve();

    expect(shouldSave).not.toHaveBeenCalled();
    expect(storage.storage.set).not.toHaveBeenCalled();
    stop();
  });
});

describe("createJsonStorage", () => {
  it("читает undefined для отсутствующего ключа, пишет JSON и удаляет запись", () => {
    const backend = new Map<string, string>();
    const storage = createJsonStorage<Store>({
      key: "fsm",
      storage: {
        getItem: (key) => backend.get(key) ?? null,
        setItem: (key, value) => {
          backend.set(key, value);
        },
        removeItem: (key) => {
          backend.delete(key);
        },
      },
    });
    const record = createRecord(5, { storageVersion: 1 });

    expect(storage.get()).toBeUndefined();
    storage.set(record);
    expect(backend.get("fsm")).toBe(JSON.stringify(record));
    expect(storage.get()).toEqual(record);
    storage.remove();
    expect(storage.get()).toBeUndefined();
  });

  it("пробрасывает JSON.parse ошибки из get()", () => {
    const storage = createJsonStorage<Store>({
      key: "fsm",
      storage: {
        getItem: () => "{bad json",
        setItem: () => {},
        removeItem: () => {},
      },
    });

    expect(() => storage.get()).toThrow(SyntaxError);
  });

  it("remove() не падает на отсутствующем ключе", () => {
    const backend = new Map<string, string>();
    const storage = createJsonStorage<Store>({
      key: "fsm",
      storage: {
        getItem: (key) => backend.get(key) ?? null,
        setItem: (key, value) => {
          backend.set(key, value);
        },
        removeItem: (key) => {
          backend.delete(key);
        },
      },
    });

    expect(() => storage.remove()).not.toThrow();
    expect(storage.get()).toBeUndefined();
  });
});
