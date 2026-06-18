import { LiteFsmError } from "@lite-fsm/core";
import type { MachineStore, StorageManagerContext, StorageTemplate } from "@lite-fsm/core";

import { runtimeError } from "../internal";
import type { EntityIndex } from "../plugin";
import {
  assignActorSelfFields,
  createActorSelf,
  createEntityAccess,
  rebindEntityStoreView,
  type EntityAccess,
} from "./access";
import { compileEntityRuntimeMetadata, ENTITY_INIT_STATE_CODE, type EntityTemplateMetadata } from "./compile";
import { createEmptyColumn, growColumn, growInt16, growInt32, growUint8, growUint32 } from "./columns";
import { createScratchByState, refreshActorPublicSlice } from "./runtime-index";
import type {
  ColumnarActorStore,
  EntityActorRowRef,
  EntityColumn,
  EntityReducerSelfCache,
  EntityRuntimeState,
  EntityStore,
} from "./store-types";

// Entrypoint модуля `state`: владелец жизненного цикла EntityRuntimeState (создание,
// реестр по менеджеру, рост ёмкости, привязка reducer self). Низкоуровневые слои
// вынесены в отдельные модули и реэкспортируются ниже, чтобы остальной рантайм и тесты
// импортировали единый `./state`.
export type {
  ColumnarActorStore,
  EntityActorRowRef,
  EntityColumn,
  EntityReducerSelfCache,
  EntityRuntimeState,
  EntityStore,
} from "./store-types";
export { getInitialColumnValue } from "./columns";
export {
  addActorRowOwnership,
  addEntityToGroupBucket,
  clearPendingPrevStateCodeSync,
  createPublicInitialState,
  moveActorStateBucket,
  moveActorStateBucketBatch,
  rebuildActorAcceptStateBuckets,
  rebuildEntityRuntimeIndexes,
  refreshActorPublicSlice,
  removeActorRowsForStore,
  removeEntityRecords,
  restorePublicSlices,
  schedulePresentPrevStateCodeSync,
  schedulePrevStateCodeSync,
  schedulePrevStateCodeSyncRow,
  syncPendingPrevStateCode,
} from "./runtime-index";
export {
  compileEntityTemplate,
  ENTITY_INIT_STATE,
  ENTITY_INIT_STATE_CODE,
  getEntityStateCode,
  getEntityStateName,
} from "./compile";

const runtimeByManager = new WeakMap<object, EntityRuntimeState>();

const resourceConfigError = (templateKey: string, resourceKey: string, reason: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CONFIG",
    `[lite-fsm/entities] machine '${templateKey}' resource '${resourceKey}' ${reason}.`,
  );

const isPromise = (value: unknown): value is Promise<unknown> => value instanceof Promise;

const createActorReducerSelf = (entityStore: EntityStore, store: ColumnarActorStore): EntityReducerSelfCache =>
  createActorSelf(store, {
    indices: [],
    has(entity: EntityIndex) {
      return store.presence[entity] === 1;
    },
    entityId(entity: EntityIndex) {
      const id = entityStore.ids[entity];
      if (id !== undefined) return id;
      throw runtimeError(`unknown entity index ${entity}`);
    },
  }) as EntityReducerSelfCache;

export const rebindActorReducerSelf = (store: ColumnarActorStore): void => {
  assignActorSelfFields(store.reducerSelf, store);
};

export const getActorReducerSelf = (
  store: ColumnarActorStore,
  indices: readonly EntityIndex[],
): EntityReducerSelfCache => {
  store.reducerSelf.indices = indices;
  return store.reducerSelf;
};

const createResourceValues = (
  metadata: EntityTemplateMetadata,
): { readonly resources: Record<string, unknown>; readonly resourceViews: Record<string, unknown> } => {
  const resources = Object.create(null) as Record<string, unknown>;
  const resourceViews = Object.create(null) as Record<string, unknown>;

  for (const [name, descriptor] of Object.entries(metadata.resourceSchema)) {
    const resource = descriptor.factory();
    if (isPromise(resource)) {
      throw resourceConfigError(
        metadata.templateKey,
        name,
        "factory returned a Promise; resource factories are sync-only",
      );
    }

    resources[name] = resource;

    if (!descriptor.exposed) continue;

    const expose = descriptor.expose as (resource: unknown) => unknown;
    const view = expose(resource);
    if (isPromise(view)) {
      throw resourceConfigError(
        metadata.templateKey,
        name,
        "expose returned a Promise; resource expose functions are sync-only",
      );
    }

    resourceViews[name] = view;
  }

  return { resources, resourceViews };
};

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

const createColumnarActorStore = (metadata: EntityTemplateMetadata, entityStore: EntityStore): ColumnarActorStore => {
  const columns = Object.fromEntries(
    Object.entries(metadata.initialContext).map(([name, descriptor]) => [
      name,
      createEmptyColumn(descriptor),
    ]),
  ) as Record<string, EntityColumn>;
  const resourceValues = createResourceValues(metadata);
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
    pendingPrevStateCodeSync: [],
    pendingPrevStateCodeSyncMark: new Uint32Array(0),
    pendingPrevStateCodeSyncToken: 1,
    routingScratchVersion: 0,
    acceptStateBucketsByEventCode: [],
    columns,
    resources: resourceValues.resources,
    resourceViews: resourceValues.resourceViews,
    reducerSelf: undefined as unknown as EntityReducerSelfCache,
    publicSlice: { storage: "entity", version: 0, count: 0, capacity: 0 },
  };

  store.reducerSelf = createActorReducerSelf(entityStore, store);
  store.acceptStateBucketsByEventCode = metadata.acceptStateCodesByEventCode.map((stateCodes) =>
    stateCodes.flatMap((stateCode) => (stateCode >= 0 ? [store.stateBuckets[stateCode]] : [])),
  );
  refreshActorPublicSlice(store);
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
    const store = createColumnarActorStore(metadata, runtime.entityStore);
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
  store.pendingPrevStateCodeSyncMark = growUint32(store.pendingPrevStateCodeSyncMark, capacity);

  for (const [name, descriptor] of Object.entries(store.metadata.initialContext)) {
    store.columns[name] = growColumn(store.columns[name], descriptor, capacity);
  }
  rebindActorReducerSelf(store);
  rebindEntityStoreView(store);
};
