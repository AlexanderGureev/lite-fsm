import type { EntityIndex } from "../plugin";
import {
  ENTITY_INVALID_TRANSITION_TARGET,
  ENTITY_NO_TRANSITION,
  getEntityStateName,
} from "./compile";
import { runtimeError, type ReducerBatch } from "./reduce-shared";
import { syncPendingPrevStateCode, type ColumnarActorStore } from "./state";

type DefaultTransitionResult = {
  readonly firstNextState: string | undefined;
  readonly previousStateCodeForAccepted: number | undefined;
  readonly sourceStateCodesByAccepted?: readonly number[];
  readonly knownValidStateCodeForAccepted?: number;
};

const resolveTransitionTarget = (
  store: ColumnarActorStore,
  entity: EntityIndex,
  eventCode: number | undefined,
  eventType: string,
): { readonly accepted: boolean; readonly nextState: string | undefined; readonly sourceStateCode: number } => {
  if (eventCode === undefined) return { accepted: false, nextState: undefined, sourceStateCode: ENTITY_NO_TRANSITION };

  const previousCode = store.stateCode[entity];
  const stateSlot = previousCode + 1;
  /* v8 ignore next -- public routing and single-state fast path reject invalid source states before this fallback. */
  if (stateSlot < 0 || stateSlot >= store.metadata.stateSlotCount) {
    throw runtimeError(`actor '${store.templateKey}' has invalid stateCode ${previousCode} for entity ${entity}`);
  }

  const cell = eventCode * store.metadata.stateSlotCount + stateSlot;
  const nextCode = store.metadata.transitionTable[cell];
  if (nextCode === ENTITY_NO_TRANSITION) {
    return { accepted: false, nextState: undefined, sourceStateCode: previousCode };
  }
  if (nextCode === ENTITY_INVALID_TRANSITION_TARGET) {
    throw runtimeError(
      `actor '${store.templateKey}' transition '${eventType}' targets unknown state '${store.metadata.transitionTargetByCell[cell]}'`,
    );
  }

  store.prevStateCode[entity] = previousCode;
  store.stateCode[entity] = nextCode;
  return { accepted: true, nextState: getEntityStateName(store.metadata, nextCode), sourceStateCode: previousCode };
};

export const getAcceptedIndices = (batch: ReducerBatch): readonly EntityIndex[] => {
  if (batch.accepted) return batch.indices;

  const accepted = batch.store.acceptedScratch;
  accepted.length = 0;
  for (let index = 0; index < batch.indices.length; index += 1) {
    const entity = batch.indices[index];
    const result = resolveTransitionTarget(batch.store, entity, batch.eventCode, batch.action.type);
    if (result.accepted) accepted.push(entity);
  }
  return accepted;
};

const getAcceptedSingleStateSource = (
  batch: ReducerBatch,
  accepted: readonly EntityIndex[],
): number | undefined => {
  if (!batch.accepted || batch.eventCode === undefined) return undefined;

  const plan = batch.store.metadata.reducePlansByEventCode[batch.eventCode];
  /* v8 ignore next -- accepted public batches are compiled from event metadata and have a reduce plan. */
  if (!plan) return undefined;

  for (const sourceCode of plan.acceptStateCodes) {
    if (sourceCode >= 0 && batch.store.stateBuckets[sourceCode] === accepted) return sourceCode;
  }

  return undefined;
};

const applySingleStateDefaultTransitions = (
  batch: ReducerBatch,
  accepted: readonly EntityIndex[],
): DefaultTransitionResult | undefined => {
  const sourceCode = getAcceptedSingleStateSource(batch, accepted);
  if (sourceCode === undefined) return undefined;

  const store = batch.store;
  const eventCode = batch.eventCode!;
  const cell = eventCode * store.metadata.stateSlotCount + sourceCode + 1;
  const targetCode = store.metadata.transitionTable[cell];

  /* v8 ignore next -- accepted state bucket is built from accepting transition metadata. */
  if (targetCode === ENTITY_NO_TRANSITION) return undefined;
  if (targetCode === ENTITY_INVALID_TRANSITION_TARGET) {
    throw runtimeError(
      `actor '${store.templateKey}' transition '${batch.action.type}' targets unknown state '${store.metadata.transitionTargetByCell[cell]}'`,
    );
  }

  if (targetCode === sourceCode) {
    syncPendingPrevStateCode(store);
    return {
      firstNextState: getEntityStateName(store.metadata, sourceCode),
      previousStateCodeForAccepted: sourceCode,
      knownValidStateCodeForAccepted: sourceCode,
    };
  }

  const previousStateCodeByEntity = store.prevStateCode;
  const stateCodeByEntity = store.stateCode;
  for (let index = 0; index < accepted.length; index += 1) {
    const entity = accepted[index];
    if (stateCodeByEntity[entity] !== sourceCode) {
      throw runtimeError(
        `actor '${store.templateKey}' has invalid stateCode ${stateCodeByEntity[entity]} for entity ${entity}`,
      );
    }
    previousStateCodeByEntity[entity] = sourceCode;
    stateCodeByEntity[entity] = targetCode;
  }

  return {
    firstNextState: getEntityStateName(store.metadata, targetCode),
    previousStateCodeForAccepted: sourceCode,
    knownValidStateCodeForAccepted: targetCode,
  };
};

export const applyDefaultTransitions = (
  batch: ReducerBatch,
  accepted: readonly EntityIndex[],
): DefaultTransitionResult => {
  const fastPathNextState = applySingleStateDefaultTransitions(batch, accepted);
  if (fastPathNextState !== undefined) return fastPathNextState;

  let firstNextState: string | undefined;

  if (!batch.accepted) {
    const stateCodeByEntity = batch.store.stateCode;
    const previousStateCodeByEntity = batch.store.prevStateCode;
    const sourceStateCodes = batch.store.defaultTransitionSourceStateScratch;
    sourceStateCodes.length = accepted.length;
    for (let index = 0; index < accepted.length; index += 1) {
      const entity = accepted[index];
      sourceStateCodes[index] = previousStateCodeByEntity[entity];
      firstNextState ??= getEntityStateName(batch.store.metadata, stateCodeByEntity[entity]);
    }
    return { firstNextState, previousStateCodeForAccepted: undefined, sourceStateCodesByAccepted: sourceStateCodes };
  }

  const sourceStateCodes = batch.store.defaultTransitionSourceStateScratch;
  sourceStateCodes.length = accepted.length;
  for (let index = 0; index < accepted.length; index += 1) {
    const entity = accepted[index];
    const result = resolveTransitionTarget(batch.store, entity, batch.eventCode, batch.action.type);
    sourceStateCodes[index] = result.sourceStateCode;
    firstNextState ??= result.nextState;
  }

  return { firstNextState, previousStateCodeForAccepted: undefined, sourceStateCodesByAccepted: sourceStateCodes };
};
