import type { StorageReduceBucketContext } from "@lite-fsm/core";

import { runtimeError } from "../internal";
import type { EntityIndex } from "../plugin";
import { ENTITY_NO_TRANSITION, type EntityTemplateMetadata } from "./compile";
import type { ColumnarActorStore, EntityActorRowRef, EntityRuntimeState } from "./state";

type EntityDispatchRoute = StorageReduceBucketContext<any>["dispatch"]["route"];

export type EntityPublicReducerBatch = {
  readonly store: ColumnarActorStore;
  readonly indices: readonly EntityIndex[];
  readonly accepted: true;
};

const transitionCell = (metadata: EntityTemplateMetadata, eventCode: number, stateCode: number): number => {
  const stateSlot = stateCode + 1;
  if (stateSlot < 0 || stateSlot >= metadata.stateSlotCount) return -1;
  return eventCode * metadata.stateSlotCount + stateSlot;
};

const stateAcceptsEventCode = (store: ColumnarActorStore, entity: EntityIndex, eventCode: number): boolean => {
  const stateCode = store.stateCode[entity];
  const cell = transitionCell(store.metadata, eventCode, stateCode);
  if (cell < 0) {
    throw runtimeError(`actor '${store.templateKey}' has invalid stateCode ${stateCode} for entity ${entity}`);
  }

  return store.metadata.transitionTable[cell] !== ENTITY_NO_TRANSITION;
};

const entityAcceptsEventCode = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  eventCode: number,
  entity: EntityIndex,
): boolean => {
  if (runtime.entityStore.alive[entity] !== 1) return false;
  if (store.presence[entity] !== 1) return false;
  return stateAcceptsEventCode(store, entity, eventCode);
};

const collectUnscopedBatch = (
  store: ColumnarActorStore,
  eventCode: number,
): readonly EntityIndex[] | undefined => {
  const buckets = store.acceptStateBucketsByEventCode[eventCode];
  if (!buckets || buckets.length === 0) return undefined;
  if (buckets.length === 1) return buckets[0].length === 0 ? undefined : buckets[0];

  let singleBucket: readonly EntityIndex[] | undefined;
  const accepted = store.acceptedScratch;
  accepted.length = 0;
  for (const bucket of buckets) {
    if (bucket.length === 0) continue;

    if (!singleBucket) {
      singleBucket = bucket;
      continue;
    }

    if (accepted.length === 0) {
      for (let index = 0; index < singleBucket.length; index += 1) accepted.push(singleBucket[index]);
    }
    for (let index = 0; index < bucket.length; index += 1) accepted.push(bucket[index]);
  }

  if (accepted.length > 0) return accepted;
  return singleBucket;
};

const beginRoutedCollection = (runtime: EntityRuntimeState): number => {
  runtime.routingScratchVersion += 1;
  return runtime.routingScratchVersion;
};

const appendRoutedRow = (
  runtime: EntityRuntimeState,
  eventCode: number,
  scratchVersion: number,
  row: EntityActorRowRef,
  batches: EntityPublicReducerBatch[],
): void => {
  const { store, entity } = row;
  if (!entityAcceptsEventCode(runtime, store, eventCode, entity)) return;

  if (store.routingScratchVersion !== scratchVersion) {
    store.routingScratchVersion = scratchVersion;
    store.acceptedScratch.length = 0;
  }

  if (store.acceptedScratch.length === 0) {
    batches.push({ store, indices: store.acceptedScratch, accepted: true });
  }

  store.acceptedScratch.push(entity);
};

const collectEntityRoutedBatches = (
  runtime: EntityRuntimeState,
  eventCode: number,
  targetSet: readonly string[],
): EntityPublicReducerBatch[] => {
  const batches: EntityPublicReducerBatch[] = [];
  const scratchVersion = beginRoutedCollection(runtime);
  for (const entityId of targetSet) {
    const entity = runtime.entityStore.indexById[entityId];
    if (entity === undefined) continue;
    const rows = runtime.actorRowsByEntity[entity];
    if (!rows) continue;
    for (let index = 0; index < rows.length; index += 1) {
      appendRoutedRow(runtime, eventCode, scratchVersion, rows[index], batches);
    }
  }

  return batches;
};

const collectGroupTagRoutedBatches = (
  runtime: EntityRuntimeState,
  eventCode: number,
  targetSet: readonly string[],
): EntityPublicReducerBatch[] => {
  const batches: EntityPublicReducerBatch[] = [];
  const scratchVersion = beginRoutedCollection(runtime);
  for (const groupTag of targetSet) {
    const rows = runtime.actorRowsByGroupTag[groupTag];
    if (!rows) continue;
    for (let index = 0; index < rows.length; index += 1) {
      appendRoutedRow(runtime, eventCode, scratchVersion, rows[index], batches);
    }
  }

  return batches;
};

export const collectEntityPublicReducerBatches = (
  runtime: EntityRuntimeState,
  eventCode: number,
  route: EntityDispatchRoute,
): EntityPublicReducerBatch[] => {
  if (route.scope === "plugin" && route.key === "entityId") {
    return collectEntityRoutedBatches(runtime, eventCode, route.targetSet);
  }
  if (route.scope === "tag") return collectGroupTagRoutedBatches(runtime, eventCode, route.targetSet);
  if (route.scope !== "unscoped") return [];

  const stores = runtime.templatesByEventCode[eventCode];
  if (!stores || stores.length === 0) return [];

  const batches: EntityPublicReducerBatch[] = [];
  for (const store of stores) {
    const indices = collectUnscopedBatch(store, eventCode);
    if (!indices || indices.length === 0) continue;
    batches.push({ store, indices, accepted: true });
  }

  return batches;
};
