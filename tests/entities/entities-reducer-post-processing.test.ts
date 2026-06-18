import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  i32,
  spawnEvent,
} from "@lite-fsm/entities";
import type { EntityIndex } from "@lite-fsm/entities";

import { ENTITY_RESOLVED_STATE_CODE, type EntityReducePlan } from "../../packages/entities/src/runtime/compile";
import { reduceEntityBucket } from "../../packages/entities/src/runtime/reduce";
import { postProcessAcceptedRows } from "../../packages/entities/src/runtime/reduce-post-process";
import {
  getEntityRuntimeState,
  moveActorStateBucket,
  moveActorStateBucketBatch,
  rebindActorReducerSelf,
  schedulePrevStateCodeSync,
  syncPendingPrevStateCode,
  type ColumnarActorStore,
  type EntityRuntimeState,
} from "../../packages/entities/src/runtime/state";
import {
  prepareEntityTransaction,
  scheduleDespawnRowHint,
  scheduleEntityDespawn,
} from "../../packages/entities/src/runtime/transaction";

type TestReducerSelf = {
  readonly indices: readonly EntityIndex[];
  readonly states: Record<"READY" | "STOPPED", number>;
  stateCode: Int16Array;
  prevStateCode: Int16Array;
};

type TestReducer = (
  slice: { readonly state: string; readonly context: Record<string, unknown> },
  action: { readonly type: string },
  meta: { readonly self: TestReducerSelf },
) => void;

type TestEffect = (deps: { readonly self: { readonly indices: readonly EntityIndex[] } }) => void;

const spawnEvents = defineSpawnEvents({
  SPAWN: spawnEvent<{ readonly id: string }>(),
});

const createActor = (reducer?: TestReducer) => {
  const actor = {
    storage: "entity",
    config: {
      __INIT: { ENTITY_SPAWNED: "READY" },
      READY: { TICK: "READY" },
      STOPPED: {},
    },
    initialState: "__INIT",
    initialContext: { value: i32() },
    spawnSchema: {},
  } as const;

  return reducer ? { ...actor, reducer } : actor;
};

const createManager = (reducer?: TestReducer) => {
  const machines = { actor: createActor(reducer) };
  const spawn = defineEntitySpawn(machines, spawnEvents)({
    SPAWN: (payload) => ({
      id: payload.id,
      groupTag: "units",
      actors: { actor: {} },
    }),
  });

  return MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
};

const createTransitionManager = (
  reducer?: TestReducer,
  effects?: Record<string, TestEffect>,
) => {
  const actor = {
    storage: "entity",
    config: {
      __INIT: { ENTITY_SPAWNED: "READY" },
      READY: { TICK: "STOPPED" },
      STOPPED: {},
    },
    initialState: "__INIT",
    initialContext: { value: i32() },
    spawnSchema: {},
    ...(reducer ? { reducer } : {}),
    ...(effects ? { effects } : {}),
  } as const;
  const machines = { actor };
  const spawn = defineEntitySpawn(machines, spawnEvents)({
    SPAWN: (payload) => ({
      id: payload.id,
      groupTag: "units",
      actors: { actor: {} },
    }),
  });

  return MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
};

const createDespawnOnManager = (withLifecycle = false) => {
  const actor = {
    storage: "entity",
    config: {
      __INIT: { ENTITY_SPAWNED: "READY" },
      READY: { TICK: "EXPIRED" },
      EXPIRED: withLifecycle ? { ENTITY_DESPAWNED: "CLEANED" } : {},
      CLEANED: {},
    },
    initialState: "__INIT",
    initialContext: { value: i32() },
    spawnSchema: {},
    despawnOn: "EXPIRED",
    ...(withLifecycle ? { reducer: () => undefined } : {}),
  } as const;
  const machines = { actor };
  const spawn = defineEntitySpawn(machines, spawnEvents)({
    SPAWN: (payload) => ({
      id: payload.id,
      groupTag: "units",
      actors: { actor: {} },
    }),
  });

  return MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
};

const spawnEntity = (manager: Pick<ReturnType<typeof createManager>, "transition">, id: string): void => {
  manager.transition({ type: "SPAWN", payload: { id } });
};

const noLifecyclePostProcessingFlags = {
  scheduleDespawnOn: false,
  scheduleEffects: false,
  collectReactionSurvivors: false,
  scheduleTerminal: false,
} as const;

const despawnOnPostProcessingFlags = {
  scheduleDespawnOn: true,
  scheduleEffects: true,
  collectReactionSurvivors: false,
  scheduleTerminal: true,
} as const;

const createBulkTransitionPlan = (acceptStateCodes: readonly number[]): EntityReducePlan => ({
  eventCode: 0,
  acceptStateCodes,
  allDefaultTransitionsIdentity: false,
  hasNonIdentityDefaultTransition: true,
  mayEnterEffectState: false,
  hasDespawnOnStates: false,
  hasReaction: false,
  mayEnterTerminalState: false,
  requiresReducerCall: false,
});

const createUnscopedTickContext = (runtime: EntityRuntimeState) => {
  const dispatch = {
    runtime: new Map<string, unknown>(),
    route: { scope: "unscoped" as const, key: undefined, targetSet: [] as string[] },
    reportError(error: unknown) {
      throw error;
    },
  };
  prepareEntityTransaction(dispatch, runtime);

  return {
    action: { type: "TICK" },
    dispatch,
    manager: { getDependencies: () => ({}) },
  };
};

const reduceUnscopedTick = (runtime: EntityRuntimeState, ctx: ReturnType<typeof createUnscopedTickContext>): void => {
  reduceEntityBucket(runtime, ctx as never);
};

const isNumericIndex = (property: string | symbol): boolean =>
  typeof property === "string" && /^(0|[1-9]\d*)$/.test(property);

const installStateCodeReadCounters = (store: ColumnarActorStore) => {
  const originalStateCode = store.stateCode;
  const originalPrevStateCode = store.prevStateCode;
  const stateCode = Array.from(originalStateCode);
  const prevStateCode = Array.from(originalPrevStateCode);
  let stateReads = 0;
  let prevReads = 0;
  let prevWrites = 0;

  store.stateCode = new Proxy(stateCode, {
    get(target, property, receiver) {
      if (isNumericIndex(property)) stateReads += 1;
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      return Reflect.set(target, property, value, receiver);
    },
  }) as unknown as Int16Array;
  store.prevStateCode = new Proxy(prevStateCode, {
    get(target, property, receiver) {
      if (isNumericIndex(property)) prevReads += 1;
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (isNumericIndex(property)) prevWrites += 1;
      return Reflect.set(target, property, value, receiver);
    },
  }) as unknown as Int16Array;
  rebindActorReducerSelf(store);

  return {
    get stateReads() {
      return stateReads;
    },
    get prevReads() {
      return prevReads;
    },
    get prevWrites() {
      return prevWrites;
    },
    restore() {
      store.stateCode = originalStateCode;
      store.prevStateCode = originalPrevStateCode;
      rebindActorReducerSelf(store);
    },
  };
};

const installAllocationCounters = () => {
  const OriginalMap = globalThis.Map;
  const OriginalSet = globalThis.Set;
  let mapAllocations = 0;
  let setAllocations = 0;

  const CountingMap = new Proxy(OriginalMap, {
    construct(target, args, newTarget) {
      mapAllocations += 1;
      return Reflect.construct(target, args, newTarget);
    },
  }) as typeof Map;
  const CountingSet = new Proxy(OriginalSet, {
    construct(target, args, newTarget) {
      setAllocations += 1;
      return Reflect.construct(target, args, newTarget);
    },
  }) as typeof Set;

  Object.defineProperty(globalThis, "Map", { configurable: true, writable: true, value: CountingMap });
  Object.defineProperty(globalThis, "Set", { configurable: true, writable: true, value: CountingSet });

  return {
    get mapAllocations() {
      return mapAllocations;
    },
    get setAllocations() {
      return setAllocations;
    },
    restore() {
      Object.defineProperty(globalThis, "Map", { configurable: true, writable: true, value: OriginalMap });
      Object.defineProperty(globalThis, "Set", { configurable: true, writable: true, value: OriginalSet });
    },
  };
};

const installTypedArrayAllocationCounters = () => {
  const OriginalUint8Array = globalThis.Uint8Array;
  const OriginalInt16Array = globalThis.Int16Array;
  let uint8Allocations = 0;
  let int16Allocations = 0;

  const CountingUint8Array = new Proxy(OriginalUint8Array, {
    construct(target, args, newTarget) {
      uint8Allocations += 1;
      return Reflect.construct(target, args, newTarget);
    },
  }) as typeof Uint8Array;
  const CountingInt16Array = new Proxy(OriginalInt16Array, {
    construct(target, args, newTarget) {
      int16Allocations += 1;
      return Reflect.construct(target, args, newTarget);
    },
  }) as typeof Int16Array;

  Object.defineProperty(globalThis, "Uint8Array", { configurable: true, writable: true, value: CountingUint8Array });
  Object.defineProperty(globalThis, "Int16Array", { configurable: true, writable: true, value: CountingInt16Array });

  return {
    get uint8Allocations() {
      return uint8Allocations;
    },
    get int16Allocations() {
      return int16Allocations;
    },
    restore() {
      Object.defineProperty(globalThis, "Uint8Array", { configurable: true, writable: true, value: OriginalUint8Array });
      Object.defineProperty(globalThis, "Int16Array", { configurable: true, writable: true, value: OriginalInt16Array });
    },
  };
};

describe("@lite-fsm/entities — reducer post-processing dirty rows", () => {
  it("hot identity TICK не создает Set, Map, column enumeration и bucket update scan", () => {
    const manager = createManager();
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");
    spawnEntity(manager, "unit/c");

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const rowCount = store.stateBuckets[store.metadata.stateCodeByName.READY].length;
    reduceUnscopedTick(runtime, createUnscopedTickContext(runtime));

    const ctx = createUnscopedTickContext(runtime);
    const reads = installStateCodeReadCounters(store);
    const originalEntries = Object.entries;
    let columnEnumerations = 0;
    const entriesSpy = vi.spyOn(Object, "entries").mockImplementation((value: object) => {
      if (value === store.columns) columnEnumerations += 1;
      return originalEntries(value);
    });
    const allocations = installAllocationCounters();
    let mapAllocations = 0;
    let setAllocations = 0;

    try {
      reduceUnscopedTick(runtime, ctx);
      mapAllocations = allocations.mapAllocations;
      setAllocations = allocations.setAllocations;
    } finally {
      entriesSpy.mockRestore();
      allocations.restore();
      reads.restore();
    }

    // covered by 5.6: identity post-processing path avoids Map/Set allocation and extra scans.
    expect(mapAllocations).toBe(0);
    expect(setAllocations).toBe(0);
    expect(columnEnumerations).toBe(0);
    expect(reads.stateReads).toBe(rowCount);
    expect(reads.prevReads).toBe(0);
    expect(reads.prevWrites).toBe(0);
  });

  it("runtime назначает internal storeId по порядку templates", () => {
    const manager = createManager();
    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;

    expect(store.storeId).toBe(0);
    expect(runtime.actorStoresById).toEqual([store]);
  });

  it("despawnOn final-removal rows планируют hints без Map и не попадают в dirty bucket move", () => {
    const manager = createDespawnOnManager();
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const expiredCode = store.metadata.stateCodeByName.EXPIRED;
    const accepted = store.stateBuckets[readyCode];
    for (const entity of accepted) {
      store.prevStateCode[entity] = readyCode;
      store.stateCode[entity] = expiredCode;
    }
    const transaction = prepareEntityTransaction({ runtime: new Map<string, unknown>() }, runtime);
    const beforeRowVersions = [store.rowVersion[0], store.rowVersion[1]];
    const allocations = installAllocationCounters();
    let mapAllocations = 0;
    let setAllocations = 0;
    let result: ReturnType<typeof postProcessAcceptedRows>;

    try {
      result = postProcessAcceptedRows(
        transaction,
        store,
        accepted,
        despawnOnPostProcessingFlags,
        undefined,
        readyCode,
        expiredCode,
      );
      mapAllocations = allocations.mapAllocations;
      setAllocations = allocations.setAllocations;
    } finally {
      allocations.restore();
    }

    // covered by 5.1/5.2/5.6: all-despawn final-removal path schedules cleanup hints without hot Map/Set allocation.
    expect(mapAllocations).toBe(0);
    expect(setAllocations).toBe(0);
    expect(result!.dirtyRows).toBeUndefined();
    expect(result!.despawnOnRemovesAcceptedRows).toBe(true);
    expect(result!.acceptedRowsHaveFinalRemoval).toBe(true);
    expect(result!.reactionSurvivorRows).toBeUndefined();
    expect(transaction.scheduledDespawns).toEqual([0, 1]);
    expect(transaction.despawnRowHints).toEqual([
      { storeId: store.storeId, entity: 0, bucketStateCode: readyCode },
      { storeId: store.storeId, entity: 1, bucketStateCode: readyCode },
    ]);
    expect(store.stateBuckets[readyCode]).toEqual([0, 1]);
    expect(store.stateBuckets[expiredCode]).toEqual([]);
    expect([store.rowVersion[0], store.rowVersion[1]]).toEqual(
      beforeRowVersions.map((version) => version + 1),
    );
  });

  it("mass despawn scheduling растит mark arrays амортизированно", () => {
    const manager = createDespawnOnManager();
    const rowCount = 128;
    for (let index = 0; index < rowCount; index += 1) {
      spawnEntity(manager, `unit/${index}`);
    }

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const transaction = prepareEntityTransaction({ runtime: new Map<string, unknown>() }, runtime);
    const allocations = installTypedArrayAllocationCounters();
    let uint8Allocations = 0;
    let int16Allocations = 0;

    try {
      for (let entity = 0; entity < rowCount; entity += 1) {
        expect(scheduleEntityDespawn(transaction, entity as EntityIndex)).toBe(true);
        expect(scheduleDespawnRowHint(transaction, store, entity as EntityIndex, readyCode)).toBe(true);
      }
      uint8Allocations = allocations.uint8Allocations;
      int16Allocations = allocations.int16Allocations;
    } finally {
      allocations.restore();
    }

    // covered by 5.6: mass final-removal scheduling does not allocate/copy per row.
    expect(uint8Allocations).toBe(2);
    expect(int16Allocations).toBe(1);
    expect(transaction.scheduledDespawns).toHaveLength(rowCount);
    expect(transaction.despawnRowHints).toHaveLength(rowCount);
  });

  it("despawn row hints расширяют переиспользуемые mark arrays после роста store", () => {
    const manager = createDespawnOnManager();
    spawnEntity(manager, "unit/0");

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const firstTransaction = prepareEntityTransaction({ runtime: new Map<string, unknown>() }, runtime);
    expect(scheduleDespawnRowHint(firstTransaction, store, 0 as EntityIndex, readyCode)).toBe(true);

    for (let index = 1; index < 33; index += 1) {
      spawnEntity(manager, `unit/${index}`);
    }

    const nextTransaction = prepareEntityTransaction({ runtime: new Map<string, unknown>() }, runtime);
    expect(scheduleDespawnRowHint(nextTransaction, store, 32 as EntityIndex, readyCode)).toBe(true);
    expect(scheduleDespawnRowHint(nextTransaction, store, 32 as EntityIndex, readyCode)).toBe(false);
    expect(nextTransaction.despawnRowHints).toEqual([{ storeId: store.storeId, entity: 32, bucketStateCode: readyCode }]);
  });

  it("mixed despawnOn строит reaction survivors только для живых rows", () => {
    const manager = createDespawnOnManager();
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");
    spawnEntity(manager, "unit/c");

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const expiredCode = store.metadata.stateCodeByName.EXPIRED;
    const accepted = store.stateBuckets[readyCode];
    for (const entity of accepted) {
      store.prevStateCode[entity] = readyCode;
      store.stateCode[entity] = entity === 1 ? expiredCode : readyCode;
    }
    const transaction = prepareEntityTransaction({ runtime: new Map<string, unknown>() }, runtime);

    const result = postProcessAcceptedRows(
      transaction,
      store,
      accepted,
      { ...despawnOnPostProcessingFlags, collectReactionSurvivors: true },
      undefined,
      readyCode,
      expiredCode,
    );

    // covered by 5.2/5.5: mixed despawnOn reaction planning keeps only survivor rows.
    expect(result.dirtyRows).toBeUndefined();
    expect(result.reactionSurvivorRows).toEqual([0, 2]);
    expect(transaction.scheduledDespawns).toEqual([1]);
    expect(transaction.despawnRowHints).toEqual([{ storeId: store.storeId, entity: 1, bucketStateCode: readyCode }]);
  });

  it("despawnOn lifecycle rows остаются dirty path и не создают final-removal hints", () => {
    const manager = createDespawnOnManager(true);
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const expiredCode = store.metadata.stateCodeByName.EXPIRED;
    const accepted = store.stateBuckets[readyCode];
    for (const entity of accepted) {
      store.prevStateCode[entity] = readyCode;
      store.stateCode[entity] = expiredCode;
    }
    const transaction = prepareEntityTransaction({ runtime: new Map<string, unknown>() }, runtime);

    const result = postProcessAcceptedRows(
      transaction,
      store,
      accepted,
      despawnOnPostProcessingFlags,
      undefined,
      readyCode,
      expiredCode,
    );

    // covered by 5.3/5.6: lifecycle despawn rows use the regular dirty-row bucket update path.
    expect(result.dirtyRows).toEqual([0, 1]);
    expect(result.dirtyRowsPreviousStateCode).toBe(readyCode);
    expect(result.acceptedRowsHaveFinalRemoval).toBe(false);
    expect(transaction.scheduledDespawns).toEqual([0, 1]);
    expect(transaction.despawnRowHints).toEqual([]);
  });

  it("identity TICK синхронизирует pending prevStateCode один раз после spawn", () => {
    const observations: number[] = [];
    const manager = createManager((_slice, action, { self }) => {
      if (action.type !== "TICK") return;
      for (const entity of self.indices) observations.push(self.prevStateCode[entity]);
    });
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");
    spawnEntity(manager, "unit/c");

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const rowCount = store.stateBuckets[readyCode].length;
    const reads = installStateCodeReadCounters(store);

    try {
      reduceUnscopedTick(runtime, createUnscopedTickContext(runtime));
      const writesAfterFirstTick = reads.prevWrites;
      reduceUnscopedTick(runtime, createUnscopedTickContext(runtime));

      expect(observations).toEqual([readyCode, readyCode, readyCode, readyCode, readyCode, readyCode]);
      expect(writesAfterFirstTick).toBe(rowCount);
      expect(reads.prevWrites).toBe(writesAfterFirstTick);
    } finally {
      reads.restore();
    }
  });

  it("bucket update читает только dirty rows после reducer override", () => {
    const manager = createManager((_slice, action, { self }) => {
      if (action.type !== "TICK") return;
      self.stateCode[1 as EntityIndex] = self.states.STOPPED;
    });
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");
    spawnEntity(manager, "unit/c");

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const stoppedCode = store.metadata.stateCodeByName.STOPPED;
    const rowCount = store.stateBuckets[readyCode].length;
    syncPendingPrevStateCode(store);
    const ctx = createUnscopedTickContext(runtime);
    const reads = installStateCodeReadCounters(store);

    try {
      reduceUnscopedTick(runtime, ctx);
    } finally {
      reads.restore();
    }

    // covered by 5.2/5.4: reducer override keeps dirty-row bucket updates narrow and coherent.
    expect(store.stateBuckets[readyCode]).toEqual([0, 2]);
    expect(store.stateBuckets[stoppedCode]).toEqual([1]);
    expect(reads.stateReads).toBe(rowCount + 1);
    expect(reads.prevReads).toBe(0);
  });

  it("multi-source default transition обновляет buckets из per-row source state", () => {
    const actor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { SAFE: "SAFE", TICK: "STOPPED" },
        SAFE: { TICK: "STOPPED" },
        STOPPED: {},
      },
      initialState: "__INIT",
      initialContext: { value: i32() },
      spawnSchema: {},
    } as const;
    const machines = { actor };
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN: (payload) => ({
        id: payload.id,
        groupTag: "units",
        actors: { actor: {} },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");
    spawnEntity(manager, "unit/c");
    manager.transition({ type: "SAFE", meta: { entityId: "unit/b" } } as never);

    const store = getEntityRuntimeState(manager.entities()).actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const safeCode = store.metadata.stateCodeByName.SAFE;
    const stoppedCode = store.metadata.stateCodeByName.STOPPED;

    manager.transition({ type: "TICK" });

    // covered by 5.2/5.4: mixed source buckets use per-row source state codes during bucket updates.
    expect(store.stateBuckets[readyCode]).toEqual([]);
    expect(store.stateBuckets[safeCode]).toEqual([]);
    expect([...store.stateBuckets[stoppedCode]].sort()).toEqual([0, 1, 2]);
    expect([store.stateCode[0], store.stateCode[1], store.stateCode[2]]).toEqual([
      stoppedCode,
      stoppedCode,
      stoppedCode,
    ]);
  });

  it("identity fast path планирует terminal cleanup после reducer write", () => {
    const manager = createManager((_slice, action, { self }) => {
      if (action.type !== "TICK") return;
      self.stateCode[0 as EntityIndex] = ENTITY_RESOLVED_STATE_CODE;
    });
    spawnEntity(manager, "unit/a");

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const ctx = createUnscopedTickContext(runtime);

    reduceUnscopedTick(runtime, ctx);

    // covered by 5.3: terminal row cleanup is separate from full-entity despawn.
    expect(store.presence[0 as EntityIndex]).toBe(0);
    expect(store.count).toBe(0);
    expect(runtime.entityStore.alive[0 as EntityIndex]).toBe(0);
  });

  it("pending prevStateCode sync пропускает удаленные rows", () => {
    const manager = createManager();
    spawnEntity(manager, "unit/a");

    const store = getEntityRuntimeState(manager.entities()).actorStores.actor;
    const entity = 0 as EntityIndex;
    store.prevStateCode[entity] = -1;
    store.stateCode[entity] = store.metadata.stateCodeByName.READY;
    store.presence[entity] = 0;

    schedulePrevStateCodeSync(store, [entity]);
    syncPendingPrevStateCode(store);

    // covered by 5.4: prevStateCode sync skips rows that cleanup already removed.
    expect(store.prevStateCode[entity]).toBe(-1);
    expect(store.pendingPrevStateCodeSync).toEqual([]);
  });

  it("identity bucket move сохраняет текущую state bucket позицию", () => {
    const manager = createManager();
    spawnEntity(manager, "unit/a");

    const store = getEntityRuntimeState(manager.entities()).actorStores.actor;
    const entity = 0 as EntityIndex;
    const readyCode = store.metadata.stateCodeByName.READY;
    const bucketBefore = store.stateBuckets[readyCode].slice();
    const positionBefore = store.statePosition[entity];

    moveActorStateBucket(store, entity, readyCode, readyCode);

    expect(store.stateBuckets[readyCode]).toEqual(bucketBefore);
    expect(store.statePosition[entity]).toBe(positionBefore);
  });

  it("moveActorStateBucketBatch отклоняет identity и несовпадающий source bucket", () => {
    const manager = createTransitionManager();
    spawnEntity(manager, "unit/a");

    const store = getEntityRuntimeState(manager.entities()).actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const stoppedCode = store.metadata.stateCodeByName.STOPPED;
    const readyBucket = store.stateBuckets[readyCode];
    const stoppedBucket = store.stateBuckets[stoppedCode];

    expect(moveActorStateBucketBatch(store, readyCode, readyCode, readyBucket)).toBe(false);
    expect(moveActorStateBucketBatch(store, readyCode, stoppedCode, [...readyBucket])).toBe(false);
    expect(store.stateBuckets[readyCode]).toBe(readyBucket);
    expect(store.stateBuckets[stoppedCode]).toBe(stoppedBucket);
  });

  it("bulk transition переносит single-source bucket целиком и сохраняет effect scope", () => {
    const effectScopes: EntityIndex[][] = [];
    const manager = createTransitionManager(undefined, {
      STOPPED({ self }) {
        effectScopes.push([...self.indices]);
      },
    });
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");
    spawnEntity(manager, "unit/c");

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const stoppedCode = store.metadata.stateCodeByName.STOPPED;
    const readyBucket = store.stateBuckets[readyCode];
    const stoppedBucket = store.stateBuckets[stoppedCode];
    const beforeRowVersions = [store.rowVersion[0], store.rowVersion[1], store.rowVersion[2]];

    manager.transition({ type: "TICK" });

    // covered by 5.2/5.4: single-source bucket batch move preserves positions and effect scope.
    expect(store.stateBuckets[readyCode]).toBe(stoppedBucket);
    expect(store.stateBuckets[stoppedCode]).toBe(readyBucket);
    expect(store.stateBuckets[readyCode]).toEqual([]);
    expect(store.stateBuckets[stoppedCode]).toEqual([0, 1, 2]);
    expect([store.statePosition[0], store.statePosition[1], store.statePosition[2]]).toEqual([0, 1, 2]);
    expect([store.prevStateCode[0], store.prevStateCode[1], store.prevStateCode[2]]).toEqual([
      readyCode,
      readyCode,
      readyCode,
    ]);
    expect(store.pendingPrevStateCodeSync).toEqual([0, 1, 2]);
    expect([store.rowVersion[0], store.rowVersion[1], store.rowVersion[2]]).toEqual(
      beforeRowVersions.map((version) => version + 1),
    );
    expect(effectScopes).toEqual([[0, 1, 2]]);
  });

  it("bulk transition fallback обновляет buckets, если batch move отклонен", () => {
    const manager = createTransitionManager();
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");
    spawnEntity(manager, "unit/c");

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const stoppedCode = store.metadata.stateCodeByName.STOPPED;
    const stateBuckets = store.stateBuckets;
    const readyBucket = store.stateBuckets[readyCode];
    const stoppedBucket = store.stateBuckets[stoppedCode];
    let readyBucketReads = 0;

    store.stateBuckets = new Proxy(stateBuckets, {
      get(target, property, receiver) {
        if (property === String(readyCode)) {
          readyBucketReads += 1;
          if (readyBucketReads === 3) return [];
        }
        return Reflect.get(target, property, receiver);
      },
    }) as EntityIndex[][];

    try {
      reduceUnscopedTick(runtime, createUnscopedTickContext(runtime));
    } finally {
      store.stateBuckets = stateBuckets;
    }

    expect(readyBucketReads).toBeGreaterThanOrEqual(3);
    expect(store.stateBuckets[readyCode]).toBe(readyBucket);
    expect(store.stateBuckets[stoppedCode]).toBe(stoppedBucket);
    expect(store.stateBuckets[readyCode]).toEqual([]);
    expect([...store.stateBuckets[stoppedCode]].sort()).toEqual([0, 1, 2]);
    expect([store.statePosition[0], store.statePosition[1], store.statePosition[2]]).toEqual([2, 1, 0]);
  });

  it("bulk transition candidate отбрасывает неподходящие инварианты bucket", () => {
    {
      const manager = createTransitionManager();
      spawnEntity(manager, "unit/a");

      const store = getEntityRuntimeState(manager.entities()).actorStores.actor;
      const readyCode = store.metadata.stateCodeByName.READY;
      const accepted = store.stateBuckets[readyCode];
      const result = postProcessAcceptedRows(
        undefined,
        store,
        accepted,
        noLifecyclePostProcessingFlags,
        createBulkTransitionPlan([readyCode]),
        readyCode,
        readyCode,
      );

      expect(result.bulkStateTransition).toBeUndefined();
    }

    {
      const manager = createTransitionManager();
      spawnEntity(manager, "unit/a");

      const store = getEntityRuntimeState(manager.entities()).actorStores.actor;
      const readyCode = store.metadata.stateCodeByName.READY;
      const stoppedCode = store.metadata.stateCodeByName.STOPPED;
      const accepted = store.stateBuckets[readyCode];
      const result = postProcessAcceptedRows(
        undefined,
        store,
        accepted,
        noLifecyclePostProcessingFlags,
        createBulkTransitionPlan([stoppedCode]),
        readyCode,
        stoppedCode,
      );

      expect(result.bulkStateTransition).toBeUndefined();
    }

    {
      const manager = createTransitionManager();
      spawnEntity(manager, "unit/a");

      const store = getEntityRuntimeState(manager.entities()).actorStores.actor;
      const readyCode = store.metadata.stateCodeByName.READY;
      const stoppedCode = store.metadata.stateCodeByName.STOPPED;
      const accepted = [...store.stateBuckets[readyCode]];
      const result = postProcessAcceptedRows(
        undefined,
        store,
        accepted,
        noLifecyclePostProcessingFlags,
        createBulkTransitionPlan([readyCode]),
        readyCode,
        stoppedCode,
      );

      expect(result.bulkStateTransition).toBeUndefined();
    }

    {
      const manager = createTransitionManager();
      spawnEntity(manager, "unit/a");

      const store = getEntityRuntimeState(manager.entities()).actorStores.actor;
      const readyCode = store.metadata.stateCodeByName.READY;
      const stoppedCode = store.metadata.stateCodeByName.STOPPED;
      const accepted = store.stateBuckets[readyCode];
      store.stateBuckets[stoppedCode].push(0 as EntityIndex);

      const result = postProcessAcceptedRows(
        undefined,
        store,
        accepted,
        noLifecyclePostProcessingFlags,
        createBulkTransitionPlan([readyCode]),
        readyCode,
        stoppedCode,
      );

      expect(result.bulkStateTransition).toBeUndefined();
    }
  });

  it("bulk transition fallback сохраняет reducer override для части rows", () => {
    const manager = createTransitionManager((_slice, action, { self }) => {
      if (action.type !== "TICK") return;
      self.stateCode[1 as EntityIndex] = self.prevStateCode[1 as EntityIndex];
    });
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");
    spawnEntity(manager, "unit/c");

    const store = getEntityRuntimeState(manager.entities()).actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const stoppedCode = store.metadata.stateCodeByName.STOPPED;
    const readyBucket = store.stateBuckets[readyCode];
    const stoppedBucket = store.stateBuckets[stoppedCode];

    manager.transition({ type: "TICK" });

    // covered by 5.2: reducer override from default target back to live state keeps survivor rows.
    expect(store.stateBuckets[readyCode]).toBe(readyBucket);
    expect(store.stateBuckets[stoppedCode]).toBe(stoppedBucket);
    expect(store.stateBuckets[readyCode]).toEqual([1]);
    expect([...store.stateBuckets[stoppedCode]].sort()).toEqual([0, 2]);
  });

  it("bulk transition fallback валидирует invalid reducer stateCode", () => {
    const manager = createTransitionManager((_slice, action, { self }) => {
      if (action.type !== "TICK") return;
      self.stateCode[1 as EntityIndex] = 99;
    });
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");

    expect(() => manager.transition({ type: "TICK" })).toThrow("invalid stateCode 99");
  });
});
