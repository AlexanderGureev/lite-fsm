import type { AnyEvent, ManagerAction } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import { ENTITY_INIT_STATE_CODE } from "./compile";
import { ENTITY_SPAWNED } from "./lifecycle";
import { reduceAcceptedBatch } from "./reduce-batch";
import { appendLifecycleReactionBatch, type LifecycleReactionContext } from "./reduce-shared";
import { runEntityReactionBatches } from "./reactions";
import {
  addActorRowOwnership,
  addEntityToGroupBucket,
  ensureActorCapacity,
  ensureEntityCapacity,
  refreshActorPublicSlice,
  writeInitialColumnValues,
  type ColumnarActorStore,
  type EntityRuntimeState,
} from "./state";
import { type EntityDispatchTransaction, type EntityReactionBatch, type StagedEntitySpawn } from "./transaction";
import { tracePhase, type EntityTransitionTraceSession } from "./transitionTrace";

type SpawnBatch = {
  readonly store: ColumnarActorStore;
  readonly indices: EntityIndex[];
  readonly payloadByEntity: Map<EntityIndex, Record<string, unknown>>;
};

const spawnLifecycleAction: ManagerAction<AnyEvent> = { type: ENTITY_SPAWNED };

const toEntityIndex = (value: number): EntityIndex => value as EntityIndex;

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

export const reduceStagedSpawnLifecycle = (
  runtime: EntityRuntimeState,
  staged: readonly StagedEntitySpawn[],
  transaction: EntityDispatchTransaction | undefined,
  reactionContext: LifecycleReactionContext,
  trace?: EntityTransitionTraceSession,
): boolean => {
  if (staged.length === 0) return false;

  const spawnBatches = tracePhase(trace, "entities.reduce.spawnLifecycle.applyStagedSpawns", () =>
    applyStagedSpawns(runtime, staged),
  );
  const reactionBatches: EntityReactionBatch[] = [];

  tracePhase(trace, "entities.reduce.spawnLifecycle.reduceBatches", () => {
    for (const batch of spawnBatches) {
      reduceAcceptedBatch(
        runtime,
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
          trace,
          traceBatchPrefix: "entities.reduce.spawnLifecycle.batch",
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
  });

  tracePhase(trace, "entities.reduce.spawnLifecycle.reactions", () => {
    runEntityReactionBatches(
      runtime,
      reactionBatches,
      {
        action: spawnLifecycleAction,
        manager: reactionContext.manager,
        dispatch: reactionContext.dispatch,
      },
      trace,
      "entities.reduce.spawnLifecycle.reactions",
    );
  });
  return true;
};
