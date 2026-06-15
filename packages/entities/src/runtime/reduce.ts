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
  readonly enteredByState: ReadonlyMap<number, readonly EntityIndex[]> | undefined;
  readonly cleanupRemovesAcceptedRows: boolean;
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

const updateActorStateBuckets = (store: ColumnarActorStore, indices: readonly EntityIndex[]): void => {
  for (let index = indices.length - 1; index >= 0; index -= 1) {
    const entity = indices[index];
    moveActorStateBucket(store, entity, store.prevStateCode[entity], store.stateCode[entity]);
  }
};

const scheduleEnteredStateEffects = (
  transaction: EntityDispatchTransaction | undefined,
  store: ColumnarActorStore,
  enteredByState: ReadonlyMap<number, readonly EntityIndex[]> | undefined,
): void => {
  /* v8 ignore next -- defensive invariant: reduceBucket receives a transaction from prepareAction. */
  if (!transaction || !enteredByState) return;

  for (const [stateCode, entered] of enteredByState) {
    scheduleEntityEffectBatch(transaction, store, stateCode, entered);
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
  enteredByState: Map<number, EntityIndex[]> | undefined,
  stateCode: number,
  entity: EntityIndex,
): Map<number, EntityIndex[]> => {
  const next = enteredByState ?? new Map<number, EntityIndex[]>();
  const entered = next.get(stateCode);
  if (entered) {
    entered.push(entity);
    return next;
  }

  next.set(stateCode, [entity]);
  return next;
};

const postProcessAcceptedRows = (
  transaction: EntityDispatchTransaction | undefined,
  store: ColumnarActorStore,
  accepted: readonly EntityIndex[],
  flags: PostProcessingFlags,
): AcceptedRowsPostProcessing => {
  let dirtyRows: EntityIndex[] | undefined;
  let enteredByState: Map<number, EntityIndex[]> | undefined;
  let cleanupRemovesAcceptedRows = false;

  for (const entity of accepted) {
    const stateCode = store.stateCode[entity];
    assertValidStateCode(store, entity, stateCode);
    store.rowVersion[entity] += 1;

    const dirty = stateCode !== store.prevStateCode[entity];
    let despawned = false;
    if (flags.scheduleDespawnOn && stateCode >= 0 && store.metadata.despawnStateMask[stateCode] === 1) {
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

    if (flags.scheduleEffects && !despawned && stateCode >= 0 && store.metadata.effectsByStateCode[stateCode]) {
      enteredByState = appendEnteredEffectRow(enteredByState, stateCode, entity);
    }
  }

  return { dirtyRows, enteredByState, cleanupRemovesAcceptedRows };
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
  for (const entity of batch.indices) {
    const result = resolveTransitionTarget(batch.store, entity, batch.eventCode, batch.action.type);
    if (result.accepted) accepted.push(entity);
  }
  return accepted;
};

const applyDefaultTransitions = (batch: ReducerBatch, accepted: readonly EntityIndex[]): string | undefined => {
  const fastPathNextState = applyIdentityDefaultTransitions(batch, accepted);
  if (fastPathNextState !== undefined) return fastPathNextState;

  let firstNextState: string | undefined;

  if (!batch.accepted) {
    for (const entity of accepted) {
      firstNextState ??= getEntityStateName(batch.store.metadata, batch.store.stateCode[entity]);
    }
    return firstNextState;
  }

  for (const entity of accepted) {
    const result = resolveTransitionTarget(batch.store, entity, batch.eventCode, batch.action.type);
    firstNextState ??= result.nextState;
  }

  return firstNextState;
};

const getSingleStateIdentitySource = (
  batch: ReducerBatch,
  accepted: readonly EntityIndex[],
): number | undefined => {
  if (!batch.accepted || batch.eventCode === undefined) return undefined;

  const plan = batch.store.metadata.reducePlansByEventCode[batch.eventCode];
  if (!plan?.allDefaultTransitionsIdentity) return undefined;
  if (plan.acceptStateCodes.length !== 1) return undefined;

  const sourceCode = plan.acceptStateCodes[0];
  const buckets = batch.store.acceptStateBucketsByEventCode[batch.eventCode];
  if (!buckets || buckets.length !== 1 || buckets[0] !== accepted) return undefined;

  return sourceCode;
};

const applyIdentityDefaultTransitions = (
  batch: ReducerBatch,
  accepted: readonly EntityIndex[],
): string | undefined => {
  const sourceCode = getSingleStateIdentitySource(batch, accepted);
  if (sourceCode === undefined) return undefined;

  for (const entity of accepted) {
    batch.store.prevStateCode[entity] = sourceCode;
  }

  return getEntityStateName(batch.store.metadata, sourceCode);
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
    const defaultTransitionsStartedAt = trace?.now();
    try {
      accepted = getAcceptedIndices(batch);
      if (accepted.length === 0) return false;
      firstNextState = applyDefaultTransitions(batch, accepted);
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
      if (postProcessing.dirtyRows) updateActorStateBuckets(batch.store, postProcessing.dirtyRows);
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
