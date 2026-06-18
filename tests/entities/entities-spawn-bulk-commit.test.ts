import { describe, expect, it } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  f32,
  i32,
  spawnEvent,
  string,
} from "@lite-fsm/entities";
import type { EntityIndex } from "@lite-fsm/entities";

import { ENTITY_INIT_STATE_CODE } from "../../packages/entities/src/runtime/compile";
import { applyStagedSpawnCommit } from "../../packages/entities/src/runtime/spawn-commit";
import {
  addActorRowOwnership,
  getEntityRuntimeState,
  removeActorRowsForStore,
  removeEntityRecords,
  type EntityRuntimeState,
} from "../../packages/entities/src/runtime/state";

type BulkSpec = {
  readonly id: string;
  readonly groupTag: string;
  readonly x: number;
  readonly hp: number;
};

type ReducerSelf = {
  readonly indices: readonly EntityIndex[];
  readonly states: Record<string, number>;
  readonly stateCode: Int16Array;
  readonly hp: Int32Array;
  readonly seen: Int32Array;
  readonly x: Float32Array;
  readonly label: string[];
  entityId(entity: EntityIndex): string;
};

const bulkSpawnEvents = defineSpawnEvents({
  SPAWN_BULK: spawnEvent<{ readonly specs: readonly BulkSpec[] }>(),
});

const describeRows = (rows: readonly { readonly store: { readonly templateKey: string }; readonly entity: EntityIndex; readonly entityRowsPosition: number; readonly groupRowsPosition: number }[] | undefined): string[] =>
  (rows ?? []).map(
    (row) => `${row.store.templateKey}:${row.entity}:${row.entityRowsPosition}:${row.groupRowsPosition}`,
  );

const describeGroupRows = (runtime: EntityRuntimeState, groupTag: string): string[] =>
  describeRows(runtime.actorRowsByGroupTag[groupTag]);

const removeEntity = (runtime: EntityRuntimeState, entity: EntityIndex): void => {
  const rows = runtime.actorRowsByEntity[entity].slice();
  for (const row of rows) removeActorRowsForStore(runtime, row.store, [row]);
  removeEntityRecords(runtime, [entity]);
};

const createMultiActorManager = () => {
  const movementActor = {
    storage: "entity",
    config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
    initialState: "__INIT",
    initialContext: {
      x: f32({ default: -1 }),
      hp: i32({ default: 5 }),
      label: string({ default: "idle" }),
    },
    spawnSchema: { x: f32(), hp: i32() },
    reducer(
      _slice: unknown,
      action: { readonly type: string },
      { self, payloadFor }: { readonly self: ReducerSelf; payloadFor(entity: EntityIndex): { readonly x: number; readonly hp: number } },
    ) {
      for (const entity of self.indices) {
        if (action.type === "ENTITY_SPAWNED") {
          const payload = payloadFor(entity);
          self.x[entity] = payload.x;
          self.hp[entity] = payload.hp;
        }
        if (action.type === "PING") self.hp[entity] += 1;
      }
    },
  } as const;
  const sensorActor = {
    storage: "entity",
    config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
    initialState: "__INIT",
    initialContext: { seen: i32() },
    spawnSchema: { hp: i32() },
    reducer(
      _slice: unknown,
      action: { readonly type: string },
      { self, payloadFor }: { readonly self: ReducerSelf; payloadFor(entity: EntityIndex): { readonly hp: number } },
    ) {
      for (const entity of self.indices) {
        if (action.type === "ENTITY_SPAWNED") self.seen[entity] = payloadFor(entity).hp * 10;
        if (action.type === "PING") self.seen[entity] += 1;
      }
    },
  } as const;
  const machines = { movementActor, sensorActor };
  const spawn = defineEntitySpawn(machines, bulkSpawnEvents)({
    SPAWN_BULK: (payload) =>
      payload.specs.map((spec) => ({
        id: spec.id,
        groupTag: spec.groupTag,
        actors: {
          movementActor: { x: spec.x, hp: spec.hp },
          sensorActor: { hp: spec.hp },
        },
      })),
  });

  return MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
};

const spawnBulk = (
  manager: ReturnType<typeof createMultiActorManager>,
  specs: readonly BulkSpec[],
): void => {
  manager.transition({ type: "SPAWN_BULK", payload: { specs } });
};

describe("@lite-fsm/entities — spawn bulk commit", () => {
  it("empty staged commit является no-op для internal commit helper", () => {
    const manager = createMultiActorManager();
    const runtime = getEntityRuntimeState(manager.entities());
    const beforeEntityVersion = runtime.entityStore.version;
    const beforeMovementVersion = runtime.actorStores.movementActor.version;

    expect(applyStagedSpawnCommit(runtime, [])).toEqual([]);
    expect(runtime.entityStore.count).toBe(0);
    expect(runtime.entityStore.version).toBe(beforeEntityVersion);
    expect(runtime.actorStores.movementActor.count).toBe(0);
    expect(runtime.actorStores.movementActor.version).toBe(beforeMovementVersion);
  });

  it("ownership helper сохраняет позиции при повторном actor row для entity и group", () => {
    const manager = createMultiActorManager();
    const runtime = getEntityRuntimeState(manager.entities());

    addActorRowOwnership(runtime, runtime.actorStores.movementActor, 0 as EntityIndex, "manual");
    addActorRowOwnership(runtime, runtime.actorStores.sensorActor, 0 as EntityIndex, "manual");

    expect(describeRows(runtime.actorRowsByEntity[0 as EntityIndex])).toEqual([
      "movementActor:0:0:0",
      "sensorActor:0:1:1",
    ]);
    expect(describeGroupRows(runtime, "manual")).toEqual([
      "movementActor:0:0:0",
      "sensorActor:0:1:1",
    ]);
  });

  it("плотный batch коммитит entity rows, actor rows, defaults, ownership и group routing", () => {
    const manager = createMultiActorManager();
    const runtime = getEntityRuntimeState(manager.entities());
    const beforeEntityVersion = runtime.entityStore.version;
    const beforeMovementVersion = runtime.actorStores.movementActor.version;

    spawnBulk(manager, [
      { id: "unit/a", groupTag: "alpha", x: 1, hp: 10 },
      { id: "unit/b", groupTag: "beta", x: 2, hp: 20 },
      { id: "unit/c", groupTag: "alpha", x: 3, hp: 30 },
    ]);

    const entityStore = runtime.entityStore;
    const movement = runtime.actorStores.movementActor;
    const sensor = runtime.actorStores.sensorActor;
    const readyCode = movement.metadata.stateCodeByName.READY;

    expect(entityStore.count).toBe(3);
    expect(entityStore.capacity).toBe(3);
    expect(entityStore.version).toBeGreaterThan(beforeEntityVersion);
    expect(entityStore.ids).toEqual(["unit/a", "unit/b", "unit/c"]);
    expect(entityStore.indexById).toMatchObject({ "unit/a": 0, "unit/b": 1, "unit/c": 2 });
    expect(Array.from(entityStore.alive)).toEqual([1, 1, 1]);
    expect(entityStore.entitiesByGroupTag.alpha).toEqual([0, 2]);
    expect(entityStore.entitiesByGroupTag.beta).toEqual([1]);
    expect(Array.from(entityStore.groupTagPosition)).toEqual([0, 0, 1]);

    expect(movement.count).toBe(3);
    expect(movement.capacity).toBe(3);
    expect(movement.version).toBeGreaterThan(beforeMovementVersion);
    expect(movement.publicSlice).toMatchObject({ storage: "entity", count: 3, capacity: 3 });
    expect(sensor.publicSlice).toMatchObject({ storage: "entity", count: 3, capacity: 3 });
    expect(manager.getState().movementActor).toMatchObject({ storage: "entity", count: 3, capacity: 3 });
    expect(Array.from(movement.presence)).toEqual([1, 1, 1]);
    expect(Array.from(movement.stateCode)).toEqual([readyCode, readyCode, readyCode]);
    expect(Array.from(movement.columns.x as Float32Array)).toEqual([1, 2, 3]);
    expect(Array.from(movement.columns.hp as Int32Array)).toEqual([10, 20, 30]);
    expect(movement.columns.label).toEqual(["idle", "idle", "idle"]);
    expect(Array.from(sensor.columns.seen as Int32Array)).toEqual([100, 200, 300]);

    expect(describeRows(runtime.actorRowsByEntity[0 as EntityIndex])).toEqual([
      "movementActor:0:0:0",
      "sensorActor:0:1:1",
    ]);
    expect(describeRows(runtime.actorRowsByEntity[2 as EntityIndex])).toEqual([
      "movementActor:2:0:2",
      "sensorActor:2:1:3",
    ]);
    expect(describeGroupRows(runtime, "alpha")).toEqual([
      "movementActor:0:0:0",
      "sensorActor:0:1:1",
      "movementActor:2:0:2",
      "sensorActor:2:1:3",
    ]);

    manager.transition({ type: "PING", meta: { groupTag: "alpha" } } as never);

    expect(Array.from(movement.columns.hp as Int32Array)).toEqual([11, 20, 31]);
    expect(Array.from(sensor.columns.seen as Int32Array)).toEqual([101, 200, 301]);
  });

  it("sparse batch переиспользует freeList по LIFO и затем добавляет tail indices", () => {
    const manager = createMultiActorManager();
    spawnBulk(manager, [
      { id: "unit/a", groupTag: "enemy", x: 1, hp: 10 },
      { id: "unit/b", groupTag: "ally", x: 2, hp: 20 },
      { id: "unit/c", groupTag: "enemy", x: 3, hp: 30 },
    ]);
    const runtime = getEntityRuntimeState(manager.entities());

    removeEntity(runtime, 0 as EntityIndex);
    removeEntity(runtime, 2 as EntityIndex);
    expect(runtime.entityStore.freeList).toEqual([0, 2]);

    spawnBulk(manager, [
      { id: "unit/d", groupTag: "enemy", x: 4, hp: 40 },
      { id: "unit/e", groupTag: "ally", x: 5, hp: 50 },
      { id: "unit/f", groupTag: "enemy", x: 6, hp: 60 },
    ]);

    const entityStore = runtime.entityStore;
    const movement = runtime.actorStores.movementActor;
    expect(entityStore.freeList).toEqual([]);
    expect(entityStore.count).toBe(4);
    expect(entityStore.capacity).toBe(4);
    expect(entityStore.indexById["unit/d"]).toBe(2);
    expect(entityStore.indexById["unit/e"]).toBe(0);
    expect(entityStore.indexById["unit/f"]).toBe(3);
    expect(entityStore.ids).toEqual(["unit/e", "unit/b", "unit/d", "unit/f"]);
    expect(Array.from(entityStore.generation)).toEqual([2, 1, 2, 1]);
    expect(Array.from(movement.columns.x as Float32Array)).toEqual([5, 2, 4, 6]);
    expect(Array.from(movement.columns.hp as Int32Array)).toEqual([50, 20, 40, 60]);

    manager.transition({ type: "PING", meta: { groupTag: "enemy" } } as never);

    expect(Array.from(movement.columns.hp as Int32Array)).toEqual([50, 20, 41, 61]);
    expect(Array.from(runtime.actorStores.sensorActor.columns.seen as Int32Array)).toEqual([500, 200, 401, 601]);
  });

  it("actor без ENTITY_SPAWNED transition остается в __INIT после physical commit", () => {
    const passiveActor = {
      storage: "entity",
      config: { __INIT: {}, READY: {} },
      initialState: "__INIT",
      initialContext: { hp: i32({ default: 7 }) },
      spawnSchema: { hp: i32() },
    } as const;
    const machines = { passiveActor };
    const spawn = defineEntitySpawn(machines, bulkSpawnEvents)({
      SPAWN_BULK: (payload) =>
        payload.specs.map((spec) => ({
          id: spec.id,
          groupTag: spec.groupTag,
          actors: { passiveActor: { hp: spec.hp } },
        })),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    manager.transition({
      type: "SPAWN_BULK",
      payload: { specs: [{ id: "unit/passive", groupTag: "passive", x: 0, hp: 42 }] },
    });

    const store = getEntityRuntimeState(manager.entities()).actorStores.passiveActor;
    expect(store.count).toBe(1);
    expect(store.publicSlice).toMatchObject({ storage: "entity", count: 1, capacity: 1 });
    expect(store.stateCode[0]).toBe(ENTITY_INIT_STATE_CODE);
    expect(store.prevStateCode[0]).toBe(ENTITY_INIT_STATE_CODE);
    expect(store.stateBuckets.every((bucket) => bucket.length === 0)).toBe(true);
    expect(manager.entities().get("passiveActor").state(0 as EntityIndex)).toBeUndefined();
  });

  it("payloadFor вне ENTITY_SPAWNED сохраняет диагностическую ошибку", () => {
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: { hp: i32() },
      spawnSchema: { hp: i32() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: ReducerSelf; payloadFor(entity: EntityIndex): { readonly hp: number } },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") self.hp[entity] = payloadFor(entity).hp;
          if (action.type === "PING") payloadFor(entity);
        }
      },
    } as const;
    const machines = { actor };
    const spawn = defineEntitySpawn(machines, bulkSpawnEvents)({
      SPAWN_BULK: (payload) =>
        payload.specs.map((spec) => ({
          id: spec.id,
          groupTag: spec.groupTag,
          actors: { actor: { hp: spec.hp } },
        })),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    manager.transition({
      type: "SPAWN_BULK",
      payload: { specs: [{ id: "unit/a", groupTag: "enemy", x: 0, hp: 10 }] },
    });

    expect(() => manager.transition({ type: "PING" })).toThrow("payloadFor(entity) is only available while reducing ENTITY_SPAWNED");
  });

  it("payloadFor для entity вне current spawn scope откатывает только второй spawn", () => {
    let outsideEntity: EntityIndex | undefined;
    let probeOutsideScope = false;
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: {} },
      initialState: "__INIT",
      initialContext: { hp: i32() },
      spawnSchema: { hp: i32() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: ReducerSelf; payloadFor(entity: EntityIndex): { readonly hp: number } },
      ) {
        if (action.type !== "ENTITY_SPAWNED") return;
        if (probeOutsideScope) payloadFor(outsideEntity!);

        for (const entity of self.indices) {
          outsideEntity = entity;
          self.hp[entity] = payloadFor(entity).hp;
        }
      },
    } as const;
    const machines = { actor };
    const spawn = defineEntitySpawn(machines, bulkSpawnEvents)({
      SPAWN_BULK: (payload) =>
        payload.specs.map((spec) => ({
          id: spec.id,
          groupTag: spec.groupTag,
          actors: { actor: { hp: spec.hp } },
        })),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const runtime = getEntityRuntimeState(manager.entities());

    manager.transition({
      type: "SPAWN_BULK",
      payload: {
        specs: [
          { id: "unit/a", groupTag: "enemy", x: 0, hp: 10 },
          { id: "unit/b", groupTag: "enemy", x: 0, hp: 20 },
        ],
      },
    });
    removeEntity(runtime, 0 as EntityIndex);
    probeOutsideScope = true;

    expect(() =>
      manager.transition({
        type: "SPAWN_BULK",
        payload: { specs: [{ id: "unit/c", groupTag: "enemy", x: 0, hp: 30 }] },
      }),
    ).toThrow("current spawn scope");

    const store = runtime.actorStores.actor;
    expect(store.count).toBe(1);
    expect(runtime.entityStore.count).toBe(1);
    expect(runtime.entityStore.freeList).toEqual([0]);
    expect(runtime.entityStore.indexById["unit/a"]).toBeUndefined();
    expect(runtime.entityStore.indexById["unit/b"]).toBe(1);
    expect(runtime.entityStore.indexById["unit/c"]).toBeUndefined();
    expect(Array.from(store.columns.hp as Int32Array)).toEqual([10, 20]);
  });

  it("ENTITY_SPAWNED reducer override обновляет state buckets после bulk spawn", () => {
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: {}, STOPPED: {} },
      initialState: "__INIT",
      initialContext: { hp: i32() },
      spawnSchema: { hp: i32() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: ReducerSelf; payloadFor(entity: EntityIndex): { readonly hp: number } },
      ) {
        if (action.type !== "ENTITY_SPAWNED") return;

        for (const entity of self.indices) {
          const payload = payloadFor(entity);
          self.hp[entity] = payload.hp;
          if (payload.hp <= 0) self.stateCode[entity] = self.states.STOPPED;
        }
      },
    } as const;
    const machines = { actor };
    const spawn = defineEntitySpawn(machines, bulkSpawnEvents)({
      SPAWN_BULK: (payload) =>
        payload.specs.map((spec) => ({
          id: spec.id,
          groupTag: spec.groupTag,
          actors: { actor: { hp: spec.hp } },
        })),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    manager.transition({
      type: "SPAWN_BULK",
      payload: {
        specs: [
          { id: "unit/a", groupTag: "enemy", x: 0, hp: 10 },
          { id: "unit/b", groupTag: "enemy", x: 0, hp: 0 },
          { id: "unit/c", groupTag: "enemy", x: 0, hp: 20 },
        ],
      },
    });

    const store = getEntityRuntimeState(manager.entities()).actorStores.actor;
    const readyCode = store.metadata.stateCodeByName.READY;
    const stoppedCode = store.metadata.stateCodeByName.STOPPED;
    expect([...store.stateBuckets[readyCode]].sort()).toEqual([0, 2]);
    expect(store.stateBuckets[stoppedCode]).toEqual([1]);
    expect(store.stateBuckets[readyCode][store.statePosition[0]]).toBe(0);
    expect(store.stateBuckets[stoppedCode][store.statePosition[1]]).toBe(1);
    expect(store.stateBuckets[readyCode][store.statePosition[2]]).toBe(2);
  });

  it("despawnOn в lifecycle cleanup удаляет ownership refs после bulk spawn", () => {
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "ALIVE" }, ALIVE: {}, DEAD: {} },
      initialState: "__INIT",
      initialContext: { hp: i32() },
      spawnSchema: { hp: i32() },
      despawnOn: "DEAD",
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: ReducerSelf; payloadFor(entity: EntityIndex): { readonly hp: number } },
      ) {
        if (action.type !== "ENTITY_SPAWNED") return;

        for (const entity of self.indices) {
          const payload = payloadFor(entity);
          self.hp[entity] = payload.hp;
          if (payload.hp <= 0) self.stateCode[entity] = self.states.DEAD;
        }
      },
    } as const;
    const machines = { actor };
    const spawn = defineEntitySpawn(machines, bulkSpawnEvents)({
      SPAWN_BULK: (payload) =>
        payload.specs.map((spec) => ({
          id: spec.id,
          groupTag: spec.groupTag,
          actors: { actor: { hp: spec.hp } },
        })),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    manager.transition({
      type: "SPAWN_BULK",
      payload: {
        specs: [
          { id: "unit/dead", groupTag: "enemy", x: 0, hp: 0 },
          { id: "unit/alive", groupTag: "enemy", x: 0, hp: 10 },
        ],
      },
    });

    const runtime = getEntityRuntimeState(manager.entities());
    const store = runtime.actorStores.actor;
    expect(runtime.entityStore.count).toBe(1);
    expect(runtime.entityStore.alive[0]).toBe(0);
    expect(runtime.entityStore.indexById["unit/dead"]).toBeUndefined();
    expect(runtime.entityStore.indexById["unit/alive"]).toBe(1);
    expect(runtime.actorRowsByEntity[0]).toEqual([]);
    expect(describeGroupRows(runtime, "enemy")).toEqual(["actor:1:0:0"]);
    expect(store.count).toBe(1);
    expect(store.presence[0]).toBe(0);
    expect(store.presence[1]).toBe(1);
  });

  it("dehydrate/hydrate после dense и sparse bulk spawn сохраняет rows, freeList и routing", () => {
    const denseSource = createMultiActorManager();
    spawnBulk(denseSource, [
      { id: "dense/a", groupTag: "alpha", x: 1, hp: 10 },
      { id: "dense/b", groupTag: "beta", x: 2, hp: 20 },
    ]);
    const denseSnapshot = JSON.parse(JSON.stringify(denseSource.dehydrate()));
    const denseTarget = createMultiActorManager();

    denseTarget.hydrate(denseSnapshot);
    denseTarget.transition({ type: "PING", meta: { groupTag: "alpha" } } as never);

    let runtime = getEntityRuntimeState(denseTarget.entities());
    expect(runtime.entityStore.freeList).toEqual([]);
    expect(runtime.entityStore.ids).toEqual(["dense/a", "dense/b"]);
    expect(Array.from(runtime.actorStores.movementActor.columns.hp as Int32Array)).toEqual([11, 20]);
    expect(Array.from(runtime.actorStores.sensorActor.columns.seen as Int32Array)).toEqual([101, 200]);

    const sparseSource = createMultiActorManager();
    spawnBulk(sparseSource, [
      { id: "sparse/a", groupTag: "alpha", x: 1, hp: 10 },
      { id: "sparse/b", groupTag: "beta", x: 2, hp: 20 },
      { id: "sparse/c", groupTag: "alpha", x: 3, hp: 30 },
    ]);
    runtime = getEntityRuntimeState(sparseSource.entities());
    removeEntity(runtime, 0 as EntityIndex);
    spawnBulk(sparseSource, [
      { id: "sparse/d", groupTag: "alpha", x: 4, hp: 40 },
      { id: "sparse/e", groupTag: "beta", x: 5, hp: 50 },
    ]);
    removeEntity(runtime, 3 as EntityIndex);

    const sparseSnapshot = JSON.parse(JSON.stringify(sparseSource.dehydrate()));
    const sparseTarget = createMultiActorManager();
    sparseTarget.hydrate(sparseSnapshot);
    sparseTarget.transition({ type: "PING", meta: { groupTag: "alpha" } } as never);

    runtime = getEntityRuntimeState(sparseTarget.entities());
    expect(runtime.entityStore.freeList).toEqual([3]);
    expect(runtime.entityStore.indexById["sparse/d"]).toBe(0);
    expect(runtime.entityStore.indexById["sparse/b"]).toBe(1);
    expect(runtime.entityStore.indexById["sparse/c"]).toBe(2);
    expect(runtime.entityStore.indexById["sparse/e"]).toBeUndefined();
    expect(Array.from(runtime.actorStores.movementActor.presence)).toEqual([1, 1, 1, 0]);
    expect(Array.from(runtime.actorStores.movementActor.columns.hp as Int32Array).slice(0, 3)).toEqual([41, 20, 31]);
    expect(Array.from(runtime.actorStores.sensorActor.columns.seen as Int32Array).slice(0, 3)).toEqual([401, 200, 301]);
  });

  it("ошибка ENTITY_SPAWNED reducer откатывает rows, freeList, indexes, columns, ownership и publicSlice", () => {
    let failOnHp: number | undefined;
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: {} },
      initialState: "__INIT",
      initialContext: { hp: i32({ default: 5 }) },
      spawnSchema: { hp: i32() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: ReducerSelf; payloadFor(entity: EntityIndex): { readonly hp: number } },
      ) {
        if (action.type !== "ENTITY_SPAWNED") return;

        for (const entity of self.indices) {
          const payload = payloadFor(entity);
          self.hp[entity] = payload.hp;
          if (payload.hp === failOnHp) throw new Error("spawn lifecycle failed");
        }
      },
    } as const;
    const machines = { actor };
    const spawn = defineEntitySpawn(machines, bulkSpawnEvents)({
      SPAWN_BULK: (payload) =>
        payload.specs.map((spec) => ({
          id: spec.id,
          groupTag: spec.groupTag,
          actors: { actor: { hp: spec.hp } },
        })),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    manager.transition({
      type: "SPAWN_BULK",
      payload: {
        specs: [
          { id: "unit/a", groupTag: "enemy", x: 0, hp: 10 },
          { id: "unit/b", groupTag: "enemy", x: 0, hp: 20 },
        ],
      },
    });
    const runtime = getEntityRuntimeState(manager.entities());
    const entityStore = runtime.entityStore;
    const store = runtime.actorStores.actor;
    removeEntity(runtime, 0 as EntityIndex);

    const beforePublicSlice = store.publicSlice;
    const before = {
      entityCount: entityStore.count,
      entityCapacity: entityStore.capacity,
      ids: entityStore.ids.slice(),
      indexById: { ...entityStore.indexById },
      alive: Array.from(entityStore.alive),
      freeList: entityStore.freeList.slice(),
      groupRows: describeGroupRows(runtime, "enemy"),
      rowsByEntity: runtime.actorRowsByEntity.map((rows) => describeRows(rows)),
      actorCount: store.count,
      actorCapacity: store.capacity,
      presence: Array.from(store.presence),
      hp: Array.from(store.columns.hp as Int32Array),
      publicSlice: store.publicSlice,
    };

    failOnHp = 99;
    expect(() =>
      manager.transition({
        type: "SPAWN_BULK",
        payload: {
          specs: [
            { id: "unit/c", groupTag: "enemy", x: 0, hp: 30 },
            { id: "unit/d", groupTag: "enemy", x: 0, hp: 99 },
          ],
        },
      }),
    ).toThrow("spawn lifecycle failed");

    expect(entityStore.count).toBe(before.entityCount);
    expect(entityStore.capacity).toBe(before.entityCapacity);
    expect(entityStore.ids).toEqual(before.ids);
    expect({ ...entityStore.indexById }).toEqual(before.indexById);
    expect(Array.from(entityStore.alive)).toEqual(before.alive);
    expect(entityStore.freeList).toEqual(before.freeList);
    expect(describeGroupRows(runtime, "enemy")).toEqual(before.groupRows);
    expect(runtime.actorRowsByEntity.map((rows) => describeRows(rows))).toEqual(before.rowsByEntity);
    expect(store.count).toBe(before.actorCount);
    expect(store.capacity).toBe(before.actorCapacity);
    expect(Array.from(store.presence)).toEqual(before.presence);
    expect(Array.from(store.columns.hp as Int32Array)).toEqual(before.hp);
    expect(store.publicSlice).toBe(beforePublicSlice);
    expect(store.publicSlice).toBe(before.publicSlice);
    expect(entityStore.indexById["unit/c"]).toBeUndefined();
    expect(entityStore.indexById["unit/d"]).toBeUndefined();
  });
});
