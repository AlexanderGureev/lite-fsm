import type { AnyEvent, ManagerAction } from "@lite-fsm/core";

import { ENTITY_SPAWNED } from "./lifecycle";
import { reduceAcceptedBatch } from "./reduce-batch";
import { appendLifecycleReactionBatch, type LifecycleReactionContext } from "./reduce-shared";
import { runEntityReactionBatches } from "./reactions";
import { applyStagedSpawnCommit } from "./spawn-commit";
import type { EntityRuntimeState } from "./state";
import { type EntityDispatchTransaction, type EntityReactionBatch, type StagedEntitySpawn } from "./transaction";
import { tracePhase, type EntityTransitionTraceSession } from "./transitionTrace";

const spawnLifecycleAction: ManagerAction<AnyEvent> = { type: ENTITY_SPAWNED };

export const reduceStagedSpawnLifecycle = (
  runtime: EntityRuntimeState,
  staged: readonly StagedEntitySpawn[],
  transaction: EntityDispatchTransaction | undefined,
  reactionContext: LifecycleReactionContext,
  trace?: EntityTransitionTraceSession,
): boolean => {
  if (staged.length === 0) return false;

  const spawnBatches = tracePhase(trace, "entities.reduce.spawnLifecycle.applyStagedSpawns", () =>
    applyStagedSpawnCommit(runtime, staged),
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
          payloadScope: batch.payloadScope,
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
