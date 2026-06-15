import { LiteFsmError } from "@lite-fsm/core";
import type { AnyEvent, ReadonlyManagerAction } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import type { EntitySpawnDescriptor } from "../spawn";
import { hasSpawnRecipe, runSpawnRecipe } from "../spawn";
import type { EntitySpawnSchema } from "../schema";
import type { ColumnarActorStore, EntityRuntimeState } from "./state";
import { readEntityTransitionTraceSession, recordEntityTracePhase } from "./transitionTrace";

type RuntimeCarrier = {
  readonly runtime: Map<string, unknown>;
};

type EntityTransactionScratch = {
  despawnScheduled: Uint8Array;
  readonly despawnScheduledMarks: EntityIndex[];
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
  terminalRows: EntityActorTerminalRow[];
  effectBatches: EntityEffectBatch[];
  reactionBatches: EntityReactionBatch[];
};

export type EntityActorTerminalRow = {
  readonly store: ColumnarActorStore;
  readonly entity: EntityIndex;
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

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const runtimeError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_STORAGE_RUNTIME", `[lite-fsm/entities] invalid entity spawn: ${reason}.`);

const entityRuntimeError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_STORAGE_RUNTIME", `[lite-fsm/entities] ${reason}.`);

const isDev = (): boolean =>
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV !== "production";

const getExplicitDespawnRequest = (options: unknown): ExplicitDespawnRequest | undefined => {
  if (options === null || typeof options !== "object") return undefined;
  return (options as { readonly [ENTITY_DESPAWN_OPTIONS_KEY]?: ExplicitDespawnRequest })[ENTITY_DESPAWN_OPTIONS_KEY];
};

export const createEntityDespawnOptions = (request: ExplicitDespawnRequest): object => ({
  [ENTITY_DESPAWN_OPTIONS_KEY]: request,
});

const scheduleEntityDespawnById = (transaction: EntityDispatchTransaction, id: string): void => {
  const entity = transaction.runtime.entityStore.indexById[id];
  if (entity === undefined) return;
  scheduleEntityDespawn(transaction, entity);
};

const scheduleCapturedEntityDespawn = (
  transaction: EntityDispatchTransaction,
  entry: CapturedEntityScopeEntry,
): void => {
  const store = transaction.runtime.entityStore;
  const stale = store.alive[entry.entity] !== 1 || store.generation[entry.entity] !== entry.generation;
  if (!stale) {
    scheduleEntityDespawn(transaction, entry.entity);
    return;
  }

  if (isDev()) {
    throw entityRuntimeError(
      `stale entity effect scope cannot despawn entity '${entry.id}' at index ${entry.entity}`,
    );
  }
};

const stageExplicitDespawns = (transaction: EntityDispatchTransaction, options: unknown): void => {
  const request = getExplicitDespawnRequest(options);
  if (!request) return;

  if (request.mode === "ids") {
    for (const id of request.ids) scheduleEntityDespawnById(transaction, id);
    return;
  }

  for (const entry of request.entries) scheduleCapturedEntityDespawn(transaction, entry);
};

const getEntityTransactionScratch = (runtime: EntityRuntimeState): EntityTransactionScratch => {
  const scratch = transactionScratchByRuntime.get(runtime);
  if (scratch) return scratch;

  const next = {
    despawnScheduled: emptyDespawnScheduled,
    despawnScheduledMarks: [],
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

const resetReactionIndexPool = (scratch: EntityTransactionScratch): void => {
  for (let index = 0; index < scratch.reactionIndexPoolCursor; index += 1) {
    scratch.reactionIndexPool[index].length = 0;
  }
  scratch.reactionIndexPoolCursor = 0;
};

export const prepareEntityTransaction = (carrier: RuntimeCarrier, runtime: EntityRuntimeState): EntityDispatchTransaction => {
  const scratch = getEntityTransactionScratch(runtime);
  clearDespawnScheduledMarks(scratch);
  resetReactionIndexPool(scratch);

  const transaction: EntityDispatchTransaction = {
    runtime,
    stagedSpawns: [],
    scheduledDespawns: [],
    despawnScheduled: scratch.despawnScheduled,
    terminalRows: [],
    effectBatches: [],
    reactionBatches: [],
  };
  carrier.runtime.set(ENTITY_TRANSACTION_KEY, transaction);
  stageExplicitDespawns(transaction, (carrier as { readonly options?: unknown }).options);
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

const validateSpawnSpec = (
  runtime: EntityRuntimeState,
  value: unknown,
  seenIds: Set<string>,
): StagedEntitySpawn => {
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

    const result = runSpawnRecipe(spawn, carrier.action as AnyEvent);
    const rawSpecs = normalizeRecipeResult(result);
    if (rawSpecs.length === 0) {
      transaction.stagedSpawns = [];
      return;
    }

    const seenIds = new Set<string>();
    transaction.stagedSpawns = rawSpecs.map((spec) => validateSpawnSpec(transaction.runtime, spec, seenIds));
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

const ensureDespawnScheduleCapacity = (transaction: EntityDispatchTransaction, capacity: number): void => {
  if (transaction.despawnScheduled.length >= capacity) return;

  const next = new Uint8Array(capacity);
  next.set(transaction.despawnScheduled);
  getEntityTransactionScratch(transaction.runtime).despawnScheduled = next;
  transaction.despawnScheduled = next;
};

export const scheduleEntityDespawn = (
  transaction: EntityDispatchTransaction,
  entity: EntityIndex,
): boolean => {
  if (transaction.runtime.entityStore.alive[entity] !== 1) return false;

  ensureDespawnScheduleCapacity(transaction, entity + 1);
  if (transaction.despawnScheduled[entity] === 1) return false;

  transaction.despawnScheduled[entity] = 1;
  transaction.scheduledDespawns.push(entity);
  getEntityTransactionScratch(transaction.runtime).despawnScheduledMarks.push(entity);
  return true;
};

export const consumeScheduledDespawns = (transaction: EntityDispatchTransaction): readonly EntityIndex[] => {
  const scheduled = transaction.scheduledDespawns;
  transaction.scheduledDespawns = [];
  for (const entity of scheduled) transaction.despawnScheduled[entity] = 0;
  getEntityTransactionScratch(transaction.runtime).despawnScheduledMarks.length = 0;
  return scheduled;
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
