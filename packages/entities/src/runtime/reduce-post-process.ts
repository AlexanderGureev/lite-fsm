import type { EntityIndex } from "../plugin";
import { ENTITY_INIT_STATE_CODE, hasDespawnOnStates, type EntityReducePlan } from "./compile";
import { isTerminalStateCode, runtimeError, type ReduceAcceptedBatchOptions } from "./reduce-shared";
import type { ColumnarActorStore, EntityRuntimeState } from "./state";
import { scheduleEntityDespawn, type CapturedEntityScopeEntry, type EntityDispatchTransaction } from "./transaction";

type PostProcessingFlags = {
  readonly scheduleDespawnOn: boolean;
  readonly scheduleEffects: boolean;
  readonly scheduleTerminal: boolean;
};

export type EnteredEffectRows = {
  readonly indices: EntityIndex[];
  readonly entries: CapturedEntityScopeEntry[];
};

export type AcceptedRowsPostProcessing = {
  readonly dirtyRows: readonly EntityIndex[] | undefined;
  readonly dirtyRowsPreviousStateCode: number | undefined;
  readonly enteredByState: ReadonlyMap<number, EnteredEffectRows> | undefined;
  readonly cleanupRemovesAcceptedRows: boolean;
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
    enteredByState: undefined,
    cleanupRemovesAcceptedRows,
  };
};

export const postProcessAcceptedRows = (
  transaction: EntityDispatchTransaction | undefined,
  store: ColumnarActorStore,
  accepted: readonly EntityIndex[],
  flags: PostProcessingFlags,
  previousStateCodeForAccepted: number | undefined,
  knownValidStateCodeForAccepted: number | undefined,
): AcceptedRowsPostProcessing => {
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

  let dirtyRows: EntityIndex[] | undefined;
  let enteredByState: Map<number, EnteredEffectRows> | undefined;
  let cleanupRemovesAcceptedRows = false;
  const canSkipCleanStateValidation = previousStateCodeForAccepted !== undefined;
  const stateCodeByEntity = store.stateCode;
  const previousStateCodeByEntity = store.prevStateCode;
  const rowVersion = store.rowVersion;
  const despawnStateMask = store.metadata.despawnStateMask;
  const effectsByStateCode = store.metadata.effectsByStateCode;

  for (let index = 0; index < accepted.length; index += 1) {
    const entity = accepted[index];
    const stateCode = stateCodeByEntity[entity];
    const previousStateCode = previousStateCodeForAccepted ?? previousStateCodeByEntity[entity];
    const dirty = stateCode !== previousStateCode;
    const knownValid =
      previousStateCodeForAccepted !== undefined &&
      (stateCode === previousStateCodeForAccepted || stateCode === knownValidStateCodeForAccepted);
    if ((dirty || !canSkipCleanStateValidation) && !knownValid) assertValidStateCode(store, entity, stateCode);
    rowVersion[entity] += 1;

    let despawned = false;
    if (flags.scheduleDespawnOn && stateCode >= 0 && despawnStateMask[stateCode] === 1) {
      cleanupRemovesAcceptedRows = true;
      despawned = true;
      /* v8 ignore next -- defensive invariant: reduceBucket receives a transaction from prepareAction. */
      if (transaction) scheduleEntityDespawn(transaction, entity);
    }

    if (!dirty) continue;

    if (!dirtyRows) dirtyRows = [];
    dirtyRows.push(entity);

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
    enteredByState,
    cleanupRemovesAcceptedRows,
  };
};
