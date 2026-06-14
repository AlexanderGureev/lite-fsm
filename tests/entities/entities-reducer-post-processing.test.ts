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

import { reduceEntityBucket } from "../../packages/entities/src/runtime/reduce";
import {
  getEntityRuntimeState,
  moveActorStateBucket,
  rebindActorReducerSelf,
  type ColumnarActorStore,
  type EntityRuntimeState,
} from "../../packages/entities/src/runtime/state";
import { prepareEntityTransaction } from "../../packages/entities/src/runtime/transaction";

type TestReducerSelf = {
  readonly indices: readonly EntityIndex[];
  readonly states: Record<"READY" | "STOPPED", number>;
  stateCode: Int16Array;
};

type TestReducer = (
  slice: { readonly state: string; readonly context: Record<string, unknown> },
  action: { readonly type: string },
  meta: { readonly self: TestReducerSelf },
) => void;

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

const spawnEntity = (manager: ReturnType<typeof createManager>, id: string): void => {
  manager.transition({ type: "SPAWN", payload: { id } });
};

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

describe("@lite-fsm/entities — reducer post-processing dirty rows", () => {
  it("hot identity TICK не создает Set, Map, column enumeration и bucket update scan", () => {
    const manager = createManager();
    spawnEntity(manager, "unit/a");
    spawnEntity(manager, "unit/b");
    spawnEntity(manager, "unit/c");

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    const rowCount = store.stateBuckets[store.metadata.stateCodeByName.READY].length;
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

    expect(mapAllocations).toBe(0);
    expect(setAllocations).toBe(0);
    expect(columnEnumerations).toBe(0);
    expect(reads.stateReads).toBe(rowCount);
    expect(reads.prevReads).toBe(rowCount);
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
    const ctx = createUnscopedTickContext(runtime);
    const reads = installStateCodeReadCounters(store);

    try {
      reduceUnscopedTick(runtime, ctx);
    } finally {
      reads.restore();
    }

    expect(store.stateBuckets[readyCode]).toEqual([0, 2]);
    expect(store.stateBuckets[stoppedCode]).toEqual([1]);
    expect(reads.stateReads).toBe(rowCount + 1);
    expect(reads.prevReads).toBe(rowCount + 1);
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
});
