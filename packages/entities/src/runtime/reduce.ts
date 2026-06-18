import type { AnyEvent, ManagerAction, StorageReduceBucketContext } from "@lite-fsm/core";

import { isSingleStateBucketReactionSource, reduceAcceptedBatch } from "./reduce-batch";
import { flushEntityLifecycleCleanup } from "./reduce-despawn";
import { reduceStagedSpawnLifecycle } from "./reduce-spawn";
import { restoreRuntimeMutation, snapshotRuntimeMutation } from "./mutation-snapshot";
import { collectEntityPublicReducerBatches } from "./routing";
import type { EntityRuntimeState } from "./state";
import { getEntityTransaction, getStagedSpawns } from "./transaction";
import { readEntityTransitionTraceSession, tracePhase } from "./transitionTrace";

export const reduceEntityBucket = (
  runtime: EntityRuntimeState,
  ctx: StorageReduceBucketContext<any>,
): { readonly type: "skip" } | void => {
  const trace = readEntityTransitionTraceSession(ctx.dispatch);
  const staged = getStagedSpawns(ctx.dispatch);
  const transaction = getEntityTransaction(ctx.dispatch);
  const snapshot = staged.length > 0 ? snapshotRuntimeMutation(runtime) : undefined;
  const eventCode = runtime.eventCodeByType[ctx.action.type];

  return tracePhase(trace, "entities.reduce.total", (): { readonly type: "skip" } | undefined => {
    try {
      const spawned = tracePhase(trace, "entities.reduce.spawnLifecycle", () =>
        reduceStagedSpawnLifecycle(runtime, staged, transaction, ctx, trace),
      );
      const spawnCleanup = tracePhase(trace, "entities.reduce.spawnCleanup", () =>
        flushEntityLifecycleCleanup(runtime, transaction, ctx, "spawn", trace),
      );
      let touched = spawned || spawnCleanup;

      if (eventCode === undefined) return touched ? undefined : { type: "skip" };

      const publicBatches = tracePhase(trace, "entities.reduce.collectPublicBatches", () =>
        collectEntityPublicReducerBatches(runtime, eventCode, ctx.dispatch.route),
      );

      for (const batch of publicBatches) {
        const reduced = reduceAcceptedBatch(
          runtime,
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
        );
        if (reduced) touched = true;
      }

      const publicCleanup = tracePhase(trace, "entities.reduce.publicCleanup", () =>
        flushEntityLifecycleCleanup(runtime, transaction, ctx, "public", trace),
      );
      touched = touched || publicCleanup;
      return touched ? undefined : { type: "skip" };
    } catch (error) {
      if (snapshot) restoreRuntimeMutation(runtime, snapshot);
      throw error;
    }
  });
};
