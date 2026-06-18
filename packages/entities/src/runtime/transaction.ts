import type { AnyEvent, ReadonlyManagerAction } from "@lite-fsm/core";

import { hasOwn, isDev, isPlainObject, runtimeError as storageRuntimeError } from "../internal";
import type { EntityIndex } from "../plugin";
import type { EntitySpawnDescriptor } from "../spawn";
import { hasSpawnRecipe, runSpawnRecipe } from "../spawn";
import type { EntitySpawnSchema } from "../schema";
import type { ColumnarActorStore, EntityActorRowRef, EntityRuntimeState } from "./state";
import {
  readEntityTransitionTraceSession,
  recordEntityTraceCounter,
  recordEntityTracePhase,
  tracePhase,
  type EntityTransitionTraceSession,
} from "./transitionTrace";

type RuntimeCarrier = {
  readonly runtime: Map<string, unknown>;
};

type EntityTransactionScratch = {
  despawnScheduled: Uint8Array;
  readonly despawnScheduledMarks: EntityIndex[];
  readonly despawnRowHintMarksByStoreId: Uint8Array[];
  readonly despawnRowHintBucketStateCodeByStoreId: Int16Array[];
  readonly despawnRowHintMarks: EntityDespawnRowHint[];
  readonly cleanupScratchPool: EntityCleanupScratch[];
  cleanupScratchPoolCursor: number;
  readonly reactionIndexPool: EntityIndex[][];
  reactionIndexPoolCursor: number;
};

export type StagedActorSpawn = {
  readonly templateKey: string;
  readonly payload: Record<string, unknown>;
};

export type StagedEntitySpawn = {
  readonly id: string;
  readonly groupTag: string;
  readonly actors: readonly StagedActorSpawn[];
};

export type EntityDispatchTransaction = {
  // Store versions are monotonic invalidation tokens; exact increments are not a transaction contract.
  readonly runtime: EntityRuntimeState;
  stagedSpawns: readonly StagedEntitySpawn[];
  scheduledDespawns: EntityIndex[];
  despawnScheduled: Uint8Array;
  despawnRowHints: EntityDespawnRowHint[];
  terminalRows: EntityActorTerminalRow[];
  effectBatches: EntityEffectBatch[];
  reactionBatches: EntityReactionBatch[];
};

export type EntityDespawnRowHint = {
  readonly storeId: number;
  readonly entity: EntityIndex;
  readonly bucketStateCode: number;
};

export type EntityActorTerminalRow = {
  readonly store: ColumnarActorStore;
  readonly entity: EntityIndex;
};

export type EntityCleanupRemovalBatch = {
  readonly store: ColumnarActorStore;
  readonly rows: EntityActorRowRef[];
  readonly bucketStateCodes: Array<number | undefined>;
  bucketStateCodesActive: boolean;
};

export type EntityCleanupLifecycleBatch = {
  readonly store: ColumnarActorStore;
  readonly indices: EntityIndex[];
};

export type EntityCleanupScratch = {
  readonly entities: EntityIndex[];
  readonly removalBatchesByStoreId: Array<EntityCleanupRemovalBatch | undefined>;
  readonly removalTouchedStoreIds: number[];
  readonly lifecycleBatchesByStoreId: Array<EntityCleanupLifecycleBatch | undefined>;
  readonly lifecycleTouchedStoreIds: number[];
};

export type EntityEffectBatch = {
  readonly store: ColumnarActorStore;
  readonly stateCode: number;
  readonly indices: readonly EntityIndex[];
  readonly capturedEntries?: readonly CapturedEntityScopeEntry[];
  readonly storeVersion?: number;
  readonly entityStoreVersion?: number;
};

export type EntityReactionBatch = {
  readonly store: ColumnarActorStore;
  readonly eventCode: number;
  readonly ownership: EntityReactionBatchOwnership;
  readonly indices: readonly EntityIndex[];
};

export type CapturedEntityScopeEntry = {
  readonly entity: EntityIndex;
  readonly generation: number;
  readonly id: string;
};

type ExplicitDespawnRequest =
  | { readonly mode: "ids"; readonly ids: readonly string[] }
  | { readonly mode: "scope"; readonly entries: readonly CapturedEntityScopeEntry[] };

export type EntityReactionBatchOwnership = "borrowed" | "owned";

type ScheduleEntityReactionBatchOptions = {
  readonly ownership?: EntityReactionBatchOwnership;
};

const ENTITY_TRANSACTION_KEY = "@lite-fsm/entities/transaction";
const ENTITY_DESPAWN_OPTIONS_KEY = Symbol.for("@lite-fsm/entities/despawn-options");

export const ENTITY_DESPAWN_ACTION_TYPE = "LITE_FSM_ENTITY_DESPAWN";

const emptyDespawnScheduled = new Uint8Array();
const transactionScratchByRuntime = new WeakMap<EntityRuntimeState, EntityTransactionScratch>();
const MIN_DESPAWN_SCHEDULE_CAPACITY = 16;
const MIN_DESPAWN_ROW_HINT_CAPACITY = 16;

const runtimeError = (reason: string) => storageRuntimeError(`invalid entity spawn: ${reason}`);

const getExplicitDespawnRequest = (options: unknown): ExplicitDespawnRequest | undefined => {
  if (options === null || typeof options !== "object") return undefined;
  return (options as { readonly [ENTITY_DESPAWN_OPTIONS_KEY]?: ExplicitDespawnRequest })[ENTITY_DESPAWN_OPTIONS_KEY];
};

export const createEntityDespawnOptions = (request: ExplicitDespawnRequest): object => ({
  [ENTITY_DESPAWN_OPTIONS_KEY]: request,
});

const scheduleEntityDespawnById = (transaction: EntityDispatchTransaction, id: string): boolean => {
  const entity = transaction.runtime.entityStore.indexById[id];
  if (entity === undefined) return false;
  return scheduleEntityDespawn(transaction, entity);
};

const scheduleCapturedEntityDespawn = (
  transaction: EntityDispatchTransaction,
  entry: CapturedEntityScopeEntry,
): boolean => {
  const store = transaction.runtime.entityStore;
  const stale = store.alive[entry.entity] !== 1 || store.generation[entry.entity] !== entry.generation;
  if (!stale) {
    return scheduleEntityDespawn(transaction, entry.entity);
  }

  if (isDev()) {
    throw storageRuntimeError(`stale entity effect scope cannot despawn entity '${entry.id}' at index ${entry.entity}`);
  }

  return false;
};

const stageExplicitDespawns = (
  transaction: EntityDispatchTransaction,
  options: unknown,
  trace: EntityTransitionTraceSession | undefined,
): void => {
  const request = getExplicitDespawnRequest(options);
  if (!request) return;

  let scheduled = 0;
  if (request.mode === "ids") {
    recordEntityTraceCounter(trace, "entities.prepare.explicitDespawn.ids", request.ids.length);
    for (const id of request.ids) {
      if (scheduleEntityDespawnById(transaction, id)) scheduled += 1;
    }
    recordEntityTraceCounter(trace, "entities.prepare.explicitDespawn.scheduled", scheduled);
    return;
  }

  recordEntityTraceCounter(trace, "entities.prepare.explicitDespawn.scopeEntries", request.entries.length);
  for (const entry of request.entries) {
    if (scheduleCapturedEntityDespawn(transaction, entry)) scheduled += 1;
  }
  recordEntityTraceCounter(trace, "entities.prepare.explicitDespawn.scheduled", scheduled);
};

const getEntityTransactionScratch = (runtime: EntityRuntimeState): EntityTransactionScratch => {
  const scratch = transactionScratchByRuntime.get(runtime);
  if (scratch) return scratch;

  const next = {
    despawnScheduled: emptyDespawnScheduled,
    despawnScheduledMarks: [],
    despawnRowHintMarksByStoreId: [],
    despawnRowHintBucketStateCodeByStoreId: [],
    despawnRowHintMarks: [],
    cleanupScratchPool: [],
    cleanupScratchPoolCursor: 0,
    reactionIndexPool: [],
    reactionIndexPoolCursor: 0,
  };
  transactionScratchByRuntime.set(runtime, next);
  return next;
};

const clearDespawnScheduledMarks = (scratch: EntityTransactionScratch): void => {
  for (const entity of scratch.despawnScheduledMarks) scratch.despawnScheduled[entity] = 0;
  scratch.despawnScheduledMarks.length = 0;
};

const clearDespawnRowHintMarks = (scratch: EntityTransactionScratch): void => {
  for (const hint of scratch.despawnRowHintMarks) {
    scratch.despawnRowHintMarksByStoreId[hint.storeId][hint.entity] = 0;
  }
  scratch.despawnRowHintMarks.length = 0;
};

const resetReactionIndexPool = (scratch: EntityTransactionScratch): void => {
  for (let index = 0; index < scratch.reactionIndexPoolCursor; index += 1) {
    scratch.reactionIndexPool[index].length = 0;
  }
  scratch.reactionIndexPoolCursor = 0;
};

const createCleanupScratch = (): EntityCleanupScratch => ({
  entities: [],
  removalBatchesByStoreId: [],
  removalTouchedStoreIds: [],
  lifecycleBatchesByStoreId: [],
  lifecycleTouchedStoreIds: [],
});

const clearCleanupScratch = (cleanup: EntityCleanupScratch): void => {
  for (const storeId of cleanup.removalTouchedStoreIds) {
    const batch = cleanup.removalBatchesByStoreId[storeId];
    /* v8 ignore next -- touched store ids are recorded only after creating a removal batch. */
    if (!batch) continue;
    batch.rows.length = 0;
    batch.bucketStateCodes.length = 0;
    batch.bucketStateCodesActive = false;
  }
  cleanup.removalTouchedStoreIds.length = 0;

  for (const storeId of cleanup.lifecycleTouchedStoreIds) {
    const batch = cleanup.lifecycleBatchesByStoreId[storeId];
    /* v8 ignore next -- touched store ids are recorded only after creating a lifecycle batch. */
    if (!batch) continue;
    batch.indices.length = 0;
  }
  cleanup.lifecycleTouchedStoreIds.length = 0;
  cleanup.entities.length = 0;
};

const resetInactiveCleanupScratchPool = (scratch: EntityTransactionScratch): void => {
  /* v8 ignore next -- lifecycle cleanup closes scratch frames in finally blocks before the next prepare. */
  if (scratch.cleanupScratchPoolCursor !== 0) return;
  for (const cleanup of scratch.cleanupScratchPool) clearCleanupScratch(cleanup);
};

export const prepareEntityTransaction = (
  carrier: RuntimeCarrier,
  runtime: EntityRuntimeState,
): EntityDispatchTransaction => {
  const scratch = getEntityTransactionScratch(runtime);
  clearDespawnScheduledMarks(scratch);
  clearDespawnRowHintMarks(scratch);
  resetInactiveCleanupScratchPool(scratch);
  resetReactionIndexPool(scratch);

  const transaction: EntityDispatchTransaction = {
    runtime,
    stagedSpawns: [],
    scheduledDespawns: [],
    despawnScheduled: scratch.despawnScheduled,
    despawnRowHints: [],
    terminalRows: [],
    effectBatches: [],
    reactionBatches: [],
  };
  carrier.runtime.set(ENTITY_TRANSACTION_KEY, transaction);
  const trace = readEntityTransitionTraceSession(carrier);
  tracePhase(trace, "entities.prepare.explicitDespawn", () =>
    stageExplicitDespawns(transaction, (carrier as { readonly options?: unknown }).options, trace),
  );
  return transaction;
};

export const getEntityTransaction = (carrier: RuntimeCarrier): EntityDispatchTransaction | undefined =>
  carrier.runtime.get(ENTITY_TRANSACTION_KEY) as EntityDispatchTransaction | undefined;

const assertNonEmptyString = (path: string, value: unknown): string => {
  if (typeof value === "string" && value.length > 0) return value;
  throw runtimeError(`${path} must be a non-empty string`);
};

const describePayloadValue = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return typeof value;
};

const assertScalarPayload = (path: string, kind: string, value: unknown): void => {
  if (kind === "string") {
    if (typeof value === "string") return;
    throw runtimeError(`${path} must be a string, got ${describePayloadValue(value)}`);
  }

  if (typeof value === "number" && Number.isFinite(value)) return;
  throw runtimeError(`${path} must be a finite number, got ${describePayloadValue(value)}`);
};

const assertPayloadField = (path: string, descriptor: Record<string, unknown>, value: unknown): void => {
  if (descriptor.kind !== "optional") {
    assertScalarPayload(path, String(descriptor.kind), value);
    return;
  }

  if (value === null) return;
  if (value === undefined) {
    throw runtimeError(`${path} is required and cannot be undefined`);
  }
  assertScalarPayload(path, String((descriptor.inner as Record<string, unknown>).kind), value);
};

const validateActorPayload = (
  templateKey: string,
  schema: EntitySpawnSchema,
  value: unknown,
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw runtimeError(`actor '${templateKey}' payload must be a plain object`);
  }

  for (const key of Object.keys(value)) {
    if (hasOwn(schema, key)) continue;
    throw runtimeError(`actor '${templateKey}' payload has unknown key '${key}'`);
  }

  for (const [key, descriptor] of Object.entries(schema)) {
    if (!hasOwn(value, key)) {
      throw runtimeError(`actor '${templateKey}' payload is missing required key '${key}'`);
    }
    assertPayloadField(`actor '${templateKey}' payload.${key}`, descriptor as Record<string, unknown>, value[key]);
  }

  return value;
};

const normalizeRecipeResult = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) return [value];
  throw runtimeError("recipe must return an EntitySpawnSpec or an array of EntitySpawnSpec");
};

const validateSpawnSpec = (runtime: EntityRuntimeState, value: unknown, seenIds: Set<string>): StagedEntitySpawn => {
  if (!isPlainObject(value)) {
    throw runtimeError("EntitySpawnSpec must be a plain object");
  }

  const id = assertNonEmptyString("EntitySpawnSpec.id", value.id);
  const groupTag = assertNonEmptyString("EntitySpawnSpec.groupTag", value.groupTag);

  const liveIndex = runtime.entityStore.indexById[id];
  if (liveIndex !== undefined && runtime.entityStore.alive[liveIndex] === 1) {
    throw runtimeError(`duplicate entity id '${id}'`);
  }
  if (seenIds.has(id)) {
    throw runtimeError(`duplicate entity id '${id}' in one recipe result`);
  }
  seenIds.add(id);

  if (!isPlainObject(value.actors)) {
    throw runtimeError(`EntitySpawnSpec '${id}' actors must be a plain object`);
  }

  const actors: StagedActorSpawn[] = [];
  for (const [templateKey, payload] of Object.entries(value.actors)) {
    const actorStore = runtime.actorStores[templateKey];
    if (!actorStore) {
      throw runtimeError(`unknown entity actor template '${templateKey}'`);
    }
    actors.push({
      templateKey,
      payload: validateActorPayload(templateKey, actorStore.metadata.spawnSchema, payload),
    });
  }

  if (actors.length === 0) {
    throw runtimeError(`EntitySpawnSpec '${id}' must contain at least one actor`);
  }

  return { id, groupTag, actors };
};

export const stageSpawnAction = (
  carrier: RuntimeCarrier & {
    readonly action: ReadonlyManagerAction<AnyEvent>;
    readonly skipDelivery: boolean;
  },
  spawn: EntitySpawnDescriptor,
): void => {
  const trace = readEntityTransitionTraceSession(carrier);
  const startedAt = trace?.now();
  try {
    if (carrier.skipDelivery || !hasSpawnRecipe(spawn, carrier.action.type)) return;

    const transaction = getEntityTransaction(carrier);
    /* v8 ignore next 3 -- defensive invariant: entity storage prepareAction creates the slot before hooks. */
    if (!transaction) {
      throw runtimeError("entity transaction slot was not prepared before spawn staging");
    }

    const result = tracePhase(trace, "entities.spawn.stage.recipe", () =>
      runSpawnRecipe(spawn, carrier.action as AnyEvent),
    );
    const rawSpecs = tracePhase(trace, "entities.spawn.stage.normalize", () => normalizeRecipeResult(result));
    if (rawSpecs.length === 0) {
      transaction.stagedSpawns = [];
      return;
    }

    transaction.stagedSpawns = tracePhase(trace, "entities.spawn.stage.validate", () => {
      const seenIds = new Set<string>();
      return rawSpecs.map((spec) => validateSpawnSpec(transaction.runtime, spec, seenIds));
    });
  } finally {
    recordEntityTracePhase(trace, "entities.spawn.stage", startedAt);
  }
};

export const getStagedSpawns = (carrier: RuntimeCarrier): readonly StagedEntitySpawn[] => {
  const transaction = getEntityTransaction(carrier);
  /* v8 ignore next 2 -- reduceBucket is called after prepareAction for the same storage runtime. */
  if (!transaction) return [];
  return transaction.stagedSpawns;
};

const ensureDespawnScheduleCapacity = (transaction: EntityDispatchTransaction, requestedCapacity: number): void => {
  const currentCapacity = transaction.despawnScheduled.length;
  if (currentCapacity >= requestedCapacity) return;

  const targetCapacity = Math.max(
    requestedCapacity,
    transaction.runtime.entityStore.capacity,
    MIN_DESPAWN_SCHEDULE_CAPACITY,
  );
  let nextCapacity = Math.max(currentCapacity, MIN_DESPAWN_SCHEDULE_CAPACITY);
  while (nextCapacity < targetCapacity) nextCapacity *= 2;

  const next = new Uint8Array(nextCapacity);
  next.set(transaction.despawnScheduled);
  getEntityTransactionScratch(transaction.runtime).despawnScheduled = next;
  transaction.despawnScheduled = next;
};

export const scheduleEntityDespawn = (transaction: EntityDispatchTransaction, entity: EntityIndex): boolean => {
  if (transaction.runtime.entityStore.alive[entity] !== 1) return false;

  ensureDespawnScheduleCapacity(transaction, entity + 1);
  if (transaction.despawnScheduled[entity] === 1) return false;

  transaction.despawnScheduled[entity] = 1;
  transaction.scheduledDespawns.push(entity);
  getEntityTransactionScratch(transaction.runtime).despawnScheduledMarks.push(entity);
  return true;
};

const ensureDespawnRowHintCapacity = (
  scratch: EntityTransactionScratch,
  storeId: number,
  requestedCapacity: number,
  storeCapacity: number,
): void => {
  const marks = scratch.despawnRowHintMarksByStoreId[storeId];
  const bucketStateCodes = scratch.despawnRowHintBucketStateCodeByStoreId[storeId];
  if (
    marks &&
    bucketStateCodes &&
    marks.length >= requestedCapacity &&
    bucketStateCodes.length >= requestedCapacity
  ) {
    return;
  }

  const currentCapacity = Math.min(marks?.length ?? 0, bucketStateCodes?.length ?? 0);
  const targetCapacity = Math.max(requestedCapacity, storeCapacity, MIN_DESPAWN_ROW_HINT_CAPACITY);
  let nextCapacity = Math.max(currentCapacity, MIN_DESPAWN_ROW_HINT_CAPACITY);
  while (nextCapacity < targetCapacity) nextCapacity *= 2;

  const nextMarks = new Uint8Array(nextCapacity);
  if (marks) nextMarks.set(marks);
  scratch.despawnRowHintMarksByStoreId[storeId] = nextMarks;

  const nextBucketStateCodes = new Int16Array(nextCapacity);
  if (bucketStateCodes) nextBucketStateCodes.set(bucketStateCodes);
  scratch.despawnRowHintBucketStateCodeByStoreId[storeId] = nextBucketStateCodes;
};

export const scheduleDespawnRowHint = (
  transaction: EntityDispatchTransaction,
  store: ColumnarActorStore,
  entity: EntityIndex,
  bucketStateCode: number,
): boolean => {
  const scratch = getEntityTransactionScratch(transaction.runtime);
  ensureDespawnRowHintCapacity(scratch, store.storeId, entity + 1, store.capacity);

  const marks = scratch.despawnRowHintMarksByStoreId[store.storeId];
  if (marks[entity] === 1) return false;

  marks[entity] = 1;
  scratch.despawnRowHintBucketStateCodeByStoreId[store.storeId][entity] = bucketStateCode;
  const hint = { storeId: store.storeId, entity, bucketStateCode };
  transaction.despawnRowHints.push(hint);
  scratch.despawnRowHintMarks.push(hint);
  return true;
};

export const getDespawnRowHintBucketStateCode = (
  transaction: EntityDispatchTransaction,
  storeId: number,
  entity: EntityIndex,
): number | undefined => {
  const scratch = getEntityTransactionScratch(transaction.runtime);
  const marks = scratch.despawnRowHintMarksByStoreId[storeId];
  if (!marks || marks[entity] !== 1) return undefined;
  return scratch.despawnRowHintBucketStateCodeByStoreId[storeId][entity];
};

export const clearDespawnRowHints = (transaction: EntityDispatchTransaction): void => {
  clearDespawnRowHintMarks(getEntityTransactionScratch(transaction.runtime));
  transaction.despawnRowHints = [];
};

export const consumeScheduledDespawns = (transaction: EntityDispatchTransaction): readonly EntityIndex[] => {
  const scheduled = transaction.scheduledDespawns;
  transaction.scheduledDespawns = [];
  for (const entity of scheduled) transaction.despawnScheduled[entity] = 0;
  getEntityTransactionScratch(transaction.runtime).despawnScheduledMarks.length = 0;
  return scheduled;
};

export const beginEntityCleanupScratch = (transaction: EntityDispatchTransaction): EntityCleanupScratch => {
  const scratch = getEntityTransactionScratch(transaction.runtime);
  const poolIndex = scratch.cleanupScratchPoolCursor;
  const cleanup = scratch.cleanupScratchPool[poolIndex] ?? createCleanupScratch();
  scratch.cleanupScratchPool[poolIndex] = cleanup;
  scratch.cleanupScratchPoolCursor += 1;
  clearCleanupScratch(cleanup);
  return cleanup;
};

export const finishEntityCleanupScratch = (
  transaction: EntityDispatchTransaction,
  cleanup: EntityCleanupScratch,
): void => {
  clearCleanupScratch(cleanup);

  const scratch = getEntityTransactionScratch(transaction.runtime);
  const lastPoolIndex = scratch.cleanupScratchPoolCursor - 1;
  if (lastPoolIndex >= 0 && scratch.cleanupScratchPool[lastPoolIndex] === cleanup) {
    scratch.cleanupScratchPoolCursor = lastPoolIndex;
  }
};

export const appendCleanupRemovalRow = (
  cleanup: EntityCleanupScratch,
  store: ColumnarActorStore,
  row: EntityActorRowRef,
  bucketStateCode: number | undefined,
): void => {
  let batch = cleanup.removalBatchesByStoreId[store.storeId];
  if (!batch) {
    batch = { store, rows: [], bucketStateCodes: [], bucketStateCodesActive: false };
    cleanup.removalBatchesByStoreId[store.storeId] = batch;
  }

  if (batch.rows.length === 0) cleanup.removalTouchedStoreIds.push(store.storeId);

  if (bucketStateCode !== undefined || batch.bucketStateCodesActive) {
    if (!batch.bucketStateCodesActive) {
      batch.bucketStateCodes.length = batch.rows.length;
      batch.bucketStateCodesActive = true;
    }
    batch.bucketStateCodes.push(bucketStateCode);
  }
  batch.rows.push(row);
};

export const appendCleanupLifecycleIndex = (
  cleanup: EntityCleanupScratch,
  store: ColumnarActorStore,
  entity: EntityIndex,
): void => {
  let batch = cleanup.lifecycleBatchesByStoreId[store.storeId];
  if (!batch) {
    batch = { store, indices: [] };
    cleanup.lifecycleBatchesByStoreId[store.storeId] = batch;
  }

  if (batch.indices.length === 0) cleanup.lifecycleTouchedStoreIds.push(store.storeId);
  batch.indices.push(entity);
};

export const scheduleEntityEffectBatch = (
  transaction: EntityDispatchTransaction | undefined,
  store: ColumnarActorStore,
  stateCode: number,
  indices: readonly EntityIndex[],
  capturedEntries?: readonly CapturedEntityScopeEntry[],
): void => {
  if (!transaction || indices.length === 0 || !store.metadata.effectsByStateCode[stateCode]) return;

  const entityStore = transaction.runtime.entityStore;
  transaction.effectBatches.push({
    store,
    stateCode,
    indices,
    capturedEntries,
    storeVersion: store.version,
    entityStoreVersion: entityStore.version,
  });
};

const ownReactionIndices = (
  transaction: EntityDispatchTransaction,
  indices: readonly EntityIndex[],
): readonly EntityIndex[] => {
  const scratch = getEntityTransactionScratch(transaction.runtime);
  const poolIndex = scratch.reactionIndexPoolCursor;
  const owned = scratch.reactionIndexPool[poolIndex] ?? [];
  scratch.reactionIndexPool[poolIndex] = owned;
  scratch.reactionIndexPoolCursor += 1;

  owned.length = indices.length;
  for (let index = 0; index < indices.length; index += 1) owned[index] = indices[index];
  return owned;
};

export const createEntityReactionBatch = (
  transaction: EntityDispatchTransaction | undefined,
  store: ColumnarActorStore,
  eventCode: number | undefined,
  indices: readonly EntityIndex[],
  options: ScheduleEntityReactionBatchOptions = {},
): EntityReactionBatch | undefined => {
  if (!transaction || eventCode === undefined || indices.length === 0) return undefined;
  if (!store.metadata.reactionsByEventCode[eventCode]) return undefined;

  const ownership = options.ownership ?? "owned";
  return {
    store,
    eventCode,
    ownership,
    indices: ownership === "borrowed" ? indices : ownReactionIndices(transaction, indices),
  };
};

export const scheduleEntityReactionBatch = (
  transaction: EntityDispatchTransaction | undefined,
  store: ColumnarActorStore,
  eventCode: number | undefined,
  indices: readonly EntityIndex[],
  options?: ScheduleEntityReactionBatchOptions,
): void => {
  if (!transaction) return;
  const batch = createEntityReactionBatch(transaction, store, eventCode, indices, options);
  if (batch) transaction.reactionBatches.push(batch);
};
