/* global globalThis */

// Legacy synthetic calibration fixture. The active optimization record workflow uses gate+trace
// and does not treat these synthetic layers as production `manager.transition` attribution.

import { MachineManager } from "../../../packages/core/dist/index.js";
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  f32,
  i32,
  spawnEvent,
  string as entityString,
} from "../../../packages/entities/dist/index.js";

export const benchmarkName = "composition-lite-fsm-entities-legacy-diagnostics";
export const warmupIterations = 5;
export const measuredIterations = 30;

const rowCounts = [10_000, 50_000];
const tickAction = { type: "TICK" };
const cleanupBatchSize = 128;
const entityInitStateCode = -1;
const noTransitionCode = -32768;

const now = () => globalThis.performance.now();

const median = (sortedSamples) => {
  const mid = Math.floor(sortedSamples.length / 2);
  return sortedSamples.length % 2 === 0 ? (sortedSamples[mid - 1] + sortedSamples[mid]) / 2 : sortedSamples[mid];
};

const percentile = (sortedSamples, rank) => {
  const index = Math.min(sortedSamples.length - 1, Math.max(0, Math.ceil(sortedSamples.length * rank) - 1));
  return sortedSamples[index];
};

const summarize = (samples) => {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    median: median(sorted),
    p95: percentile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    samples,
  };
};

const measure = (runner, operationsPerSample) => {
  for (let sample = 0; sample < warmupIterations; sample += 1) {
    runner.beforeSample?.();
    for (let op = 0; op < operationsPerSample; op += 1) {
      runner.beforeOperation?.();
      runner.run();
      runner.afterOperation?.();
    }
    runner.afterSample?.();
  }

  const samples = [];
  for (let sample = 0; sample < measuredIterations; sample += 1) {
    runner.beforeSample?.();
    let elapsed = 0;
    for (let op = 0; op < operationsPerSample; op += 1) {
      runner.beforeOperation?.();
      const startedAt = now();
      runner.run();
      elapsed += now() - startedAt;
      runner.afterOperation?.();
    }
    runner.afterSample?.();
    samples.push(elapsed / operationsPerSample);
  }

  runner.read?.();
  return summarize(samples);
};

const createMovementActor = () =>
  ({
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      x: f32(),
      y: f32(),
      dx: f32({ default: 1 }),
      dy: f32({ default: 1 }),
    },
    spawnSchema: {
      x: f32(),
      y: f32(),
      dx: f32(),
      dy: f32(),
    },
    config: {
      __INIT: { ENTITY_SPAWNED: "active" },
      active: { TICK: "active" },
    },
    reducer(_state, action, { self, payloadFor }) {
      for (const entity of self.indices) {
        if (action.type === "ENTITY_SPAWNED") {
          const payload = payloadFor(entity);
          self.x[entity] = payload.x;
          self.y[entity] = payload.y;
          self.dx[entity] = payload.dx;
          self.dy[entity] = payload.dy;
          continue;
        }

        self.x[entity] += self.dx[entity];
        self.y[entity] += self.dy[entity];
      }
    },
  });

const createProjectileActor = (mode) =>
  ({
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      ticksLeft: i32(),
      damage: i32(),
    },
    spawnSchema: {
      ticksLeft: i32(),
      damage: i32(),
    },
    config: {
      __INIT: { ENTITY_SPAWNED: "active" },
      active: { TICK: "active" },
      expired: {},
    },
    despawnOn: mode === "cleanup" ? "expired" : undefined,
    reducer(_state, action, { self, payloadFor }) {
      for (const entity of self.indices) {
        if (action.type === "ENTITY_SPAWNED") {
          const payload = payloadFor(entity);
          self.ticksLeft[entity] = payload.ticksLeft;
          self.damage[entity] = payload.damage;
          continue;
        }

        self.ticksLeft[entity] -= 1;
        if (mode === "cleanup" && self.ticksLeft[entity] <= 0) self.stateCode[entity] = self.states.expired;
      }
    },
  });

const createSpriteActor = (spriteAccumulator) =>
  ({
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      spriteId: entityString(),
    },
    spawnSchema: {
      spriteId: entityString(),
    },
    config: {
      __INIT: { ENTITY_SPAWNED: "visible" },
      visible: { TICK: "visible" },
    },
    reducer(_state, action, { self, payloadFor }) {
      if (action.type !== "ENTITY_SPAWNED") return;

      for (const entity of self.indices) {
        self.spriteId[entity] = payloadFor(entity).spriteId;
      }
    },
    reactions: {
      TICK: ({ self, entities }) => {
        const movement = entities().get("movementActor");
        let checksum = 0;

        for (const entity of self.indices) {
          checksum += movement.x[entity] + movement.y[entity] + self.spriteId[entity].length;
        }

        spriteAccumulator.value += checksum;
      },
    },
  });

const createSpawnEvents = () =>
  defineSpawnEvents({
    SPAWN_BENCH_BATCH: spawnEvent(),
  });

const createSpawn = (machines, createSpec) => {
  const spawnEvents = createSpawnEvents();

  return defineEntitySpawn(machines, spawnEvents)({
    SPAWN_BENCH_BATCH: (payload) => {
      const specs = new Array(payload.count);
      for (let index = 0; index < payload.count; index += 1) specs[index] = createSpec(index, payload);
      return specs;
    },
  });
};

const createMovementPublicRunner = (rowCount) => {
  const movementActor = createMovementActor();
  const machines = { movementActor };
  const spawn = createSpawn(machines, (index, payload) => ({
    id: `unit/${payload.startId + index}`,
    groupTag: "unit",
    actors: {
      movementActor: {
        x: index % 1024,
        y: index % 2048,
        dx: 1 + (index % 3),
        dy: 1 + (index % 5),
      },
    },
  }));
  const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] });
  manager.transition({ type: "SPAWN_BENCH_BATCH", payload: { count: rowCount, startId: 0 } });

  return {
    run: () => manager.transition(tickAction),
  };
};

const createProjectilePublicRunner = (rowCount, mode) => {
  const projectileActor = createProjectileActor(mode);
  const machines = { projectileActor };
  const initialTicksLeft = 1_000_000;
  const spawn = createSpawn(machines, (index, payload) => ({
    id: `projectile/${payload.startId + index}`,
    groupTag: "projectile",
    actors: {
      projectileActor: {
        ticksLeft: index < (payload.expireCount ?? 0) ? 1 : initialTicksLeft,
        damage: 10 + (index % 7),
      },
    },
  }));
  const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] });

  if (mode !== "cleanup") {
    manager.transition({ type: "SPAWN_BENCH_BATCH", payload: { count: rowCount, startId: 0, expireCount: 0 } });
    return {
      run: () => manager.transition(tickAction),
    };
  }

  let nextId = 0;
  let needsReplacement = false;
  const spawnBatch = (count, expireCount) => {
    manager.transition({
      type: "SPAWN_BENCH_BATCH",
      payload: { count, startId: nextId, expireCount },
    });
    nextId += count;
  };

  spawnBatch(rowCount, cleanupBatchSize);

  return {
    beforeOperation: () => {
      if (needsReplacement) spawnBatch(cleanupBatchSize, cleanupBatchSize);
      needsReplacement = false;
    },
    run: () => manager.transition(tickAction),
    afterOperation: () => {
      needsReplacement = true;
    },
  };
};

const createSpritePublicRunner = (rowCount) => {
  const spriteAccumulator = { value: 0 };
  const movementActor = createMovementActor();
  const spriteSyncActor = createSpriteActor(spriteAccumulator);
  const machines = { movementActor, spriteSyncActor };
  const spawn = createSpawn(machines, (index, payload) => ({
    id: `sprite/${payload.startId + index}`,
    groupTag: "unit",
    actors: {
      movementActor: {
        x: index % 1024,
        y: index % 2048,
        dx: 1 + (index % 3),
        dy: 1 + (index % 5),
      },
      spriteSyncActor: {
        spriteId: `sprite-${index}`,
      },
    },
  }));
  const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] });
  manager.transition({ type: "SPAWN_BENCH_BATCH", payload: { count: rowCount, startId: 0 } });

  return {
    run: () => manager.transition(tickAction),
    read: () => spriteAccumulator.value,
  };
};

const createSoaRows = (rowCount) => {
  const indices = new Int32Array(rowCount);
  const accepted = new Int32Array(rowCount);
  const presence = new Uint8Array(rowCount);
  const stateCode = new Int16Array(rowCount);
  const prevStateCode = new Int16Array(rowCount);
  const rowVersion = new Uint32Array(rowCount);
  const x = new Float32Array(rowCount);
  const y = new Float32Array(rowCount);
  const dx = new Float32Array(rowCount);
  const dy = new Float32Array(rowCount);
  const ticksLeft = new Int32Array(rowCount);
  const damage = new Int32Array(rowCount);
  const spriteIds = new Array(rowCount);
  const ids = new Array(rowCount);

  for (let entity = 0; entity < rowCount; entity += 1) {
    indices[entity] = entity;
    presence[entity] = 1;
    x[entity] = entity % 1024;
    y[entity] = entity % 2048;
    dx[entity] = 1 + (entity % 3);
    dy[entity] = 1 + (entity % 5);
    ticksLeft[entity] = 1_000_000;
    damage[entity] = 10 + (entity % 7);
    spriteIds[entity] = `sprite-${entity}`;
    ids[entity] = `entity/${entity}`;
  }

  return {
    count: rowCount,
    version: 0,
    indices,
    accepted,
    presence,
    stateCode,
    prevStateCode,
    rowVersion,
    x,
    y,
    dx,
    dy,
    ticksLeft,
    damage,
    spriteIds,
    ids,
    indexById: Object.create(null),
    checksum: 0,
  };
};

const fillIndexById = (rows) => {
  rows.indexById = Object.create(null);
  for (let entity = 0; entity < rows.count; entity += 1) rows.indexById[rows.ids[entity]] = entity;
};

const createMovementRawSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);

  return {
    run: () => {
      const { x, y, dx, dy } = rows;
      for (let entity = 0; entity < rowCount; entity += 1) {
        x[entity] += dx[entity];
        y[entity] += dy[entity];
      }
    },
  };
};

const createProjectileRawSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);

  return {
    run: () => {
      const { ticksLeft } = rows;
      for (let entity = 0; entity < rowCount; entity += 1) ticksLeft[entity] -= 1;
    },
  };
};

const createCleanupRawSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);
  const reset = () => {
    rows.count = rowCount;
    for (let entity = 0; entity < rowCount; entity += 1) rows.indices[entity] = entity;
    rows.presence.fill(1);
    rows.ticksLeft.fill(1_000_000);
    for (let entity = 0; entity < cleanupBatchSize; entity += 1) rows.ticksLeft[entity] = 1;
    fillIndexById(rows);
  };

  return {
    beforeOperation: reset,
    run: () => {
      const { indices, presence, ticksLeft, ids, indexById } = rows;
      let write = 0;

      for (let offset = 0; offset < rowCount; offset += 1) {
        const entity = indices[offset];
        if (presence[entity] === 0) continue;

        ticksLeft[entity] -= 1;
        if (ticksLeft[entity] <= 0) {
          presence[entity] = 0;
          delete indexById[ids[entity]];
          continue;
        }

        indices[write] = entity;
        write += 1;
      }

      rows.count = write;
      rows.version += 1;
    },
  };
};

const createSpriteRawSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);

  return {
    run: () => {
      const { x, y, dx, dy, spriteIds } = rows;
      let checksum = 0;
      for (let entity = 0; entity < rowCount; entity += 1) {
        x[entity] += dx[entity];
        y[entity] += dy[entity];
        checksum += x[entity] + y[entity] + spriteIds[entity].length;
      }
      rows.checksum += checksum;
    },
    read: () => rows.checksum,
  };
};

const createMovementSemanticSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);

  return {
    run: () => {
      const { indices, accepted, presence, stateCode, prevStateCode, rowVersion, x, y, dx, dy } = rows;
      let acceptedCount = 0;

      for (let offset = 0; offset < rowCount; offset += 1) {
        const entity = indices[offset];
        if (presence[entity] === 0 || stateCode[entity] !== 0) continue;
        prevStateCode[entity] = stateCode[entity];
        accepted[acceptedCount] = entity;
        acceptedCount += 1;
        x[entity] += dx[entity];
        y[entity] += dy[entity];
      }

      for (let offset = 0; offset < acceptedCount; offset += 1) rowVersion[accepted[offset]] += 1;
      rows.version += 1;
    },
  };
};

const createProjectileSemanticSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);

  return {
    run: () => {
      const { indices, accepted, presence, stateCode, prevStateCode, rowVersion, ticksLeft, damage } = rows;
      let acceptedCount = 0;

      for (let offset = 0; offset < rowCount; offset += 1) {
        const entity = indices[offset];
        if (presence[entity] === 0 || stateCode[entity] !== 0) continue;
        prevStateCode[entity] = stateCode[entity];
        accepted[acceptedCount] = entity;
        acceptedCount += 1;
        ticksLeft[entity] -= 1;
        damage[entity] += 0;
      }

      for (let offset = 0; offset < acceptedCount; offset += 1) rowVersion[accepted[offset]] += 1;
      rows.version += 1;
    },
  };
};

const createCleanupSemanticSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);
  const reset = () => {
    rows.count = rowCount;
    rows.version += 1;
    for (let entity = 0; entity < rowCount; entity += 1) rows.indices[entity] = entity;
    rows.presence.fill(1);
    rows.stateCode.fill(0);
    rows.prevStateCode.fill(0);
    rows.ticksLeft.fill(1_000_000);
    for (let entity = 0; entity < cleanupBatchSize; entity += 1) rows.ticksLeft[entity] = 1;
    fillIndexById(rows);
  };

  return {
    beforeOperation: reset,
    run: () => {
      const { indices, accepted, presence, stateCode, prevStateCode, rowVersion, ticksLeft, ids, indexById } = rows;
      let write = 0;
      let acceptedCount = 0;

      for (let offset = 0; offset < rowCount; offset += 1) {
        const entity = indices[offset];
        if (presence[entity] === 0 || stateCode[entity] !== 0) continue;

        prevStateCode[entity] = stateCode[entity];
        accepted[acceptedCount] = entity;
        acceptedCount += 1;
        ticksLeft[entity] -= 1;
        if (ticksLeft[entity] <= 0) {
          presence[entity] = 0;
          stateCode[entity] = 1;
          delete indexById[ids[entity]];
          continue;
        }

        indices[write] = entity;
        write += 1;
      }

      rows.count = write;
      for (let offset = 0; offset < acceptedCount; offset += 1) rowVersion[accepted[offset]] += 1;
      rows.version += 1;
    },
  };
};

const createSpriteSemanticSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);

  return {
    run: () => {
      const { indices, accepted, presence, stateCode, prevStateCode, rowVersion, x, y, dx, dy, spriteIds } = rows;
      let acceptedCount = 0;
      let checksum = 0;

      for (let offset = 0; offset < rowCount; offset += 1) {
        const entity = indices[offset];
        if (presence[entity] === 0 || stateCode[entity] !== 0) continue;
        prevStateCode[entity] = stateCode[entity];
        accepted[acceptedCount] = entity;
        acceptedCount += 1;
        x[entity] += dx[entity];
        y[entity] += dy[entity];
        checksum += x[entity] + y[entity] + spriteIds[entity].length;
      }

      for (let offset = 0; offset < acceptedCount; offset += 1) rowVersion[accepted[offset]] += 1;
      rows.version += 1;
      rows.checksum += checksum;
    },
    read: () => rows.checksum,
  };
};

const createKernelStore = ({
  templateKey,
  rowCount,
  states,
  columns,
  reducer,
  hasReaction = false,
  despawnStates = [],
}) => {
  const stateCodeByName = Object.fromEntries(states.map((state, index) => [state, index]));
  const activeCode = stateCodeByName.active ?? stateCodeByName.visible ?? 0;
  const transitionTable = new Int16Array(2 * (states.length + 1));
  transitionTable.fill(noTransitionCode);
  transitionTable[0 * (states.length + 1) + (activeCode + 1)] = activeCode;

  const despawnStateMask = new Uint8Array(states.length);
  for (const state of despawnStates) despawnStateMask[stateCodeByName[state]] = 1;

  const activeBucket = Array.from({ length: rowCount }, (_, entity) => entity);
  const stateBuckets = states.map((state) => (stateCodeByName[state] === activeCode ? activeBucket : []));
  const statePosition = new Int32Array(rowCount);
  const presence = new Uint8Array(rowCount);
  const stateCode = new Int16Array(rowCount);
  const prevStateCode = new Int16Array(rowCount);
  const rowVersion = new Uint32Array(rowCount);

  presence.fill(1);
  stateCode.fill(activeCode);
  prevStateCode.fill(activeCode);
  for (let entity = 0; entity < rowCount; entity += 1) statePosition[entity] = entity;

  return {
    templateKey,
    count: rowCount,
    version: 0,
    metadata: {
      templateKey,
      publicStates: states,
      stateCodeByName,
      stateSlotCount: states.length + 1,
      transitionTable,
      despawnStateMask,
      despawnLifecycleStateMask: new Uint8Array(states.length + 1),
      effectsByStateCode: Array.from({ length: states.length }),
      reactionsByEventCode: hasReaction ? [() => undefined] : [],
      reducer,
    },
    presence,
    stateCode,
    prevStateCode,
    rowVersion,
    stateBuckets,
    statePosition,
    acceptedScratch: activeBucket,
    columns,
    publicSlice: { storage: "entity", version: 0, count: rowCount, capacity: rowCount },
  };
};

const createKernelRuntime = (stores, rowCount) => {
  const ids = new Array(rowCount);
  const alive = new Uint8Array(rowCount);
  const generation = new Uint32Array(rowCount);
  const groupTagByIndex = new Array(rowCount);
  const entitiesByGroupTag = Object.create(null);
  const groupTagPosition = new Int32Array(rowCount);
  const actorRowsByEntity = Array.from({ length: rowCount }, () => []);
  const actorRowsByGroupTag = Object.create(null);
  const entityBucket = [];
  const unitRows = [];

  for (let entity = 0; entity < rowCount; entity += 1) {
    ids[entity] = `entity/${entity}`;
    alive[entity] = 1;
    generation[entity] = 1;
    groupTagByIndex[entity] = "unit";
    groupTagPosition[entity] = entity;
    entityBucket.push(entity);
    const entityRows = actorRowsByEntity[entity];
    for (const store of stores) {
      const row = {
        store,
        entity,
        groupTag: "unit",
        entityRowsPosition: entityRows.length,
        groupRowsPosition: unitRows.length,
      };
      entityRows.push(row);
      unitRows.push(row);
    }
  }
  entitiesByGroupTag.unit = entityBucket;
  actorRowsByGroupTag.unit = unitRows;

  return {
    stores,
    entityStore: {
      ids,
      alive,
      generation,
      indexById: Object.fromEntries(ids.map((id, entity) => [id, entity])),
      groupTagByIndex,
      entitiesByGroupTag,
      groupTagPosition,
      freeList: [],
      count: rowCount,
      version: 0,
    },
    actorRowsByEntity,
    actorRowsByGroupTag,
    reactionBatches: [],
    reactionScopeScratch: {
      markers: new Uint32Array(rowCount),
      generation: new Uint32Array(rowCount),
      touched: [],
      compactIndices: [],
      token: 0,
    },
    scheduledDespawns: [],
    despawnScheduled: new Uint8Array(rowCount),
    checksum: 0,
  };
};

const createReducerSelf = (runtime, store, indices) => {
  const self = {
    indices,
    states: store.metadata.stateCodeByName,
    presence: store.presence,
    stateCode: store.stateCode,
    prevStateCode: store.prevStateCode,
    rowVersion: store.rowVersion,
    has(entity) {
      return store.presence[entity] === 1;
    },
    entityId(entity) {
      return runtime.entityStore.ids[entity];
    },
  };

  for (const [name, column] of Object.entries(store.columns)) self[name] = column;
  return self;
};

const resolveTransitionTarget = (store, entity, eventCode) => {
  const previousCode = store.stateCode[entity];
  const cell = eventCode * store.metadata.stateSlotCount + previousCode + 1;
  const nextCode = store.metadata.transitionTable[cell];
  if (nextCode === noTransitionCode) return false;

  store.prevStateCode[entity] = previousCode;
  store.stateCode[entity] = nextCode;
  return true;
};

const moveStateBucket = (store, entity, previousCode, nextCode) => {
  if (previousCode === nextCode) return;

  if (previousCode >= 0) {
    const previousBucket = store.stateBuckets[previousCode];
    const position = store.statePosition[entity];
    const last = previousBucket.pop();
    if (last !== undefined && last !== entity) {
      previousBucket[position] = last;
      store.statePosition[last] = position;
    }
  }

  if (nextCode >= 0) {
    const nextBucket = store.stateBuckets[nextCode];
    store.statePosition[entity] = nextBucket.length;
    nextBucket.push(entity);
    return;
  }

  store.statePosition[entity] = -1;
};

const swapRemoveKernelRowRef = (rows, row, position, updateMovedPosition) => {
  if (!rows || position < 0 || rows[position] !== row) return false;

  const last = rows.pop();
  if (last !== undefined && last !== row) {
    rows[position] = last;
    updateMovedPosition(last, position);
  }

  return true;
};

const removeKernelActorRowOwnership = (runtime, row) => {
  const entityRows = runtime.actorRowsByEntity[row.entity];
  swapRemoveKernelRowRef(entityRows, row, row.entityRowsPosition, (moved, position) => {
    moved.entityRowsPosition = position;
  });
  row.entityRowsPosition = -1;

  const groupRows = runtime.actorRowsByGroupTag[row.groupTag];
  swapRemoveKernelRowRef(groupRows, row, row.groupRowsPosition, (moved, position) => {
    moved.groupRowsPosition = position;
  });
  row.groupRowsPosition = -1;
  if (groupRows && groupRows.length === 0) delete runtime.actorRowsByGroupTag[row.groupTag];
};

const refreshKernelPublicSlice = (store) => {
  store.publicSlice = { storage: "entity", version: store.version, count: store.count, capacity: store.presence.length };
};

const removeKernelEntityFromGroupBucket = (runtime, entity) => {
  const entityStore = runtime.entityStore;
  const groupTag = entityStore.groupTagByIndex[entity];
  const bucket = entityStore.entitiesByGroupTag[groupTag];
  const position = entityStore.groupTagPosition[entity];
  if (!bucket || position < 0) return;

  const last = bucket.pop();
  if (last !== undefined && last !== entity) {
    bucket[position] = last;
    entityStore.groupTagPosition[last] = position;
  }
  if (bucket.length === 0) delete entityStore.entitiesByGroupTag[groupTag];
  entityStore.groupTagPosition[entity] = -1;
};

const scheduleDespawns = (runtime, store, indices) => {
  if (store.metadata.despawnStateMask.length === 0) return;

  for (const entity of indices) {
    const stateCode = store.stateCode[entity];
    if (stateCode < 0 || store.metadata.despawnStateMask[stateCode] !== 1) continue;
    if (runtime.entityStore.alive[entity] !== 1 || runtime.despawnScheduled[entity] === 1) continue;
    runtime.despawnScheduled[entity] = 1;
    runtime.scheduledDespawns.push(entity);
  }
};

const removeKernelActorRowsForStore = (runtime, store, rows) => {
  let removed = 0;

  for (const row of rows) {
    const entity = row.entity;
    if (row.store !== store || store.presence[entity] !== 1) continue;

    moveStateBucket(store, entity, store.stateCode[entity], entityInitStateCode);
    removeKernelActorRowOwnership(runtime, row);
    store.presence[entity] = 0;
    store.stateCode[entity] = entityInitStateCode;
    store.prevStateCode[entity] = entityInitStateCode;
    store.rowVersion[entity] = 0;
    removed += 1;
  }

  if (removed === 0) return 0;

  store.count -= removed;
  store.version += 1;
  return removed;
};

const removeKernelEntityRecords = (runtime, entities) => {
  const entityStore = runtime.entityStore;
  let removed = 0;

  for (const entity of entities) {
    if (entityStore.alive[entity] !== 1) continue;

    removeKernelEntityFromGroupBucket(runtime, entity);
    delete entityStore.indexById[entityStore.ids[entity]];
    entityStore.alive[entity] = 0;
    entityStore.ids[entity] = "";
    entityStore.groupTagByIndex[entity] = "";
    entityStore.freeList.push(entity);
    runtime.actorRowsByEntity[entity] = [];
    removed += 1;
  }

  if (removed === 0) return 0;

  entityStore.count -= removed;
  entityStore.version += 1;
  return removed;
};

const consumeKernelScheduledDespawns = (runtime) => {
  const despawns = runtime.scheduledDespawns;
  runtime.scheduledDespawns = [];

  for (const entity of despawns) runtime.despawnScheduled[entity] = 0;
  return despawns;
};

const appendKernelActorRowRemoval = (batches, row) => {
  const batch = batches.get(row.store.templateKey) ?? { store: row.store, rows: [] };
  batch.rows.push(row);
  batches.set(row.store.templateKey, batch);
};

const collectKernelDespawnCleanupPlan = (runtime) => {
  const despawns = consumeKernelScheduledDespawns(runtime);
  const removalBatches = new Map();
  const liveEntities = [];

  for (const entity of despawns) {
    if (runtime.entityStore.alive[entity] !== 1) continue;

    const rows = runtime.actorRowsByEntity[entity];
    if (!rows) continue;

    liveEntities.push(entity);
    for (const row of rows) {
      if (row.store.presence[entity] !== 1) continue;
      appendKernelActorRowRemoval(removalBatches, row);
    }
  }

  return { removalBatches: [...removalBatches.values()], entities: liveEntities };
};

const removeKernelActorRowsFromBatches = (runtime, batches) => {
  let removed = 0;
  for (const batch of batches) removed += removeKernelActorRowsForStore(runtime, batch.store, batch.rows);
  return removed;
};

const commitKernelPublicSlices = (runtime) => {
  for (const store of runtime.stores) refreshKernelPublicSlice(store);
};

const flushKernelDespawns = (runtime) => {
  const plan = collectKernelDespawnCleanupPlan(runtime);
  const removedRows = removeKernelActorRowsFromBatches(runtime, plan.removalBatches);
  const removedEntities = removeKernelEntityRecords(runtime, plan.entities);
  if (removedRows > 0 || removedEntities > 0) commitKernelPublicSlices(runtime);
};

const scheduleKernelReactionBatch = (runtime, store, eventCode, indices) => {
  const batch = { store, eventCode, ownership: "borrowed", indices };
  runtime.reactionBatches.push(batch);
  return batch;
};

const collectKernelDefaultTransitions = (store, indices, eventCode = 0) => {
  let firstNextState;
  for (const entity of indices) {
    if (!resolveTransitionTarget(store, entity, eventCode)) continue;
    firstNextState ??= store.metadata.publicStates[store.stateCode[entity]];
  }
  return firstNextState;
};

const firstKernelPublicState = (store, indices) => {
  const entity = indices[0];
  return entity === undefined ? undefined : store.metadata.publicStates[store.stateCode[entity]];
};

const runKernelUserReducer = (runtime, store, indices, action, firstNextState, reducerSelf) => {
  if (!store.metadata.reducer) return;

  store.metadata.reducer(
    { state: firstNextState, context: {} },
    action,
    {
      nextState: firstNextState,
      config: undefined,
      self: reducerSelf ?? createReducerSelf(runtime, store, indices),
      payloadFor() {
        throw new Error("payloadFor is not available in diagnostic kernel TICK");
      },
    },
  );
};

const validateKernelFinalStates = (store, indices) => {
  for (const entity of indices) {
    const code = store.stateCode[entity];
    if (code !== entityInitStateCode && store.metadata.publicStates[code] === undefined) {
      throw new Error(`invalid diagnostic stateCode ${code}`);
    }
  }
};

const markKernelRowsAndPublicSlice = (store, indices) => {
  for (const entity of indices) store.rowVersion[entity] += 1;
  store.version += 1;
};

const scheduleKernelLifecycleWork = (runtime, store, indices, { eventCode = 0, scheduleReactions = false } = {}) => {
  for (const entity of indices) {
    const stateCode = store.stateCode[entity];
    if (stateCode < 0 || stateCode === store.prevStateCode[entity]) continue;
    if (!store.metadata.effectsByStateCode[stateCode]) continue;
  }

  if (scheduleReactions && store.metadata.reactionsByEventCode[eventCode]) {
    scheduleKernelReactionBatch(runtime, store, eventCode, indices);
  }

  scheduleDespawns(runtime, store, indices);

  for (const entity of indices) {
    if (store.stateCode[entity] >= -1) continue;
  }
};

const updateKernelStateBuckets = (store, indices) => {
  for (let index = indices.length - 1; index >= 0; index -= 1) {
    const entity = indices[index];
    moveStateBucket(store, entity, store.prevStateCode[entity], store.stateCode[entity]);
  }
};

const reduceKernelBatch = (runtime, store, indices, action, { scheduleReactions = false } = {}) => {
  const firstNextState = collectKernelDefaultTransitions(store, indices, 0);
  if (indices.length === 0) return;

  runKernelUserReducer(runtime, store, indices, action, firstNextState);
  validateKernelFinalStates(store, indices);
  markKernelRowsAndPublicSlice(store, indices);
  scheduleKernelLifecycleWork(runtime, store, indices, { eventCode: 0, scheduleReactions });
  updateKernelStateBuckets(store, indices);
};

const cleanupKernelReactionScope = (scopeScratch) => {
  for (const entity of scopeScratch.touched) {
    scopeScratch.markers[entity] = 0;
    scopeScratch.generation[entity] = 0;
  }
  scopeScratch.touched.length = 0;
  scopeScratch.compactIndices.length = 0;
};

const nextKernelReactionScopeToken = (scopeScratch) => {
  scopeScratch.token += 1;
  if (scopeScratch.token >= 0xffffffff) {
    scopeScratch.markers.fill(0);
    scopeScratch.generation.fill(0);
    scopeScratch.token = 1;
  }
  return scopeScratch.token;
};

const entityCanEnterKernelReactionScope = (runtime, store, entity) => {
  if (store.presence[entity] !== 1 || runtime.entityStore.alive[entity] !== 1) return false;
  const id = runtime.entityStore.ids[entity];
  return id !== undefined && id.length > 0;
};

const captureKernelReactionScope = (runtime, store, indices) => {
  const scopeScratch = runtime.reactionScopeScratch;
  cleanupKernelReactionScope(scopeScratch);
  const token = nextKernelReactionScopeToken(scopeScratch);
  let compact;

  for (let index = 0; index < indices.length; index += 1) {
    const entity = indices[index];

    if (!entityCanEnterKernelReactionScope(runtime, store, entity)) {
      if (!compact) {
        compact = scopeScratch.compactIndices;
        compact.length = 0;
        for (let copyIndex = 0; copyIndex < index; copyIndex += 1) compact.push(indices[copyIndex]);
      }
      continue;
    }

    scopeScratch.markers[entity] = token;
    scopeScratch.generation[entity] = runtime.entityStore.generation[entity];
    scopeScratch.touched.push(entity);
    compact?.push(entity);
  }

  const scopedIndices = compact ?? indices;
  if (scopedIndices.length === 0) {
    cleanupKernelReactionScope(scopeScratch);
    return undefined;
  }

  return {
    indices: scopedIndices,
    markers: scopeScratch.markers,
    generation: scopeScratch.generation,
    token,
  };
};

const createKernelReactionDeps = (runtime, batch, scope, movementStore) => {
  const entityIsInScope = (entity) => scope.markers[entity] === scope.token;
  const entityHasCapturedGeneration = (entity) => runtime.entityStore.generation[entity] === scope.generation[entity];
  const self = {
    indices: scope.indices,
    spriteId: batch.store.columns.spriteId,
    has(entity) {
      return (
        entityIsInScope(entity) &&
        entityHasCapturedGeneration(entity) &&
        runtime.entityStore.alive[entity] === 1 &&
        batch.store.presence[entity] === 1
      );
    },
    entityId(entity) {
      if (!entityIsInScope(entity) || !entityHasCapturedGeneration(entity)) {
        throw new Error(`entity index ${entity} is outside current diagnostic reaction scope`);
      }
      const id = runtime.entityStore.ids[entity];
      if (id !== undefined && id.length > 0) return id;
      throw new Error(`entity index ${entity} has no diagnostic id`);
    },
  };
  const entities = () => ({
    get(key) {
      if (key !== "movementActor") throw new Error(`unknown diagnostic actor '${key}'`);
      return movementStore.columns;
    },
  });

  return { self, entities };
};

const runKernelUserReaction = (runtime, deps) => {
  const movement = deps.entities().get("movementActor");
  let checksum = 0;

  for (const entity of deps.self.indices) {
    checksum += movement.x[entity] + movement.y[entity] + deps.self.spriteId[entity].length;
  }
  runtime.checksum += checksum;
};

const runKernelReactions = (runtime, movementStore) => {
  for (const batch of runtime.reactionBatches) {
    const scope = captureKernelReactionScope(runtime, batch.store, batch.indices);
    if (!scope) continue;
    try {
      runKernelUserReaction(runtime, createKernelReactionDeps(runtime, batch, scope, movementStore));
    } finally {
      cleanupKernelReactionScope(runtime.reactionScopeScratch);
    }
  }

  runtime.reactionBatches.length = 0;
};

const resetCleanupKernel = (runtime, store, rowCount) => {
  runtime.entityStore.count = rowCount;
  runtime.entityStore.freeList.length = 0;
  runtime.entityStore.entitiesByGroupTag.unit = [];
  runtime.entityStore.indexById = Object.create(null);
  runtime.scheduledDespawns.length = 0;
  runtime.despawnScheduled.fill(0);
  runtime.entityStore.alive.fill(1);
  runtime.actorRowsByGroupTag.unit = [];
  store.count = rowCount;
  store.presence.fill(1);
  store.stateCode.fill(0);
  store.prevStateCode.fill(0);
  store.rowVersion.fill(0);
  store.stateBuckets[0].length = rowCount;
  store.stateBuckets[1].length = 0;

  for (let entity = 0; entity < rowCount; entity += 1) {
    runtime.entityStore.ids[entity] = `entity/${entity}`;
    runtime.entityStore.indexById[runtime.entityStore.ids[entity]] = entity;
    runtime.entityStore.groupTagByIndex[entity] = "unit";
    runtime.entityStore.groupTagPosition[entity] = entity;
    runtime.entityStore.entitiesByGroupTag.unit.push(entity);
    const entityRows = [];
    runtime.actorRowsByEntity[entity] = entityRows;
    for (const actorStore of runtime.stores) {
      const row = {
        store: actorStore,
        entity,
        groupTag: "unit",
        entityRowsPosition: entityRows.length,
        groupRowsPosition: runtime.actorRowsByGroupTag.unit.length,
      };
      entityRows.push(row);
      runtime.actorRowsByGroupTag.unit.push(row);
    }
    store.stateBuckets[0][entity] = entity;
    store.statePosition[entity] = entity;
    store.columns.ticksLeft[entity] = entity < cleanupBatchSize ? 1 : 1_000_000;
  }
};

const createReducerPhaseRunner = (batches, phase) => {
  let createdSelf;
  let preparedBatches = [];

  return {
    beforeOperation: () => {
      if (phase !== "run-user-reducer") return;

      preparedBatches = batches.map((batch) => ({
        ...batch,
        firstNextState: firstKernelPublicState(batch.store, batch.indices),
        self: createReducerSelf(batch.runtime, batch.store, batch.indices),
      }));
    },
    run: () => {
      if (phase === "collect-default-transitions") {
        for (const batch of batches) collectKernelDefaultTransitions(batch.store, batch.indices, 0);
        return;
      }
      if (phase === "create-reducer-self") {
        for (const batch of batches) createdSelf = createReducerSelf(batch.runtime, batch.store, batch.indices);
        return;
      }
      if (phase === "run-user-reducer") {
        for (const batch of preparedBatches) {
          runKernelUserReducer(
            batch.runtime,
            batch.store,
            batch.indices,
            tickAction,
            batch.firstNextState,
            batch.self,
          );
        }
        return;
      }
      if (phase === "validate-final-states") {
        for (const batch of batches) validateKernelFinalStates(batch.store, batch.indices);
        return;
      }
      if (phase === "mark-rows-public-slice") {
        for (const batch of batches) markKernelRowsAndPublicSlice(batch.store, batch.indices);
        return;
      }
      if (phase === "schedule-lifecycle-work") {
        for (const batch of batches) scheduleKernelLifecycleWork(batch.runtime, batch.store, batch.indices);
        return;
      }

      for (const batch of batches) updateKernelStateBuckets(batch.store, batch.indices);
    },
    read: () => createdSelf?.indices.length ?? preparedBatches.length,
  };
};

const createMovementKernelFixture = (rowCount) => {
  const rows = createSoaRows(rowCount);
  const store = createKernelStore({
    templateKey: "movementActor",
    rowCount,
    states: ["active"],
    columns: { x: rows.x, y: rows.y, dx: rows.dx, dy: rows.dy },
    reducer: createMovementActor().reducer,
  });
  const runtime = createKernelRuntime([store], rowCount);

  return { runtime, store };
};

const createMovementKernelRunner = (rowCount) => {
  const { runtime, store } = createMovementKernelFixture(rowCount);

  return {
    run: () => {
      reduceKernelBatch(runtime, store, store.stateBuckets[0], tickAction);
      flushKernelDespawns(runtime);
    },
  };
};

const createMovementReducerPhaseRunner = (rowCount, phase) => {
  const { runtime, store } = createMovementKernelFixture(rowCount);
  return createReducerPhaseRunner([{ runtime, store, indices: store.stateBuckets[0] }], phase);
};

const createProjectileKernelFixture = (rowCount) => {
  const rows = createSoaRows(rowCount);
  const store = createKernelStore({
    templateKey: "projectileActor",
    rowCount,
    states: ["active", "expired"],
    columns: { ticksLeft: rows.ticksLeft, damage: rows.damage },
    reducer: createProjectileActor("lifetime").reducer,
  });
  const runtime = createKernelRuntime([store], rowCount);

  return { runtime, store };
};

const createProjectileKernelRunner = (rowCount) => {
  const { runtime, store } = createProjectileKernelFixture(rowCount);

  return {
    run: () => {
      reduceKernelBatch(runtime, store, store.stateBuckets[0], tickAction);
      flushKernelDespawns(runtime);
    },
  };
};

const createProjectileReducerPhaseRunner = (rowCount, phase) => {
  const { runtime, store } = createProjectileKernelFixture(rowCount);
  return createReducerPhaseRunner([{ runtime, store, indices: store.stateBuckets[0] }], phase);
};

const createCleanupKernelFixture = (rowCount) => {
  const rows = createSoaRows(rowCount);
  const store = createKernelStore({
    templateKey: "projectileActor",
    rowCount,
    states: ["active", "expired"],
    columns: { ticksLeft: rows.ticksLeft, damage: rows.damage },
    reducer: createProjectileActor("cleanup").reducer,
    despawnStates: ["expired"],
  });
  const runtime = createKernelRuntime([store], rowCount);

  return { runtime, store };
};

const createCleanupKernelRunner = (rowCount) => {
  const { runtime, store } = createCleanupKernelFixture(rowCount);

  return {
    beforeOperation: () => resetCleanupKernel(runtime, store, rowCount),
    run: () => {
      reduceKernelBatch(runtime, store, store.stateBuckets[0], tickAction);
      flushKernelDespawns(runtime);
    },
  };
};

const prepareKernelCleanupScheduleInput = (runtime, store, rowCount) => {
  resetCleanupKernel(runtime, store, rowCount);
  for (let entity = 0; entity < cleanupBatchSize; entity += 1) store.stateCode[entity] = 1;
};

const prepareKernelCleanupAfterSchedule = (runtime, store, rowCount) => {
  resetCleanupKernel(runtime, store, rowCount);
  reduceKernelBatch(runtime, store, store.stateBuckets[0], tickAction);
};

const createCleanupPhaseRunner = (rowCount, phase) => {
  const { runtime, store } = createCleanupKernelFixture(rowCount);
  let plan = { removalBatches: [], entities: [] };

  return {
    beforeOperation: () => {
      if (phase === "schedule-despawn") {
        prepareKernelCleanupScheduleInput(runtime, store, rowCount);
        return;
      }

      prepareKernelCleanupAfterSchedule(runtime, store, rowCount);
      if (phase === "lifecycle-plan") return;

      plan = collectKernelDespawnCleanupPlan(runtime);
      if (phase === "batch-remove-actor-rows") return;

      removeKernelActorRowsFromBatches(runtime, plan.removalBatches);
      if (phase === "remove-entity-records") return;

      removeKernelEntityRecords(runtime, plan.entities);
    },
    run: () => {
      if (phase === "schedule-despawn") {
        scheduleDespawns(runtime, store, store.stateBuckets[0]);
        return;
      }
      if (phase === "lifecycle-plan") {
        plan = collectKernelDespawnCleanupPlan(runtime);
        return;
      }
      if (phase === "batch-remove-actor-rows") {
        removeKernelActorRowsFromBatches(runtime, plan.removalBatches);
        return;
      }
      if (phase === "remove-entity-records") {
        removeKernelEntityRecords(runtime, plan.entities);
        return;
      }

      commitKernelPublicSlices(runtime);
    },
  };
};

const createSpriteKernelFixture = (rowCount) => {
  const rows = createSoaRows(rowCount);
  const movementStore = createKernelStore({
    templateKey: "movementActor",
    rowCount,
    states: ["active"],
    columns: { x: rows.x, y: rows.y, dx: rows.dx, dy: rows.dy },
    reducer: createMovementActor().reducer,
  });
  const spriteStore = createKernelStore({
    templateKey: "spriteSyncActor",
    rowCount,
    states: ["visible"],
    columns: { spriteId: rows.spriteIds },
    reducer: createSpriteActor({ value: 0 }).reducer,
    hasReaction: true,
  });
  const runtime = createKernelRuntime([movementStore, spriteStore], rowCount);

  return { runtime, movementStore, spriteStore };
};

const createSpriteKernelRunner = (rowCount) => {
  const { runtime, movementStore, spriteStore } = createSpriteKernelFixture(rowCount);

  return {
    run: () => {
      reduceKernelBatch(runtime, movementStore, movementStore.stateBuckets[0], tickAction, { scheduleReactions: true });
      reduceKernelBatch(runtime, spriteStore, spriteStore.stateBuckets[0], tickAction, { scheduleReactions: true });
      runKernelReactions(runtime, movementStore);
      flushKernelDespawns(runtime);
    },
    read: () => runtime.checksum,
  };
};

const createSpriteReducerPhaseRunner = (rowCount, phase) => {
  const { runtime, movementStore, spriteStore } = createSpriteKernelFixture(rowCount);
  return createReducerPhaseRunner(
    [
      { runtime, store: movementStore, indices: movementStore.stateBuckets[0] },
      { runtime, store: spriteStore, indices: spriteStore.stateBuckets[0] },
    ],
    phase,
  );
};

const createSpriteKernelPhaseRunner = (rowCount, phase) => {
  const { runtime, movementStore, spriteStore } = createSpriteKernelFixture(rowCount);
  const indices = spriteStore.stateBuckets[0];
  const batch = { store: spriteStore, eventCode: 0, indices };
  let scheduledBatch;
  let scope;
  let deps;

  return {
    beforeOperation: () => {
      runtime.reactionBatches.length = 0;

      if (phase === "create-reaction-deps" || phase === "run-user-reaction") {
        scope = captureKernelReactionScope(runtime, spriteStore, indices);
      }
      if (phase === "run-user-reaction") deps = createKernelReactionDeps(runtime, batch, scope, movementStore);
    },
    run: () => {
      if (phase === "reduce-entity-batches") {
        reduceKernelBatch(runtime, movementStore, movementStore.stateBuckets[0], tickAction);
        reduceKernelBatch(runtime, spriteStore, spriteStore.stateBuckets[0], tickAction);
        return;
      }
      if (phase === "schedule-reaction-batch") {
        scheduledBatch = scheduleKernelReactionBatch(runtime, spriteStore, 0, indices);
        runtime.checksum += scheduledBatch.indices.length;
        runtime.reactionBatches.length = 0;
        return;
      }
      if (phase === "collect-reaction-scope") {
        scope = captureKernelReactionScope(runtime, spriteStore, indices);
        runtime.checksum += scope?.indices.length ?? 0;
        return;
      }
      if (phase === "create-reaction-deps") {
        deps = createKernelReactionDeps(runtime, batch, scope, movementStore);
        runtime.checksum += deps.self.indices.length;
        return;
      }

      runKernelUserReaction(runtime, deps);
    },
    afterOperation: () => {
      if (phase === "collect-reaction-scope" || phase === "create-reaction-deps" || phase === "run-user-reaction") {
        cleanupKernelReactionScope(runtime.reactionScopeScratch);
      }
    },
    read: () => runtime.checksum,
  };
};

const reducerPipelineOperationsPerSample = {
  "movement-update": 10,
  "projectile-lifetime": 10,
  "sprite-sync-reaction": 10,
};

const createReducerPhaseRunners = (createRunner) => ({
  "reducer-collect-default-transitions": (rowCount) => createRunner(rowCount, "collect-default-transitions"),
  "reducer-create-self": (rowCount) => createRunner(rowCount, "create-reducer-self"),
  "reducer-run-user-reducer": (rowCount) => createRunner(rowCount, "run-user-reducer"),
  "reducer-validate-final-states": (rowCount) => createRunner(rowCount, "validate-final-states"),
  "reducer-mark-rows-public-slice": (rowCount) => createRunner(rowCount, "mark-rows-public-slice"),
  "reducer-schedule-lifecycle-work": (rowCount) => createRunner(rowCount, "schedule-lifecycle-work"),
  "reducer-update-state-buckets": (rowCount) => createRunner(rowCount, "update-state-buckets"),
});

const layerDefinitions = [
  {
    key: "raw-soa",
    label: "raw SoA lower bound",
    operationsPerSample: {
      "movement-update": 100,
      "projectile-lifetime": 100,
      "despawn-on-cleanup": 20,
      "sprite-sync-reaction": 100,
    },
  },
  {
    key: "semantic-soa",
    label: "semantic SoA baseline",
    operationsPerSample: {
      "movement-update": 50,
      "projectile-lifetime": 50,
      "despawn-on-cleanup": 10,
      "sprite-sync-reaction": 50,
    },
  },
  {
    key: "reducer-collect-default-transitions",
    label: "collect/default transitions",
    operationsPerSample: reducerPipelineOperationsPerSample,
  },
  {
    key: "reducer-create-self",
    label: "create reducer self",
    operationsPerSample: reducerPipelineOperationsPerSample,
  },
  {
    key: "reducer-run-user-reducer",
    label: "run user reducer",
    operationsPerSample: reducerPipelineOperationsPerSample,
  },
  {
    key: "reducer-validate-final-states",
    label: "validate final states",
    operationsPerSample: reducerPipelineOperationsPerSample,
  },
  {
    key: "reducer-mark-rows-public-slice",
    label: "mark rows/public slice",
    operationsPerSample: reducerPipelineOperationsPerSample,
  },
  {
    key: "reducer-schedule-lifecycle-work",
    label: "schedule lifecycle work",
    operationsPerSample: reducerPipelineOperationsPerSample,
  },
  {
    key: "reducer-update-state-buckets",
    label: "update state buckets",
    operationsPerSample: reducerPipelineOperationsPerSample,
  },
  {
    key: "reduce-entity-batches",
    label: "reduce entity batches",
    operationsPerSample: {
      "sprite-sync-reaction": 10,
    },
  },
  {
    key: "schedule-reaction-batch",
    label: "schedule reaction batch",
    operationsPerSample: {
      "sprite-sync-reaction": 20,
    },
  },
  {
    key: "collect-reaction-scope",
    label: "collect reaction scope",
    operationsPerSample: {
      "sprite-sync-reaction": 10,
    },
  },
  {
    key: "create-reaction-deps",
    label: "create reaction deps",
    operationsPerSample: {
      "sprite-sync-reaction": 10,
    },
  },
  {
    key: "run-user-reaction",
    label: "run user reaction",
    operationsPerSample: {
      "sprite-sync-reaction": 20,
    },
  },
  {
    key: "cleanup-schedule-despawn",
    label: "schedule despawn",
    operationsPerSample: {
      "despawn-on-cleanup": 20,
    },
  },
  {
    key: "cleanup-lifecycle-plan",
    label: "despawn lifecycle plan",
    operationsPerSample: {
      "despawn-on-cleanup": 20,
    },
  },
  {
    key: "cleanup-batch-remove-actor-rows",
    label: "batch remove actor rows",
    operationsPerSample: {
      "despawn-on-cleanup": 20,
    },
  },
  {
    key: "cleanup-remove-entity-records",
    label: "remove entity records",
    operationsPerSample: {
      "despawn-on-cleanup": 20,
    },
  },
  {
    key: "cleanup-public-commit",
    label: "public commit",
    operationsPerSample: {
      "despawn-on-cleanup": 20,
    },
  },
  {
    key: "raw-entity-kernel",
    label: "raw entity kernel",
    operationsPerSample: {
      "movement-update": 20,
      "projectile-lifetime": 20,
      "despawn-on-cleanup": 5,
      "sprite-sync-reaction": 10,
    },
  },
  {
    key: "public-transition",
    label: "public manager.transition",
    operationsPerSample: {
      "movement-update": 5,
      "projectile-lifetime": 5,
      "despawn-on-cleanup": 5,
      "sprite-sync-reaction": 5,
    },
  },
];

const scenarioDefinitions = [
  {
    key: "movement-update",
    label: "movement update",
    createRunnerByLayer: {
      "raw-soa": createMovementRawSoaRunner,
      "semantic-soa": createMovementSemanticSoaRunner,
      ...createReducerPhaseRunners(createMovementReducerPhaseRunner),
      "raw-entity-kernel": createMovementKernelRunner,
      "public-transition": createMovementPublicRunner,
    },
  },
  {
    key: "projectile-lifetime",
    label: "projectile lifetime update",
    createRunnerByLayer: {
      "raw-soa": createProjectileRawSoaRunner,
      "semantic-soa": createProjectileSemanticSoaRunner,
      ...createReducerPhaseRunners(createProjectileReducerPhaseRunner),
      "raw-entity-kernel": createProjectileKernelRunner,
      "public-transition": (rowCount) => createProjectilePublicRunner(rowCount, "lifetime"),
    },
  },
  {
    key: "despawn-on-cleanup",
    label: "despawnOn cleanup",
    createRunnerByLayer: {
      "raw-soa": createCleanupRawSoaRunner,
      "semantic-soa": createCleanupSemanticSoaRunner,
      "raw-entity-kernel": createCleanupKernelRunner,
      "cleanup-schedule-despawn": (rowCount) => createCleanupPhaseRunner(rowCount, "schedule-despawn"),
      "cleanup-lifecycle-plan": (rowCount) => createCleanupPhaseRunner(rowCount, "lifecycle-plan"),
      "cleanup-batch-remove-actor-rows": (rowCount) => createCleanupPhaseRunner(rowCount, "batch-remove-actor-rows"),
      "cleanup-remove-entity-records": (rowCount) => createCleanupPhaseRunner(rowCount, "remove-entity-records"),
      "cleanup-public-commit": (rowCount) => createCleanupPhaseRunner(rowCount, "public-commit"),
      "public-transition": (rowCount) => createProjectilePublicRunner(rowCount, "cleanup"),
    },
  },
  {
    key: "sprite-sync-reaction",
    label: "sprite sync reaction",
    createRunnerByLayer: {
      "raw-soa": createSpriteRawSoaRunner,
      "semantic-soa": createSpriteSemanticSoaRunner,
      ...createReducerPhaseRunners(createSpriteReducerPhaseRunner),
      "raw-entity-kernel": createSpriteKernelRunner,
      "reduce-entity-batches": (rowCount) => createSpriteKernelPhaseRunner(rowCount, "reduce-entity-batches"),
      "schedule-reaction-batch": (rowCount) => createSpriteKernelPhaseRunner(rowCount, "schedule-reaction-batch"),
      "collect-reaction-scope": (rowCount) => createSpriteKernelPhaseRunner(rowCount, "collect-reaction-scope"),
      "create-reaction-deps": (rowCount) => createSpriteKernelPhaseRunner(rowCount, "create-reaction-deps"),
      "run-user-reaction": (rowCount) => createSpriteKernelPhaseRunner(rowCount, "run-user-reaction"),
      "public-transition": createSpritePublicRunner,
    },
  },
];

const runLayer = (scenario, layer, rowCount) => {
  const createRunner = scenario.createRunnerByLayer[layer.key];
  if (!createRunner) return undefined;

  const operationsPerSample = layer.operationsPerSample[scenario.key];
  if (operationsPerSample === undefined) return undefined;

  const runner = createRunner(rowCount);
  const summary = measure(runner, operationsPerSample);

  return {
    key: layer.key,
    label: layer.label,
    operationsPerSample,
    ...summary,
  };
};

const runScenario = (scenario, rowCount) => {
  const layers = layerDefinitions.flatMap((layer) => {
    const result = runLayer(scenario, layer, rowCount);
    return result ? [result] : [];
  });
  const rawSoa = layers.find((layer) => layer.key === "raw-soa");

  return {
    key: scenario.key,
    label: scenario.label,
    rowCount,
    layers: layers.map((layer) => ({
      ...layer,
      ratioToRawSoa: layer.median / rawSoa.median,
    })),
  };
};

export const runEntitiesDiagnosticsBenchmark = ({
  profile,
  onScenarioStart,
  onScenarioEnd,
  rowCounts: selectedRowCounts = rowCounts,
} = {}) => {
  const scenarios = [];

  for (const scenarioDefinition of scenarioDefinitions) {
    for (const rowCount of selectedRowCounts) {
      onScenarioStart?.(scenarioDefinition, rowCount);
      const scenario = runScenario(scenarioDefinition, rowCount);
      scenarios.push(scenario);
      onScenarioEnd?.(scenario);
    }
  }

  return {
    benchmark: benchmarkName,
    profile: profile ?? "node",
    runtime: "production dist",
    rowCounts: selectedRowCounts,
    scenarios,
  };
};

const formatMs = (value) => `${value.toFixed(3)}ms`;
const formatRatio = (value) => `${value.toFixed(2)}x`;

export const formatDiagnosticsReport = (result) => {
  const lines = [
    `${result.benchmark} (${result.profile}, ${result.runtime})`,
    "legacy synthetic calibration; not production manager.transition attribution",
    `iterations: warmup=${warmupIterations}, measured=${measuredIterations}`,
    "",
  ];

  for (const scenario of result.scenarios) {
    lines.push(`## ${scenario.label} / ${scenario.rowCount.toLocaleString("en-US")} rows`);
    lines.push("");
    lines.push("| Layer | Median | p95 | Min | Max | Ops/sample | Ratio to raw SoA |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");

    for (const layer of scenario.layers) {
      lines.push(
        [
          layer.label,
          formatMs(layer.median),
          formatMs(layer.p95),
          formatMs(layer.min),
          formatMs(layer.max),
          String(layer.operationsPerSample),
          formatRatio(layer.ratioToRawSoa),
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
      );
    }

    lines.push("");
  }

  return lines.join("\n");
};

export const massDespawnDiagnosticsBenchmarkName = "mass-despawn-lite-fsm-entities-diagnostics";

const massDespawnDiagnosticsWarmupIterations = 2;
const massDespawnDiagnosticsMeasuredIterations = 10;
const massDespawnDiagnosticsRowCounts = [30_000, 35_000];
const massDespawnDiagnosticsBatchSizes = [1_024, 5_000];
const massActorRowsPerEntity = 5;
const massActorKeys = ["identity", "movement", "health", "combat", "enemyAi"];

const measureMassDiagnostics = (runner, operationsPerSample) => {
  for (let sample = 0; sample < massDespawnDiagnosticsWarmupIterations; sample += 1) {
    for (let operation = 0; operation < operationsPerSample; operation += 1) {
      runner.beforeOperation?.();
      runner.run();
    }
  }

  const samples = [];
  for (let sample = 0; sample < massDespawnDiagnosticsMeasuredIterations; sample += 1) {
    let elapsed = 0;
    for (let operation = 0; operation < operationsPerSample; operation += 1) {
      runner.beforeOperation?.();
      const startedAt = now();
      runner.run();
      elapsed += now() - startedAt;
    }
    samples.push(elapsed / operationsPerSample);
  }

  runner.read?.();
  return summarize(samples);
};

const createMassDiagnosticsState = (rowCount) => {
  const actorRowsByEntity = Array.from({ length: rowCount }, () => []);
  const actorRowsByGroupTag = { unit: [] };
  const entityGroupBucket = Array.from({ length: rowCount }, (_, entity) => entity);
  const groupTagPosition = new Int32Array(rowCount);
  const ids = new Array(rowCount);
  const indexById = Object.create(null);
  const freeList = [];
  const stores = massActorKeys.map((key) => ({
    key,
    count: rowCount,
    version: 0,
    presence: new Uint8Array(rowCount),
    stateCode: new Int16Array(rowCount),
    statePosition: new Int32Array(rowCount),
    stateBucket: Array.from({ length: rowCount }, (_, entity) => entity),
    publicSlice: { storage: "entity", version: 0, count: rowCount, capacity: rowCount },
  }));

  for (let entity = 0; entity < rowCount; entity += 1) {
    groupTagPosition[entity] = entity;
    ids[entity] = `unit/${entity}`;
    indexById[ids[entity]] = entity;
  }

  for (const store of stores) {
    store.presence.fill(1);
    for (let entity = 0; entity < rowCount; entity += 1) {
      store.statePosition[entity] = entity;
      const row = {
        store,
        entity,
        groupTag: "unit",
        entityRowsPosition: actorRowsByEntity[entity].length,
        groupRowsPosition: actorRowsByGroupTag.unit.length,
      };
      actorRowsByEntity[entity].push(row);
      actorRowsByGroupTag.unit.push(row);
    }
  }

  return {
    rowCount,
    stores,
    actorRowsByEntity,
    actorRowsByGroupTag,
    entityStore: {
      count: rowCount,
      version: 0,
      ids,
      indexById,
      freeList,
      entitiesByGroupTag: { unit: entityGroupBucket },
      groupTagPosition,
    },
    checksum: 0,
  };
};

const swapRemove = (rows, item, position, updateMovedPosition) => {
  if (position < 0 || rows[position] !== item) return false;
  const last = rows.pop();
  if (last !== undefined && last !== item) {
    rows[position] = last;
    updateMovedPosition(last, position);
  }
  return true;
};

const createMassRemovalBatches = (state, batchSize) => {
  const batches = state.stores.map((store) => ({ store, rows: [] }));
  for (let entity = 0; entity < batchSize; entity += 1) {
    const rows = state.actorRowsByEntity[entity];
    for (let index = 0; index < rows.length; index += 1) {
      batches[index].rows.push(rows[index]);
    }
  }
  return batches;
};

const runActorRowsByEntityPlanScan = (state, batchSize) => {
  let rows = 0;
  for (let entity = 0; entity < batchSize; entity += 1) {
    rows += state.actorRowsByEntity[entity].length;
  }
  state.checksum += rows;
};

const runGroupOwnershipRemove = (state, batchSize) => {
  const removalBatches = createMassRemovalBatches(state, batchSize);
  for (const batch of removalBatches) {
    for (const row of batch.rows) {
      const groupRows = state.actorRowsByGroupTag[row.groupTag];
      swapRemove(groupRows, row, row.groupRowsPosition, (moved, position) => {
        moved.groupRowsPosition = position;
      });
      row.groupRowsPosition = -1;
    }
  }
};

const runEntityOwnershipRemove = (state, batchSize) => {
  const removalBatches = createMassRemovalBatches(state, batchSize);
  for (const batch of removalBatches) {
    for (const row of batch.rows) {
      const entityRows = state.actorRowsByEntity[row.entity];
      swapRemove(entityRows, row, row.entityRowsPosition, (moved, position) => {
        moved.entityRowsPosition = position;
      });
      row.entityRowsPosition = -1;
    }
  }
};

const runStateBucketRemove = (state, batchSize) => {
  for (const store of state.stores) {
    const bucket = store.stateBucket;
    for (let entity = 0; entity < batchSize; entity += 1) {
      const position = store.statePosition[entity];
      if (position < 0) continue;
      const last = bucket.pop();
      if (last !== undefined && last !== entity) {
        bucket[position] = last;
        store.statePosition[last] = position;
      }
      store.statePosition[entity] = -1;
    }
  }
};

const runEntityGroupBucketRemove = (state, batchSize) => {
  const bucket = state.entityStore.entitiesByGroupTag.unit;
  const positions = state.entityStore.groupTagPosition;
  for (let entity = 0; entity < batchSize; entity += 1) {
    const position = positions[entity];
    if (position < 0) continue;
    const last = bucket.pop();
    if (last !== undefined && last !== entity) {
      bucket[position] = last;
      positions[last] = position;
    }
    positions[entity] = -1;
  }
};

const runIndexByIdDelete = (state, batchSize) => {
  const { ids, indexById } = state.entityStore;
  for (let entity = 0; entity < batchSize; entity += 1) delete indexById[ids[entity]];
};

const runFreeListPush = (state, batchSize) => {
  const { freeList } = state.entityStore;
  for (let entity = 0; entity < batchSize; entity += 1) freeList.push(entity);
};

const runPublicSliceRefresh = (state, batchSize) => {
  for (const store of state.stores) {
    store.count -= batchSize;
    store.version += 1;
    store.publicSlice = {
      storage: "entity",
      version: store.version,
      count: store.count,
      capacity: state.rowCount,
    };
  }
};

const runCombinedRemoveActorRows = (state, batchSize) => {
  const removalBatches = createMassRemovalBatches(state, batchSize);
  for (const batch of removalBatches) {
    for (const row of batch.rows) {
      const { store, entity } = row;
      const bucket = store.stateBucket;
      const statePosition = store.statePosition[entity];
      const lastStateEntity = bucket.pop();
      if (lastStateEntity !== undefined && lastStateEntity !== entity) {
        bucket[statePosition] = lastStateEntity;
        store.statePosition[lastStateEntity] = statePosition;
      }
      store.statePosition[entity] = -1;

      const entityRows = state.actorRowsByEntity[entity];
      swapRemove(entityRows, row, row.entityRowsPosition, (moved, position) => {
        moved.entityRowsPosition = position;
      });

      const groupRows = state.actorRowsByGroupTag[row.groupTag];
      swapRemove(groupRows, row, row.groupRowsPosition, (moved, position) => {
        moved.groupRowsPosition = position;
      });

      store.presence[entity] = 0;
      store.stateCode[entity] = entityInitStateCode;
    }
    batch.store.count -= batch.rows.length;
    batch.store.version += 1;
  }
};

const runCombinedRemoveEntityRecords = (state, batchSize) => {
  const store = state.entityStore;
  for (let entity = 0; entity < batchSize; entity += 1) {
    const position = store.groupTagPosition[entity];
    const bucket = store.entitiesByGroupTag.unit;
    const last = bucket.pop();
    if (last !== undefined && last !== entity) {
      bucket[position] = last;
      store.groupTagPosition[last] = position;
    }
    store.groupTagPosition[entity] = -1;
    delete store.indexById[store.ids[entity]];
    store.ids[entity] = "";
    store.freeList.push(entity);
    state.actorRowsByEntity[entity] = [];
  }
  store.count -= batchSize;
  store.version += 1;
};

const createMassDiagnosticsRunner = (rowCount, batchSize, runLayer) => {
  let state;
  return {
    beforeOperation() {
      state = createMassDiagnosticsState(rowCount);
    },
    run() {
      runLayer(state, batchSize);
    },
    read() {
      return state?.checksum ?? 0;
    },
  };
};

const massDiagnosticsLayerDefinitions = [
  {
    key: "actorRowsByEntity-plan-scan",
    label: "actorRowsByEntity plan scan",
    run: runActorRowsByEntityPlanScan,
    operationsPerSample: 20,
    mapsTo: "collectPlan",
  },
  {
    key: "actorRowsByEntity-ownership-remove",
    label: "actorRowsByEntity ownership remove",
    run: runEntityOwnershipRemove,
    operationsPerSample: 20,
    mapsTo: "removeActorRows",
  },
  {
    key: "actorRowsByGroupTag-ownership-remove",
    label: "actorRowsByGroupTag ownership remove",
    run: runGroupOwnershipRemove,
    operationsPerSample: 20,
    mapsTo: "removeActorRows",
  },
  {
    key: "state-bucket-remove",
    label: "state bucket remove",
    run: runStateBucketRemove,
    operationsPerSample: 20,
    mapsTo: "removeActorRows",
  },
  {
    key: "entity-group-bucket-remove",
    label: "entity group bucket remove",
    run: runEntityGroupBucketRemove,
    operationsPerSample: 20,
    mapsTo: "removeEntityRecords",
  },
  {
    key: "indexById-delete",
    label: "indexById delete",
    run: runIndexByIdDelete,
    operationsPerSample: 20,
    mapsTo: "removeEntityRecords",
  },
  {
    key: "freeList-push",
    label: "freeList push",
    run: runFreeListPush,
    operationsPerSample: 20,
    mapsTo: "removeEntityRecords",
  },
  {
    key: "public-slice-refresh",
    label: "public slice refresh",
    run: runPublicSliceRefresh,
    operationsPerSample: 20,
    mapsTo: "removeActorRows",
  },
  {
    key: "combined-removeActorRows",
    label: "combined removeActorRows",
    run: runCombinedRemoveActorRows,
    operationsPerSample: 10,
    mapsTo: "removeActorRows",
  },
  {
    key: "combined-removeEntityRecords",
    label: "combined removeEntityRecords",
    run: runCombinedRemoveEntityRecords,
    operationsPerSample: 10,
    mapsTo: "removeEntityRecords",
  },
];

const runMassDiagnosticsLayer = (layer, rowCount, batchSize) => {
  const runner = createMassDiagnosticsRunner(rowCount, batchSize, layer.run);
  const summary = measureMassDiagnostics(runner, layer.operationsPerSample);
  return {
    key: layer.key,
    label: layer.label,
    mapsTo: layer.mapsTo,
    operationsPerSample: layer.operationsPerSample,
    ...summary,
  };
};

const runMassDiagnosticsScenario = (rowCount, batchSize) => ({
  key: `mass-despawn-diagnostics-b${batchSize}`,
  label: `mass despawn diagnostics / batch ${batchSize.toLocaleString("en-US")}`,
  rowCount,
  batchSize,
  actorRowsPerEntity: massActorRowsPerEntity,
  actorRowCount: rowCount * massActorRowsPerEntity,
  removedActorRows: batchSize * massActorRowsPerEntity,
  layers: massDiagnosticsLayerDefinitions.map((layer) => runMassDiagnosticsLayer(layer, rowCount, batchSize)),
});

export const runEntitiesMassDespawnDiagnosticsBenchmark = ({
  profile,
  onScenarioStart,
  onScenarioEnd,
  rowCounts: selectedRowCounts = massDespawnDiagnosticsRowCounts,
  batchSizes: selectedBatchSizes = massDespawnDiagnosticsBatchSizes,
} = {}) => {
  const scenarios = [];

  for (const rowCount of selectedRowCounts) {
    for (const batchSize of selectedBatchSizes) {
      if (batchSize > rowCount) continue;
      const definition = { key: `mass-despawn-diagnostics-b${batchSize}`, label: `batch ${batchSize}` };
      onScenarioStart?.(definition, rowCount);
      const scenario = runMassDiagnosticsScenario(rowCount, batchSize);
      scenarios.push(scenario);
      onScenarioEnd?.(scenario);
    }
  }

  return {
    benchmark: massDespawnDiagnosticsBenchmarkName,
    profile: profile ?? "node",
    runtime: "synthetic kernel",
    rowCounts: selectedRowCounts,
    batchSizes: selectedBatchSizes,
    scenarios,
  };
};

export const formatMassDespawnDiagnosticsReport = (result) => {
  const lines = [
    `${result.benchmark} (${result.profile}, ${result.runtime})`,
    "synthetic attribution for mass despawn cleanup internals; public API benchmark remains separate",
    `iterations: warmup=${massDespawnDiagnosticsWarmupIterations}, measured=${massDespawnDiagnosticsMeasuredIterations}`,
    "",
  ];

  for (const scenario of result.scenarios) {
    lines.push(
      `## ${scenario.label} / ${scenario.rowCount.toLocaleString("en-US")} rows / ${scenario.batchSize.toLocaleString(
        "en-US",
      )} despawns`,
    );
    lines.push("");
    lines.push("| Layer | Maps to public phase | Median | p95 | Min | Max | Ops/sample |");
    lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: |");

    for (const layer of scenario.layers) {
      lines.push(
        [
          layer.label,
          layer.mapsTo,
          formatMs(layer.median),
          formatMs(layer.p95),
          formatMs(layer.min),
          formatMs(layer.max),
          String(layer.operationsPerSample),
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
      );
    }

    lines.push("");
  }

  return lines.join("\n");
};
