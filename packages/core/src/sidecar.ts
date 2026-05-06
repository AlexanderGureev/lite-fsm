// Sidecar — runtime-индексы actor identity и routing рядом с public root state.
// Контракт: state и sidecar коммитятся вместе одной точкой (`commitDispatchSidecar`).
// Reducer throw → до commit не доходим, live state/sidecar остаются прежними.

import {
  ActorIdentity,
  ActorRuntime,
  bumpCountersFromId,
  cloneCounters,
  Counters,
  createActorMeta,
  EMPTY_ACTOR_RECORD,
  GroupIndex,
  isActorStateContextSlice,
  isObjectRecord,
  mergeCounters,
  RuntimeActorSlice,
} from "./actor";
import type { DispatchContext } from "./dispatchContext";
import { LiteFsmError } from "./utils";

// === Типы ===================================================================

export type SidecarState = {
  actorById: Map<string, ActorRuntime>;
  groupById: Map<string, GroupIndex>;
  groupIdsByTag: Map<string, Set<string>>;
  actorIdsByTemplate: Map<string, Set<string>>;
  counters: Counters;
};

// Slow-path план replacement reconcile: материализуется до commit, чтобы validation
// throw'ы не мутировали live sidecar; на commit подмена всех индексов атомарна.
export type ReplacementReconcilePlan = {
  nextActorById: Map<string, ActorRuntime>;
  nextGroupById: Map<string, GroupIndex>;
  nextGroupIdsByTag: Map<string, Set<string>>;
  nextActorIdsByTemplate: Map<string, Set<string>>;
  nextCounters: Counters;
  canonicalActorRecords: Map<string, ActorRecord>;
  actorsToCleanup: ActorRuntime[];
  touchedTemplateKeys: string[];
};

// Per-manager validation deps для replacement-slice — единственный мост из sidecar в manager.
export type SidecarValidationDeps = {
  actorTemplateKeys: readonly string[];
  groupTagForTemplate: (templateKey: string) => string;
  isPublicActorState: (templateKey: string, state: string) => boolean;
  originId: string | undefined;
};

type RootStateView = Record<string, unknown>;
type ActorRecord = Record<string, RuntimeActorSlice>;
type ValidatedReplacementActor = { identity: ActorIdentity; isNew: boolean };

// === Factory =================================================================

export const createSidecarState = (): SidecarState => ({
  actorById: new Map(),
  groupById: new Map(),
  groupIdsByTag: new Map(),
  actorIdsByTemplate: new Map(),
  counters: { actor: 0, groupByTag: new Map() },
});

// === Group index helpers =====================================================
// Производные индексы (`groupById`, `groupIdsByTag`, `actorIdsByTemplate`) поддерживаются
// точечно вместе с `actorById` — без full-rebuild в hot path.

// Узкий subset `SidecarState`: одна функция `addActorToGroupIndexes` пишет и в live sidecar
// (incremental commit), и в свежесобранный bundle (slow reconcile rebuild).
type IndexBundle = {
  groupById: Map<string, GroupIndex>;
  groupIdsByTag: Map<string, Set<string>>;
  actorIdsByTemplate: Map<string, Set<string>>;
};

const createEmptyIndexBundle = (): IndexBundle => ({
  groupById: new Map(),
  groupIdsByTag: new Map(),
  actorIdsByTemplate: new Map(),
});

const addActorIdToTemplateBucket = (index: Map<string, Set<string>>, templateKey: string, actorId: string) => {
  let ids = index.get(templateKey);
  if (!ids) {
    ids = new Set();
    index.set(templateKey, ids);
  }
  ids.add(actorId);
};

const removeActorIdFromTemplateBucket = (index: Map<string, Set<string>>, templateKey: string, actorId: string) => {
  const ids = index.get(templateKey);
  ids?.delete(actorId);
  if (ids?.size === 0) index.delete(templateKey);
};

export const addActorToGroupIndexes = (indexes: IndexBundle, actor: ActorRuntime) => {
  const { actorId, groupId, groupTag } = actor.meta;
  let group = indexes.groupById.get(groupId);
  if (!group) {
    group = { groupTag, actorIds: new Set(), actorIdsByTemplate: new Map() };
    indexes.groupById.set(groupId, group);
  }
  group.actorIds.add(actorId);
  addActorIdToTemplateBucket(group.actorIdsByTemplate, actor.templateKey, actorId);
  addActorIdToTemplateBucket(indexes.actorIdsByTemplate, actor.templateKey, actorId);

  let tagGroups = indexes.groupIdsByTag.get(groupTag);
  if (!tagGroups) {
    tagGroups = new Set();
    indexes.groupIdsByTag.set(groupTag, tagGroups);
  }
  tagGroups.add(groupId);
};

// Удаляет actor и подчищает пустые group/tag buckets — иначе следующий spawn получит «сиротский» индекс.
export const removeActorFromGroupIndexes = (sidecar: SidecarState, actor: ActorRuntime) => {
  const { actorId, groupId, groupTag } = actor.meta;
  removeActorIdFromTemplateBucket(sidecar.actorIdsByTemplate, actor.templateKey, actorId);

  const group = sidecar.groupById.get(groupId);
  /* v8 ignore next -- group индексы поддерживаются вместе с actorById; защитный guard. */
  if (!group) return;

  group.actorIds.delete(actorId);
  removeActorIdFromTemplateBucket(group.actorIdsByTemplate, actor.templateKey, actorId);
  if (group.actorIds.size > 0) return;

  sidecar.groupById.delete(groupId);
  const tagGroups = sidecar.groupIdsByTag.get(groupTag);
  tagGroups?.delete(groupId);
  if (tagGroups?.size === 0) sidecar.groupIdsByTag.delete(groupTag);
};

// Запускает все dispose-callback'и из bag и очищает его.
// Идемпотентно: после commit актор уже удалён из sidecar.actorById, повторно вызвать некому.
export const cleanupDisposedActor = (actor: ActorRuntime) => {
  for (const dispose of actor.bag.values()) dispose();
  actor.bag.clear();
};

// === Replacement reconcile (slow path) ======================================
// Только manager-owned restore/replacement flows. План отделён от commit'а,
// validation throw'ы НЕ мутируют live sidecar.

const validateReplacementSlice = (
  sidecar: SidecarState,
  deps: SidecarValidationDeps,
  templateKey: string,
  actorId: string,
  slice: unknown,
): ValidatedReplacementActor => {
  if (actorId.length === 0) {
    throw new LiteFsmError("LITE_FSM_INVALID_ACTOR_SLICE", `Actor id for template '${templateKey}' must be non-empty.`);
  }
  if (!isActorStateContextSlice(slice) || !deps.isPublicActorState(templateKey, slice.state)) {
    throw new LiteFsmError("LITE_FSM_INVALID_ACTOR_SLICE", `Invalid actor slice '${templateKey}.${actorId}'.`);
  }

  const existing = sidecar.actorById.get(actorId);
  if (existing) {
    if (existing.templateKey !== templateKey) {
      throw new LiteFsmError(
        "LITE_FSM_INVALID_ACTOR_SLICE",
        `Actor '${actorId}' cannot move between actor template records.`,
      );
    }
    return { identity: existing, isNew: false };
  }

  const meta = (slice as Record<string, unknown>).meta;
  if (!isObjectRecord(meta)) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_ACTOR_SLICE",
      `Actor '${actorId}' cannot be created by state replacement without actor meta.`,
    );
  }

  const { groupId, groupTag } = meta;
  if (
    meta.actorId !== actorId ||
    typeof groupTag !== "string" ||
    groupTag !== deps.groupTagForTemplate(templateKey) ||
    typeof groupId !== "string" ||
    groupId.length === 0
  ) {
    throw new LiteFsmError("LITE_FSM_INVALID_ACTOR_SLICE", `Actor '${actorId}' has invalid actor meta.`);
  }
  return {
    identity: { templateKey, meta: createActorMeta({ actorId, groupId, groupTag }) },
    isNew: true,
  };
};

// Полный rebuild производных индексов из набора live actor'ов (используется в slow reconcile).
const rebuildSidecarIndexes = (actorById: Map<string, ActorRuntime>): IndexBundle => {
  const indexes = createEmptyIndexBundle();
  for (const actor of actorById.values()) addActorToGroupIndexes(indexes, actor);
  return indexes;
};

export const buildReplacementReconcilePlan = (
  sidecar: SidecarState,
  deps: SidecarValidationDeps,
  changedTemplateKeys: string[],
  nextRoot: RootStateView,
): ReplacementReconcilePlan => {
  const newIds = new Set<string>();
  const newActorIdentities = new Map<string, ActorIdentity>();
  const nextActorById = new Map(sidecar.actorById);
  const canonicalActorRecords = new Map<string, ActorRecord>();
  const actorsToCleanup: ActorRuntime[] = [];

  // (1) Валидируем changed-records и собираем identities для новых actorId.
  for (const templateKey of changedTemplateKeys) {
    const record = nextRoot[templateKey];
    if (!isObjectRecord(record)) {
      throw new LiteFsmError("LITE_FSM_INVALID_ACTOR_SLICE", `Invalid actor record '${templateKey}'.`);
    }
    const canonicalRecord: ActorRecord = {};
    for (const [actorId, slice] of Object.entries(record)) {
      if (newIds.has(actorId)) {
        throw new LiteFsmError("LITE_FSM_INVALID_ACTOR_SLICE", `Duplicate actorId '${actorId}'.`);
      }
      newIds.add(actorId);

      const { identity, isNew } = validateReplacementSlice(sidecar, deps, templateKey, actorId, slice);
      canonicalRecord[actorId] = { ...(slice as Omit<RuntimeActorSlice, "meta">), meta: identity.meta };
      if (isNew) newActorIdentities.set(actorId, identity);
    }
    canonicalActorRecords.set(templateKey, canonicalRecord);
  }

  // (2) ActorRuntime для restored акторов.
  for (const [actorId, identity] of newActorIdentities) {
    nextActorById.set(actorId, { ...identity, bag: new Map() });
  }

  // (3) Cleanup для акторов, исчезнувших из changed-records.
  const changedKeySet = new Set(changedTemplateKeys);
  for (const [actorId, actor] of nextActorById) {
    if (!changedKeySet.has(actor.templateKey)) continue;
    if (newIds.has(actorId)) continue;
    actorsToCleanup.push(actor);
    nextActorById.delete(actorId);
  }

  // (4) Rebuild производных group-индексов.
  const indexes = rebuildSidecarIndexes(nextActorById);

  // (5) Bump counters поверх restored ids — иначе новые spawn'ы после JUMP назад collid'нут.
  // Чужие id (originId-mismatch) пропускаются: они не двигают local counter.
  const nextCounters = cloneCounters(sidecar.counters);
  for (const [actorId, identity] of newActorIdentities) {
    bumpCountersFromId(nextCounters, actorId, identity.meta.groupId, deps.originId);
  }

  return {
    nextActorById,
    nextGroupById: indexes.groupById,
    nextGroupIdsByTag: indexes.groupIdsByTag,
    nextActorIdsByTemplate: indexes.actorIdsByTemplate,
    nextCounters,
    canonicalActorRecords,
    actorsToCleanup,
    touchedTemplateKeys: changedTemplateKeys,
  };
};

// Slow-path commit: применяет план reconcile к live sidecar.
const commitReplacementReconcile = (sidecar: SidecarState, plan: ReplacementReconcilePlan) => {
  sidecar.actorById = plan.nextActorById;
  sidecar.groupById = plan.nextGroupById;
  sidecar.groupIdsByTag = plan.nextGroupIdsByTag;
  sidecar.actorIdsByTemplate = plan.nextActorIdsByTemplate;
  sidecar.counters = plan.nextCounters;
  for (const actor of plan.actorsToCleanup) cleanupDisposedActor(actor);
};

// Fast-path commit: только акторы, owned core'ом в этом dispatch. Counters мерджатся снаружи.
const commitCoreSidecarOps = (sidecar: SidecarState, ctx: DispatchContext) => {
  const deletedIds = new Set(ctx.pendingDeleted.map((identity) => identity.meta.actorId));

  for (const identity of ctx.pendingSpawned) {
    if (deletedIds.has(identity.meta.actorId)) continue;
    const actor: ActorRuntime = { ...identity, bag: new Map() };
    sidecar.actorById.set(identity.meta.actorId, actor);
    addActorToGroupIndexes(sidecar, actor);
  }

  for (const identity of ctx.pendingDeleted) {
    const actor = sidecar.actorById.get(identity.meta.actorId);
    if (!actor) continue;
    sidecar.actorById.delete(identity.meta.actorId);
    removeActorFromGroupIndexes(sidecar, actor);
    cleanupDisposedActor(actor);
  }
};

// После полного collapse возвращаем запись к singleton `EMPTY_ACTOR_RECORD` —
// чтобы `useSelector(s => s.actorKey)` сохранял identity между idle→busy→idle.
export const canonicalizeEmptyActorRecords = <S extends RootStateView>(state: S, templateKeys: Iterable<string>): S => {
  let next = state;
  for (const templateKey of templateKeys) {
    const record = next[templateKey] as ActorRecord | undefined;
    if (record && record !== EMPTY_ACTOR_RECORD && Object.keys(record).length === 0) {
      next = { ...next, [templateKey]: EMPTY_ACTOR_RECORD } as S;
    }
  }
  return next;
};

// === Single root commit (ФАЗА 9) ============================================
// Атомарно применяет sidecar-апдейты dispatch и канонизирует state.
// Единственная точка commit'а: state и sidecar обновляются вместе.
export const commitDispatchSidecar = <S extends RootStateView>(
  sidecar: SidecarState,
  ctx: DispatchContext,
  nextState: S,
): S => {
  // В tick без spawn countersDraft нет, merge пропускаем.
  if (ctx.countersDraft) sidecar.counters = mergeCounters(sidecar.counters, ctx.countersDraft);
  commitCoreSidecarOps(sidecar, ctx);
  return canonicalizeEmptyActorRecords(nextState, ctx.touchedActorRecords.keys());
};

export const commitReplacementSidecar = <S extends RootStateView>(
  sidecar: SidecarState,
  plan: ReplacementReconcilePlan,
  nextState: S,
): S => {
  for (const [templateKey, record] of plan.canonicalActorRecords) {
    nextState = { ...nextState, [templateKey]: record };
  }
  commitReplacementReconcile(sidecar, plan);
  return canonicalizeEmptyActorRecords(nextState, plan.touchedTemplateKeys);
};

// Live ActorRuntime по id из pending-списков. Terminal-collapsed уже отсутствуют — ФАЗА 12 их не видит.
export const resolveLiveActors = (
  sidecar: SidecarState,
  ids: readonly ActorIdentity[],
): ActorRuntime[] => {
  const result: ActorRuntime[] = [];
  for (const id of ids) {
    const actor = sidecar.actorById.get(id.meta.actorId);
    if (actor) result.push(actor);
  }
  return result;
};
