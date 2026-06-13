import { LiteFsmError } from "@lite-fsm/core";
import type { AnyEvent, ReadonlyManagerAction } from "@lite-fsm/core";

import type { EntitySpawnDescriptor, EntitySpawnSpec } from "../spawn";
import { hasSpawnRecipe, runSpawnRecipe } from "../spawn";
import type { EntitySpawnSchema } from "../schema";
import type { EntityRuntimeState } from "./state";

type RuntimeCarrier = {
  readonly runtime: Map<string, unknown>;
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
  readonly runtime: EntityRuntimeState;
  stagedSpawns: readonly StagedEntitySpawn[];
};

const ENTITY_TRANSACTION_KEY = "@lite-fsm/entities/transaction";

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const runtimeError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_STORAGE_RUNTIME", `[lite-fsm/entities] invalid entity spawn: ${reason}.`);

export const prepareEntityTransaction = (carrier: RuntimeCarrier, runtime: EntityRuntimeState): EntityDispatchTransaction => {
  const transaction: EntityDispatchTransaction = {
    runtime,
    stagedSpawns: [],
  };
  carrier.runtime.set(ENTITY_TRANSACTION_KEY, transaction);
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
};

export const getStagedSpawns = (carrier: RuntimeCarrier): readonly StagedEntitySpawn[] => {
  const transaction = getEntityTransaction(carrier);
  /* v8 ignore next 2 -- reduceBucket is called after prepareAction for the same storage runtime. */
  if (!transaction) return [];
  return transaction.stagedSpawns;
};

export type RuntimeEntitySpawnSpec = EntitySpawnSpec;
