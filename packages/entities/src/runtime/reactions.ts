import { LiteFsmError } from "@lite-fsm/core";
import type { AnyEvent, ReadonlyManagerAction, StorageManagerContext } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import {
  createReactionEntityAccess,
  createReactionEntitySelf,
  type EntityReactionScope,
} from "./access";
import type { ColumnarActorStore, EntityRuntimeState } from "./state";
import { getEntityTransaction, type EntityReactionBatch } from "./transaction";

type ReactionRunContext = {
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly manager: Pick<StorageManagerContext<AnyEvent>, "getDependencies">;
  readonly dispatch: { readonly runtime: Map<string, unknown>; reportError(error: unknown): void };
};

type ReactionScopeScratch = {
  markers: Uint32Array;
  generation: Uint32Array;
  readonly touched: EntityIndex[];
  readonly compactIndices: EntityIndex[];
  token: number;
};

const runtimeError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_STORAGE_RUNTIME", `[lite-fsm/entities] ${reason}.`);

const reactionScratchByRuntime = new WeakMap<EntityRuntimeState, ReactionScopeScratch>();

const createReactionScopeScratch = (): ReactionScopeScratch => ({
  markers: new Uint32Array(0),
  generation: new Uint32Array(0),
  touched: [],
  compactIndices: [],
  token: 0,
});

const getReactionScopeScratch = (runtime: EntityRuntimeState): ReactionScopeScratch => {
  const scratch = reactionScratchByRuntime.get(runtime);
  if (scratch) return scratch;

  const next = createReactionScopeScratch();
  reactionScratchByRuntime.set(runtime, next);
  return next;
};

const ensureReactionScopeCapacity = (scratch: ReactionScopeScratch, capacity: number): void => {
  if (scratch.markers.length >= capacity) return;

  const markers = new Uint32Array(capacity);
  markers.set(scratch.markers);
  scratch.markers = markers;

  const generation = new Uint32Array(capacity);
  generation.set(scratch.generation);
  scratch.generation = generation;
};

const nextReactionScopeToken = (scratch: ReactionScopeScratch): number => {
  scratch.token += 1;
  /* v8 ignore next 5 -- one runtime would need more than four billion reaction batches. */
  if (scratch.token >= 0xffffffff) {
    scratch.markers.fill(0);
    scratch.generation.fill(0);
    scratch.token = 1;
  }
  return scratch.token;
};

const entityCanEnterReactionScope = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  entity: EntityIndex,
): boolean => {
  if (store.presence[entity] !== 1) return false;
  if (runtime.entityStore.alive[entity] !== 1) return false;

  const id = runtime.entityStore.ids[entity];
  return id !== undefined && id.length > 0;
};

const cleanupReactionScope = (scratch: ReactionScopeScratch): void => {
  for (const entity of scratch.touched) {
    scratch.markers[entity] = 0;
    scratch.generation[entity] = 0;
  }
  scratch.touched.length = 0;
  scratch.compactIndices.length = 0;
};

const captureReactionScope = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  indices: readonly EntityIndex[],
): { readonly scratch: ReactionScopeScratch; readonly scope: EntityReactionScope } | undefined => {
  const scratch = getReactionScopeScratch(runtime);
  cleanupReactionScope(scratch);
  ensureReactionScopeCapacity(
    scratch,
    Math.max(runtime.entityStore.generation.length, store.presence.length),
  );

  const token = nextReactionScopeToken(scratch);
  let compact: EntityIndex[] | undefined;

  for (let index = 0; index < indices.length; index += 1) {
    const entity = indices[index];

    if (!entityCanEnterReactionScope(runtime, store, entity)) {
      if (!compact) {
        compact = scratch.compactIndices;
        compact.length = 0;
        for (let copyIndex = 0; copyIndex < index; copyIndex += 1) compact.push(indices[copyIndex]);
      }
      continue;
    }

    scratch.markers[entity] = token;
    scratch.generation[entity] = runtime.entityStore.generation[entity];
    scratch.touched.push(entity);
    compact?.push(entity);
  }

  const scopedIndices = compact ?? indices;
  if (scopedIndices.length === 0) {
    cleanupReactionScope(scratch);
    return undefined;
  }

  return {
    scratch,
    scope: {
      indices: scopedIndices,
      markers: scratch.markers,
      generation: scratch.generation,
      token,
    },
  };
};

const createReactionDeps = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  scope: EntityReactionScope,
  ctx: ReactionRunContext,
): Record<string, unknown> => {
  const scopedEntities = createReactionEntityAccess(runtime);
  const deps = Object.create(ctx.manager.getDependencies()) as Record<string, unknown>;
  deps.action = ctx.action;
  deps.self = createReactionEntitySelf(runtime, store, scope);
  deps.entities = () => scopedEntities;
  deps.transition = undefined;
  deps.condition = undefined;
  return deps;
};

const reactionPromiseError = (store: ColumnarActorStore, eventType: string): LiteFsmError =>
  runtimeError(
    `reaction for actor '${store.templateKey}' and event '${eventType}' returned a Promise; entity reactions are sync-only`,
  );

const runReactionBatch = (
  runtime: EntityRuntimeState,
  batch: EntityReactionBatch,
  ctx: ReactionRunContext,
): void => {
  const reaction = batch.store.metadata.reactionsByEventCode[batch.eventCode];
  if (!reaction) return;

  const captured = captureReactionScope(runtime, batch.store, batch.indices);
  if (!captured) return;

  try {
    const result = reaction(createReactionDeps(runtime, batch.store, captured.scope, ctx));
    if (result instanceof Promise) {
      ctx.dispatch.reportError(reactionPromiseError(batch.store, ctx.action.type));
    }
  } catch (error) {
    ctx.dispatch.reportError(error);
  } finally {
    cleanupReactionScope(captured.scratch);
  }
};

export const runEntityReactionBatches = (
  runtime: EntityRuntimeState,
  batches: readonly EntityReactionBatch[],
  ctx: ReactionRunContext,
): void => {
  for (const batch of batches) runReactionBatch(runtime, batch, ctx);
};

export const runEntityReactions = (runtime: EntityRuntimeState, ctx: ReactionRunContext): void => {
  const transaction = getEntityTransaction(ctx.dispatch);
  if (!transaction || transaction.reactionBatches.length === 0) return;

  runEntityReactionBatches(runtime, transaction.reactionBatches, ctx);
};
