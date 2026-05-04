// Routing-резолвер: куда спавнить (ФАЗА 5) и какие identities reduce'ить (ФАЗА 6) для scope/targetSet.

import type { ActorIdentity, RoutingScope } from "./actor";
import { type DispatchContext, reserveGroupId, type SpawnIdConfig } from "./dispatchContext";
import type { SidecarState } from "./sidecar";
import type { AnyEvent, ManagerAction, MachineStore } from "./types";

export type RoutingResolver<S extends MachineStore, P extends AnyEvent> = {
  // (groupId, groupTag) пары для spawn:
  //   "group"    — существующие target-группы (новые НЕ создаются);
  //   "tag"      — все группы каждого target-тега;
  //   "unscoped" — новая группа на каждый matching groupTag (counter резервируется здесь).
  resolveSpawnGroups: (
    scope: Exclude<RoutingScope, "actor">,
    targetSet: string[],
    ctx: DispatchContext<S, P>,
    action: ManagerAction<P>,
  ) => Array<{ groupId: string; groupTag: string }>;

  // Упорядоченный обход identities для ФАЗЫ 6. В не-actor scope включает pendingSpawned.
  forEachRoutedIdentity: (
    scope: RoutingScope,
    targetSet: string[],
    pendingSpawned: ActorIdentity[],
    action: ManagerAction<P>,
    visit: (identity: ActorIdentity) => void,
  ) => void;
};

// groupId'ы всех target-тегов в порядке тегов.
const resolveTagGroupIds = (sidecar: SidecarState, tags: readonly string[]): string[] => {
  const ids: string[] = [];
  for (const tag of tags) {
    const tagGroups = sidecar.groupIdsByTag.get(tag);
    if (tagGroups) for (const id of tagGroups) ids.push(id);
  }
  return ids;
};

// pendingSpawned, сгруппированные по templateKey — для O(1) lookup в основном цикле.
const groupPendingByTemplate = (pending: readonly ActorIdentity[]): Map<string, ActorIdentity[]> => {
  const map = new Map<string, ActorIdentity[]>();
  for (const actor of pending) {
    const bucket = map.get(actor.templateKey);
    if (bucket) bucket.push(actor);
    else map.set(actor.templateKey, [actor]);
  }
  return map;
};

// Live actorId'ы template'а в порядке scope buckets.
// scopedGroupIds === null → unscoped (глобальный actorIdsByTemplate); иначе — bucket'ы groupIds.
const forEachLiveActorId = (
  sidecar: SidecarState,
  templateKey: string,
  scopedGroupIds: readonly string[] | null,
  visit: (actorId: string) => void,
): void => {
  if (scopedGroupIds === null) {
    for (const id of sidecar.actorIdsByTemplate.get(templateKey) ?? []) visit(id);
    return;
  }

  for (const groupId of scopedGroupIds) {
    const bucket = sidecar.groupById.get(groupId)?.actorIdsByTemplate.get(templateKey);
    if (bucket) for (const id of bucket) visit(id);
  }
};

export const createRoutingResolver = <S extends MachineStore, P extends AnyEvent>(deps: {
  sidecar: SidecarState;
  actorTemplateKeys: readonly string[];
  actorSpawnIndex: Map<string, Map<string, string[]>>;
  actorReduceIndex: Map<string, string[]>;
  spawnIdConfig: SpawnIdConfig<P>;
}): RoutingResolver<S, P> => {
  const { sidecar, actorTemplateKeys, actorSpawnIndex, actorReduceIndex, spawnIdConfig } = deps;

  const resolveSpawnGroups: RoutingResolver<S, P>["resolveSpawnGroups"] = (scope, targetSet, ctx, action) => {
    if (scope === "group") {
      const groups: Array<{ groupId: string; groupTag: string }> = [];
      for (const groupId of targetSet) {
        const group = sidecar.groupById.get(groupId);
        if (group) groups.push({ groupId, groupTag: group.groupTag });
      }
      return groups;
    }

    if (scope === "tag") {
      const groups: Array<{ groupId: string; groupTag: string }> = [];
      for (const groupTag of targetSet) {
        for (const groupId of sidecar.groupIdsByTag.get(groupTag) ?? []) {
          groups.push({ groupId, groupTag });
        }
      }
      return groups;
    }

    // unscoped: новая группа на каждый groupTag с matching __INIT.
    // collected — pending в текущем resolveSpawnGroups, чтобы isGroupIdTaken видел свои же id.
    const groups: Array<{ groupId: string; groupTag: string }> = [];
    const collected = new Set<string>();
    const isGroupIdTaken = (id: string) => sidecar.groupById.has(id) || collected.has(id);
    /* v8 ignore next -- spawnActors делает early-return когда action.type отсутствует в actorSpawnIndex. */
    for (const groupTag of actorSpawnIndex.get(action.type)?.keys() ?? []) {
      const groupId = reserveGroupId(ctx, groupTag, action, spawnIdConfig, isGroupIdTaken);
      collected.add(groupId);
      groups.push({ groupId, groupTag });
    }
    return groups;
  };

  const forEachRoutedIdentity: RoutingResolver<S, P>["forEachRoutedIdentity"] = (
    scope,
    targetSet,
    pendingSpawned,
    action,
    visit,
  ) => {
    // actor scope — точечная адресация по actorId, без template-ordering.
    if (scope === "actor") {
      for (const id of targetSet) {
        const actor = sidecar.actorById.get(id);
        if (actor) visit(actor);
      }
      return;
    }

    // Резолвим groupIds один раз перед циклом. null → unscoped.
    const scopedGroupIds: readonly string[] | null =
      scope === "group" ? targetSet : scope === "tag" ? resolveTagGroupIds(sidecar, targetSet) : null;

    // Обычный tick без spawn не требует pending maps, seen Set и materialized identity array.
    if (pendingSpawned.length === 0) {
      for (const templateKey of actorReduceIndex.get(action.type) ?? []) {
        forEachLiveActorId(sidecar, templateKey, scopedGroupIds, (id) => {
          const actor = sidecar.actorById.get(id);
          /* v8 ignore next -- group/tag indexes are updated atomically with actorById. */
          if (actor) visit(actor);
        });
      }
      return;
    }

    // Templates с edge для action.type — кандидаты на reduce. Pending — то, что ещё не в sidecar.
    const acceptingTemplates = new Set(actorReduceIndex.get(action.type) ?? []);
    const pendingByTemplate = groupPendingByTemplate(pendingSpawned);

    const targetMembership = new Set(targetSet);
    const isPendingInScope = (a: ActorIdentity): boolean => {
      if (scope === "unscoped") return true;
      if (scope === "group") return targetMembership.has(a.meta.groupId);
      return targetMembership.has(a.meta.groupTag);
    };

    const seen = new Set<string>();
    for (const templateKey of actorTemplateKeys) {
      if (acceptingTemplates.has(templateKey)) {
        forEachLiveActorId(sidecar, templateKey, scopedGroupIds, (id) => {
          /* v8 ignore next -- routing target sets are deduped before identity collection. */
          if (seen.has(id)) return;
          const actor = sidecar.actorById.get(id);
          /* v8 ignore next -- group/tag indexes are updated atomically with actorById. */
          if (!actor) return;
          seen.add(id);
          visit(actor);
        });
      }

      for (const actor of pendingByTemplate.get(templateKey) ?? []) {
        const id = actor.meta.actorId;
        /* v8 ignore next -- pending actors are unique by reserveActorId; defensive dedupe. */
        if (seen.has(id)) continue;
        /* v8 ignore next -- pending spawned in group/tag scope are placed only into target groups. */
        if (!isPendingInScope(actor)) continue;
        seen.add(id);
        visit(actor);
      }
    }
  };

  return { resolveSpawnGroups, forEachRoutedIdentity };
};
