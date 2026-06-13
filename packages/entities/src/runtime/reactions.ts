import { LiteFsmError } from "@lite-fsm/core";
import type { AnyEvent, ReadonlyManagerAction, StorageManagerContext } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import { createScopedEntityAccess, type EntityAccessScope } from "./access";
import type { ColumnarActorStore, EntityRuntimeState } from "./state";
import { getEntityTransaction, type CapturedEntityScopeEntry, type EntityReactionBatch } from "./transaction";

type ReactionRunContext = {
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly manager: Pick<StorageManagerContext<AnyEvent>, "getDependencies">;
  readonly dispatch: { readonly runtime: Map<string, unknown>; reportError(error: unknown): void };
};

const runtimeError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_STORAGE_RUNTIME", `[lite-fsm/entities] ${reason}.`);

const capturedEntryIsLive = (runtime: EntityRuntimeState, entry: CapturedEntityScopeEntry): boolean =>
  runtime.entityStore.alive[entry.entity] === 1 &&
  runtime.entityStore.generation[entry.entity] === entry.generation;

const createReactionSelf = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  indices: readonly EntityIndex[],
  scope: EntityAccessScope,
): Record<string, unknown> => {
  const entriesByEntity = new Map(scope.entries.map((entry) => [entry.entity, entry]));
  const self: Record<string, unknown> = {
    indices,
    states: store.metadata.stateCodeByName,
    presence: store.presence,
    stateCode: store.stateCode,
    prevStateCode: store.prevStateCode,
    rowVersion: store.rowVersion,
    has(entity: EntityIndex) {
      const entry = entriesByEntity.get(entity);
      if (!entry) return false;
      return capturedEntryIsLive(runtime, entry) && store.presence[entity] === 1;
    },
    entityId(entity: EntityIndex) {
      const entry = entriesByEntity.get(entity);
      if (entry) return entry.id;
      throw runtimeError(`entity index ${entity} is outside current entity reaction scope`);
    },
  };

  for (const [name, column] of Object.entries(store.columns)) {
    self[name] = column;
  }

  return self;
};

const collectReactionScopeEntries = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  indices: readonly EntityIndex[],
): readonly CapturedEntityScopeEntry[] => {
  const entries: CapturedEntityScopeEntry[] = [];

  for (const entity of indices) {
    if (store.presence[entity] !== 1 || runtime.entityStore.alive[entity] !== 1) continue;

    const id = runtime.entityStore.ids[entity];
    if (id === undefined || id.length === 0) continue;
    entries.push({ entity, generation: runtime.entityStore.generation[entity], id });
  }

  return entries;
};

const createReactionDeps = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  entries: readonly CapturedEntityScopeEntry[],
  ctx: ReactionRunContext,
): Record<string, unknown> => {
  const scope = {
    sourceActor: store.templateKey,
    eventType: ctx.action.type,
    entries,
  };
  const userDeps = { ...ctx.manager.getDependencies() };
  delete userDeps.action;
  delete userDeps.condition;
  delete userDeps.entities;
  delete userDeps.self;
  delete userDeps.transition;

  return {
    ...userDeps,
    action: ctx.action,
    self: createReactionSelf(
      runtime,
      store,
      entries.map((entry) => entry.entity),
      scope,
    ),
    entities: createScopedEntityAccess(runtime, scope),
  };
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

  const entries = collectReactionScopeEntries(runtime, batch.store, batch.indices);
  if (entries.length === 0) return;

  try {
    const result = reaction(createReactionDeps(runtime, batch.store, entries, ctx));
    if (result instanceof Promise) {
      ctx.dispatch.reportError(reactionPromiseError(batch.store, ctx.action.type));
    }
  } catch (error) {
    ctx.dispatch.reportError(error);
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
