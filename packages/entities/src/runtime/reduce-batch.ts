import type { EntityIndex } from "../plugin";
import type { EntityReducePlan } from "./compile";
import { ENTITY_SPAWNED } from "./lifecycle";
import {
  getEnteredEffectIndices,
  getPostProcessingFlags,
  postProcessAcceptedRows,
  type AcceptedRowsPostProcessing,
  type EnteredEffectRows,
} from "./reduce-post-process";
import { runtimeError, type ReduceAcceptedBatchOptions, type ReducerBatch } from "./reduce-shared";
import { applyDefaultTransitions, getAcceptedIndices } from "./reduce-transitions";
import {
  getActorReducerSelf,
  moveActorStateBucket,
  moveActorStateBucketBatch,
  refreshActorPublicSlice,
  schedulePrevStateCodeSync,
  type ColumnarActorStore,
  type EntityRuntimeState,
} from "./state";
import {
  scheduleEntityEffectBatch,
  scheduleEntityReactionBatch,
  type EntityDispatchTransaction,
  type EntityReactionBatchOwnership,
} from "./transaction";
import { recordEntityTracePhase } from "./transitionTrace";

const markActorRowsTouched = (store: ColumnarActorStore): void => {
  store.version += 1;
  refreshActorPublicSlice(store);
};

const updateActorStateBuckets = (
  store: ColumnarActorStore,
  indices: readonly EntityIndex[],
  previousStateCode: number | undefined,
): void => {
  const previousStateCodeByEntity = store.prevStateCode;
  const stateCodeByEntity = store.stateCode;
  for (let index = indices.length - 1; index >= 0; index -= 1) {
    const entity = indices[index];
    moveActorStateBucket(
      store,
      entity,
      previousStateCode ?? previousStateCodeByEntity[entity],
      stateCodeByEntity[entity],
    );
  }
};

const scheduleEnteredStateEffects = (
  transaction: EntityDispatchTransaction | undefined,
  store: ColumnarActorStore,
  enteredByState: ReadonlyMap<number, EnteredEffectRows> | undefined,
): void => {
  /* v8 ignore next -- defensive invariant: reduceBucket receives a transaction from prepareAction. */
  if (!transaction || !enteredByState) return;

  for (const [stateCode, entered] of enteredByState) {
    scheduleEntityEffectBatch(transaction, store, stateCode, getEnteredEffectIndices(entered), entered.entries);
  }
};

export const isSingleStateBucketReactionSource = (
  store: ColumnarActorStore,
  eventCode: number,
  indices: readonly EntityIndex[],
): boolean => {
  const buckets = store.acceptStateBucketsByEventCode[eventCode];
  return buckets !== undefined && buckets.length === 1 && buckets[0] === indices;
};

const chooseReactionBatchOwnership = (
  plan: EntityReducePlan | undefined,
  postProcessing: AcceptedRowsPostProcessing,
  options: ReduceAcceptedBatchOptions,
): EntityReactionBatchOwnership => {
  if (!options.allowBorrowedReactionBatch) return "owned";
  if (plan?.allDefaultTransitionsIdentity !== true) return "owned";
  if (postProcessing.dirtyRows && postProcessing.dirtyRows.length > 0) return "owned";
  if (postProcessing.cleanupRemovesAcceptedRows) return "owned";
  return "borrowed";
};

const createPayloadFor = (
  store: ColumnarActorStore,
  payloadByEntity: ReadonlyMap<EntityIndex, Record<string, unknown>> | undefined,
) => {
  if (!payloadByEntity) {
    return (): Record<string, unknown> => {
      throw runtimeError(`payloadFor(entity) is only available while reducing ${ENTITY_SPAWNED}`);
    };
  }

  return (entity: EntityIndex): Record<string, unknown> => {
    if (!payloadByEntity.has(entity)) {
      throw runtimeError(
        `payloadFor(entity) for actor '${store.templateKey}' only accepts EntityIndex values from current spawn scope`,
      );
    }
    return payloadByEntity.get(entity)!;
  };
};

const getBatchReducePlan = (batch: ReducerBatch): EntityReducePlan | undefined => {
  /* v8 ignore next -- accepted reducer batches are compiled event batches; this keeps lifecycle no-plan paths defensive. */
  if (batch.eventCode === undefined) return undefined;
  return batch.store.metadata.reducePlansByEventCode[batch.eventCode];
};

export const reduceAcceptedBatch = (
  runtime: EntityRuntimeState,
  batch: ReducerBatch,
  transaction: EntityDispatchTransaction | undefined,
  options: ReduceAcceptedBatchOptions = {},
): boolean => {
  const traceBatchPrefix = options.traceBatchPrefix ?? "entities.reduce.publicBatch";
  const trace = options.tracePublicBatch || options.traceBatchPrefix ? options.trace : undefined;
  const totalStartedAt = trace?.now();
  try {
    let accepted: readonly EntityIndex[] = [];
    let firstNextState: string | undefined;
    let previousStateCodeForAccepted: number | undefined;
    let knownValidStateCodeForAccepted: number | undefined;
    const defaultTransitionsStartedAt = trace?.now();
    try {
      accepted = getAcceptedIndices(batch);
      if (accepted.length === 0) return false;
      const defaultTransitions = applyDefaultTransitions(batch, accepted);
      firstNextState = defaultTransitions.firstNextState;
      previousStateCodeForAccepted = defaultTransitions.previousStateCodeForAccepted;
      knownValidStateCodeForAccepted = defaultTransitions.knownValidStateCodeForAccepted;
    } finally {
      recordEntityTracePhase(trace, `${traceBatchPrefix}.defaultTransitions`, defaultTransitionsStartedAt);
    }

    const reducer = batch.store.metadata.reducer;
    const userReducerStartedAt = trace?.now();
    try {
      if (reducer) {
        const nextState = firstNextState!;
        const result = reducer({ state: nextState, context: {} }, batch.action, {
          nextState,
          config: batch.store.metadata.config,
          self: getActorReducerSelf(batch.store, accepted),
          entities: () => runtime.access,
          payloadFor: createPayloadFor(batch.store, batch.payloadByEntity),
        });
        if (result instanceof Promise) {
          throw runtimeError(
            `reducer for actor '${batch.store.templateKey}' and event '${batch.action.type}' returned a Promise; entity reducers are sync-only`,
          );
        }
      }
    } finally {
      recordEntityTracePhase(trace, `${traceBatchPrefix}.userReducer`, userReducerStartedAt);
    }

    const plan = getBatchReducePlan(batch);
    let postProcessing: AcceptedRowsPostProcessing;
    const postProcessStartedAt = trace?.now();
    try {
      postProcessing = postProcessAcceptedRows(
        transaction,
        batch.store,
        accepted,
        getPostProcessingFlags(batch.store, plan, options),
        plan,
        previousStateCodeForAccepted,
        knownValidStateCodeForAccepted,
      );
    } finally {
      recordEntityTracePhase(trace, `${traceBatchPrefix}.postProcess`, postProcessStartedAt);
    }

    const markTouchedStartedAt = trace?.now();
    try {
      markActorRowsTouched(batch.store);
    } finally {
      recordEntityTracePhase(trace, `${traceBatchPrefix}.markTouched`, markTouchedStartedAt);
    }

    const scheduleEffectsStartedAt = trace?.now();
    try {
      scheduleEnteredStateEffects(transaction, batch.store, postProcessing.enteredByState);
    } finally {
      recordEntityTracePhase(trace, `${traceBatchPrefix}.scheduleEffects`, scheduleEffectsStartedAt);
    }

    const scheduleReactionsStartedAt = trace?.now();
    try {
      if (options.scheduleReactions && batch.eventCode !== undefined) {
        scheduleEntityReactionBatch(transaction, batch.store, batch.eventCode, accepted, {
          ownership: chooseReactionBatchOwnership(plan, postProcessing, options),
        });
      }
    } finally {
      recordEntityTracePhase(trace, `${traceBatchPrefix}.scheduleReactions`, scheduleReactionsStartedAt);
    }

    const updateStateBucketsStartedAt = trace?.now();
    try {
      if (postProcessing.bulkStateTransition) {
        const moved = moveActorStateBucketBatch(
          batch.store,
          postProcessing.bulkStateTransition.previousStateCode,
          postProcessing.bulkStateTransition.stateCode,
          postProcessing.bulkStateTransition.indices,
        );
        if (!moved) {
          updateActorStateBuckets(
            batch.store,
            postProcessing.bulkStateTransition.indices,
            postProcessing.bulkStateTransition.previousStateCode,
          );
        }
      }
      if (postProcessing.dirtyRows) {
        updateActorStateBuckets(batch.store, postProcessing.dirtyRows, postProcessing.dirtyRowsPreviousStateCode);
        schedulePrevStateCodeSync(batch.store, postProcessing.dirtyRows);
      }
    } finally {
      recordEntityTracePhase(trace, `${traceBatchPrefix}.updateStateBuckets`, updateStateBucketsStartedAt);
    }

    options.onAccepted?.(accepted);
    return true;
  } finally {
    recordEntityTracePhase(trace, `${traceBatchPrefix}.total`, totalStartedAt);
  }
};
