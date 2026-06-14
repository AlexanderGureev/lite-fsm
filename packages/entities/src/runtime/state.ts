import type { MachineStore, StorageManagerContext, StorageTemplate } from "@lite-fsm/core";

import { createEntityAccess, type EntityAccess } from "./access";
import {
  compileEntityRuntimeMetadata,
  ENTITY_INIT_STATE_CODE,
  type EntityTemplateMetadata,
} from "./compile";
import type { EntityReactRuntime } from "./react";
import type { EntityIndex } from "../plugin";

type EntityPublicStateSlice = {
  readonly storage: "entity";
  readonly version: number;
  readonly count: number;
  readonly capacity: number;
};

export type EntityColumn = Float32Array | Int16Array | Int32Array | Uint8Array | string[];

type EntityContextDescriptor = {
  readonly kind: "f32" | "i16" | "i32" | "u8" | "string";
  readonly default?: number | string;
};

export type EntityStore = {
  count: number;
  capacity: number;
  ids: string[];
  indexById: Record<string, EntityIndex>;
  alive: Uint8Array;
  generation: Uint32Array;
  groupTagByIndex: string[];
  entitiesByGroupTag: Record<string, EntityIndex[]>;
  groupTagPosition: Int32Array;
  freeList: EntityIndex[];
  version: number;
};

export type EntityActorRowRef = {
  readonly store: ColumnarActorStore;
  readonly entity: EntityIndex;
  readonly groupTag: string;
  entityRowsPosition: number;
  groupRowsPosition: number;
};

export type ColumnarActorStore = {
  readonly templateKey: string;
  readonly metadata: EntityTemplateMetadata;
  capacity: number;
  count: number;
  version: number;
  presence: Uint8Array;
  stateCode: Int16Array;
  prevStateCode: Int16Array;
  rowVersion: Uint32Array;
  stateBuckets: EntityIndex[][];
  statePosition: Int32Array;
  acceptedScratch: EntityIndex[];
  routingScratchVersion: number;
  acceptStateBucketsByEventCode: EntityIndex[][][];
  columns: Record<string, EntityColumn>;
  publicSlice: EntityPublicStateSlice;
};

export type EntityRuntimeState = {
  readonly entityStore: EntityStore;
  readonly actorStores: Record<string, ColumnarActorStore>;
  readonly eventCodeByType: Readonly<Record<string, number>>;
  readonly eventTypesByCode: readonly string[];
  readonly templatesByEventCode: readonly (readonly ColumnarActorStore[])[];
  actorRowsByEntity: EntityActorRowRef[][];
  actorRowsByGroupTag: Record<string, EntityActorRowRef[]>;
  routingScratchVersion: number;
  readonly access: EntityAccess<MachineStore>;
  react?: EntityReactRuntime;
};

const runtimeByManager = new WeakMap<object, EntityRuntimeState>();

export { compileEntityTemplate, ENTITY_INIT_STATE, ENTITY_INIT_STATE_CODE, getEntityStateCode, getEntityStateName } from "./compile";

const emptyColumnFactories = {
  f32: () => new Float32Array(0),
  i16: () => new Int16Array(0),
  i32: () => new Int32Array(0),
  u8: () => new Uint8Array(0),
  string: () => [] as string[],
} as const satisfies Record<EntityContextDescriptor["kind"], () => EntityColumn>;

const createEmptyColumn = (descriptor: EntityContextDescriptor): EntityColumn =>
  emptyColumnFactories[descriptor.kind]();

const growColumn = (column: EntityColumn, descriptor: EntityContextDescriptor, capacity: number): EntityColumn => {
  if (column.length >= capacity) return column;

  if (descriptor.kind === "string") {
    const next = (column as string[]).slice();
    next.length = capacity;
    for (let index = column.length; index < capacity; index += 1) next[index] = "";
    return next;
  }

  const next = emptyColumnFactories[descriptor.kind]() as Float32Array | Int16Array | Int32Array | Uint8Array;
  const grown = new (next.constructor as { new (length: number): typeof next })(capacity);
  grown.set(column as typeof next);
  return grown;
};

const growInt16 = (value: Int16Array, capacity: number, fillValue = 0): Int16Array => {
  if (value.length >= capacity) return value;

  const next = new Int16Array(capacity);
  next.fill(fillValue);
  next.set(value);
  return next;
};

const growInt32 = (value: Int32Array, capacity: number, fillValue = 0): Int32Array => {
  if (value.length >= capacity) return value;

  const next = new Int32Array(capacity);
  next.fill(fillValue);
  next.set(value);
  return next;
};

const growUint8 = (value: Uint8Array, capacity: number): Uint8Array => {
  if (value.length >= capacity) return value;

  const next = new Uint8Array(capacity);
  next.set(value);
  return next;
};

const growUint32 = (value: Uint32Array, capacity: number): Uint32Array => {
  if (value.length >= capacity) return value;

  const next = new Uint32Array(capacity);
  next.set(value);
  return next;
};

const createScratchByState = (states: readonly string[]): EntityIndex[][] => states.map(() => [] as EntityIndex[]);

const createEntityStore = (): EntityStore => ({
  count: 0,
  capacity: 0,
  ids: [],
  indexById: Object.create(null) as Record<string, EntityIndex>,
  alive: new Uint8Array(0),
  generation: new Uint32Array(0),
  groupTagByIndex: [],
  entitiesByGroupTag: Object.create(null) as Record<string, EntityIndex[]>,
  groupTagPosition: new Int32Array(0),
  freeList: [],
  version: 0,
});

const createPublicSlice = (store: Pick<ColumnarActorStore, "capacity" | "count" | "version">): EntityPublicStateSlice => ({
  storage: "entity",
  version: store.version,
  count: store.count,
  capacity: store.capacity,
});

const createColumnarActorStore = (metadata: EntityTemplateMetadata): ColumnarActorStore => {
  const columns = Object.fromEntries(
    Object.entries(metadata.initialContext).map(([name, descriptor]) => [
      name,
      createEmptyColumn(descriptor as EntityContextDescriptor),
    ]),
  ) as Record<string, EntityColumn>;
  const store: ColumnarActorStore = {
    templateKey: metadata.templateKey,
    metadata,
    capacity: 0,
    count: 0,
    version: 0,
    presence: new Uint8Array(0),
    stateCode: new Int16Array(0),
    prevStateCode: new Int16Array(0),
    rowVersion: new Uint32Array(0),
    stateBuckets: createScratchByState(metadata.publicStates),
    statePosition: new Int32Array(0),
    acceptedScratch: [],
    routingScratchVersion: 0,
    acceptStateBucketsByEventCode: [],
    columns,
    publicSlice: { storage: "entity", version: 0, count: 0, capacity: 0 },
  };

  store.acceptStateBucketsByEventCode = metadata.acceptStateCodesByEventCode.map((stateCodes) =>
    stateCodes.flatMap((stateCode) => (stateCode >= 0 ? [store.stateBuckets[stateCode]] : [])),
  );
  store.publicSlice = createPublicSlice(store);
  return store;
};

export const createEntityRuntimeState = (
  templates: readonly StorageTemplate<EntityTemplateMetadata>[],
  manager: StorageManagerContext,
): EntityRuntimeState => {
  const compiled = compileEntityRuntimeMetadata(templates.map((template) => template.data as EntityTemplateMetadata));
  const runtime = {
    entityStore: createEntityStore(),
    actorStores: Object.create(null) as Record<string, ColumnarActorStore>,
    eventCodeByType: compiled.eventCodeByType,
    eventTypesByCode: compiled.eventTypesByCode,
    templatesByEventCode: compiled.eventTypesByCode.map(() => [] as ColumnarActorStore[]),
    actorRowsByEntity: [],
    actorRowsByGroupTag: Object.create(null) as Record<string, EntityActorRowRef[]>,
    routingScratchVersion: 0,
    access: undefined as unknown as EntityAccess<MachineStore>,
  };

  for (const template of templates) {
    const metadata = compiled.metadataByKey[template.key];
    const store = createColumnarActorStore(metadata);
    runtime.actorStores[template.key] = store;
    for (let eventCode = 0; eventCode < metadata.eventAcceptMask.length; eventCode += 1) {
      if (metadata.eventAcceptMask[eventCode] === 1) {
        (runtime.templatesByEventCode[eventCode] as ColumnarActorStore[]).push(store);
      }
    }
  }
  runtime.access = createEntityAccess(runtime);
  runtimeByManager.set(manager, runtime);
  runtimeByManager.set(runtime.access, runtime);

  return runtime;
};

export const getEntityRuntimeState = (manager: object): EntityRuntimeState => {
  const runtime = runtimeByManager.get(manager);
  /* v8 ignore next 7 -- defensive invariant: manager extension is attached after createRuntimeState for installed plugin. */
  if (!runtime) {
    throw new Error("[lite-fsm/entities] entity runtime state is not initialized for this manager.");
  }

  return runtime;
};

export const asEntityRuntimeState = (state: unknown): EntityRuntimeState => state as EntityRuntimeState;

export const ensureEntityCapacity = (store: EntityStore, capacity: number): void => {
  if (store.capacity >= capacity) return;

  store.capacity = capacity;
  store.alive = growUint8(store.alive, capacity);
  store.generation = growUint32(store.generation, capacity);
  store.groupTagPosition = growInt32(store.groupTagPosition, capacity, -1);
};

export const ensureActorCapacity = (store: ColumnarActorStore, capacity: number): void => {
  if (store.capacity >= capacity) return;

  store.capacity = capacity;
  store.presence = growUint8(store.presence, capacity);
  store.stateCode = growInt16(store.stateCode, capacity, ENTITY_INIT_STATE_CODE);
  store.prevStateCode = growInt16(store.prevStateCode, capacity, ENTITY_INIT_STATE_CODE);
  store.rowVersion = growUint32(store.rowVersion, capacity);
  store.statePosition = growInt32(store.statePosition, capacity, -1);

  for (const [name, descriptor] of Object.entries(store.metadata.initialContext)) {
    store.columns[name] = growColumn(store.columns[name], descriptor as EntityContextDescriptor, capacity);
  }
};

export const getInitialColumnValue = (descriptor: EntityContextDescriptor): number | string => {
  if (descriptor.default !== undefined) return descriptor.default;
  return descriptor.kind === "string" ? "" : 0;
};

export const writeInitialColumnValues = (store: ColumnarActorStore, entity: EntityIndex): void => {
  for (const [name, descriptor] of Object.entries(store.metadata.initialContext)) {
    const column = store.columns[name];
    (column as Record<number, number | string>)[entity] = getInitialColumnValue(descriptor as EntityContextDescriptor);
  }
};

export const refreshActorPublicSlice = (store: ColumnarActorStore): void => {
  store.publicSlice = createPublicSlice(store);
};

const rebuildAcceptStateBuckets = (store: ColumnarActorStore): void => {
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
    rebuildAcceptStateBuckets(store);
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
