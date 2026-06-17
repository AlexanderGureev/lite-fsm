import type { AnyEvent, ManagerAction } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import { ENTITY_DESPAWNED } from "./lifecycle";
import { reduceAcceptedBatch } from "./reduce-batch";
import { runEntityReactionBatches } from "./reactions";
import {
  appendLifecycleReactionBatch,
  isTerminalStateCode,
  type LifecycleReactionContext,
  type ReducerBatch,
} from "./reduce-shared";
import {
  removeActorRowsForStore,
  removeEntityRecords,
  type ColumnarActorStore,
  type EntityActorRowRef,
  type EntityRuntimeState,
} from "./state";
import {
  consumeScheduledDespawns,
  type EntityDispatchTransaction,
  type EntityReactionBatch,
} from "./transaction";
import { recordEntityTracePhase, type EntityTransitionTraceSession } from "./transitionTrace";

type ActorRowRemovalBatch = {
  readonly store: ColumnarActorStore;
  readonly rows: EntityActorRowRef[];
};

type DespawnCleanupPlan = {
  readonly lifecycleBatches: ReducerBatch[];
  readonly removalBatches: ActorRowRemovalBatch[];
  readonly entities: EntityIndex[];
};

type CleanupPhaseKind = "spawn" | "public";

const despawnLifecycleAction: ManagerAction<AnyEvent> = { type: ENTITY_DESPAWNED };

const actorRowNeedsDespawnLifecycle = (store: ColumnarActorStore, entity: EntityIndex): boolean => {
  const stateSlot = store.stateCode[entity] + 1;
  return stateSlot >= 0 && store.metadata.despawnLifecycleStateMask[stateSlot] === 1;
};

const appendActorRowRemoval = (
  batches: Map<string, ActorRowRemovalBatch>,
  row: EntityActorRowRef,
): void => {
  const batch = batches.get(row.store.templateKey) ?? { store: row.store, rows: [] };
  batch.rows.push(row);
  batches.set(row.store.templateKey, batch);
};

const appendDespawnLifecycle = (
  batches: Map<string, { readonly store: ColumnarActorStore; readonly indices: EntityIndex[] }>,
  row: EntityActorRowRef,
): void => {
  const batch = batches.get(row.store.templateKey) ?? { store: row.store, indices: [] };
  batch.indices.push(row.entity);
  batches.set(row.store.templateKey, batch);
};

const collectDespawnCleanupPlan = (
  runtime: EntityRuntimeState,
  entities: readonly EntityIndex[],
): DespawnCleanupPlan => {
  const eventCode = runtime.eventCodeByType[ENTITY_DESPAWNED];
  const lifecycleBatches = new Map<string, { readonly store: ColumnarActorStore; readonly indices: EntityIndex[] }>();
  const removalBatches = new Map<string, ActorRowRemovalBatch>();
  const liveEntities: EntityIndex[] = [];
  for (const entity of entities) {
    /* v8 ignore next -- scheduled despawns are live when recorded; stale entries are defensive no-ops. */
    if (runtime.entityStore.alive[entity] !== 1) continue;

    liveEntities.push(entity);
    const rows = runtime.actorRowsByEntity[entity];
    /* v8 ignore next -- defensive ownership invariant: scheduled live entities keep an actorRowsByEntity entry. */
    if (!rows) continue;

    for (const row of rows) {
      const { store } = row;
      /* v8 ignore next -- defensive ownership invariant: attached row refs point to present rows until cleanup. */
      if (store.presence[entity] !== 1) continue;

      appendActorRowRemoval(removalBatches, row);
      if (eventCode !== undefined && actorRowNeedsDespawnLifecycle(store, entity)) {
        appendDespawnLifecycle(lifecycleBatches, row);
      }
    }
  }

  return {
    lifecycleBatches: [...lifecycleBatches.values()].map((batch) => ({
      store: batch.store,
      indices: batch.indices,
      action: despawnLifecycleAction,
      eventCode,
      accepted: true,
    })),
    removalBatches: [...removalBatches.values()],
    entities: liveEntities,
  };
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
  batches: readonly ActorRowRemovalBatch[],
): boolean => {
  let touched = false;
  for (const batch of batches) {
    const removed = removeActorRowsForStore(runtime, batch.store, batch.rows);
    touched = touched || removed > 0;
  }
  return touched;
};

const removeEmptyEntityRecords = (runtime: EntityRuntimeState, entities: readonly EntityIndex[]): boolean => {
  const emptyEntities: EntityIndex[] = [];
  for (const entity of entities) {
    const rows = runtime.actorRowsByEntity[entity];
    if (rows && rows.length > 0) continue;
    emptyEntities.push(entity);
  }

  return removeEntityRecords(runtime, emptyEntities) > 0;
};

const cleanupTerminalRows = (
  runtime: EntityRuntimeState,
  transaction: EntityDispatchTransaction,
  trace: EntityTransitionTraceSession | undefined,
  phaseKind: CleanupPhaseKind,
): boolean => {
  if (transaction.terminalRows.length === 0) return false;

  const terminalEntities: EntityIndex[] = [];
  const removalBatches = new Map<string, ActorRowRemovalBatch>();
  const collectStartedAt = trace?.now();
  try {
    const terminalRows = transaction.terminalRows;
    transaction.terminalRows = [];
    for (const row of terminalRows) {
      if (!isTerminalStateCode(row.store.stateCode[row.entity])) continue;

      const ref = findActorRowRef(runtime, row.store, row.entity);
      /* v8 ignore next -- defensive terminal cleanup invariant: terminal row refs remain attached until cleanup. */
      if (!ref) continue;
      appendActorRowRemoval(removalBatches, ref);
      terminalEntities.push(row.entity);
    }
  } finally {
    recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.collectPlan`, collectStartedAt);
  }

  let touched = false;
  const removeActorRowsStartedAt = trace?.now();
  try {
    touched = removeActorRowsFromBatches(runtime, [...removalBatches.values()]);
  } finally {
    recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.removeActorRows`, removeActorRowsStartedAt);
  }

  const removeEntityRecordsStartedAt = trace?.now();
  try {
    touched = removeEmptyEntityRecords(runtime, terminalEntities) || touched;
  } finally {
    recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.removeEntityRecords`, removeEntityRecordsStartedAt);
  }
  return touched;
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
  let cleanupPlan: DespawnCleanupPlan | undefined;
  const collectStartedAt = trace?.now();
  try {
    if (despawns.length > 0) cleanupPlan = collectDespawnCleanupPlan(runtime, despawns);
  } finally {
    recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.collectPlan`, collectStartedAt);
  }

  if (cleanupPlan) {
    const reactionBatches: EntityReactionBatch[] = [];
    const lifecycleStartedAt = trace?.now();
    try {
      for (const batch of cleanupPlan.lifecycleBatches) {
        const reduced = reduceAcceptedBatch(
          runtime,
          batch,
          transaction,
          {
            scheduleDespawnOn: false,
            scheduleEffects: false,
            scheduleReactions: false,
            scheduleTerminal: false,
            onAccepted(accepted) {
              appendLifecycleReactionBatch(transaction, reactionBatches, batch.store, batch.eventCode, accepted);
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

    let removedRows = false;
    const removeActorRowsStartedAt = trace?.now();
    try {
      removedRows = removeActorRowsFromBatches(runtime, cleanupPlan.removalBatches);
    } finally {
      recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.removeActorRows`, removeActorRowsStartedAt);
    }

    let removedEntities = false;
    const removeEntityRecordsStartedAt = trace?.now();
    try {
      removedEntities = removeEntityRecords(runtime, cleanupPlan.entities) > 0;
    } finally {
      recordEntityTracePhase(trace, `entities.cleanup.${phaseKind}.removeEntityRecords`, removeEntityRecordsStartedAt);
    }
    if (removedRows) touched = true;
    if (removedEntities) touched = true;
  }

  const removedTerminals = cleanupTerminalRows(runtime, transaction, trace, phaseKind);
  touched = touched || removedTerminals;
  return touched;
};
