import type { EntityIndex } from "../plugin";
import { ENTITY_INIT_STATE_CODE, hasDespawnOnStates, type EntityReducePlan } from "./compile";
import { isTerminalStateCode, runtimeError, type ReduceAcceptedBatchOptions } from "./reduce-shared";
import { schedulePrevStateCodeSyncRow, type ColumnarActorStore, type EntityRuntimeState } from "./state";
import {
  scheduleDespawnRowHint,
  scheduleEntityDespawn,
  type CapturedEntityScopeEntry,
  type EntityDispatchTransaction,
} from "./transaction";

type PostProcessingFlags = {
  readonly scheduleDespawnOn: boolean;
  readonly scheduleEffects: boolean;
  readonly collectReactionSurvivors: boolean;
  readonly scheduleTerminal: boolean;
};

export type EnteredEffectRows = {
  readonly indices: EntityIndex[];
  readonly entries: CapturedEntityScopeEntry[];
};

export type AcceptedRowsPostProcessing = {
  readonly dirtyRows: readonly EntityIndex[] | undefined;
  readonly dirtyRowsPreviousStateCode: number | undefined;
  readonly dirtyRowsPreviousStateCodes: readonly number[] | undefined;
  readonly bulkStateTransition: BulkStateTransition | undefined;
  readonly enteredByState: ReadonlyMap<number, EnteredEffectRows> | undefined;
  readonly cleanupRemovesAcceptedRows: boolean;
  readonly despawnOnRemovesAcceptedRows: boolean;
  readonly acceptedRowsHaveFinalRemoval: boolean;
  readonly reactionSurvivorRows: readonly EntityIndex[] | undefined;
};

export type BulkStateTransition = {
  readonly indices: readonly EntityIndex[];
  readonly previousStateCode: number;
  readonly stateCode: number;
};

const assertValidStateCode = (store: ColumnarActorStore, entity: EntityIndex, code: number): void => {
  if (code === ENTITY_INIT_STATE_CODE || store.metadata.publicStates[code] !== undefined || isTerminalStateCode(code)) {
    return;
  }
  throw runtimeError(`actor '${store.templateKey}' reducer wrote invalid stateCode ${code} for entity ${entity}`);
};

const hasStateEffects = (store: ColumnarActorStore): boolean => {
  for (const effect of store.metadata.effectsByStateCode) {
    if (effect) return true;
  }
  return false;
};

export const getPostProcessingFlags = (
  store: ColumnarActorStore,
  plan: EntityReducePlan | undefined,
  options: ReduceAcceptedBatchOptions,
): PostProcessingFlags => {
  const reducerMayOverrideState = store.metadata.reducer !== undefined;
  return {
    scheduleDespawnOn: (options.scheduleDespawnOn ?? true) && hasDespawnOnStates(store.metadata.despawnStateMask),
    scheduleEffects:
      (options.scheduleEffects ?? true) &&
      (plan?.mayEnterEffectState === true || (reducerMayOverrideState && hasStateEffects(store))),
    collectReactionSurvivors:
      options.scheduleReactions === true &&
      plan?.hasReaction === true &&
      (options.scheduleDespawnOn ?? true) &&
      hasDespawnOnStates(store.metadata.despawnStateMask),
    scheduleTerminal:
      (options.scheduleTerminal ?? true) &&
      (plan?.mayEnterTerminalState === true || reducerMayOverrideState),
  };
};

const appendEnteredEffectRow = (
  enteredByState: Map<number, EnteredEffectRows> | undefined,
  entityStore: EntityRuntimeState["entityStore"],
  stateCode: number,
  entity: EntityIndex,
  dirtyRows: EntityIndex[],
): Map<number, EnteredEffectRows> => {
  const next = enteredByState ?? new Map<number, EnteredEffectRows>();
  const entry = { entity, generation: entityStore.generation[entity], id: entityStore.ids[entity] as string };
  const entered = next.get(stateCode);
  if (entered) {
    if (entered.indices !== dirtyRows) entered.indices.push(entity);
    entered.entries.push(entry);
    return next;
  }

  next.set(stateCode, { indices: next.size === 0 ? dirtyRows : [entity], entries: [entry] });
  return next;
};

export const getEnteredEffectIndices = (entered: EnteredEffectRows): readonly EntityIndex[] => {
  if (entered.indices.length === entered.entries.length) return entered.indices;

  const indices: EntityIndex[] = new Array(entered.entries.length);
  for (let index = 0; index < entered.entries.length; index += 1) {
    indices[index] = entered.entries[index].entity;
  }
  return indices;
};

const postProcessIdentityRowsWithoutLifecycle = (
  transaction: EntityDispatchTransaction | undefined,
  store: ColumnarActorStore,
  accepted: readonly EntityIndex[],
  flags: PostProcessingFlags,
  previousStateCode: number,
): AcceptedRowsPostProcessing => {
  const stateCodeByEntity = store.stateCode;
  const rowVersion = store.rowVersion;
  let dirtyRows: EntityIndex[] | undefined;
  let cleanupRemovesAcceptedRows = false;

  for (let index = 0; index < accepted.length; index += 1) {
    const entity = accepted[index];
    const stateCode = stateCodeByEntity[entity];
    rowVersion[entity] += 1;
    if (stateCode === previousStateCode) continue;

    assertValidStateCode(store, entity, stateCode);
    if (!dirtyRows) dirtyRows = [];
    dirtyRows.push(entity);

    if (flags.scheduleTerminal && isTerminalStateCode(stateCode)) {
      cleanupRemovesAcceptedRows = true;
      /* v8 ignore next -- defensive invariant: reduceBucket receives a transaction from prepareAction. */
      if (transaction) transaction.terminalRows.push({ store, entity });
    }
  }

  return {
    dirtyRows,
    dirtyRowsPreviousStateCode: dirtyRows ? previousStateCode : undefined,
    dirtyRowsPreviousStateCodes: undefined,
    bulkStateTransition: undefined,
    enteredByState: undefined,
    cleanupRemovesAcceptedRows,
    despawnOnRemovesAcceptedRows: false,
    acceptedRowsHaveFinalRemoval: false,
    reactionSurvivorRows: undefined,
  };
};

const postProcessSingleSourceRowsWithDespawnOn = (
  transaction: EntityDispatchTransaction | undefined,
  store: ColumnarActorStore,
  accepted: readonly EntityIndex[],
  flags: PostProcessingFlags,
  previousStateCode: number,
  knownValidStateCode: number | undefined,
): AcceptedRowsPostProcessing => {
  const stateCodeByEntity = store.stateCode;
  const rowVersion = store.rowVersion;
  const despawnStateMask = store.metadata.despawnStateMask;
  let dirtyRows: EntityIndex[] | undefined;
  let cleanupRemovesAcceptedRows = false;
  let despawnOnRemovesAcceptedRows = false;
  let acceptedRowsHaveFinalRemoval = false;

  for (let index = 0; index < accepted.length; index += 1) {
    const entity = accepted[index];
    const stateCode = stateCodeByEntity[entity];
    if (stateCode === previousStateCode) {
      rowVersion[entity] += 1;
      continue;
    }

    if (stateCode !== knownValidStateCode) assertValidStateCode(store, entity, stateCode);
    rowVersion[entity] += 1;

    if (stateCode >= 0 && despawnStateMask[stateCode] === 1) {
      cleanupRemovesAcceptedRows = true;
      despawnOnRemovesAcceptedRows = true;
      /* v8 ignore next -- defensive invariant: reduceBucket receives a transaction from prepareAction. */
      if (transaction) scheduleEntityDespawn(transaction, entity);

      if (!rowNeedsDespawnLifecycle(store, stateCode)) {
        acceptedRowsHaveFinalRemoval = true;
        /* v8 ignore next -- defensive invariant: reduceBucket receives a transaction from prepareAction. */
        if (transaction) scheduleDespawnRowHint(transaction, store, entity, previousStateCode);
        continue;
      }
    }

    if (!dirtyRows) dirtyRows = [];
    dirtyRows.push(entity);

    if (flags.scheduleTerminal && isTerminalStateCode(stateCode)) {
      cleanupRemovesAcceptedRows = true;
      /* v8 ignore next -- defensive invariant: reduceBucket receives a transaction from prepareAction. */
      if (transaction) transaction.terminalRows.push({ store, entity });
    }
  }

  return {
    dirtyRows,
    dirtyRowsPreviousStateCode: dirtyRows ? previousStateCode : undefined,
    dirtyRowsPreviousStateCodes: undefined,
    bulkStateTransition: undefined,
    enteredByState: undefined,
    cleanupRemovesAcceptedRows,
    despawnOnRemovesAcceptedRows,
    acceptedRowsHaveFinalRemoval,
    reactionSurvivorRows: undefined,
  };
};

const planAcceptsStateCode = (plan: EntityReducePlan, stateCode: number): boolean => {
  for (const acceptedStateCode of plan.acceptStateCodes) {
    if (acceptedStateCode === stateCode) return true;
  }
  return false;
};

const getBulkStateTransitionCandidate = (
  store: ColumnarActorStore,
  accepted: readonly EntityIndex[],
  flags: PostProcessingFlags,
  plan: EntityReducePlan | undefined,
  previousStateCodeForAccepted: number | undefined,
  knownValidStateCodeForAccepted: number | undefined,
): BulkStateTransition | undefined => {
  if (!plan?.hasNonIdentityDefaultTransition) return undefined;
  if (previousStateCodeForAccepted === undefined || knownValidStateCodeForAccepted === undefined) return undefined;
  if (previousStateCodeForAccepted === knownValidStateCodeForAccepted) return undefined;
  if (previousStateCodeForAccepted < 0 || knownValidStateCodeForAccepted < 0) return undefined;
  if (!planAcceptsStateCode(plan, previousStateCodeForAccepted)) return undefined;
  if (store.stateBuckets[previousStateCodeForAccepted] !== accepted) return undefined;
  if (store.stateBuckets[knownValidStateCodeForAccepted]?.length !== 0) return undefined;
  if (flags.scheduleDespawnOn && store.metadata.despawnStateMask[knownValidStateCodeForAccepted] === 1) {
    return undefined;
  }

  return {
    indices: accepted,
    previousStateCode: previousStateCodeForAccepted,
    stateCode: knownValidStateCodeForAccepted,
  };
};

const createEnteredEffectRows = (
  transaction: EntityDispatchTransaction,
  accepted: readonly EntityIndex[],
): EnteredEffectRows => {
  const entityStore = transaction.runtime.entityStore;
  const entries: CapturedEntityScopeEntry[] = new Array(accepted.length);
  for (let index = 0; index < accepted.length; index += 1) {
    const entity = accepted[index];
    entries[index] = { entity, generation: entityStore.generation[entity], id: entityStore.ids[entity] as string };
  }
  return { indices: accepted as EntityIndex[], entries };
};

const rowNeedsDespawnLifecycle = (store: ColumnarActorStore, stateCode: number): boolean => {
  const stateSlot = stateCode + 1;
  return stateSlot >= 0 && store.metadata.despawnLifecycleStateMask[stateSlot] === 1;
};

const getSourceBucketStateCode = (
  entity: EntityIndex,
  index: number,
  previousStateCodeForAccepted: number | undefined,
  sourceStateCodesByAccepted: readonly number[] | undefined,
  previousStateCodeByEntity: Int16Array,
): number => {
  if (previousStateCodeForAccepted !== undefined) return previousStateCodeForAccepted;
  /* v8 ignore next 3 -- reduceAcceptedBatch provides per-row source states when there is no shared source state. */
  if (sourceStateCodesByAccepted === undefined) {
    return previousStateCodeByEntity[entity];
  }
  return sourceStateCodesByAccepted[index];
};

const tryPostProcessBulkStateTransition = (
  transaction: EntityDispatchTransaction | undefined,
  store: ColumnarActorStore,
  accepted: readonly EntityIndex[],
  flags: PostProcessingFlags,
  plan: EntityReducePlan | undefined,
  previousStateCodeForAccepted: number | undefined,
  knownValidStateCodeForAccepted: number | undefined,
): AcceptedRowsPostProcessing | undefined => {
  const bulkStateTransition = getBulkStateTransitionCandidate(
    store,
    accepted,
    flags,
    plan,
    previousStateCodeForAccepted,
    knownValidStateCodeForAccepted,
  );
  if (!bulkStateTransition) return undefined;

  const stateCodeByEntity = store.stateCode;
  for (let index = 0; index < accepted.length; index += 1) {
    if (stateCodeByEntity[accepted[index]] !== bulkStateTransition.stateCode) return undefined;
  }

  const rowVersion = store.rowVersion;
  for (let index = 0; index < accepted.length; index += 1) {
    const entity = accepted[index];
    rowVersion[entity] += 1;
    schedulePrevStateCodeSyncRow(store, entity);
  }

  let enteredByState: Map<number, EnteredEffectRows> | undefined;
  if (
    flags.scheduleEffects &&
    transaction &&
    store.metadata.effectsByStateCode[bulkStateTransition.stateCode]
  ) {
    enteredByState = new Map<number, EnteredEffectRows>();
    enteredByState.set(bulkStateTransition.stateCode, createEnteredEffectRows(transaction, accepted));
  }

  return {
    dirtyRows: undefined,
    dirtyRowsPreviousStateCode: undefined,
    dirtyRowsPreviousStateCodes: undefined,
    bulkStateTransition,
    enteredByState,
    cleanupRemovesAcceptedRows: false,
    despawnOnRemovesAcceptedRows: false,
    acceptedRowsHaveFinalRemoval: false,
    reactionSurvivorRows: undefined,
  };
};

export const postProcessAcceptedRows = (
  transaction: EntityDispatchTransaction | undefined,
  store: ColumnarActorStore,
  accepted: readonly EntityIndex[],
  flags: PostProcessingFlags,
  plan: EntityReducePlan | undefined,
  previousStateCodeForAccepted: number | undefined,
  knownValidStateCodeForAccepted: number | undefined,
  sourceStateCodesByAccepted?: readonly number[],
): AcceptedRowsPostProcessing => {
  const bulkStateTransition = tryPostProcessBulkStateTransition(
    transaction,
    store,
    accepted,
    flags,
    plan,
    previousStateCodeForAccepted,
    knownValidStateCodeForAccepted,
  );
  if (bulkStateTransition) return bulkStateTransition;

  if (
    previousStateCodeForAccepted !== undefined &&
    !flags.scheduleDespawnOn &&
    !flags.scheduleEffects
  ) {
    return postProcessIdentityRowsWithoutLifecycle(
      transaction,
      store,
      accepted,
      flags,
      previousStateCodeForAccepted,
    );
  }

  if (
    previousStateCodeForAccepted !== undefined &&
    flags.scheduleDespawnOn &&
    !flags.scheduleEffects &&
    !flags.collectReactionSurvivors &&
    (previousStateCodeForAccepted < 0 || store.metadata.despawnStateMask[previousStateCodeForAccepted] !== 1)
  ) {
    return postProcessSingleSourceRowsWithDespawnOn(
      transaction,
      store,
      accepted,
      flags,
      previousStateCodeForAccepted,
      knownValidStateCodeForAccepted,
    );
  }

  let dirtyRows: EntityIndex[] | undefined;
  let dirtyRowsPreviousStateCodes: number[] | undefined;
  let enteredByState: Map<number, EnteredEffectRows> | undefined;
  let cleanupRemovesAcceptedRows = false;
  let despawnOnRemovesAcceptedRows = false;
  let acceptedRowsHaveFinalRemoval = false;
  let reactionSurvivorRows: EntityIndex[] | undefined;
  const canSkipCleanStateValidation = previousStateCodeForAccepted !== undefined;
  const stateCodeByEntity = store.stateCode;
  const previousStateCodeByEntity = store.prevStateCode;
  const rowVersion = store.rowVersion;
  const despawnStateMask = store.metadata.despawnStateMask;
  const effectsByStateCode = store.metadata.effectsByStateCode;

  for (let index = 0; index < accepted.length; index += 1) {
    const entity = accepted[index];
    const stateCode = stateCodeByEntity[entity];
    const previousStateCode = getSourceBucketStateCode(
      entity,
      index,
      previousStateCodeForAccepted,
      sourceStateCodesByAccepted,
      previousStateCodeByEntity,
    );
    const dirty = stateCode !== previousStateCode;
    const knownValid =
      previousStateCodeForAccepted !== undefined &&
      (stateCode === previousStateCodeForAccepted || stateCode === knownValidStateCodeForAccepted);
    if ((dirty || !canSkipCleanStateValidation) && !knownValid) assertValidStateCode(store, entity, stateCode);
    rowVersion[entity] += 1;

    let despawned = false;
    if (flags.scheduleDespawnOn && stateCode >= 0 && despawnStateMask[stateCode] === 1) {
      cleanupRemovesAcceptedRows = true;
      despawnOnRemovesAcceptedRows = true;
      despawned = true;
      if (flags.collectReactionSurvivors && !reactionSurvivorRows) {
        reactionSurvivorRows = [];
        for (let copyIndex = 0; copyIndex < index; copyIndex += 1) {
          reactionSurvivorRows.push(accepted[copyIndex]);
        }
      }
      /* v8 ignore next -- defensive invariant: reduceBucket receives a transaction from prepareAction. */
      if (transaction) scheduleEntityDespawn(transaction, entity);

      if (!rowNeedsDespawnLifecycle(store, stateCode)) {
        acceptedRowsHaveFinalRemoval = true;
        /* v8 ignore next -- defensive invariant: reduceBucket receives a transaction from prepareAction. */
        if (transaction) scheduleDespawnRowHint(transaction, store, entity, previousStateCode);
        continue;
      }
    } else {
      reactionSurvivorRows?.push(entity);
    }

    if (!dirty) continue;

    if (!dirtyRows) {
      dirtyRows = [];
      if (previousStateCodeForAccepted === undefined) dirtyRowsPreviousStateCodes = [];
    }
    dirtyRows.push(entity);
    dirtyRowsPreviousStateCodes?.push(previousStateCode);

    if (flags.scheduleTerminal && isTerminalStateCode(stateCode)) {
      cleanupRemovesAcceptedRows = true;
      /* v8 ignore next -- defensive invariant: reduceBucket receives a transaction from prepareAction. */
      if (transaction) transaction.terminalRows.push({ store, entity });
      continue;
    }

    if (flags.scheduleEffects && transaction && !despawned && stateCode >= 0 && effectsByStateCode[stateCode]) {
      enteredByState = appendEnteredEffectRow(
        enteredByState,
        transaction.runtime.entityStore,
        stateCode,
        entity,
        dirtyRows,
      );
    }
  }

  return {
    dirtyRows,
    dirtyRowsPreviousStateCode: dirtyRows ? previousStateCodeForAccepted : undefined,
    dirtyRowsPreviousStateCodes,
    bulkStateTransition: undefined,
    enteredByState,
    cleanupRemovesAcceptedRows,
    despawnOnRemovesAcceptedRows,
    acceptedRowsHaveFinalRemoval,
    reactionSurvivorRows,
  };
};
