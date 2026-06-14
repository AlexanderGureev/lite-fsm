import { LiteFsmError } from "@lite-fsm/core";
import type { AnyEvent, ManagerAction, ReadonlyManagerAction, StorageManagerContext } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import {
  capturedEntityScopeEntryIsLive,
  createScopedEntityAccess,
  createScopedEntitySelf,
  type EntityAccessScope,
} from "./access";
import type { EntityRuntimeState } from "./state";
import {
  createEntityDespawnOptions,
  ENTITY_DESPAWN_ACTION_TYPE,
  getEntityTransaction,
  type CapturedEntityScopeEntry,
} from "./transaction";

export type EntityEffectInvocation = {
  readonly storeKey: string;
  readonly stateCode: number;
  readonly indices: readonly EntityIndex[];
  readonly scope: EntityAccessScope;
};

type EffectResolveContext = {
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly dispatch: { readonly runtime: Map<string, unknown> };
};

type EffectInvokeContext = {
  readonly action: ReadonlyManagerAction<AnyEvent>;
  readonly manager: StorageManagerContext<AnyEvent>;
  readonly dispatch: { reportError(error: unknown): void };
};

type RuntimeTransition = ((action: ManagerAction<AnyEvent>) => ManagerAction<AnyEvent>) & {
  entity(entityId: string | readonly string[], action: AnyEvent): ManagerAction<AnyEvent>;
  actor(actorId: string | readonly string[], action: AnyEvent): ManagerAction<AnyEvent>;
  group(groupId: string | readonly string[], action: AnyEvent): ManagerAction<AnyEvent>;
  tag(groupTag: string | readonly string[], action: AnyEvent): ManagerAction<AnyEvent>;
  unscoped(action: AnyEvent): ManagerAction<AnyEvent>;
  despawn(entity: string | readonly string[] | readonly EntityIndex[]): void;
};

const isDev = (): boolean =>
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV !== "production";

const runtimeError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_STORAGE_RUNTIME", `[lite-fsm/entities] ${reason}.`);

const toManagerAction = (action: AnyEvent, meta: Record<string, unknown>): ManagerAction<AnyEvent> => ({
  ...action,
  meta: { ...((action as ManagerAction<AnyEvent>).meta ?? {}), ...meta },
});

const normalizeStringTargets = (label: string, value: string | readonly string[]): readonly string[] => {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw runtimeError(`${label} target must be a string or an array of strings`);
  }

  return value;
};

const dedupeStrings = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

const compactRouteTarget = (values: readonly string[]): string | readonly string[] => {
  if (values.length === 1) return values[0];
  return values;
};

const entityIdIsLive = (runtime: EntityRuntimeState, id: string): boolean => {
  const entity = runtime.entityStore.indexById[id];
  return entity !== undefined && runtime.entityStore.alive[entity] === 1;
};

const liveEntityIds = (runtime: EntityRuntimeState, value: string | readonly string[]): readonly string[] =>
  dedupeStrings(normalizeStringTargets("entity", value)).filter((id) => entityIdIsLive(runtime, id));

const staleCapturedScopeError = (entry: CapturedEntityScopeEntry): LiteFsmError =>
  runtimeError(`stale entity effect scope cannot despawn entity '${entry.id}' at index ${entry.entity}`);

const liveCapturedEntries = (
  runtime: EntityRuntimeState,
  entries: readonly CapturedEntityScopeEntry[],
): readonly CapturedEntityScopeEntry[] => {
  const live: CapturedEntityScopeEntry[] = [];
  for (const entry of entries) {
    if (capturedEntityScopeEntryIsLive(runtime, entry)) {
      live.push(entry);
      continue;
    }

    if (isDev()) throw staleCapturedScopeError(entry);
  }
  return live;
};

const createEffectTransition = (
  runtime: EntityRuntimeState,
  manager: StorageManagerContext<AnyEvent>,
  invocation: EntityEffectInvocation,
): RuntimeTransition => {
  const transition = ((action: ManagerAction<AnyEvent>) => manager.transition(action)) as RuntimeTransition;

  transition.unscoped = (action) =>
    manager.transition(action as ManagerAction<AnyEvent>, { routingMode: "unscoped" });
  transition.actor = (actorId, action) =>
    manager.transition(toManagerAction(action, { actorId: compactRouteTarget(normalizeStringTargets("actor", actorId)) }));
  transition.group = (groupId, action) =>
    manager.transition(toManagerAction(action, { groupId: compactRouteTarget(normalizeStringTargets("group", groupId)) }));
  transition.tag = (groupTag, action) =>
    manager.transition(toManagerAction(action, { groupTag: compactRouteTarget(normalizeStringTargets("tag", groupTag)) }));
  transition.entity = (entityId, action) => {
    const ids = liveEntityIds(runtime, entityId);
    if (ids.length === 0) return action as ManagerAction<AnyEvent>;
    return manager.transition(toManagerAction(action, { entityId: compactRouteTarget(ids) }));
  };
  transition.despawn = (entity) => {
    if (typeof entity === "string" || (Array.isArray(entity) && entity.every((item) => typeof item === "string"))) {
      const ids = liveEntityIds(runtime, entity);
      if (ids.length === 0) return;
      manager.transition(
        { type: ENTITY_DESPAWN_ACTION_TYPE },
        createEntityDespawnOptions({ mode: "ids", ids }),
      );
      return;
    }

    if (Array.isArray(entity) && entity.every((item) => typeof item === "number")) {
      if ((entity as unknown as readonly EntityIndex[]) !== invocation.indices) {
        throw runtimeError("transition.despawn(EntityIndex[]) only accepts self.indices from current entity effect scope");
      }
      const entries = liveCapturedEntries(runtime, invocation.scope.entries);
      if (entries.length === 0) return;
      manager.transition(
        { type: ENTITY_DESPAWN_ACTION_TYPE },
        createEntityDespawnOptions({ mode: "scope", entries }),
      );
      return;
    }

    throw runtimeError("transition.despawn(...) expects an entity id, entity id array or self.indices");
  };

  return transition;
};

const unsupportedCondition = (): Promise<boolean> => {
  throw runtimeError("condition() is not supported in storage: \"entity\" effects");
};

export const resolveEntityEffectInvocations = (
  runtime: EntityRuntimeState,
  ctx: EffectResolveContext,
): readonly EntityEffectInvocation[] => {
  const transaction = getEntityTransaction(ctx.dispatch);
  if (!transaction || transaction.effectBatches.length === 0) return [];

  const invocations: EntityEffectInvocation[] = [];
  for (const batch of transaction.effectBatches) {
    const effect = batch.store.metadata.effectsByStateCode[batch.stateCode];
    if (!effect) continue;

    const entries: CapturedEntityScopeEntry[] = [];
    for (const entity of batch.indices) {
      if (batch.store.presence[entity] !== 1 || batch.store.stateCode[entity] !== batch.stateCode) continue;
      if (runtime.entityStore.alive[entity] !== 1) continue;

      const id = runtime.entityStore.ids[entity];
      if (id === undefined || id.length === 0) continue;
      entries.push({ entity, generation: runtime.entityStore.generation[entity], id });
    }
    if (entries.length === 0) continue;

    invocations.push({
      storeKey: batch.store.templateKey,
      stateCode: batch.stateCode,
      indices: entries.map((entry) => entry.entity),
      scope: {
        sourceActor: batch.store.templateKey,
        eventType: ctx.action.type,
        entries,
      },
    });
  }

  return invocations;
};

export const invokeEntityEffect = (
  runtime: EntityRuntimeState,
  invocation: EntityEffectInvocation,
  ctx: EffectInvokeContext,
): void => {
  const store = runtime.actorStores[invocation.storeKey];
  const effect = store?.metadata.effectsByStateCode[invocation.stateCode];
  if (!store || !effect) return;

  const scopedEntities = createScopedEntityAccess(runtime, invocation.scope);
  const deps = {
    ...ctx.manager.getDependencies(),
    action: ctx.action,
    self: createScopedEntitySelf(runtime, store, {
      scopeName: "effect",
      indices: invocation.indices,
      entries: invocation.scope.entries,
    }),
    entities: () => scopedEntities,
    transition: createEffectTransition(runtime, ctx.manager, invocation),
    condition: unsupportedCondition,
  };

  try {
    const result = effect(deps);
    if (result instanceof Promise) {
      void result.catch((error: unknown) => {
        ctx.dispatch.reportError(error);
      });
    }
  } catch (error) {
    ctx.dispatch.reportError(error);
  }
};
