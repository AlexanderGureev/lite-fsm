import type { EntityIndex } from "../plugin";

import {
  rebuildActorAcceptStateBuckets,
  rebindActorReducerSelf,
  type ColumnarActorStore,
  type EntityActorRowRef,
  type EntityColumn,
  type EntityRuntimeState,
  type EntityStore,
} from "./state";

type EntityStoreMutationSnapshot = {
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

type ActorStoreMutationSnapshot = {
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
  readonly entityStore: EntityStoreMutationSnapshot;
  readonly actorStores: Record<string, ActorStoreMutationSnapshot>;
  readonly actorRowsByEntity: EntityActorRowRef[][];
  readonly actorRowsByGroupTag: Record<string, EntityActorRowRef[]>;
};

const cloneIndexMap = (value: Record<string, EntityIndex>): Record<string, EntityIndex> =>
  Object.assign(Object.create(null) as Record<string, EntityIndex>, value);

const cloneIndexArrayRecord = (value: Record<string, EntityIndex[]>): Record<string, EntityIndex[]> =>
  Object.assign(
    Object.create(null) as Record<string, EntityIndex[]>,
    Object.fromEntries(Object.entries(value).map(([key, indices]) => [key, indices.slice()])),
  );

const cloneIndexArrays = (value: readonly EntityIndex[][]): EntityIndex[][] => value.map((indices) => indices.slice());

const cloneActorRowRef = (
  row: EntityActorRowRef,
  clones: Map<EntityActorRowRef, EntityActorRowRef>,
): EntityActorRowRef => {
  const clone = clones.get(row);
  if (clone) return clone;

  const next = { ...row };
  clones.set(row, next);
  return next;
};

const cloneActorRowRefsByEntity = (
  value: readonly EntityActorRowRef[][],
  clones: Map<EntityActorRowRef, EntityActorRowRef>,
): EntityActorRowRef[][] => value.map((rows) => rows.map((row) => cloneActorRowRef(row, clones)));

const cloneActorRowRefRecord = (
  value: Record<string, EntityActorRowRef[]>,
  clones: Map<EntityActorRowRef, EntityActorRowRef>,
): Record<string, EntityActorRowRef[]> =>
  Object.assign(
    Object.create(null) as Record<string, EntityActorRowRef[]>,
    Object.fromEntries(Object.entries(value).map(([key, rows]) => [key, rows.map((row) => cloneActorRowRef(row, clones))])),
  );

const cloneColumn = (column: EntityColumn): EntityColumn =>
  Array.isArray(column) ? column.slice() : (column.slice() as EntityColumn);

const cloneColumns = (columns: Record<string, EntityColumn>): Record<string, EntityColumn> =>
  Object.fromEntries(Object.entries(columns).map(([name, column]) => [name, cloneColumn(column)]));

const snapshotEntityStore = (store: EntityStore): EntityStoreMutationSnapshot => ({
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

const snapshotActorStore = (store: ColumnarActorStore): ActorStoreMutationSnapshot => ({
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

export const snapshotRuntimeMutation = (runtime: EntityRuntimeState): RuntimeMutationSnapshot => {
  const rowRefClones = new Map<EntityActorRowRef, EntityActorRowRef>();

  return {
    entityStore: snapshotEntityStore(runtime.entityStore),
    actorStores: Object.fromEntries(
      Object.entries(runtime.actorStores).map(([templateKey, store]) => [templateKey, snapshotActorStore(store)]),
    ),
    actorRowsByEntity: cloneActorRowRefsByEntity(runtime.actorRowsByEntity, rowRefClones),
    actorRowsByGroupTag: cloneActorRowRefRecord(runtime.actorRowsByGroupTag, rowRefClones),
  };
};

const restoreEntityStore = (store: EntityStore, snapshot: EntityStoreMutationSnapshot): void => {
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

const restoreActorStore = (store: ColumnarActorStore, snapshot: ActorStoreMutationSnapshot): void => {
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
  rebuildActorAcceptStateBuckets(store);
  store.columns = snapshot.columns;
  rebindActorReducerSelf(store);
  store.publicSlice = snapshot.publicSlice;
};

export const restoreRuntimeMutation = (runtime: EntityRuntimeState, snapshot: RuntimeMutationSnapshot): void => {
  restoreEntityStore(runtime.entityStore, snapshot.entityStore);
  for (const [templateKey, storeSnapshot] of Object.entries(snapshot.actorStores)) {
    restoreActorStore(runtime.actorStores[templateKey], storeSnapshot);
  }
  runtime.actorRowsByEntity = snapshot.actorRowsByEntity;
  runtime.actorRowsByGroupTag = snapshot.actorRowsByGroupTag;
};
