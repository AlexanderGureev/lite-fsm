import { LiteFsmError } from "@lite-fsm/core";
import type { AnyEvent, ManagerAction, StorageReduceBucketContext } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import {
  ENTITY_CANCELLED_STATE_CODE,
  ENTITY_INIT_STATE_CODE,
  ENTITY_INVALID_TRANSITION_TARGET,
  ENTITY_NO_TRANSITION,
  ENTITY_REJECTED_STATE_CODE,
  ENTITY_RESOLVED_STATE_CODE,
  getEntityStateName,
  type EntityReducePlan,
} from "./compile";
import { ENTITY_DESPAWNED, ENTITY_SPAWNED } from "./lifecycle";
import { restoreRuntimeMutation, snapshotRuntimeMutation } from "./mutation-snapshot";
import { collectEntityPublicReducerBatches } from "./routing";
import {
  addActorRowOwnership,
  addEntityToGroupBucket,
  ensureActorCapacity,
  ensureEntityCapacity,
  getActorReducerSelf,
  moveActorStateBucket,
  removeActorRowsForStore,
  removeEntityRecords,
  refreshActorPublicSlice,
  schedulePrevStateCodeSync,
  syncPendingPrevStateCode,
  writeInitialColumnValues,
  type ColumnarActorStore,
  type EntityActorRowRef,
  type EntityRuntimeState,
} from "./state";
import {
  consumeScheduledDespawns,
  createEntityReactionBatch,
  getEntityTransaction,
  getStagedSpawns,
  scheduleEntityDespawn,
  scheduleEntityEffectBatch,
  scheduleEntityReactionBatch,
  type CapturedEntityScopeEntry,
  type EntityDispatchTransaction,
  type EntityReactionBatch,
  type EntityReactionBatchOwnership,
  type StagedEntitySpawn,
} from "./transaction";
import { runEntityReactionBatches } from "./reactions";
import {
  readEntityTransitionTraceSession,
  recordEntityTracePhase,
  type EntityTransitionTraceSession,
} from "./transitionTrace";

type SpawnBatch = {
  readonly store: ColumnarActorStore;
  readonly indices: EntityIndex[];
  readonly payloadByEntity: Map<EntityIndex, Record<string, unknown>>;
};

type ReducerBatch = {
  readonly store: ColumnarActorStore;
  readonly indices: readonly EntityIndex[];
  readonly action: ManagerAction<AnyEvent>;
  readonly eventCode: number | undefined;
  readonly accepted?: true;
  readonly payloadByEntity?: ReadonlyMap<EntityIndex, Record<string, unknown>>;
};

type ReduceAcceptedBatchOptions = {
  readonly allowBorrowedReactionBatch?: boolean;
  readonly scheduleDespawnOn?: boolean;
  readonly scheduleEffects?: boolean;
  readonly scheduleReactions?: boolean;
  readonly scheduleTerminal?: boolean;
  readonly trace?: EntityTransitionTraceSession;
  readonly tracePublicBatch?: boolean;
  onAccepted?(accepted: readonly EntityIndex[]): void;
};

type LifecycleReactionContext = Pick<StorageReduceBucketContext<any>, "dispatch" | "manager">;

type ActorRowRemovalBatch = {
  readonly store: ColumnarActorStore;
  readonly rows: EntityActorRowRef[];
};

type DespawnCleanupPlan = {
  readonly lifecycleBatches: ReducerBatch[];
  readonly removalBatches: ActorRowRemovalBatch[];
  readonly entities: EntityIndex[];
};

type PostProcessingFlags = {
  readonly scheduleDespawnOn: boolean;
  readonly scheduleEffects: boolean;
  readonly scheduleTerminal: boolean;
};

type AcceptedRowsPostProcessing = {
  readonly dirtyRows: readonly EntityIndex[] | undefined;
  readonly dirtyRowsPreviousStateCode: number | undefined;
  readonly enteredByState: ReadonlyMap<number, EnteredEffectRows> | undefined;
  readonly cleanupRemovesAcceptedRows: boolean;
};

type EnteredEffectRows = {
  readonly indices: EntityIndex[];
  readonly entries: CapturedEntityScopeEntry[];
};

type DefaultTransitionResult = {
  readonly firstNextState: string | undefined;
  readonly previousStateCodeForAccepted: number | undefined;
  readonly knownValidStateCodeForAccepted?: number;
};

type CleanupPhaseKind = "spawn" | "public";

const spawnLifecycleAction: ManagerAction<AnyEvent> = { type: ENTITY_SPAWNED };
const despawnLifecycleAction: ManagerAction<AnyEvent> = { type: ENTITY_DESPAWNED };

const runtimeError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_STORAGE_RUNTIME", `[lite-fsm/entities] ${reason}.`);

const toEntityIndex = (value: number): EntityIndex => value as EntityIndex;

const resolveTransitionTarget = (
  store: ColumnarActorStore,
  entity: EntityIndex,
  eventCode: number | undefined,
  eventType: string,
): { readonly accepted: boolean; readonly nextState: string | undefined } => {
  if (eventCode === undefined) return { accepted: false, nextState: undefined };

  const previousCode = store.stateCode[entity];
  const stateSlot = previousCode + 1;
  /* v8 ignore next -- public routing and single-state fast path reject invalid source states before this fallback. */
  if (stateSlot < 0 || stateSlot >= store.metadata.stateSlotCount) {
    throw runtimeError(`actor '${store.templateKey}' has invalid stateCode ${previousCode} for entity ${entity}`);
  }

  const cell = eventCode * store.metadata.stateSlotCount + stateSlot;
  const nextCode = store.metadata.transitionTable[cell];
  if (nextCode === ENTITY_NO_TRANSITION) return { accepted: false, nextState: undefined };
  if (nextCode === ENTITY_INVALID_TRANSITION_TARGET) {
    throw runtimeError(
      `actor '${store.templateKey}' transition '${eventType}' targets unknown state '${store.metadata.transitionTargetByCell[cell]}'`,
    );
  }

  store.prevStateCode[entity] = previousCode;
  store.stateCode[entity] = nextCode;
  return { accepted: true, nextState: getEntityStateName(store.metadata, nextCode) };
};

const isTerminalStateCode = (code: number): boolean =>
  code === ENTITY_RESOLVED_STATE_CODE || code === ENTITY_REJECTED_STATE_CODE || code === ENTITY_CANCELLED_STATE_CODE;

const assertValidStateCode = (store: ColumnarActorStore, entity: EntityIndex, code: number): void => {
  if (code === ENTITY_INIT_STATE_CODE || store.metadata.publicStates[code] !== undefined || isTerminalStateCode(code)) {
    return;
  }
  throw runtimeError(`actor '${store.templateKey}' reducer wrote invalid stateCode ${code} for entity ${entity}`);
};

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
    moveActorStateBucket(store, entity, previousStateCode ?? previousStateCodeByEntity[entity], stateCodeByEntity[entity]);
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

const hasStateEffects = (store: ColumnarActorStore): boolean => {
  for (const effect of store.metadata.effectsByStateCode) {
    if (effect) return true;
  }
  return false;
};

const hasDespawnOnStates = (store: ColumnarActorStore): boolean => {
  for (let stateCode = 0; stateCode < store.metadata.despawnStateMask.length; stateCode += 1) {
    if (store.metadata.despawnStateMask[stateCode] === 1) return true;
  }
  return false;
};

const getPostProcessingFlags = (
  store: ColumnarActorStore,
  plan: EntityReducePlan | undefined,
  options: ReduceAcceptedBatchOptions,
): PostProcessingFlags => {
  const reducerMayOverrideState = store.metadata.reducer !== undefined;
  return {
    scheduleDespawnOn: (options.scheduleDespawnOn ?? true) && hasDespawnOnStates(store),
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

const getEnteredEffectIndices = (entered: EnteredEffectRows): readonly EntityIndex[] => {
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

const postProcessAcceptedRows = (
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

const appendLifecycleReactionBatch = (
  transaction: EntityDispatchTransaction | undefined,
  batches: EntityReactionBatch[],
  store: ColumnarActorStore,
  eventCode: number | undefined,
  indices: readonly EntityIndex[],
): void => {
  const batch = createEntityReactionBatch(transaction, store, eventCode, indices, { ownership: "owned" });
  if (batch) batches.push(batch);
};

const isSingleStateBucketReactionSource = (
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

const getAcceptedIndices = (batch: ReducerBatch): readonly EntityIndex[] => {
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

const applyDefaultTransitions = (batch: ReducerBatch, accepted: readonly EntityIndex[]): DefaultTransitionResult => {
  const fastPathNextState = applySingleStateDefaultTransitions(batch, accepted);
  if (fastPathNextState !== undefined) return fastPathNextState;

  let firstNextState: string | undefined;

  if (!batch.accepted) {
    const stateCodeByEntity = batch.store.stateCode;
    for (let index = 0; index < accepted.length; index += 1) {
      const entity = accepted[index];
      firstNextState ??= getEntityStateName(batch.store.metadata, stateCodeByEntity[entity]);
    }
    return { firstNextState, previousStateCodeForAccepted: undefined };
  }

  for (let index = 0; index < accepted.length; index += 1) {
    const entity = accepted[index];
    const result = resolveTransitionTarget(batch.store, entity, batch.eventCode, batch.action.type);
    firstNextState ??= result.nextState;
  }

  return { firstNextState, previousStateCodeForAccepted: undefined };
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

const getBatchReducePlan = (batch: ReducerBatch): EntityReducePlan | undefined => {
  /* v8 ignore next -- accepted reducer batches are compiled event batches; this keeps lifecycle no-plan paths defensive. */
  if (batch.eventCode === undefined) return undefined;
  return batch.store.metadata.reducePlansByEventCode[batch.eventCode];
};

const reduceAcceptedBatch = (
  batch: ReducerBatch,
  transaction: EntityDispatchTransaction | undefined,
  options: ReduceAcceptedBatchOptions = {},
): boolean => {
  const trace = options.tracePublicBatch ? options.trace : undefined;
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
      recordEntityTracePhase(trace, "entities.reduce.publicBatch.defaultTransitions", defaultTransitionsStartedAt);
    }

    const reducer = batch.store.metadata.reducer;
    const userReducerStartedAt = trace?.now();
    try {
      if (reducer) {
        const nextState = firstNextState!;
        reducer(
          { state: nextState, context: {} },
          batch.action,
          {
            nextState,
            config: batch.store.metadata.config,
            self: getActorReducerSelf(batch.store, accepted),
            payloadFor: createPayloadFor(batch.store, batch.payloadByEntity),
          },
        );
      }
    } finally {
      recordEntityTracePhase(trace, "entities.reduce.publicBatch.userReducer", userReducerStartedAt);
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
        previousStateCodeForAccepted,
        knownValidStateCodeForAccepted,
      );
    } finally {
      recordEntityTracePhase(trace, "entities.reduce.publicBatch.postProcess", postProcessStartedAt);
    }

    const markTouchedStartedAt = trace?.now();
    try {
      markActorRowsTouched(batch.store);
    } finally {
      recordEntityTracePhase(trace, "entities.reduce.publicBatch.markTouched", markTouchedStartedAt);
    }

    const scheduleEffectsStartedAt = trace?.now();
    try {
      scheduleEnteredStateEffects(transaction, batch.store, postProcessing.enteredByState);
    } finally {
      recordEntityTracePhase(trace, "entities.reduce.publicBatch.scheduleEffects", scheduleEffectsStartedAt);
    }

    const scheduleReactionsStartedAt = trace?.now();
    try {
      if (options.scheduleReactions && batch.eventCode !== undefined) {
        scheduleEntityReactionBatch(transaction, batch.store, batch.eventCode, accepted, {
          ownership: chooseReactionBatchOwnership(plan, postProcessing, options),
        });
      }
    } finally {
      recordEntityTracePhase(trace, "entities.reduce.publicBatch.scheduleReactions", scheduleReactionsStartedAt);
    }

    const updateStateBucketsStartedAt = trace?.now();
    try {
      if (postProcessing.dirtyRows) {
        updateActorStateBuckets(batch.store, postProcessing.dirtyRows, postProcessing.dirtyRowsPreviousStateCode);
        schedulePrevStateCodeSync(batch.store, postProcessing.dirtyRows);
      }
    } finally {
      recordEntityTracePhase(trace, "entities.reduce.publicBatch.updateStateBuckets", updateStateBucketsStartedAt);
    }

    options.onAccepted?.(accepted);
    return true;
  } finally {
    recordEntityTracePhase(trace, "entities.reduce.publicBatch.total", totalStartedAt);
  }
};

const allocateEntity = (runtime: EntityRuntimeState, staged: StagedEntitySpawn): EntityIndex => {
  const entityStore = runtime.entityStore;
  const entity = entityStore.freeList.pop() ?? toEntityIndex(entityStore.ids.length);

  ensureEntityCapacity(entityStore, entity + 1);
  entityStore.ids[entity] = staged.id;
  entityStore.indexById[staged.id] = entity;
  entityStore.alive[entity] = 1;
  entityStore.generation[entity] += 1;
  entityStore.groupTagByIndex[entity] = staged.groupTag;
  addEntityToGroupBucket(entityStore, entity, staged.groupTag);
  entityStore.count += 1;
  entityStore.version += 1;
  return entity;
};

const stageActorRow = (
  runtime: EntityRuntimeState,
  batches: Map<string, SpawnBatch>,
  entity: EntityIndex,
  staged: StagedEntitySpawn,
): void => {
  for (const actor of staged.actors) {
    const store = runtime.actorStores[actor.templateKey];
    ensureActorCapacity(store, entity + 1);
    store.presence[entity] = 1;
    store.stateCode[entity] = ENTITY_INIT_STATE_CODE;
    store.prevStateCode[entity] = ENTITY_INIT_STATE_CODE;
    store.rowVersion[entity] = 0;
    store.count += 1;
    store.version += 1;
    writeInitialColumnValues(store, entity);
    addActorRowOwnership(runtime, store, entity, staged.groupTag);
    refreshActorPublicSlice(store);

    const batch = batches.get(actor.templateKey) ?? {
      store,
      indices: [],
      payloadByEntity: new Map<EntityIndex, Record<string, unknown>>(),
    };
    batch.indices.push(entity);
    batch.payloadByEntity.set(entity, actor.payload);
    batches.set(actor.templateKey, batch);
  }
};

const applyStagedSpawns = (
  runtime: EntityRuntimeState,
  stagedSpawns: readonly StagedEntitySpawn[],
): readonly SpawnBatch[] => {
  const batches = new Map<string, SpawnBatch>();
  for (const staged of stagedSpawns) {
    const entity = allocateEntity(runtime, staged);
    stageActorRow(runtime, batches, entity, staged);
  }

  return [...batches.values()];
};

const reduceStagedSpawnLifecycle = (
  runtime: EntityRuntimeState,
  staged: readonly StagedEntitySpawn[],
  transaction: EntityDispatchTransaction | undefined,
  reactionContext: LifecycleReactionContext,
): boolean => {
  if (staged.length === 0) return false;

  const spawnBatches = applyStagedSpawns(runtime, staged);
  const reactionBatches: EntityReactionBatch[] = [];

  for (const batch of spawnBatches) {
    reduceAcceptedBatch(
      {
        store: batch.store,
        indices: batch.indices,
        action: spawnLifecycleAction,
        eventCode: runtime.eventCodeByType[ENTITY_SPAWNED],
        payloadByEntity: batch.payloadByEntity,
      },
      transaction,
      {
        scheduleReactions: false,
        onAccepted(accepted) {
          appendLifecycleReactionBatch(
            transaction,
            reactionBatches,
            batch.store,
            runtime.eventCodeByType[ENTITY_SPAWNED],
            accepted,
          );
        },
      },
    );
  }

  runEntityReactionBatches(runtime, reactionBatches, {
    action: spawnLifecycleAction,
    manager: reactionContext.manager,
    dispatch: reactionContext.dispatch,
  });
  return true;
};

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

const flushEntityLifecycleCleanup = (
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
        const reduced = reduceAcceptedBatch(batch, transaction, {
          scheduleDespawnOn: false,
          scheduleEffects: false,
          scheduleReactions: false,
          scheduleTerminal: false,
          onAccepted(accepted) {
            appendLifecycleReactionBatch(transaction, reactionBatches, batch.store, batch.eventCode, accepted);
          },
        });
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

export const reduceEntityBucket = (
  runtime: EntityRuntimeState,
  ctx: StorageReduceBucketContext<any>,
): { readonly type: "skip" } | void => {
  const trace = readEntityTransitionTraceSession(ctx.dispatch);
  const totalStartedAt = trace?.now();
  const staged = getStagedSpawns(ctx.dispatch);
  const transaction = getEntityTransaction(ctx.dispatch);
  const snapshot = staged.length > 0 ? snapshotRuntimeMutation(runtime) : undefined;
  const eventCode = runtime.eventCodeByType[ctx.action.type];

  try {
    let touched = false;
    const spawnLifecycleStartedAt = trace?.now();
    let spawned = false;
    try {
      spawned = reduceStagedSpawnLifecycle(runtime, staged, transaction, ctx);
    } finally {
      recordEntityTracePhase(trace, "entities.reduce.spawnLifecycle", spawnLifecycleStartedAt);
    }

    const spawnCleanupStartedAt = trace?.now();
    let spawnCleanup = false;
    try {
      spawnCleanup = flushEntityLifecycleCleanup(runtime, transaction, ctx, "spawn", trace);
    } finally {
      recordEntityTracePhase(trace, "entities.reduce.spawnCleanup", spawnCleanupStartedAt);
    }
    touched = touched || spawned || spawnCleanup;

    if (eventCode === undefined) return touched ? undefined : { type: "skip" };

    let publicBatches: ReturnType<typeof collectEntityPublicReducerBatches>;
    const collectPublicBatchesStartedAt = trace?.now();
    try {
      publicBatches = collectEntityPublicReducerBatches(runtime, eventCode, ctx.dispatch.route);
    } finally {
      recordEntityTracePhase(trace, "entities.reduce.collectPublicBatches", collectPublicBatchesStartedAt);
    }

    for (const batch of publicBatches) {
      if (reduceAcceptedBatch(
        {
          store: batch.store,
          indices: batch.indices,
          action: ctx.action as ManagerAction<AnyEvent>,
          eventCode,
          accepted: batch.accepted,
        },
        transaction,
        {
          allowBorrowedReactionBatch:
            ctx.dispatch.route.scope === "unscoped" &&
            isSingleStateBucketReactionSource(batch.store, eventCode, batch.indices),
          scheduleReactions: true,
          trace,
          tracePublicBatch: true,
        },
      )) {
        touched = true;
      }
    }

    const publicCleanupStartedAt = trace?.now();
    let publicCleanup = false;
    try {
      publicCleanup = flushEntityLifecycleCleanup(runtime, transaction, ctx, "public", trace);
    } finally {
      recordEntityTracePhase(trace, "entities.reduce.publicCleanup", publicCleanupStartedAt);
    }
    touched = touched || publicCleanup;
    return touched ? undefined : { type: "skip" };
  } catch (error) {
    if (snapshot) restoreRuntimeMutation(runtime, snapshot);
    throw error;
  } finally {
    recordEntityTracePhase(trace, "entities.reduce.total", totalStartedAt);
  }
};
