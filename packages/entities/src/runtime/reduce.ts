import { LiteFsmError } from "@lite-fsm/core";
import type { AnyEvent, ManagerAction, ReadonlyManagerAction, StorageReduceBucketContext } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import { ENTITY_SPAWNED } from "./lifecycle";
import {
  ENTITY_INIT_STATE_CODE,
  ensureActorCapacity,
  ensureEntityCapacity,
  getEntityStateCode,
  getEntityStateName,
  refreshActorPublicSlice,
  writeInitialColumnValues,
  type ColumnarActorStore,
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

type PublicBatch = {
  readonly store: ColumnarActorStore;
  readonly indices: EntityIndex[];
};

type ReducerBatch = {
  readonly store: ColumnarActorStore;
  readonly indices: readonly EntityIndex[];
  readonly action: ManagerAction<AnyEvent>;
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
  readonly stateBuckets: Record<string, EntityIndex[]>;
  readonly statePosition: Int32Array;
  readonly acceptedScratch: EntityIndex[];
  readonly enteredScratchByState: Record<string, EntityIndex[]>;
  readonly columns: Record<string, EntityColumn>;
  readonly publicSlice: ColumnarActorStore["publicSlice"];
};

type RuntimeMutationSnapshot = {
  readonly entityStore: EntityStoreSnapshot;
  readonly actorStores: Record<string, ActorStoreSnapshot>;
};

const lifecycleAction: ManagerAction<AnyEvent> = { type: ENTITY_SPAWNED };

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

const runtimeError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_STORAGE_RUNTIME", `[lite-fsm/entities] ${reason}.`);

const toEntityIndex = (value: number): EntityIndex => value as EntityIndex;

const resolveTransitionTarget = (
  store: ColumnarActorStore,
  entity: EntityIndex,
  eventType: string,
): { readonly accepted: boolean; readonly nextState: string } => {
  const previousCode = store.stateCode[entity];
  const sourceState = getEntityStateName(store.metadata, previousCode);
  /* v8 ignore next 3 -- defensive invariant: public batch collection rejects invalid stateCode before reduce. */
  if (sourceState === undefined) {
    throw runtimeError(`actor '${store.templateKey}' has invalid stateCode ${previousCode} for entity ${entity}`);
  }

  const transitions = store.metadata.config[sourceState];
  if (!transitions || !hasOwn(transitions, eventType)) {
    return { accepted: false, nextState: sourceState };
  }

  const target = transitions[eventType];
  const nextState = target === null || target === undefined ? sourceState : target;
  const nextCode = getEntityStateCode(store.metadata, nextState);
  if (nextCode === undefined) {
    throw runtimeError(`actor '${store.templateKey}' transition '${eventType}' targets unknown state '${nextState}'`);
  }

  store.prevStateCode[entity] = previousCode;
  store.stateCode[entity] = nextCode;
  return { accepted: true, nextState };
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

const createReducerSelf = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  indices: readonly EntityIndex[],
): Record<string, unknown> => {
  const self: Record<string, unknown> = {
    indices,
    stateCode: store.stateCode,
    prevStateCode: store.prevStateCode,
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
  indices: readonly EntityIndex[],
  payloadByEntity: ReadonlyMap<EntityIndex, Record<string, unknown>> | undefined,
) => {
  const scope = new Set(indices);

  return (entity: EntityIndex): Record<string, unknown> => {
    if (!payloadByEntity) {
      throw runtimeError(`payloadFor(entity) is only available while reducing ${ENTITY_SPAWNED}`);
    }
    if (!scope.has(entity) || !payloadByEntity.has(entity)) {
      throw runtimeError(
        `payloadFor(entity) for actor '${store.templateKey}' only accepts EntityIndex values from current spawn scope`,
      );
    }
    return payloadByEntity.get(entity)!;
  };
};

const cloneIndexMap = (value: Record<string, EntityIndex>): Record<string, EntityIndex> =>
  Object.assign(Object.create(null) as Record<string, EntityIndex>, value);

const cloneIndexArrays = (value: Record<string, EntityIndex[]>): Record<string, EntityIndex[]> =>
  Object.fromEntries(Object.entries(value).map(([key, indices]) => [key, indices.slice()]));

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
  enteredScratchByState: cloneIndexArrays(store.enteredScratchByState),
  columns: cloneColumns(store.columns),
  publicSlice: store.publicSlice,
});

const snapshotRuntime = (runtime: EntityRuntimeState): RuntimeMutationSnapshot => ({
  entityStore: snapshotEntityStore(runtime.entityStore),
  actorStores: Object.fromEntries(
    Object.entries(runtime.actorStores).map(([templateKey, store]) => [templateKey, snapshotActorStore(store)]),
  ),
});

const restoreEntityStore = (store: EntityStore, snapshot: EntityStoreSnapshot): void => {
  store.count = snapshot.count;
  store.capacity = snapshot.capacity;
  store.ids = snapshot.ids;
  store.indexById = snapshot.indexById;
  store.alive = snapshot.alive;
  store.generation = snapshot.generation;
  store.groupTagByIndex = snapshot.groupTagByIndex;
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
  store.enteredScratchByState = snapshot.enteredScratchByState;
  store.columns = snapshot.columns;
  store.publicSlice = snapshot.publicSlice;
};

const restoreRuntime = (runtime: EntityRuntimeState, snapshot: RuntimeMutationSnapshot): void => {
  restoreEntityStore(runtime.entityStore, snapshot.entityStore);
  for (const [templateKey, storeSnapshot] of Object.entries(snapshot.actorStores)) {
    restoreActorStore(runtime.actorStores[templateKey], storeSnapshot);
  }
};

const reduceAcceptedBatch = (runtime: EntityRuntimeState, batch: ReducerBatch): boolean => {
  const accepted: EntityIndex[] = [];
  let firstNextState: string | undefined;

  for (const entity of batch.indices) {
    const result = resolveTransitionTarget(batch.store, entity, batch.action.type);
    if (!result.accepted) continue;
    accepted.push(entity);
    firstNextState ??= result.nextState;
  }

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
        payloadFor: createPayloadFor(batch.store, accepted, batch.payloadByEntity),
      },
    );
  }

  assertValidStateCodes(batch.store, accepted);
  markActorRowsTouched(batch.store, accepted);
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
): { readonly touched: boolean; readonly batches: readonly SpawnBatch[] } => {
  const batches = new Map<string, SpawnBatch>();
  for (const staged of stagedSpawns) {
    const entity = allocateEntity(runtime, staged);
    stageActorRow(runtime, batches, entity, staged);
  }

  return { touched: true, batches: [...batches.values()] };
};

const reduceStagedSpawnLifecycle = (
  runtime: EntityRuntimeState,
  staged: readonly StagedEntitySpawn[],
): boolean => {
  if (staged.length === 0) return false;

  let touched = false;
  const spawnResult = applyStagedSpawns(runtime, staged);
  touched ||= spawnResult.touched;

  for (const batch of spawnResult.batches) {
    touched = reduceAcceptedBatch(runtime, {
      store: batch.store,
      indices: batch.indices,
      action: lifecycleAction,
      payloadByEntity: batch.payloadByEntity,
    }) || touched;
  }

  return touched;
};

const collectPublicBatches = (runtime: EntityRuntimeState, action: ReadonlyManagerAction<AnyEvent>): PublicBatch[] => {
  const batches: PublicBatch[] = [];

  for (const store of Object.values(runtime.actorStores)) {
    const indices: EntityIndex[] = [];
    for (let entity = 0; entity < store.presence.length; entity += 1) {
      if (store.presence[entity] !== 1) continue;
      /* v8 ignore next 2 -- despawn is introduced after stage 5; live rows are always alive here. */
      if (runtime.entityStore.alive[entity] !== 1) continue;
      const state = getEntityStateName(store.metadata, store.stateCode[entity as EntityIndex]);
      if (state === undefined) {
        throw runtimeError(`actor '${store.templateKey}' has invalid stateCode ${store.stateCode[entity]} for entity ${entity}`);
      }
      const transitions = store.metadata.config[state];
      if (transitions && hasOwn(transitions, action.type)) indices.push(toEntityIndex(entity));
    }
    if (indices.length > 0) batches.push({ store, indices });
  }

  return batches;
};

export const reduceEntityBucket = (
  runtime: EntityRuntimeState,
  ctx: StorageReduceBucketContext<any>,
): { readonly type: "skip" } | void => {
  const staged = getStagedSpawns(ctx.dispatch);
  const snapshot = staged.length > 0 ? snapshotRuntime(runtime) : undefined;

  try {
    let touched = false;
    touched ||= reduceStagedSpawnLifecycle(runtime, staged);

    for (const batch of collectPublicBatches(runtime, ctx.action)) {
      if (reduceAcceptedBatch(runtime, {
        store: batch.store,
        indices: batch.indices,
        action: ctx.action as ManagerAction<AnyEvent>,
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
