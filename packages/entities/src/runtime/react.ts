import { LiteFsmError } from "@lite-fsm/core";
import type { MachineStore } from "@lite-fsm/core";

import type { EntityId, EntityIndex } from "../plugin";
import type { EntityActorKey, EntityContextFor, EntityStateFor } from "./access";
import {
  importEntitySnapshotPreview,
  type ImportedActorStore,
  type ImportedEntityStore,
  type ImportedRuntime,
} from "./snapshot";
import type { ColumnarActorStore, EntityColumn, EntityRuntimeState, EntityStore } from "./state";

export type EntityRowSnapshot<Context, State extends string = string> = {
  readonly entityId: EntityId;
  readonly groupTag: string;
  readonly state: State;
  readonly context: Context;
};

export type EntityListOptions = {
  readonly groupTag?: string;
};

export type TypedUseEntitySnapshotHook<AppMachines extends MachineStore> = <
  Key extends EntityActorKey<AppMachines>,
>(
  templateKey: Key,
  entityId: EntityId | null | undefined,
) => EntityRowSnapshot<EntityContextFor<AppMachines, Key>, EntityStateFor<AppMachines, Key>> | undefined;

export type TypedUseEntityCountHook<AppMachines extends MachineStore> = <
  Key extends EntityActorKey<AppMachines>,
>(
  templateKey: Key,
  options?: EntityListOptions,
) => number;

export type TypedUseEntityListHook<AppMachines extends MachineStore> = <
  Key extends EntityActorKey<AppMachines>,
>(
  templateKey: Key,
  options?: EntityListOptions,
) => readonly EntityId[];

type EntityReadActorStore = Pick<
  ColumnarActorStore | ImportedActorStore,
  "columns" | "count" | "presence" | "rowVersion" | "stateCode" | "version"
>;

type EntityReadStore = Pick<
  EntityStore | ImportedEntityStore,
  "alive" | "generation" | "groupTagByIndex" | "ids" | "version"
>;

type RowCacheEntry = {
  readonly entity: EntityIndex;
  readonly generation: number;
  readonly rowVersion: number;
  readonly snapshot: EntityRowSnapshot<Record<string, unknown>, string>;
};

type ListCacheEntry = {
  readonly ids: readonly EntityId[];
};

type EntityReadCache = {
  readonly rows: Map<string, RowCacheEntry>;
  readonly lists: Map<string, ListCacheEntry>;
};

type PreviewReadState = {
  readonly imported: ImportedRuntime;
  readonly indexById: Record<string, EntityIndex>;
  readonly cache: EntityReadCache;
};

type EntityReadSource = {
  readonly entityStore: EntityReadStore;
  readonly actorStores: Record<string, EntityReadActorStore>;
  readonly indexById: Record<string, EntityIndex>;
  readonly cache: EntityReadCache;
};

export type EntityReadMode =
  | { readonly mode: "commit" }
  | { readonly mode: "preview"; readonly snapshot: unknown };

export type EntityReactRuntime = {
  readRow(
    templateKey: string,
    entityId: EntityId | null | undefined,
    mode: EntityReadMode,
  ): EntityRowSnapshot<Record<string, unknown>, string> | undefined;
  readCount(templateKey: string, options: EntityListOptions | undefined, mode: EntityReadMode): number;
  readList(templateKey: string, options: EntityListOptions | undefined, mode: EntityReadMode): readonly EntityId[];
};

const EMPTY_ENTITY_ID_LIST: readonly EntityId[] = Object.freeze([]);

const createReadCache = (): EntityReadCache => ({
  rows: new Map(),
  lists: new Map(),
});

const entityReactError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_STORAGE_RUNTIME", `[lite-fsm/entities/react] ${reason}.`);

const getKnownStore = (runtime: EntityRuntimeState, templateKey: string): ColumnarActorStore => {
  const store = runtime.actorStores[templateKey];
  if (store) return store;

  throw entityReactError(`unknown entity actor template '${templateKey}'`);
};

const assertGroupTag = (options: EntityListOptions | undefined): string | undefined => {
  const groupTag = options?.groupTag;
  if (groupTag === undefined) return undefined;
  if (typeof groupTag === "string") return groupTag;

  throw entityReactError("EntityListOptions.groupTag must be a string");
};

const createPreviewIndex = (store: ImportedEntityStore): Record<string, EntityIndex> => {
  const indexById = Object.create(null) as Record<string, EntityIndex>;
  for (let entity = 0; entity < store.alive.length; entity += 1) {
    if (store.alive[entity] === 1) indexById[store.ids[entity]] = entity as EntityIndex;
  }
  return indexById;
};

const rowCacheKey = (templateKey: string, entityId: EntityId): string => `${templateKey}\u0000${entityId}`;

const listCacheKey = (templateKey: string, groupTag: string | undefined): string =>
  groupTag === undefined ? templateKey : `${templateKey}\u0000${groupTag}`;

const arraysEqual = (left: readonly EntityId[], right: readonly EntityId[]): boolean => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const readColumnValue = (column: EntityColumn, entity: EntityIndex): unknown =>
  (column as Record<number, unknown>)[entity];

const buildContext = (
  template: ColumnarActorStore,
  store: EntityReadActorStore,
  entity: EntityIndex,
): Record<string, unknown> => {
  const context: Record<string, unknown> = {};
  for (const name of Object.keys(template.metadata.initialContext)) {
    context[name] = readColumnValue(store.columns[name] as EntityColumn, entity);
  }
  return context;
};

const readPublicState = (template: ColumnarActorStore, store: EntityReadActorStore, entity: EntityIndex): string => {
  const state = template.metadata.publicStates[store.stateCode[entity]];
  if (state !== undefined) return state;

  throw entityReactError(
    `actor '${template.templateKey}' row for entity '${entity}' has no public state snapshot`,
  );
};

const readRowFromSource = (
  runtime: EntityRuntimeState,
  source: EntityReadSource,
  templateKey: string,
  entityId: EntityId | null | undefined,
): EntityRowSnapshot<Record<string, unknown>, string> | undefined => {
  getKnownStore(runtime, templateKey);
  if (entityId === null || entityId === undefined) return undefined;

  const entity = source.indexById[entityId];
  if (entity === undefined) return undefined;
  const store = source.actorStores[templateKey];
  if (store.presence[entity] !== 1) return undefined;

  const generation = source.entityStore.generation[entity];
  const rowVersion = store.rowVersion[entity];
  const cacheKey = rowCacheKey(templateKey, entityId);
  const cached = source.cache.rows.get(cacheKey);
  if (cached?.entity === entity && cached.generation === generation && cached.rowVersion === rowVersion) {
    return cached.snapshot;
  }

  const template = getKnownStore(runtime, templateKey);
  const snapshot = {
    entityId,
    groupTag: source.entityStore.groupTagByIndex[entity],
    state: readPublicState(template, store, entity),
    context: buildContext(template, store, entity),
  };
  source.cache.rows.set(cacheKey, { entity, generation, rowVersion, snapshot });
  return snapshot;
};

const readIdsFromSource = (
  runtime: EntityRuntimeState,
  source: EntityReadSource,
  templateKey: string,
  groupTag: string | undefined,
): readonly EntityId[] => {
  getKnownStore(runtime, templateKey);
  const store = source.actorStores[templateKey];
  if (store.count === 0) return EMPTY_ENTITY_ID_LIST;

  const ids: EntityId[] = [];
  for (let entity = 0; entity < store.presence.length; entity += 1) {
    if (store.presence[entity] !== 1) continue;
    if (groupTag !== undefined && source.entityStore.groupTagByIndex[entity] !== groupTag) continue;
    ids.push(source.entityStore.ids[entity]);
  }

  if (ids.length === 0) return EMPTY_ENTITY_ID_LIST;

  const cacheKey = listCacheKey(templateKey, groupTag);
  const cached = source.cache.lists.get(cacheKey);
  if (cached && arraysEqual(cached.ids, ids)) return cached.ids;

  source.cache.lists.set(cacheKey, { ids });
  return ids;
};

export const createEntityReactRuntime = (runtime: EntityRuntimeState): EntityReactRuntime => {
  const committedCache = createReadCache();
  const previewCache = new WeakMap<object, PreviewReadState>();

  const readPreview = (snapshot: unknown): PreviewReadState => {
    if (snapshot !== null && (typeof snapshot === "object" || typeof snapshot === "function")) {
      const cached = previewCache.get(snapshot);
      if (cached) return cached;

      const imported = importEntitySnapshotPreview(runtime, snapshot);
      const preview = {
        imported,
        indexById: createPreviewIndex(imported.entityStore),
        cache: createReadCache(),
      };
      previewCache.set(snapshot, preview);
      return preview;
    }

    const imported = importEntitySnapshotPreview(runtime, snapshot);
    return {
      imported,
      indexById: createPreviewIndex(imported.entityStore),
      cache: createReadCache(),
    };
  };

  const resolveSource = (mode: EntityReadMode): EntityReadSource => {
    if (mode.mode === "commit") {
      return {
        entityStore: runtime.entityStore,
        actorStores: runtime.actorStores,
        indexById: runtime.entityStore.indexById,
        cache: committedCache,
      };
    }

    const preview = readPreview(mode.snapshot);
    return {
      entityStore: preview.imported.entityStore,
      actorStores: preview.imported.actorStores,
      indexById: preview.indexById,
      cache: preview.cache,
    };
  };

  return {
    readRow(templateKey, entityId, mode) {
      return readRowFromSource(runtime, resolveSource(mode), templateKey, entityId);
    },
    readCount(templateKey, options, mode) {
      const groupTag = assertGroupTag(options);
      return readIdsFromSource(runtime, resolveSource(mode), templateKey, groupTag).length;
    },
    readList(templateKey, options, mode) {
      const groupTag = assertGroupTag(options);
      return readIdsFromSource(runtime, resolveSource(mode), templateKey, groupTag);
    },
  };
};

export type EntityHookRowSnapshot<
  AppMachines extends MachineStore,
  Key extends EntityActorKey<AppMachines>,
> = EntityRowSnapshot<EntityContextFor<AppMachines, Key>, EntityStateFor<AppMachines, Key>>;
