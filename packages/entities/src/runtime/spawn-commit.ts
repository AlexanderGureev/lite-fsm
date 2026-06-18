import type { EntityIndex } from "../plugin";
import type { EntityDescriptor } from "../schema";
import { getInitialColumnValue } from "./columns";
import { ENTITY_INIT_STATE_CODE } from "./compile";
import type { SpawnPayloadScope } from "./reduce-shared";
import {
  addEntityToGroupBucket,
  ensureActorCapacity,
  ensureEntityCapacity,
  refreshActorPublicSlice,
  type ColumnarActorStore,
  type EntityActorRowRef,
  type EntityRuntimeState,
} from "./state";
import type { StagedEntitySpawn } from "./transaction";

export type SpawnBatch = {
  readonly store: ColumnarActorStore;
  readonly indices: EntityIndex[];
  readonly payloadScope: SpawnPayloadScope;
};

type SpawnBatchDraft = {
  readonly store: ColumnarActorStore;
  readonly indices: EntityIndex[];
  readonly payloads: Record<string, unknown>[];
};

type ColumnDefaultEntry = {
  readonly name: string;
  readonly value: number | string;
};

type ActorCommitPlan = {
  readonly store: ColumnarActorStore;
  readonly defaultEntries: readonly ColumnDefaultEntry[];
  requiredCapacity: number;
  addedRows: number;
};

type SpawnCommitPlan = {
  readonly assignedEntities: readonly EntityIndex[];
  readonly batches: readonly SpawnBatchDraft[];
  readonly actorPlans: ReadonlyMap<string, ActorCommitPlan>;
  readonly requiredEntityCapacity: number;
  readonly usedFreeListCount: number;
};

const toEntityIndex = (value: number): EntityIndex => value as EntityIndex;

const createColumnDefaultEntries = (store: ColumnarActorStore): readonly ColumnDefaultEntry[] =>
  Object.entries(store.metadata.initialContext).map(([name, descriptor]) => ({
    name,
    value: getInitialColumnValue(descriptor as EntityDescriptor),
  }));

const getActorPlan = (
  plans: Map<string, ActorCommitPlan>,
  store: ColumnarActorStore,
): ActorCommitPlan => {
  const existing = plans.get(store.templateKey);
  if (existing) return existing;

  const plan: ActorCommitPlan = {
    store,
    defaultEntries: createColumnDefaultEntries(store),
    requiredCapacity: store.capacity,
    addedRows: 0,
  };
  plans.set(store.templateKey, plan);
  return plan;
};

const getSpawnBatch = (
  batches: Map<string, SpawnBatchDraft>,
  store: ColumnarActorStore,
): SpawnBatchDraft => {
  const existing = batches.get(store.templateKey);
  if (existing) return existing;

  const batch = {
    store,
    indices: [],
    payloads: [],
  };
  batches.set(store.templateKey, batch);
  return batch;
};

const createSpawnPayloadScope = (
  indices: readonly EntityIndex[],
  payloads: readonly Record<string, unknown>[],
): SpawnPayloadScope => {
  const firstEntity = indices[0]!;
  let dense = true;

  for (let index = 1; index < indices.length; index += 1) {
    if (indices[index] === firstEntity + index) continue;
    dense = false;
    break;
  }

  if (dense) return { indices, payloads, firstEntity };

  const positionsByEntity = Object.create(null) as Record<number, number | undefined>;
  for (let index = 0; index < indices.length; index += 1) positionsByEntity[indices[index]] = index;
  return { indices, payloads, firstEntity, positionsByEntity };
};

const finalizeSpawnBatches = (batches: readonly SpawnBatchDraft[]): readonly SpawnBatch[] =>
  batches.map((batch) => ({
    store: batch.store,
    indices: batch.indices,
    payloadScope: createSpawnPayloadScope(batch.indices, batch.payloads),
  }));

const planSpawnCommit = (
  runtime: EntityRuntimeState,
  stagedSpawns: readonly StagedEntitySpawn[],
): SpawnCommitPlan => {
  const entityStore = runtime.entityStore;
  const freeCount = entityStore.freeList.length;
  const usedFreeListCount = Math.min(freeCount, stagedSpawns.length);
  const assignedEntities: EntityIndex[] = new Array(stagedSpawns.length);
  const actorPlans = new Map<string, ActorCommitPlan>();
  const batches = new Map<string, SpawnBatchDraft>();
  let requiredEntityCapacity = entityStore.capacity;

  for (let index = 0; index < stagedSpawns.length; index += 1) {
    const entity = index < freeCount
      ? entityStore.freeList[freeCount - 1 - index]
      : toEntityIndex(entityStore.ids.length + (index - freeCount));
    assignedEntities[index] = entity;
    requiredEntityCapacity = Math.max(requiredEntityCapacity, entity + 1);

    const staged = stagedSpawns[index];
    for (const actor of staged.actors) {
      const store = runtime.actorStores[actor.templateKey];
      const actorPlan = getActorPlan(actorPlans, store);
      actorPlan.requiredCapacity = Math.max(actorPlan.requiredCapacity, entity + 1);
      actorPlan.addedRows += 1;

      const batch = getSpawnBatch(batches, store);
      batch.indices.push(entity);
      batch.payloads.push(actor.payload);
    }
  }

  return {
    assignedEntities,
    batches: [...batches.values()],
    actorPlans,
    requiredEntityCapacity,
    usedFreeListCount,
  };
};

const reserveSpawnCommitCapacity = (runtime: EntityRuntimeState, plan: SpawnCommitPlan): void => {
  if (plan.requiredEntityCapacity > runtime.entityStore.capacity) {
    ensureEntityCapacity(runtime.entityStore, plan.requiredEntityCapacity);
  }

  for (const actorPlan of plan.actorPlans.values()) {
    if (actorPlan.requiredCapacity > actorPlan.store.capacity) {
      ensureActorCapacity(actorPlan.store, actorPlan.requiredCapacity);
    }
  }
};

const writeColumnDefaults = (
  store: ColumnarActorStore,
  entity: EntityIndex,
  entries: readonly ColumnDefaultEntry[],
): void => {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    (store.columns[entry.name] as Record<number, number | string>)[entity] = entry.value;
  }
};

const addActorRowOwnershipRef = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  entity: EntityIndex,
  groupTag: string,
): void => {
  const entityRows = runtime.actorRowsByEntity[entity] ?? [];
  if (entityRows.length === 0) runtime.actorRowsByEntity[entity] = entityRows;

  const groupRows = runtime.actorRowsByGroupTag[groupTag] ?? [];
  if (groupRows.length === 0) runtime.actorRowsByGroupTag[groupTag] = groupRows;

  const row: EntityActorRowRef = {
    store,
    entity,
    groupTag,
    entityRowsPosition: entityRows.length,
    groupRowsPosition: groupRows.length,
  };
  entityRows.push(row);
  groupRows.push(row);
};

const commitEntityRows = (
  runtime: EntityRuntimeState,
  stagedSpawns: readonly StagedEntitySpawn[],
  plan: SpawnCommitPlan,
): void => {
  const store = runtime.entityStore;
  if (plan.usedFreeListCount > 0) store.freeList.length -= plan.usedFreeListCount;

  for (let index = 0; index < stagedSpawns.length; index += 1) {
    const staged = stagedSpawns[index];
    const entity = plan.assignedEntities[index];

    store.ids[entity] = staged.id;
    store.indexById[staged.id] = entity;
    store.alive[entity] = 1;
    store.generation[entity] += 1;
    store.groupTagByIndex[entity] = staged.groupTag;
    addEntityToGroupBucket(store, entity, staged.groupTag);
  }

  if (stagedSpawns.length === 0) return;
  store.count += stagedSpawns.length;
  store.version += 1;
};

const commitActorRows = (
  runtime: EntityRuntimeState,
  stagedSpawns: readonly StagedEntitySpawn[],
  plan: SpawnCommitPlan,
): void => {
  for (let index = 0; index < stagedSpawns.length; index += 1) {
    const staged = stagedSpawns[index];
    const entity = plan.assignedEntities[index];

    for (const actor of staged.actors) {
      const actorPlan = plan.actorPlans.get(actor.templateKey)!;
      const store = actorPlan.store;
      store.presence[entity] = 1;
      store.stateCode[entity] = ENTITY_INIT_STATE_CODE;
      store.prevStateCode[entity] = ENTITY_INIT_STATE_CODE;
      store.rowVersion[entity] = 0;
      writeColumnDefaults(store, entity, actorPlan.defaultEntries);
      addActorRowOwnershipRef(runtime, store, entity, staged.groupTag);
    }
  }

  for (const actorPlan of plan.actorPlans.values()) {
    actorPlan.store.count += actorPlan.addedRows;
    actorPlan.store.version += 1;
    refreshActorPublicSlice(actorPlan.store);
  }
};

export const applyStagedSpawnCommit = (
  runtime: EntityRuntimeState,
  stagedSpawns: readonly StagedEntitySpawn[],
): readonly SpawnBatch[] => {
  const plan = planSpawnCommit(runtime, stagedSpawns);
  reserveSpawnCommitCapacity(runtime, plan);
  commitEntityRows(runtime, stagedSpawns, plan);
  commitActorRows(runtime, stagedSpawns, plan);
  return finalizeSpawnBatches(plan.batches);
};
