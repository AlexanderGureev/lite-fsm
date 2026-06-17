import type { StorageTemplate } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import { ENTITY_INIT_STATE_CODE, type EntityTemplateMetadata } from "./compile";
import type {
  ColumnarActorStore,
  EntityActorRowRef,
  EntityPublicStateSlice,
  EntityRuntimeState,
  EntityStore,
} from "./store-types";

export const createScratchByState = (states: readonly string[]): EntityIndex[][] =>
  states.map(() => [] as EntityIndex[]);

const createPublicSlice = (store: Pick<ColumnarActorStore, "capacity" | "count" | "version">): EntityPublicStateSlice => ({
  storage: "entity",
  version: store.version,
  count: store.count,
  capacity: store.capacity,
});

export const refreshActorPublicSlice = (store: ColumnarActorStore): void => {
  store.publicSlice = createPublicSlice(store);
};

export const clearPendingPrevStateCodeSync = (store: ColumnarActorStore): void => {
  store.pendingPrevStateCodeSync.length = 0;
  store.pendingPrevStateCodeSyncToken += 1;
  /* v8 ignore next 4 -- one actor store would need more than four billion dirty-row sync epochs. */
  if (store.pendingPrevStateCodeSyncToken >= 0xffffffff) {
    store.pendingPrevStateCodeSyncMark.fill(0);
    store.pendingPrevStateCodeSyncToken = 1;
  }
};

export const schedulePrevStateCodeSync = (
  store: ColumnarActorStore,
  indices: readonly EntityIndex[],
): void => {
  for (let index = 0; index < indices.length; index += 1) {
    schedulePrevStateCodeSyncRow(store, indices[index]);
  }
};

export const schedulePrevStateCodeSyncRow = (store: ColumnarActorStore, entity: EntityIndex): void => {
  const marks = store.pendingPrevStateCodeSyncMark;
  const token = store.pendingPrevStateCodeSyncToken;
  if (marks[entity] === token) return;

  marks[entity] = token;
  store.pendingPrevStateCodeSync.push(entity);
};

export const schedulePresentPrevStateCodeSync = (store: ColumnarActorStore): void => {
  const pending = store.pendingPrevStateCodeSync;
  const marks = store.pendingPrevStateCodeSyncMark;
  const token = store.pendingPrevStateCodeSyncToken;
  const presence = store.presence;

  for (let entity = 0; entity < presence.length; entity += 1) {
    if (presence[entity] !== 1 || marks[entity] === token) continue;
    marks[entity] = token;
    pending.push(entity as EntityIndex);
  }
};

export const syncPendingPrevStateCode = (store: ColumnarActorStore): void => {
  const pending = store.pendingPrevStateCodeSync;
  if (pending.length === 0) return;

  const presence = store.presence;
  const previousStateCodeByEntity = store.prevStateCode;
  const stateCodeByEntity = store.stateCode;
  for (let index = 0; index < pending.length; index += 1) {
    const entity = pending[index];
    if (presence[entity] === 1) previousStateCodeByEntity[entity] = stateCodeByEntity[entity];
  }
  clearPendingPrevStateCodeSync(store);
};

export const rebuildActorAcceptStateBuckets = (store: ColumnarActorStore): void => {
  store.acceptStateBucketsByEventCode = store.metadata.acceptStateCodesByEventCode.map((stateCodes) =>
    stateCodes.flatMap((stateCode) => (stateCode >= 0 ? [store.stateBuckets[stateCode]] : [])),
  );
};

export const addEntityToGroupBucket = (store: EntityStore, entity: EntityIndex, groupTag: string): void => {
  const bucket = store.entitiesByGroupTag[groupTag] ?? [];
  if (bucket.length === 0) store.entitiesByGroupTag[groupTag] = bucket;
  store.groupTagPosition[entity] = bucket.length;
  bucket.push(entity);
};

const removeEntityFromGroupBucket = (store: EntityStore, entity: EntityIndex): void => {
  const groupTag = store.groupTagByIndex[entity];
  const bucket = store.entitiesByGroupTag[groupTag];
  const position = store.groupTagPosition[entity];
  /* v8 ignore next -- defensive group index invariant for live entity cleanup. */
  if (!bucket || position < 0) return;

  const last = bucket.pop();
  if (last !== undefined && last !== entity) {
    bucket[position] = last;
    store.groupTagPosition[last] = position;
  }
  if (bucket.length === 0) delete store.entitiesByGroupTag[groupTag];
  store.groupTagPosition[entity] = -1;
};

export const addActorRowOwnership = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  entity: EntityIndex,
  groupTag: string,
): void => {
  const entityRows = runtime.actorRowsByEntity[entity] ?? [];
  if (entityRows.length === 0) runtime.actorRowsByEntity[entity] = entityRows;

  const groupRows = runtime.actorRowsByGroupTag[groupTag] ?? [];
  if (groupRows.length === 0) runtime.actorRowsByGroupTag[groupTag] = groupRows;

  const row = {
    store,
    entity,
    groupTag,
    entityRowsPosition: entityRows.length,
    groupRowsPosition: groupRows.length,
  };
  entityRows.push(row);
  groupRows.push(row);
};

const swapRemoveActorRowRef = (
  rows: EntityActorRowRef[] | undefined,
  row: EntityActorRowRef,
  position: number,
  updateMovedPosition: (moved: EntityActorRowRef, position: number) => void,
): boolean => {
  /* v8 ignore next -- defensive ownership invariant: live rows are stored in both ownership indexes. */
  if (!rows || position < 0 || rows[position] !== row) return false;

  const last = rows.pop();
  if (last !== undefined && last !== row) {
    rows[position] = last;
    updateMovedPosition(last, position);
  }

  return true;
};

const removeActorRowOwnership = (runtime: EntityRuntimeState, row: EntityActorRowRef): void => {
  const entityRows = runtime.actorRowsByEntity[row.entity];
  swapRemoveActorRowRef(entityRows, row, row.entityRowsPosition, (moved, position) => {
    moved.entityRowsPosition = position;
  });
  row.entityRowsPosition = -1;

  const groupRows = runtime.actorRowsByGroupTag[row.groupTag];
  swapRemoveActorRowRef(groupRows, row, row.groupRowsPosition, (moved, position) => {
    moved.groupRowsPosition = position;
  });
  row.groupRowsPosition = -1;
  if (groupRows && groupRows.length === 0) delete runtime.actorRowsByGroupTag[row.groupTag];
};

const removeActorFromStateBucket = (store: ColumnarActorStore, entity: EntityIndex, stateCode: number): void => {
  if (stateCode < 0) return;
  const bucket = store.stateBuckets[stateCode];
  const position = store.statePosition[entity];
  if (!bucket || position < 0) return;

  const last = bucket.pop();
  if (last !== undefined && last !== entity) {
    bucket[position] = last;
    store.statePosition[last] = position;
  }
  store.statePosition[entity] = -1;
};

const addActorToStateBucket = (store: ColumnarActorStore, entity: EntityIndex, stateCode: number): void => {
  if (stateCode < 0) return;
  const bucket = store.stateBuckets[stateCode];
  if (!bucket) return;

  store.statePosition[entity] = bucket.length;
  bucket.push(entity);
};

export const moveActorStateBucket = (
  store: ColumnarActorStore,
  entity: EntityIndex,
  previousCode: number,
  nextCode: number,
): void => {
  if (previousCode === nextCode) return;

  removeActorFromStateBucket(store, entity, previousCode);
  addActorToStateBucket(store, entity, nextCode);
};

export const moveActorStateBucketBatch = (
  store: ColumnarActorStore,
  sourceCode: number,
  targetCode: number,
  sourceBucket: readonly EntityIndex[],
): boolean => {
  if (sourceCode === targetCode || sourceCode < 0 || targetCode < 0) return false;

  const currentSourceBucket = store.stateBuckets[sourceCode];
  const currentTargetBucket = store.stateBuckets[targetCode];
  if (currentSourceBucket !== sourceBucket || !currentTargetBucket || currentTargetBucket.length !== 0) {
    return false;
  }

  store.stateBuckets[sourceCode] = currentTargetBucket;
  store.stateBuckets[targetCode] = currentSourceBucket;
  rebuildActorAcceptStateBuckets(store);
  return true;
};

export const removeActorRowsForStore = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  rows: readonly EntityActorRowRef[],
): number => {
  let removed = 0;

  for (const row of rows) {
    const entity = row.entity;
    if (row.store !== store || store.presence[entity] !== 1) continue;

    removeActorFromStateBucket(store, entity, store.stateCode[entity]);
    removeActorRowOwnership(runtime, row);
    store.presence[entity] = 0;
    store.stateCode[entity] = ENTITY_INIT_STATE_CODE;
    store.prevStateCode[entity] = ENTITY_INIT_STATE_CODE;
    store.rowVersion[entity] = 0;
    removed += 1;
  }

  if (removed === 0) return 0;

  store.count -= removed;
  store.version += 1;
  refreshActorPublicSlice(store);
  return removed;
};

export const removeEntityRecords = (runtime: EntityRuntimeState, entities: readonly EntityIndex[]): number => {
  const store = runtime.entityStore;
  let removed = 0;

  for (const entity of entities) {
    if (store.alive[entity] !== 1) continue;

    const id = store.ids[entity];
    removeEntityFromGroupBucket(store, entity);
    delete store.indexById[id];
    store.ids[entity] = "";
    store.alive[entity] = 0;
    store.groupTagByIndex[entity] = "";
    store.freeList.push(entity);
    runtime.actorRowsByEntity[entity] = [];
    removed += 1;
  }

  if (removed === 0) return 0;

  store.count -= removed;
  store.version += 1;
  return removed;
};

export const createPublicInitialState = (
  runtime: EntityRuntimeState,
  template: StorageTemplate<EntityTemplateMetadata>,
): EntityPublicStateSlice => {
  const store = runtime.actorStores[template.key];
  /* v8 ignore next 4 -- compile/runtime bucket invariant: public state is requested only for compiled entity templates. */
  if (!store) {
    throw new Error(`[lite-fsm/entities] missing actor store for entity template '${template.key}'.`);
  }

  store.publicSlice = createPublicSlice(store);
  return store.publicSlice;
};

export const restorePublicSlices = (
  runtime: EntityRuntimeState,
  nextState: Record<string, unknown>,
): Record<string, unknown> => {
  let restored = nextState;

  for (const store of Object.values(runtime.actorStores)) {
    if (restored[store.templateKey] === store.publicSlice) continue;
    if (restored === nextState) restored = { ...nextState };
    restored[store.templateKey] = store.publicSlice;
  }

  return restored;
};

export const rebuildEntityRuntimeIndexes = (runtime: EntityRuntimeState): void => {
  const entityStore = runtime.entityStore;
  entityStore.indexById = Object.create(null) as Record<string, EntityIndex>;
  entityStore.entitiesByGroupTag = Object.create(null) as Record<string, EntityIndex[]>;
  entityStore.groupTagPosition = new Int32Array(entityStore.capacity);
  entityStore.groupTagPosition.fill(-1);
  entityStore.count = 0;

  runtime.actorRowsByEntity = Array.from({ length: entityStore.capacity }, () => [] as EntityActorRowRef[]);
  runtime.actorRowsByGroupTag = Object.create(null) as Record<string, EntityActorRowRef[]>;
  runtime.routingScratchVersion = 0;

  for (const store of Object.values(runtime.actorStores)) {
    store.count = 0;
    store.stateBuckets = createScratchByState(store.metadata.publicStates);
    store.statePosition = new Int32Array(store.capacity);
    store.statePosition.fill(-1);
    store.acceptedScratch = [];
    store.routingScratchVersion = 0;
    rebuildActorAcceptStateBuckets(store);
  }

  for (let entity = 0; entity < entityStore.capacity; entity += 1) {
    if (entityStore.alive[entity] !== 1) continue;

    const index = entity as EntityIndex;
    entityStore.indexById[entityStore.ids[entity]] = index;
    addEntityToGroupBucket(entityStore, index, entityStore.groupTagByIndex[entity]);
    entityStore.count += 1;
  }

  for (const store of Object.values(runtime.actorStores)) {
    for (let entity = 0; entity < store.capacity; entity += 1) {
      if (store.presence[entity] !== 1) continue;

      const index = entity as EntityIndex;
      addActorToStateBucket(store, index, store.stateCode[entity]);
      addActorRowOwnership(runtime, store, index, entityStore.groupTagByIndex[entity]);
      store.count += 1;
    }
    refreshActorPublicSlice(store);
  }
};
