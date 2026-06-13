import { LiteFsmError } from "@lite-fsm/core";
import type { AnyEvent, ManagerAction, StorageReduceBucketContext } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import {
  ENTITY_INIT_STATE_CODE,
  ENTITY_INVALID_TRANSITION_TARGET,
  ENTITY_NO_TRANSITION,
  getEntityStateName,
} from "./compile";
import { ENTITY_SPAWNED } from "./lifecycle";
import { collectEntityPublicReducerBatches } from "./routing";
import {
  addActorRowOwnership,
  addEntityToGroupBucket,
  ensureActorCapacity,
  ensureEntityCapacity,
  moveActorStateBucket,
  refreshActorPublicSlice,
  writeInitialColumnValues,
  type ColumnarActorStore,
  type EntityActorRowRef,
  type EntityColumn,
  type EntityStore,
  type EntityRuntimeState,
} from "./state";
import { getStagedSpawns, type StagedEntitySpawn } from "./transaction";

type SpawnBatch = {
  readonly store: ColumnarActorStore;
  readonly indices: EntityIndex[];
  readonly payloadByEntity: Map<EntityIndex, Record<string, unknown>>;
};

type ReducerBatch = {
  readonly store: ColumnarActorStore;
  readonly indices: readonly EntityIndex[];
  readonly action: ManagerAction<AnyEvent>;
  readonly eventCode: number | undefined;
  readonly accepted?: true;
  readonly payloadByEntity?: ReadonlyMap<EntityIndex, Record<string, unknown>>;
};

type EntityStoreSnapshot = {
  readonly count: number;
  readonly capacity: number;
  readonly ids: string[];
  readonly indexById: Record<string, EntityIndex>;
  readonly alive: Uint8Array;
  readonly generation: Uint32Array;
  readonly groupTagByIndex: string[];
  readonly entitiesByGroupTag: Record<string, EntityIndex[]>;
  readonly groupTagPosition: Int32Array;
  readonly freeList: EntityIndex[];
  readonly version: number;
};

type ActorStoreSnapshot = {
  readonly capacity: number;
  readonly count: number;
  readonly version: number;
  readonly presence: Uint8Array;
  readonly stateCode: Int16Array;
  readonly prevStateCode: Int16Array;
  readonly rowVersion: Uint32Array;
  readonly stateBuckets: EntityIndex[][];
  readonly statePosition: Int32Array;
  readonly acceptedScratch: EntityIndex[];
  readonly columns: Record<string, EntityColumn>;
  readonly publicSlice: ColumnarActorStore["publicSlice"];
};

type RuntimeMutationSnapshot = {
  readonly entityStore: EntityStoreSnapshot;
  readonly actorStores: Record<string, ActorStoreSnapshot>;
  readonly actorRowsByEntity: EntityActorRowRef[][];
  readonly actorRowsByGroupTag: Record<string, EntityActorRowRef[]>;
};

const lifecycleAction: ManagerAction<AnyEvent> = { type: ENTITY_SPAWNED };

const runtimeError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_STORAGE_RUNTIME", `[lite-fsm/entities] ${reason}.`);

const toEntityIndex = (value: number): EntityIndex => value as EntityIndex;

const resolveTransitionTarget = (
  store: ColumnarActorStore,
  entity: EntityIndex,
  eventCode: number | undefined,
  eventType: string,
): { readonly accepted: boolean; readonly nextState: string | undefined } => {
  if (eventCode === undefined) return { accepted: false, nextState: undefined };

  const previousCode = store.stateCode[entity];
  const stateSlot = previousCode + 1;
  if (stateSlot < 0 || stateSlot >= store.metadata.stateSlotCount) {
    throw runtimeError(`actor '${store.templateKey}' has invalid stateCode ${previousCode} for entity ${entity}`);
  }

  const cell = eventCode * store.metadata.stateSlotCount + stateSlot;
  const nextCode = store.metadata.transitionTable[cell];
  if (nextCode === ENTITY_NO_TRANSITION) return { accepted: false, nextState: undefined };
  if (nextCode === ENTITY_INVALID_TRANSITION_TARGET) {
    throw runtimeError(
      `actor '${store.templateKey}' transition '${eventType}' targets unknown state '${store.metadata.transitionTargetByCell[cell]}'`,
    );
  }

  store.prevStateCode[entity] = previousCode;
  store.stateCode[entity] = nextCode;
  return { accepted: true, nextState: getEntityStateName(store.metadata, nextCode) };
};

const assertValidStateCodes = (store: ColumnarActorStore, indices: readonly EntityIndex[]): void => {
  for (const entity of indices) {
    const code = store.stateCode[entity];
    if (code === ENTITY_INIT_STATE_CODE || store.metadata.publicStates[code] !== undefined) continue;
    throw runtimeError(`actor '${store.templateKey}' reducer wrote invalid stateCode ${code} for entity ${entity}`);
  }
};

const markActorRowsTouched = (store: ColumnarActorStore, indices: readonly EntityIndex[]): void => {
  for (const entity of indices) store.rowVersion[entity] += 1;
  store.version += 1;
  refreshActorPublicSlice(store);
};

const updateActorStateBuckets = (store: ColumnarActorStore, indices: readonly EntityIndex[]): void => {
  for (let index = indices.length - 1; index >= 0; index -= 1) {
    const entity = indices[index];
    moveActorStateBucket(store, entity, store.prevStateCode[entity], store.stateCode[entity]);
  }
};

const createReducerSelf = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  indices: readonly EntityIndex[],
): Record<string, unknown> => {
  const self: Record<string, unknown> = {
    indices,
    states: store.metadata.stateCodeByName,
    presence: store.presence,
    stateCode: store.stateCode,
    prevStateCode: store.prevStateCode,
    rowVersion: store.rowVersion,
    has(entity: EntityIndex) {
      return store.presence[entity] === 1;
    },
    entityId(entity: EntityIndex) {
      const id = runtime.entityStore.ids[entity];
      if (id !== undefined) return id;
      throw runtimeError(`unknown entity index ${entity}`);
    },
  };

  for (const [name, column] of Object.entries(store.columns)) {
    self[name] = column;
  }

  return self;
};

const createPayloadFor = (
  store: ColumnarActorStore,
  payloadByEntity: ReadonlyMap<EntityIndex, Record<string, unknown>> | undefined,
) => {
  if (!payloadByEntity) {
    return (): Record<string, unknown> => {
      throw runtimeError(`payloadFor(entity) is only available while reducing ${ENTITY_SPAWNED}`);
    };
  }

  return (entity: EntityIndex): Record<string, unknown> => {
    if (!payloadByEntity.has(entity)) {
      throw runtimeError(
        `payloadFor(entity) for actor '${store.templateKey}' only accepts EntityIndex values from current spawn scope`,
      );
    }
    return payloadByEntity.get(entity)!;
  };
};

const cloneIndexMap = (value: Record<string, EntityIndex>): Record<string, EntityIndex> =>
  Object.assign(Object.create(null) as Record<string, EntityIndex>, value);

const cloneIndexArrayRecord = (value: Record<string, EntityIndex[]>): Record<string, EntityIndex[]> =>
  Object.assign(
    Object.create(null) as Record<string, EntityIndex[]>,
    Object.fromEntries(Object.entries(value).map(([key, indices]) => [key, indices.slice()])),
  );

const cloneIndexArrays = (value: readonly EntityIndex[][]): EntityIndex[][] => value.map((indices) => indices.slice());

const cloneActorRowRefsByEntity = (value: readonly EntityActorRowRef[][]): EntityActorRowRef[][] =>
  value.map((rows) => rows.slice());

const cloneActorRowRefRecord = (
  value: Record<string, EntityActorRowRef[]>,
): Record<string, EntityActorRowRef[]> =>
  Object.assign(
    Object.create(null) as Record<string, EntityActorRowRef[]>,
    Object.fromEntries(Object.entries(value).map(([key, rows]) => [key, rows.slice()])),
  );

const cloneColumn = (column: EntityColumn): EntityColumn =>
  Array.isArray(column) ? column.slice() : (column.slice() as EntityColumn);

const cloneColumns = (columns: Record<string, EntityColumn>): Record<string, EntityColumn> =>
  Object.fromEntries(Object.entries(columns).map(([name, column]) => [name, cloneColumn(column)]));

const snapshotEntityStore = (store: EntityStore): EntityStoreSnapshot => ({
  count: store.count,
  capacity: store.capacity,
  ids: store.ids.slice(),
  indexById: cloneIndexMap(store.indexById),
  alive: store.alive.slice(),
  generation: store.generation.slice(),
  groupTagByIndex: store.groupTagByIndex.slice(),
  entitiesByGroupTag: cloneIndexArrayRecord(store.entitiesByGroupTag),
  groupTagPosition: store.groupTagPosition.slice(),
  freeList: store.freeList.slice(),
  version: store.version,
});

const snapshotActorStore = (store: ColumnarActorStore): ActorStoreSnapshot => ({
  capacity: store.capacity,
  count: store.count,
  version: store.version,
  presence: store.presence.slice(),
  stateCode: store.stateCode.slice(),
  prevStateCode: store.prevStateCode.slice(),
  rowVersion: store.rowVersion.slice(),
  stateBuckets: cloneIndexArrays(store.stateBuckets),
  statePosition: store.statePosition.slice(),
  acceptedScratch: store.acceptedScratch.slice(),
  columns: cloneColumns(store.columns),
  publicSlice: store.publicSlice,
});

const snapshotRuntime = (runtime: EntityRuntimeState): RuntimeMutationSnapshot => ({
  entityStore: snapshotEntityStore(runtime.entityStore),
  actorStores: Object.fromEntries(
    Object.entries(runtime.actorStores).map(([templateKey, store]) => [templateKey, snapshotActorStore(store)]),
  ),
  actorRowsByEntity: cloneActorRowRefsByEntity(runtime.actorRowsByEntity),
  actorRowsByGroupTag: cloneActorRowRefRecord(runtime.actorRowsByGroupTag),
});

const restoreEntityStore = (store: EntityStore, snapshot: EntityStoreSnapshot): void => {
  store.count = snapshot.count;
  store.capacity = snapshot.capacity;
  store.ids = snapshot.ids;
  store.indexById = snapshot.indexById;
  store.alive = snapshot.alive;
  store.generation = snapshot.generation;
  store.groupTagByIndex = snapshot.groupTagByIndex;
  store.entitiesByGroupTag = snapshot.entitiesByGroupTag;
  store.groupTagPosition = snapshot.groupTagPosition;
  store.freeList = snapshot.freeList;
  store.version = snapshot.version;
};

const restoreActorStore = (store: ColumnarActorStore, snapshot: ActorStoreSnapshot): void => {
  store.capacity = snapshot.capacity;
  store.count = snapshot.count;
  store.version = snapshot.version;
  store.presence = snapshot.presence;
  store.stateCode = snapshot.stateCode;
  store.prevStateCode = snapshot.prevStateCode;
  store.rowVersion = snapshot.rowVersion;
  store.stateBuckets = snapshot.stateBuckets;
  store.statePosition = snapshot.statePosition;
  store.acceptedScratch = snapshot.acceptedScratch;
  store.acceptStateBucketsByEventCode = store.metadata.acceptStateCodesByEventCode.map((stateCodes) =>
    stateCodes.flatMap((stateCode) => (stateCode >= 0 ? [store.stateBuckets[stateCode]] : [])),
  );
  store.columns = snapshot.columns;
  store.publicSlice = snapshot.publicSlice;
};

const restoreRuntime = (runtime: EntityRuntimeState, snapshot: RuntimeMutationSnapshot): void => {
  restoreEntityStore(runtime.entityStore, snapshot.entityStore);
  for (const [templateKey, storeSnapshot] of Object.entries(snapshot.actorStores)) {
    restoreActorStore(runtime.actorStores[templateKey], storeSnapshot);
  }
  runtime.actorRowsByEntity = snapshot.actorRowsByEntity;
  runtime.actorRowsByGroupTag = snapshot.actorRowsByGroupTag;
};

const getAcceptedIndices = (batch: ReducerBatch): readonly EntityIndex[] => {
  if (batch.accepted) return batch.indices;

  const accepted = batch.store.acceptedScratch;
  accepted.length = 0;
  for (const entity of batch.indices) {
    const result = resolveTransitionTarget(batch.store, entity, batch.eventCode, batch.action.type);
    if (result.accepted) accepted.push(entity);
  }
  return accepted;
};

const applyDefaultTransitions = (batch: ReducerBatch, accepted: readonly EntityIndex[]): string | undefined => {
  let firstNextState: string | undefined;

  if (!batch.accepted) {
    for (const entity of accepted) {
      firstNextState ??= getEntityStateName(batch.store.metadata, batch.store.stateCode[entity]);
    }
    return firstNextState;
  }

  for (const entity of accepted) {
    const result = resolveTransitionTarget(batch.store, entity, batch.eventCode, batch.action.type);
    firstNextState ??= result.nextState;
  }

  return firstNextState;
};

const reduceAcceptedBatch = (runtime: EntityRuntimeState, batch: ReducerBatch): boolean => {
  const accepted = getAcceptedIndices(batch);
  const firstNextState = applyDefaultTransitions(batch, accepted);

  if (accepted.length === 0) return false;

  const reducer = batch.store.metadata.reducer;
  if (reducer) {
    const nextState = firstNextState!;
    reducer(
      { state: nextState, context: {} },
      batch.action,
      {
        nextState,
        config: batch.store.metadata.config,
        self: createReducerSelf(runtime, batch.store, accepted),
        payloadFor: createPayloadFor(batch.store, batch.payloadByEntity),
      },
    );
  }

  assertValidStateCodes(batch.store, accepted);
  markActorRowsTouched(batch.store, accepted);
  updateActorStateBuckets(batch.store, accepted);
  return true;
};

const allocateEntity = (runtime: EntityRuntimeState, staged: StagedEntitySpawn): EntityIndex => {
  const entityStore = runtime.entityStore;
  const entity = toEntityIndex(entityStore.ids.length);

  ensureEntityCapacity(entityStore, entity + 1);
  entityStore.ids[entity] = staged.id;
  entityStore.indexById[staged.id] = entity;
  entityStore.alive[entity] = 1;
  entityStore.generation[entity] += 1;
  entityStore.groupTagByIndex[entity] = staged.groupTag;
  addEntityToGroupBucket(entityStore, entity, staged.groupTag);
  entityStore.count += 1;
  entityStore.version += 1;
  return entity;
};

const stageActorRow = (
  runtime: EntityRuntimeState,
  batches: Map<string, SpawnBatch>,
  entity: EntityIndex,
  staged: StagedEntitySpawn,
): void => {
  for (const actor of staged.actors) {
    const store = runtime.actorStores[actor.templateKey];
    ensureActorCapacity(store, entity + 1);
    store.presence[entity] = 1;
    store.stateCode[entity] = ENTITY_INIT_STATE_CODE;
    store.prevStateCode[entity] = ENTITY_INIT_STATE_CODE;
    store.count += 1;
    store.version += 1;
    writeInitialColumnValues(store, entity);
    addActorRowOwnership(runtime, store, entity, staged.groupTag);
    refreshActorPublicSlice(store);

    const batch = batches.get(actor.templateKey) ?? {
      store,
      indices: [],
      payloadByEntity: new Map<EntityIndex, Record<string, unknown>>(),
    };
    batch.indices.push(entity);
    batch.payloadByEntity.set(entity, actor.payload);
    batches.set(actor.templateKey, batch);
  }
};

const applyStagedSpawns = (
  runtime: EntityRuntimeState,
  stagedSpawns: readonly StagedEntitySpawn[],
): readonly SpawnBatch[] => {
  const batches = new Map<string, SpawnBatch>();
  for (const staged of stagedSpawns) {
    const entity = allocateEntity(runtime, staged);
    stageActorRow(runtime, batches, entity, staged);
  }

  return [...batches.values()];
};

const reduceStagedSpawnLifecycle = (
  runtime: EntityRuntimeState,
  staged: readonly StagedEntitySpawn[],
): boolean => {
  if (staged.length === 0) return false;

  const spawnBatches = applyStagedSpawns(runtime, staged);

  for (const batch of spawnBatches) {
    reduceAcceptedBatch(runtime, {
      store: batch.store,
      indices: batch.indices,
      action: lifecycleAction,
      eventCode: runtime.eventCodeByType[ENTITY_SPAWNED],
      payloadByEntity: batch.payloadByEntity,
    });
  }

  return true;
};

export const reduceEntityBucket = (
  runtime: EntityRuntimeState,
  ctx: StorageReduceBucketContext<any>,
): { readonly type: "skip" } | void => {
  const staged = getStagedSpawns(ctx.dispatch);
  const snapshot = staged.length > 0 ? snapshotRuntime(runtime) : undefined;
  const eventCode = runtime.eventCodeByType[ctx.action.type];

  try {
    let touched = false;
    touched ||= reduceStagedSpawnLifecycle(runtime, staged);

    if (eventCode === undefined) return touched ? undefined : { type: "skip" };

    for (const batch of collectEntityPublicReducerBatches(runtime, eventCode, ctx.dispatch.route)) {
      if (reduceAcceptedBatch(runtime, {
        store: batch.store,
        indices: batch.indices,
        action: ctx.action as ManagerAction<AnyEvent>,
        eventCode,
        accepted: batch.accepted,
      })) {
        touched = true;
      }
    }

    return touched ? undefined : { type: "skip" };
  } catch (error) {
    if (snapshot) restoreRuntime(runtime, snapshot);
    throw error;
  }
};
