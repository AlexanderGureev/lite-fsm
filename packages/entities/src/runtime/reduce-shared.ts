import type { AnyEvent, ManagerAction, StorageReduceBucketContext } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import type { ColumnarActorStore } from "./state";
import { createEntityReactionBatch, type EntityDispatchTransaction, type EntityReactionBatch } from "./transaction";
import type { EntityTransitionTraceSession } from "./transitionTrace";

export { runtimeError } from "../internal";
export { isTerminalStateCode } from "./compile";

export type ReducerBatch = {
  readonly store: ColumnarActorStore;
  readonly indices: readonly EntityIndex[];
  readonly action: ManagerAction<AnyEvent>;
  readonly eventCode: number | undefined;
  readonly accepted?: true;
  readonly payloadByEntity?: ReadonlyMap<EntityIndex, Record<string, unknown>>;
};

export type ReduceAcceptedBatchOptions = {
  readonly allowBorrowedReactionBatch?: boolean;
  readonly scheduleDespawnOn?: boolean;
  readonly scheduleEffects?: boolean;
  readonly scheduleReactions?: boolean;
  readonly scheduleTerminal?: boolean;
  readonly trace?: EntityTransitionTraceSession;
  readonly traceBatchPrefix?: string;
  readonly tracePublicBatch?: boolean;
  onAccepted?(accepted: readonly EntityIndex[]): void;
};

export type LifecycleReactionContext = Pick<StorageReduceBucketContext<any>, "dispatch" | "manager">;

export const appendLifecycleReactionBatch = (
  transaction: EntityDispatchTransaction | undefined,
  batches: EntityReactionBatch[],
  store: ColumnarActorStore,
  eventCode: number | undefined,
  indices: readonly EntityIndex[],
): void => {
  const batch = createEntityReactionBatch(transaction, store, eventCode, indices, { ownership: "owned" });
  if (batch) batches.push(batch);
};
