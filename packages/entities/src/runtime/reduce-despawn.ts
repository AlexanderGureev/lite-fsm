import type { AnyEvent, ManagerAction } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import { ENTITY_DESPAWNED } from "./lifecycle";
import { reduceAcceptedBatch } from "./reduce-batch";
import { runEntityReactionBatches } from "./reactions";
import {
  appendLifecycleReactionBatch,
  isTerminalStateCode,
  type LifecycleReactionContext,
} from "./reduce-shared";
import {
  removeActorRowsForStore,
  removeEntityRecords,
  type ColumnarActorStore,
  type EntityActorRowRef,
  type EntityRuntimeState,
} from "./state";
import {
  appendCleanupLifecycleIndex,
  appendCleanupRemovalRow,
  beginEntityCleanupScratch,
  clearDespawnRowHints,
  consumeScheduledDespawns,
  finishEntityCleanupScratch,
  getDespawnRowHintBucketStateCode,
  type EntityCleanupScratch,
  type EntityDispatchTransaction,
  type EntityReactionBatch,
} from "./transaction";
import {
  recordEntityTraceCounter,
  recordEntityTracePhase,
  type EntityTransitionTraceSession,
} from "./transitionTrace";

type CleanupPhaseKind = "spawn" | "public";

const despawnLifecycleAction: ManagerAction<AnyEvent> = { type: ENTITY_DESPAWNED };

const recordCleanupCounter = (
  trace: EntityTransitionTraceSession | undefined,
  phaseKind: CleanupPhaseKind,
  key: string,
  value: number,
): void => {
  recordEntityTraceCounter(trace, `entities.cleanup.${phaseKind}.${key}`, value);
};

const countLifecycleRows = (cleanup: EntityCleanupScratch | undefined): number => {
  if (!cleanup) return 0;

  let rows = 0;
  for (const storeId of cleanup.lifecycleTouchedStoreIds) {
    /* v8 ignore next -- touched store ids are recorded only after creating a lifecycle batch. */
    rows += cleanup.lifecycleBatchesByStoreId[storeId]?.indices.length ?? 0;
  }
  return rows;
};

const actorRowNeedsDespawnLifecycle = (store: ColumnarActorStore, entity: EntityIndex): boolean => {
  const stateSlot = store.stateCode[entity] + 1;
  return stateSlot >= 0 && store.metadata.despawnLifecycleStateMask[stateSlot] === 1;
};

const appendActorRowRemoval = (
  transaction: EntityDispatchTransaction | undefined,
  cleanup: EntityCleanupScratch,
  row: EntityActorRowRef,
): void => {
  const bucketStateCode = transaction
    ? getDespawnRowHintBucketStateCode(transaction, row.store.storeId, row.entity)
    : undefined;
  appendCleanupRemovalRow(cleanup, row.store, row, bucketStateCode);
};

const collectDespawnCleanupPlan = (
  runtime: EntityRuntimeState,
  transaction: EntityDispatchTransaction,
  entities: readonly EntityIndex[],
  cleanup: EntityCleanupScratch,
): void => {
  const eventCode = runtime.eventCodeByType[ENTITY_DESPAWNED];
  for (const entity of entities) {
    /* v8 ignore next -- scheduled despawns are live when recorded; stale entries are defensive no-ops. */
    if (runtime.entityStore.alive[entity] !== 1) continue;

    cleanup.entities.push(entity);
    const rows = runtime.actorRowsByEntity[entity];
    /* v8 ignore next -- defensive ownership invariant: scheduled live entities keep an actorRowsByEntity entry. */
    if (!rows) continue;

    for (const row of rows) {
      const { store } = row;
      /* v8 ignore next -- defensive ownership invariant: attached row refs point to present rows until cleanup. */
      if (store.presence[entity] !== 1) continue;

      appendActorRowRemoval(transaction, cleanup, row);
      if (eventCode !== undefined && actorRowNeedsDespawnLifecycle(store, entity)) {
        appendCleanupLifecycleIndex(cleanup, store, entity);
      }
    }
  }
};

const findActorRowRef = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  entity: EntityIndex,
): EntityActorRowRef | undefined => {
  const rows = runtime.actorRowsByEntity[entity];
  /* v8 ignore next -- terminal rows are recorded for attached rows. */
  if (!rows) return undefined;

  for (const row of rows) {
    if (row.store === store) return row;
  }

  /* v8 ignore next -- defensive terminal cleanup invariant: terminal rows are recorded while refs are attached. */
  return undefined;
};

const removeActorRowsFromBatches = (
  runtime: EntityRuntimeState,
  cleanup: EntityCleanupScratch,
  mode: "row" | "fullEntity" = "row",
): number => {
  let removedRows = 0;
  for (const storeId of cleanup.removalTouchedStoreIds) {
    const batch = cleanup.removalBatchesByStoreId[storeId];
    /* v8 ignore next -- touched store ids are recorded only after creating a removal batch. */
    if (!batch) continue;
    const removed = removeActorRowsForStore(
      runtime,
      batch.store,
      batch.rows,
      batch.bucketStateCodesActive ? batch.bucketStateCodes : undefined,
      mode,
    );
    removedRows += removed;
  }
  return removedRows;
};

const removeEmptyEntityRecords = (runtime: EntityRuntimeState, entities: EntityIndex[]): number => {
  let nextIndex = 0;
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index];
    const rows = runtime.actorRowsByEntity[entity];
    if (rows && rows.length > 0) continue;
    entities[nextIndex] = entity;
    nextIndex += 1;
  }

  entities.length = nextIndex;
  return removeEntityRecords(runtime, entities);
};

const cleanupTerminalRows = (
  runtime: EntityRuntimeState,
  transaction: EntityDispatchTransaction,
  trace: EntityTransitionTraceSession | undefined,
  phaseKind: CleanupPhaseKind,
): boolean => {
  if (transaction.terminalRows.length === 0) {
    recordCleanupCounter(trace, phaseKind, "terminalRows", 0);
    return false;
  }

  const cleanup = beginEntityCleanupScratch(transaction);
  try {
    const collectStartedAt = trace?.now();
    try {
      const terminalRows = transaction.terminalRows;
      transaction.terminalRows = [];
      recordCleanupCounter(trace, phaseKind, "terminalRows", terminalRows.length);
      for (const row of terminalRows) {
        if (!isTerminalStateCode(row.store.stateCode[row.entity])) continue;

        const ref = findActorRowRef(runtime, row.store, row.entity);
        /* v8 ignore next -- defensive terminal cleanup invariant: terminal row refs remain attached until cleanup. */
        if (!ref) continue;
        appendActorRowRemoval(undefined, cleanup, ref);
        cleanup.entities.push(row.entity);
      }
    } finally {
      recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.collectPlan`, collectStartedAt);
    }

    let touched = false;
    let removedRows = 0;
    const removeActorRowsStartedAt = trace?.now();
    try {
      removedRows = removeActorRowsFromBatches(runtime, cleanup);
    } finally {
      recordCleanupCounter(trace, phaseKind, "removedActorRows", removedRows);
      recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.removeActorRows`, removeActorRowsStartedAt);
    }
    touched = removedRows > 0;

    const removeEntityRecordsStartedAt = trace?.now();
    try {
      const removedEntities = removeEmptyEntityRecords(runtime, cleanup.entities);
      recordCleanupCounter(trace, phaseKind, "removedEntityRecords", removedEntities);
      touched = removedEntities > 0 || touched;
    } finally {
      recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.removeEntityRecords`, removeEntityRecordsStartedAt);
    }
    return touched;
  } finally {
    finishEntityCleanupScratch(transaction, cleanup);
  }
};

export const flushEntityLifecycleCleanup = (
  runtime: EntityRuntimeState,
  transaction: EntityDispatchTransaction | undefined,
  reactionContext: LifecycleReactionContext,
  phaseKind: CleanupPhaseKind,
  trace: EntityTransitionTraceSession | undefined,
): boolean => {
  /* v8 ignore next -- defensive invariant: prepareAction creates the entity transaction before reduceBucket. */
  if (!transaction) return false;

  let touched = false;
  const despawns = consumeScheduledDespawns(transaction);
  recordCleanupCounter(trace, phaseKind, "scheduledDespawns", despawns.length);
  let cleanup: EntityCleanupScratch | undefined;

  try {
    const collectStartedAt = trace?.now();
    try {
      if (despawns.length > 0) {
        cleanup = beginEntityCleanupScratch(transaction);
        collectDespawnCleanupPlan(runtime, transaction, despawns, cleanup);
      }
    } finally {
      recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.collectPlan`, collectStartedAt);
    }
    recordCleanupCounter(trace, phaseKind, "despawnedEntities", cleanup?.entities.length ?? 0);
    recordCleanupCounter(trace, phaseKind, "touchedTemplates", cleanup?.removalTouchedStoreIds.length ?? 0);
    recordCleanupCounter(trace, phaseKind, "lifecycleBatches", cleanup?.lifecycleTouchedStoreIds.length ?? 0);
    recordCleanupCounter(trace, phaseKind, "lifecycleRows", countLifecycleRows(cleanup));
    recordCleanupCounter(trace, phaseKind, "removalBatches", cleanup?.removalTouchedStoreIds.length ?? 0);

    if (cleanup) {
      const lifecycleEventCode = runtime.eventCodeByType[ENTITY_DESPAWNED];
      const reactionBatches: EntityReactionBatch[] = [];
      const lifecycleStartedAt = trace?.now();
      try {
        for (const storeId of cleanup.lifecycleTouchedStoreIds) {
          const batch = cleanup.lifecycleBatchesByStoreId[storeId];
          /* v8 ignore next -- touched store ids are recorded only after creating a lifecycle batch. */
          if (!batch) continue;
          const reduced = reduceAcceptedBatch(
            runtime,
            {
              store: batch.store,
              indices: batch.indices,
              action: despawnLifecycleAction,
              eventCode: lifecycleEventCode,
              accepted: true,
            },
            transaction,
            {
              scheduleDespawnOn: false,
              scheduleEffects: false,
              scheduleReactions: false,
              scheduleTerminal: false,
              onAccepted(accepted) {
                appendLifecycleReactionBatch(transaction, reactionBatches, batch.store, lifecycleEventCode, accepted);
              },
            },
          );
          touched = touched || reduced;
        }
        runEntityReactionBatches(runtime, reactionBatches, {
          action: despawnLifecycleAction,
          manager: reactionContext.manager,
          dispatch: reactionContext.dispatch,
        });
      } finally {
        recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.lifecycle`, lifecycleStartedAt);
      }

      let removedRows = 0;
      const removeActorRowsStartedAt = trace?.now();
      try {
        removedRows = removeActorRowsFromBatches(runtime, cleanup, "fullEntity");
      } finally {
        recordCleanupCounter(trace, phaseKind, "removedActorRows", removedRows);
        recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.removeActorRows`, removeActorRowsStartedAt);
      }

      let removedEntities = 0;
      const removeEntityRecordsStartedAt = trace?.now();
      try {
        removedEntities = removeEntityRecords(runtime, cleanup.entities);
      } finally {
        recordCleanupCounter(trace, phaseKind, "removedEntityRecords", removedEntities);
        recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.removeEntityRecords`, removeEntityRecordsStartedAt);
      }
      if (removedRows > 0) touched = true;
      if (removedEntities > 0) touched = true;
    }
  } finally {
    clearDespawnRowHints(transaction);
    if (cleanup) finishEntityCleanupScratch(transaction, cleanup);
  }

  const removedTerminals = cleanupTerminalRows(runtime, transaction, trace, phaseKind);
  touched = touched || removedTerminals;
  return touched;
};
