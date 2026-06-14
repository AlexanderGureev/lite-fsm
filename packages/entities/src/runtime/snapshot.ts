import { LiteFsmError } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import {
  ENTITY_CANCELLED_STATE_CODE,
  ENTITY_INIT_STATE_CODE,
  ENTITY_REJECTED_STATE_CODE,
  ENTITY_RESOLVED_STATE_CODE,
} from "./compile";
import {
  rebuildEntityRuntimeIndexes,
  rebindActorReducerSelf,
  restorePublicSlices,
  type ColumnarActorStore,
  type EntityColumn,
  type EntityRuntimeState,
  type EntityStore,
  getInitialColumnValue,
} from "./state";

type EntityColumnKind = "f32" | "i16" | "i32" | "u8" | "string";

export type EntityStoreSnapshot = {
  readonly count: number;
  readonly capacity: number;
  readonly ids: readonly string[];
  readonly alive: readonly number[];
  readonly generation?: readonly number[];
  readonly groupTagByIndex: readonly string[];
  readonly freeList?: readonly number[];
  readonly version: number;
};

export type EntityActorSnapshot = {
  readonly schema: {
    readonly states: readonly string[];
    readonly columns: Readonly<Record<string, EntityColumnKind>>;
  };
  readonly count: number;
  readonly capacity: number;
  readonly version: number;
  readonly presence: readonly number[];
  readonly stateCode: readonly number[];
  readonly prevStateCode: readonly number[];
  readonly rowVersion?: readonly number[];
  readonly columns: Readonly<Record<string, readonly unknown[]>>;
};

export type EntitySnapshot = {
  readonly formatVersion: 1;
  readonly entityStore: EntityStoreSnapshot;
  readonly actors: Readonly<Record<string, EntityActorSnapshot>>;
};

export type ImportedEntityStore = {
  readonly count: number;
  readonly capacity: number;
  readonly ids: string[];
  readonly alive: Uint8Array;
  readonly generation: Uint32Array;
  readonly groupTagByIndex: string[];
  readonly freeList: EntityIndex[];
  readonly version: number;
};

export type ImportedActorStore = {
  readonly capacity: number;
  readonly count: number;
  readonly version: number;
  readonly presence: Uint8Array;
  readonly stateCode: Int16Array;
  readonly prevStateCode: Int16Array;
  readonly rowVersion: Uint32Array;
  readonly columns: Record<string, EntityColumn>;
};

export type ImportedRuntime = {
  readonly entityStore: ImportedEntityStore;
  readonly actorStores: Record<string, ImportedActorStore>;
};

type EntityDehydrateContext = {
  readonly options?: { readonly machines?: readonly string[] } | undefined;
};

type EntityHydrateContext = {
  readonly machines: Readonly<Record<string, unknown>>;
  readonly snapshot: EntitySnapshot | undefined;
  readonly baseState: Record<string, unknown>;
  readonly mode: "preview" | "commit" | "init";
};

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const invalidSnapshot = (reason: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_HYDRATION_ENVELOPE",
    `[lite-fsm/entities] hydrate: invalid snapshot.storage.entity: ${reason}.`,
  );

const assertObject = (path: string, value: unknown): Record<string, unknown> => {
  if (isObjectRecord(value)) return value;
  throw invalidSnapshot(`${path} must be an object`);
};

const assertArray = (path: string, value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  throw invalidSnapshot(`${path} must be an array`);
};

const assertLength = (path: string, value: readonly unknown[], expected: number): void => {
  if (value.length === expected) return;
  throw invalidSnapshot(`${path} length ${value.length} does not match capacity ${expected}`);
};

const readInteger = (path: string, value: unknown): number => {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw invalidSnapshot(`${path} must be an integer`);
};

const readNonNegativeInteger = (path: string, value: unknown): number => {
  const integer = readInteger(path, value);
  if (integer >= 0) return integer;
  throw invalidSnapshot(`${path} must be a non-negative integer`);
};

const assertUint32 = (path: string, value: number): number => {
  if (value <= 0xffffffff) return value;
  throw invalidSnapshot(`${path} must fit Uint32`);
};

const readUint32Array = (path: string, value: unknown, length: number): Uint32Array => {
  const source = assertArray(path, value);
  assertLength(path, source, length);
  const result = new Uint32Array(length);

  for (let index = 0; index < length; index += 1) {
    result[index] = assertUint32(`${path}[${index}]`, readNonNegativeInteger(`${path}[${index}]`, source[index]));
  }

  return result;
};

const readBinaryArray = (path: string, value: unknown, length: number): Uint8Array => {
  const source = assertArray(path, value);
  assertLength(path, source, length);
  const result = new Uint8Array(length);

  for (let index = 0; index < length; index += 1) {
    const item = readInteger(`${path}[${index}]`, source[index]);
    if (item !== 0 && item !== 1) throw invalidSnapshot(`${path}[${index}] must be 0 or 1`);
    result[index] = item;
  }

  return result;
};

const readInt16Array = (path: string, value: unknown, length: number): Int16Array => {
  const source = assertArray(path, value);
  assertLength(path, source, length);
  const result = new Int16Array(length);

  for (let index = 0; index < length; index += 1) {
    const item = readInteger(`${path}[${index}]`, source[index]);
    if (item < -32768 || item > 32767) throw invalidSnapshot(`${path}[${index}] must fit Int16`);
    result[index] = item;
  }

  return result;
};

const readStringArray = (path: string, value: unknown, length: number): string[] => {
  const source = assertArray(path, value);
  assertLength(path, source, length);
  return source.map((item, index) => {
    if (typeof item === "string") return item;
    throw invalidSnapshot(`${path}[${index}] must be a string`);
  });
};

const readFreeList = (value: unknown, alive: Uint8Array): EntityIndex[] => {
  const source = assertArray("entityStore.freeList", value);
  const seen = new Set<number>();
  const result: EntityIndex[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const entity = readNonNegativeInteger(`entityStore.freeList[${index}]`, source[index]);
    if (entity >= alive.length) throw invalidSnapshot(`entityStore.freeList[${index}] is out of range`);
    if (alive[entity] === 1) throw invalidSnapshot(`entityStore.freeList[${index}] points to a live entity`);
    if (seen.has(entity)) throw invalidSnapshot(`entityStore.freeList contains duplicate entity index ${entity}`);
    seen.add(entity);
    result.push(entity as EntityIndex);
  }

  for (let entity = 0; entity < alive.length; entity += 1) {
    if (alive[entity] === 0 && !seen.has(entity)) {
      throw invalidSnapshot(`entityStore.freeList is missing dead entity index ${entity}`);
    }
  }

  return result;
};

const rebuildFreeList = (alive: Uint8Array): EntityIndex[] => {
  const freeList: EntityIndex[] = [];
  for (let entity = 0; entity < alive.length; entity += 1) {
    if (alive[entity] === 0) freeList.push(entity as EntityIndex);
  }
  return freeList;
};

const validateEntityRows = (
  count: number,
  ids: readonly string[],
  alive: Uint8Array,
  groupTagByIndex: readonly string[],
): void => {
  const liveIds = new Set<string>();
  let liveCount = 0;

  for (let entity = 0; entity < alive.length; entity += 1) {
    if (alive[entity] !== 1) continue;

    const id = ids[entity];
    const groupTag = groupTagByIndex[entity];
    if (id.length === 0) throw invalidSnapshot(`entityStore.ids[${entity}] must be non-empty for a live entity`);
    if (groupTag.length === 0) {
      throw invalidSnapshot(`entityStore.groupTagByIndex[${entity}] must be non-empty for a live entity`);
    }
    if (liveIds.has(id)) throw invalidSnapshot(`entityStore.ids contains duplicate live id '${id}'`);
    liveIds.add(id);
    liveCount += 1;
  }

  if (count !== liveCount) {
    throw invalidSnapshot(`entityStore.count ${count} does not match live entity count ${liveCount}`);
  }
};

const freshEntityStoreVersion = (current: number, remote: number): number =>
  assertUint32("entityStore.version", Math.max(current, remote) + 1);

const importEntityStore = (snapshot: Record<string, unknown>, current: EntityStore): ImportedEntityStore => {
  const entityStore = assertObject("entityStore", snapshot.entityStore);
  const capacity = readNonNegativeInteger("entityStore.capacity", entityStore.capacity);
  const count = readNonNegativeInteger("entityStore.count", entityStore.count);
  if (count > capacity) throw invalidSnapshot("entityStore.count cannot exceed capacity");

  const ids = readStringArray("entityStore.ids", entityStore.ids, capacity);
  const alive = readBinaryArray("entityStore.alive", entityStore.alive, capacity);
  const groupTagByIndex = readStringArray("entityStore.groupTagByIndex", entityStore.groupTagByIndex, capacity);
  const hasGeneration = hasOwn(entityStore, "generation") && entityStore.generation !== undefined;
  const generation = hasGeneration ? readUint32Array("entityStore.generation", entityStore.generation, capacity) : new Uint32Array(capacity);
  const freeList = hasGeneration ? readFreeList(entityStore.freeList, alive) : rebuildFreeList(alive);
  const version = freshEntityStoreVersion(
    current.version,
    assertUint32("entityStore.version", readNonNegativeInteger("entityStore.version", entityStore.version)),
  );

  validateEntityRows(count, ids, alive, groupTagByIndex);
  return { count, capacity, ids, alive, generation, groupTagByIndex, freeList, version };
};

const descriptorKind = (descriptor: unknown): EntityColumnKind => (descriptor as { readonly kind: EntityColumnKind }).kind;

const columnKindsFor = (store: ColumnarActorStore): Record<string, EntityColumnKind> =>
  Object.fromEntries(
    Object.entries(store.metadata.initialContext).map(([name, descriptor]) => [name, descriptorKind(descriptor)]),
  );

const assertSameKeys = (path: string, actual: readonly string[], expected: readonly string[]): void => {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (actualSorted.length !== expectedSorted.length) {
    throw invalidSnapshot(`${path} keys do not match current entity schema`);
  }

  for (let index = 0; index < actualSorted.length; index += 1) {
    if (actualSorted[index] !== expectedSorted[index]) {
      throw invalidSnapshot(`${path} keys do not match current entity schema`);
    }
  }
};

const validateActorSchema = (store: ColumnarActorStore, snapshot: Record<string, unknown>): void => {
  const schema = assertObject(`actors.${store.templateKey}.schema`, snapshot.schema);
  const states = readStringArray(
    `actors.${store.templateKey}.schema.states`,
    schema.states,
    store.metadata.publicStates.length,
  );
  for (let index = 0; index < states.length; index += 1) {
    if (states[index] !== store.metadata.publicStates[index]) {
      throw invalidSnapshot(`actors.${store.templateKey}.schema.states do not match current entity schema`);
    }
  }

  const columns = assertObject(`actors.${store.templateKey}.schema.columns`, schema.columns);
  const currentColumns = columnKindsFor(store);
  assertSameKeys(`actors.${store.templateKey}.schema.columns`, Object.keys(columns), Object.keys(currentColumns));
  for (const [name, kind] of Object.entries(currentColumns)) {
    if (columns[name] !== kind) {
      throw invalidSnapshot(`actors.${store.templateKey}.schema.columns.${name} does not match current entity schema`);
    }
  }
};

const isValidStateCode = (store: ColumnarActorStore, code: number): boolean =>
  code === ENTITY_INIT_STATE_CODE ||
  code === ENTITY_RESOLVED_STATE_CODE ||
  code === ENTITY_REJECTED_STATE_CODE ||
  code === ENTITY_CANCELLED_STATE_CODE ||
  (code >= 0 && code < store.metadata.publicStates.length);

const isTerminalStateCode = (code: number): boolean =>
  code === ENTITY_RESOLVED_STATE_CODE || code === ENTITY_REJECTED_STATE_CODE || code === ENTITY_CANCELLED_STATE_CODE;

const validateStateCodes = (store: ColumnarActorStore, field: string, values: Int16Array): void => {
  for (let entity = 0; entity < values.length; entity += 1) {
    if (isValidStateCode(store, values[entity])) continue;
    throw invalidSnapshot(`actors.${store.templateKey}.${field}[${entity}] has unknown stateCode ${values[entity]}`);
  }
};

const validatePresentStateCodes = (store: ColumnarActorStore, presence: Uint8Array, stateCode: Int16Array): void => {
  for (let entity = 0; entity < presence.length; entity += 1) {
    if (presence[entity] !== 1 || !isTerminalStateCode(stateCode[entity])) continue;
    throw invalidSnapshot(
      `actors.${store.templateKey}.stateCode[${entity}] cannot be a terminal stateCode for a present row`,
    );
  }
};

const readNumberColumnValue = (path: string, kind: Exclude<EntityColumnKind, "string">, value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidSnapshot(`${path} must be a finite number`);
  }
  if (kind === "f32") return value;
  if (!Number.isInteger(value)) throw invalidSnapshot(`${path} must be an integer`);
  if (kind === "i16" && (value < -32768 || value > 32767)) throw invalidSnapshot(`${path} must fit Int16`);
  if (kind === "i32" && (value < -2147483648 || value > 2147483647)) {
    throw invalidSnapshot(`${path} must fit Int32`);
  }
  if (kind === "u8" && (value < 0 || value > 255)) throw invalidSnapshot(`${path} must fit Uint8`);
  return value;
};

const createNumericColumn = (
  kind: Exclude<EntityColumnKind, "string">,
  values: readonly number[],
): Float32Array | Int16Array | Int32Array | Uint8Array => {
  if (kind === "f32") return Float32Array.from(values);
  if (kind === "i16") return Int16Array.from(values);
  if (kind === "i32") return Int32Array.from(values);
  return Uint8Array.from(values);
};

const readColumn = (
  path: string,
  kind: EntityColumnKind,
  value: unknown,
  length: number,
): EntityColumn => {
  const source = assertArray(path, value);
  assertLength(path, source, length);

  if (kind === "string") {
    return source.map((item, index) => {
      if (typeof item === "string") return item;
      throw invalidSnapshot(`${path}[${index}] must be a string`);
    });
  }

  return createNumericColumn(
    kind,
    source.map((item, index) => readNumberColumnValue(`${path}[${index}]`, kind, item)),
  );
};

const assertActorStorePresence = (
  store: ColumnarActorStore,
  entityStore: ImportedEntityStore,
  presence: Uint8Array,
): number => {
  let count = 0;
  for (let entity = 0; entity < presence.length; entity += 1) {
    if (presence[entity] !== 1) continue;
    if (entityStore.alive[entity] !== 1) {
      throw invalidSnapshot(`actors.${store.templateKey}.presence[${entity}] points to a missing entity`);
    }
    count += 1;
  }
  return count;
};

const freshVersion = (current: number, remote: number, remoteRows: Uint32Array | undefined): number => {
  let next = Math.max(current, remote);
  if (remoteRows) {
    for (let index = 0; index < remoteRows.length; index += 1) {
      if (remoteRows[index] > next) next = remoteRows[index];
    }
  }
  return assertUint32("actor.version", next + 1);
};

const importActorStore = (
  store: ColumnarActorStore,
  snapshot: unknown,
  entityStore: ImportedEntityStore,
): ImportedActorStore => {
  const actor = assertObject(`actors.${store.templateKey}`, snapshot);
  validateActorSchema(store, actor);

  const capacity = readNonNegativeInteger(`actors.${store.templateKey}.capacity`, actor.capacity);
  if (capacity > entityStore.capacity) {
    throw invalidSnapshot(`actors.${store.templateKey}.capacity cannot exceed entityStore.capacity`);
  }
  const count = readNonNegativeInteger(`actors.${store.templateKey}.count`, actor.count);
  if (count > capacity) throw invalidSnapshot(`actors.${store.templateKey}.count cannot exceed capacity`);

  const presence = readBinaryArray(`actors.${store.templateKey}.presence`, actor.presence, capacity);
  const presentCount = assertActorStorePresence(store, entityStore, presence);
  if (count !== presentCount) {
    throw invalidSnapshot(`actors.${store.templateKey}.count ${count} does not match present row count ${presentCount}`);
  }

  const stateCode = readInt16Array(`actors.${store.templateKey}.stateCode`, actor.stateCode, capacity);
  const prevStateCode = readInt16Array(`actors.${store.templateKey}.prevStateCode`, actor.prevStateCode, capacity);
  validateStateCodes(store, "stateCode", stateCode);
  validateStateCodes(store, "prevStateCode", prevStateCode);
  validatePresentStateCodes(store, presence, stateCode);

  const remoteRowVersion = hasOwn(actor, "rowVersion") && actor.rowVersion !== undefined
    ? readUint32Array(`actors.${store.templateKey}.rowVersion`, actor.rowVersion, capacity)
    : undefined;
  const version = freshVersion(
    store.version,
    assertUint32(`actors.${store.templateKey}.version`, readNonNegativeInteger(`actors.${store.templateKey}.version`, actor.version)),
    remoteRowVersion,
  );
  const rowVersion = new Uint32Array(capacity);
  for (let entity = 0; entity < capacity; entity += 1) {
    if (presence[entity] === 1) rowVersion[entity] = version;
  }

  const columnsSnapshot = assertObject(`actors.${store.templateKey}.columns`, actor.columns);
  const currentColumns = columnKindsFor(store);
  assertSameKeys(`actors.${store.templateKey}.columns`, Object.keys(columnsSnapshot), Object.keys(currentColumns));
  const columns = Object.create(null) as Record<string, EntityColumn>;
  for (const [name, kind] of Object.entries(currentColumns)) {
    columns[name] = readColumn(`actors.${store.templateKey}.columns.${name}`, kind, columnsSnapshot[name], capacity);
  }

  return { capacity, count, version, presence, stateCode, prevStateCode, rowVersion, columns };
};

const validateLiveEntitiesHaveRows = (runtime: ImportedRuntime): void => {
  const rowCountByEntity = new Uint8Array(runtime.entityStore.capacity);
  for (const actor of Object.values(runtime.actorStores)) {
    for (let entity = 0; entity < actor.capacity; entity += 1) {
      if (actor.presence[entity] === 1) rowCountByEntity[entity] = 1;
    }
  }

  for (let entity = 0; entity < runtime.entityStore.capacity; entity += 1) {
    if (runtime.entityStore.alive[entity] === 1 && rowCountByEntity[entity] !== 1) {
      throw invalidSnapshot(`entity '${runtime.entityStore.ids[entity]}' has no actor rows`);
    }
  }
};

const importEntitySnapshot = (runtime: EntityRuntimeState, value: unknown): ImportedRuntime => {
  const snapshot = assertObject("storage.entity", value);
  if (snapshot.formatVersion !== 1) throw invalidSnapshot("formatVersion must be 1");

  const entityStore = importEntityStore(snapshot, runtime.entityStore);
  const actors = assertObject("actors", snapshot.actors);
  const currentActorKeys = Object.keys(runtime.actorStores);
  assertSameKeys("actors", Object.keys(actors), currentActorKeys);

  const actorStores = Object.create(null) as Record<string, ImportedActorStore>;
  for (const key of currentActorKeys) {
    actorStores[key] = importActorStore(runtime.actorStores[key], actors[key], entityStore);
  }

  const imported = { entityStore, actorStores };
  validateLiveEntitiesHaveRows(imported);
  return imported;
};

export const importEntitySnapshotPreview = (runtime: EntityRuntimeState, value: unknown): ImportedRuntime =>
  importEntitySnapshot(runtime, value);

const copyStringArray = (value: readonly string[], length: number): string[] =>
  Array.from({ length }, (_, index) => value[index] ?? "");

const serializeEntityStore = (store: EntityStore): EntityStoreSnapshot => ({
  count: store.count,
  capacity: store.capacity,
  ids: copyStringArray(store.ids, store.capacity),
  alive: Array.from(store.alive),
  generation: Array.from(store.generation),
  groupTagByIndex: copyStringArray(store.groupTagByIndex, store.capacity),
  freeList: store.freeList.slice(),
  version: store.version,
});

const serializeColumn = (
  column: EntityColumn,
  capacity: number,
  presence: Uint8Array,
  defaultValue: number | string,
): readonly unknown[] => {
  const serialized = Array.from({ length: capacity }, (_, entity) => {
    if (presence[entity] !== 1) return defaultValue;
    return column[entity] ?? defaultValue;
  });

  return serialized;
};

const serializeActorStore = (store: ColumnarActorStore): EntityActorSnapshot => {
  const columnKinds = columnKindsFor(store);
  return {
    schema: {
      states: store.metadata.publicStates.slice(),
      columns: columnKinds,
    },
    count: store.count,
    capacity: store.capacity,
    version: store.version,
    presence: Array.from(store.presence),
    stateCode: Array.from(store.stateCode),
    prevStateCode: Array.from(store.prevStateCode),
    rowVersion: Array.from(store.rowVersion),
    columns: Object.fromEntries(
      Object.entries(store.columns).map(([name, column]) => [
        name,
        serializeColumn(
          column,
          store.capacity,
          store.presence,
          getInitialColumnValue(store.metadata.initialContext[name]),
        ),
      ]),
    ),
  };
};

const buildPublicSlices = (
  actorStores: Record<string, Pick<ImportedActorStore, "capacity" | "count" | "version">>,
  baseState: Record<string, unknown>,
): Record<string, unknown> => {
  let nextState = baseState;
  for (const [key, store] of Object.entries(actorStores)) {
    const slice = {
      storage: "entity",
      version: store.version,
      count: store.count,
      capacity: store.capacity,
    };
    if (nextState === baseState) nextState = { ...baseState };
    nextState[key] = slice;
  }
  return nextState;
};

const applyEntityStore = (target: EntityStore, source: ImportedEntityStore): void => {
  target.count = source.count;
  target.capacity = source.capacity;
  target.ids = source.ids;
  target.indexById = Object.create(null) as Record<string, EntityIndex>;
  target.alive = source.alive;
  target.generation = source.generation;
  target.groupTagByIndex = source.groupTagByIndex;
  target.entitiesByGroupTag = Object.create(null) as Record<string, EntityIndex[]>;
  target.groupTagPosition = new Int32Array(source.capacity);
  target.groupTagPosition.fill(-1);
  target.freeList = source.freeList;
  target.version = source.version;
};

const applyActorStore = (target: ColumnarActorStore, source: ImportedActorStore): void => {
  target.capacity = source.capacity;
  target.count = source.count;
  target.version = source.version;
  target.presence = source.presence;
  target.stateCode = source.stateCode;
  target.prevStateCode = source.prevStateCode;
  target.rowVersion = source.rowVersion;
  target.columns = source.columns;
  rebindActorReducerSelf(target);
};

const applyImportedRuntime = (runtime: EntityRuntimeState, imported: ImportedRuntime): void => {
  applyEntityStore(runtime.entityStore, imported.entityStore);
  for (const [key, store] of Object.entries(imported.actorStores)) {
    applyActorStore(runtime.actorStores[key], store);
  }
  rebuildEntityRuntimeIndexes(runtime);
};

export const dehydrateEntityRuntime = (
  runtime: EntityRuntimeState,
  ctx: EntityDehydrateContext,
): { readonly machines: Record<string, unknown>; readonly snapshot: EntitySnapshot } => {
  const requestedMachines = ctx.options?.machines;
  const machineKeys = requestedMachines ?? Object.keys(runtime.actorStores);
  const machines = Object.create(null) as Record<string, unknown>;
  for (const key of machineKeys) {
    machines[key] = runtime.actorStores[key].publicSlice;
  }

  return {
    machines,
    snapshot: {
      formatVersion: 1,
      entityStore: serializeEntityStore(runtime.entityStore),
      actors: Object.fromEntries(
        Object.entries(runtime.actorStores).map(([key, store]) => [key, serializeActorStore(store)]),
      ),
    },
  };
};

export const hydrateEntityRuntime = (
  runtime: EntityRuntimeState,
  ctx: EntityHydrateContext,
): { readonly nextState: Record<string, unknown>; readonly changed: boolean } => {
  if (ctx.snapshot === undefined) {
    const nextState = restorePublicSlices(runtime, ctx.baseState);
    return { nextState, changed: nextState !== ctx.baseState };
  }

  const imported = importEntitySnapshot(runtime, ctx.snapshot);
  const nextState =
    ctx.mode === "preview"
      ? buildPublicSlices(imported.actorStores, ctx.baseState)
      : (() => {
          applyImportedRuntime(runtime, imported);
          return restorePublicSlices(runtime, ctx.baseState);
        })();

  return { nextState, changed: ctx.mode !== "preview" || nextState !== ctx.baseState };
};
