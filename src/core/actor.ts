import type {
  ActorMeta,
  ActorTerminalState,
  AnyEvent,
  AnyRecord,
  FSMEventMeta,
  ManagerAction,
  Self,
} from "./types";
import { LiteFsmError } from "./utils";

// === Runtime types (internal, не часть public API) ============================

export type RuntimeActorSlice = { state: string; context: AnyRecord; meta: Readonly<ActorMeta> };

export type ActorBag = Map<symbol, () => void>;
// Идентификатор: canonical ActorMeta + templateKey. Живёт в pending-списках и restore identity.
export type ActorIdentity = { meta: Readonly<ActorMeta>; templateKey: string };
// Runtime-инстанс: identity + bag для disposable callback'ов (condition / createEffect cleanup).
export type ActorRuntime = ActorIdentity & { bag: ActorBag };
export type GroupIndex = { groupTag: string; actorIds: Set<string>; actorIdsByTemplate: Map<string, Set<string>> };
export type Counters = { actor: number; groupByTag: Map<string, number> };
export type NormalizeOptions = { sender?: Self; forceUnscoped?: boolean };
export type RoutingScope = "actor" | "group" | "tag" | "unscoped";

// === Константы ================================================================

// Singleton-frozen-`{}` для пустого actor template. Сохраняет ту же ссылку
// между idle→busy→idle, чтобы `useSelector` не дёргал ререндер.
export const EMPTY_ACTOR_RECORD = Object.freeze({}) as Record<string, RuntimeActorSlice>;
export const TERMINAL_STATES = new Set<string>(["__RESOLVED", "__REJECTED", "__CANCELLED"]);
const SENDER_FIELDS = ["senderActorId", "senderGroupId", "senderGroupTag"] as const;
const ROUTING_FIELDS = ["actorId", "groupId", "groupTag"] as const;

// === Type guards ==============================================================

export const hasOwn = <T extends object>(obj: T, key: PropertyKey): key is keyof T =>
  Object.prototype.hasOwnProperty.call(obj, key);

export const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const isTerminal = (state: unknown): state is ActorTerminalState =>
  typeof state === "string" && TERMINAL_STATES.has(state);

export const isActorStateContextSlice = (value: unknown): value is Omit<RuntimeActorSlice, "meta"> =>
  isObjectRecord(value) && typeof value.state === "string" && isObjectRecord(value.context);

export const createActorMeta = (input: ActorMeta | (ActorMeta & { templateKey: string })): Readonly<ActorMeta> =>
  Object.freeze({
    actorId: input.actorId,
    groupId: input.groupId,
    groupTag: input.groupTag,
  });

// `__INIT` в graph → actor template. Single source of truth для Machine и MachineManager.
export const isActorTemplateConfig = (cfg: { config: object }): boolean =>
  hasOwn(cfg.config, "__INIT");

// Target перехода: null = self-transition, string = state/terminal, undefined = нет перехода.
// Приоритет: явный source[actionType] → wildcard "*"[actionType]. Для actor `__INIT` wildcard
// НЕ применяется — spawn возможен только через явный `__INIT`-edge.
export const resolveTransitionTarget = (
  graph: Record<string, Record<string, unknown> | undefined>,
  source: string,
  actionType: string,
  isActorTemplate: boolean,
): string | null | undefined => {
  const direct = graph[source]?.[actionType];
  if (direct !== undefined) return direct as string | null;
  /* v8 ignore next -- инвариант: actor с source="__INIT" сюда не доходит. */
  if (isActorTemplate && source === "__INIT") return undefined;
  return graph["*"]?.[actionType] as string | null | undefined;
};

// === Runtime-валидация результата actor reducer'а ==========================

// Reducer актора должен вернуть либо public state, либо terminal — и не остаться в `__INIT`.
export const validateActorReducerOutput = (
  actorId: string,
  templateKey: string,
  nextState: string,
  isPublicActorState: (templateKey: string, state: string) => boolean,
): void => {
  if (nextState === "__INIT") {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_ACTOR_CONFIG",
      `[lite-fsm] actor '${actorId}' remained in __INIT after spawn.`,
    );
  }
  if (!isTerminal(nextState) && !isPublicActorState(templateKey, nextState)) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_ACTOR_CONFIG",
      `[lite-fsm] actor '${actorId}' has invalid state.`,
    );
  }
};

// === Статическая валидация actor-template config ============================

// initialState=="__INIT", hydrate/dehydrate hooks запрещены, зарезервированные `__*` имена
// (кроме `__INIT`) запрещены, `__INIT` не может self-transition или target'ить себя.
export const validateActorTemplateConfig = (
  templateKey: string,
  cfg: { initialState: string; persistence?: unknown; hydrate?: unknown; dehydrate?: unknown; config: object },
): void => {
  if (cfg.initialState !== "__INIT") {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_ACTOR_CONFIG",
      `[lite-fsm] actor template '${templateKey}' must use __INIT as initialState.`,
    );
  }
  if (cfg.persistence !== undefined && cfg.persistence !== "runtime" && cfg.persistence !== "snapshot") {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_ACTOR_CONFIG",
      `[lite-fsm] actor template '${templateKey}' has invalid persistence mode.`,
    );
  }
  if (cfg.persistence !== "snapshot" && (cfg.hydrate || cfg.dehydrate)) {
    throw new LiteFsmError(
      "LITE_FSM_INVALID_ACTOR_CONFIG",
      `[lite-fsm] actor template '${templateKey}' cannot define hydrate/dehydrate hooks without snapshot persistence.`,
    );
  }

  const graph = cfg.config as Record<string, Record<string, unknown>>;
  for (const source of Object.keys(graph)) {
    if (isTerminal(source) || (source.startsWith("__") && source !== "__INIT")) {
      throw new LiteFsmError(
        "LITE_FSM_INVALID_ACTOR_CONFIG",
        `[lite-fsm] actor template '${templateKey}' has reserved state '${source}'.`,
      );
    }

    for (const target of Object.values(graph[source])) {
      if (source === "__INIT" && target === null) {
        throw new LiteFsmError(
          "LITE_FSM_INVALID_ACTOR_CONFIG",
          `[lite-fsm] actor template '${templateKey}' cannot spawn with a null __INIT target.`,
        );
      }
      if (target === "__INIT" || (typeof target === "string" && target.startsWith("__") && !isTerminal(target))) {
        throw new LiteFsmError(
          "LITE_FSM_INVALID_ACTOR_CONFIG",
          `[lite-fsm] actor template '${templateKey}' has invalid target '${String(target)}'.`,
        );
      }
    }
  }
};

// === Нормализация routing meta ==============================================

// Очищает meta от undefined-полей с сохранением порядка. База для всех strip*-helper'ов.
const stripUndefined = (meta: FSMEventMeta | undefined): FSMEventMeta => {
  const next: FSMEventMeta = {};
  if (!meta) return next;

  if (meta.actorId !== undefined) next.actorId = meta.actorId;
  if (meta.groupId !== undefined) next.groupId = meta.groupId;
  if (meta.groupTag !== undefined) next.groupTag = meta.groupTag;
  if (meta.senderActorId !== undefined) next.senderActorId = meta.senderActorId;
  if (meta.senderGroupId !== undefined) next.senderGroupId = meta.senderGroupId;
  if (meta.senderGroupTag !== undefined) next.senderGroupTag = meta.senderGroupTag;

  return next;
};

export const stripSenderFields = (meta: FSMEventMeta | undefined): FSMEventMeta => {
  const next = stripUndefined(meta);
  for (const key of SENDER_FIELDS) delete next[key];
  return next;
};

export const stripRouting = (meta: FSMEventMeta | undefined): FSMEventMeta => {
  const next = stripUndefined(meta);
  for (const key of ROUTING_FIELDS) delete next[key];
  return next;
};

export const attachMeta = <P extends AnyEvent>(
  action: ManagerAction<P>,
  meta: FSMEventMeta,
): ManagerAction<P> => {
  if (Object.keys(meta).length === 0) {
    const { meta: _, ...rest } = action;
    return rest as ManagerAction<P>;
  }
  return { ...action, meta } as ManagerAction<P>;
};

// === Резолвер routing scope =================================================
// Приоритет: actorId > groupId > groupTag > unscoped. Более точное вытесняет менее точное.

export const arrayify = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);
export const dedupe = <T>(values: T[]): T[] => [...new Set(values)];

export const resolveRouting = (
  meta?: FSMEventMeta,
): { scope: RoutingScope; targetSet: string[] } => {
  if (!meta) return { scope: "unscoped", targetSet: [] };
  if (meta.actorId !== undefined) return { scope: "actor", targetSet: dedupe(arrayify(meta.actorId)) };
  if (meta.groupId !== undefined) return { scope: "group", targetSet: dedupe(arrayify(meta.groupId)) };
  if (meta.groupTag !== undefined) return { scope: "tag", targetSet: dedupe(arrayify(meta.groupTag)) };
  return { scope: "unscoped", targetSet: [] };
};

// === Counters / id parsing ====================================================
// SSR-safe monotonic counters: только инкремент, никаких Math.random/Date.now. Старт с 0.

export const SPAWN_ID_SEP = "#";

// Парсит spawn id вида `${owner}#${tail}`. Без `#` — owner === null, tail === id.
export const parseSpawnId = (id: string): { owner: string | null; tail: string } => {
  const sep = id.indexOf(SPAWN_ID_SEP);
  if (sep === -1) return { owner: null, tail: id };
  return { owner: id.slice(0, sep), tail: id.slice(sep + 1) };
};

// id принадлежит этому manager'у, если owner-префикс совпадает с originId.
// undefined originId требует id без `#`-префикса (legacy формат).
export const isOwnedId = (id: string, originId: string | undefined): boolean => {
  const { owner } = parseSpawnId(id);
  return originId === undefined ? owner === null : owner === originId;
};

export const cloneCounters = (counters: Counters): Counters => ({
  actor: counters.actor,
  groupByTag: new Map(counters.groupByTag),
});

// Max-merge live + draft counters; вызывается при commit'е dispatch и slow reconcile.
export const mergeCounters = (live: Counters, draft: Counters): Counters => {
  const next = cloneCounters(live);
  next.actor = Math.max(next.actor, draft.actor);

  for (const [tag, counter] of draft.groupByTag) {
    next.groupByTag.set(tag, Math.max(next.groupByTag.get(tag) ?? 0, counter));
  }

  return next;
};

// Парсит trailing counter из "{prefix}/{number}". null для opaque (server-owned "custom").
const parseTrailingCounter = (value: string): number | null => {
  const index = value.lastIndexOf("/");
  if (index < 0) return null;
  const counter = Number(value.slice(index + 1));
  return Number.isInteger(counter) && counter >= 0 ? counter : null;
};

// Mutates counters in-place: bump'ит счётчики поверх restored ids. Учитывает ownership через
// originId — id чужого owner'а пропускается (counter не двигается). Owned id парсятся из tail
// (часть после `#`), opaque tail без trailing /N skip'ается — non-collision гарантируется
// ownership-контрактом, а не парсингом.
export const bumpCountersFromId = (
  counters: Counters,
  actorId: string,
  groupId: string,
  originId: string | undefined,
): void => {
  if (isOwnedId(actorId, originId)) {
    const actorCounter = parseTrailingCounter(parseSpawnId(actorId).tail);
    if (actorCounter !== null) counters.actor = Math.max(counters.actor, actorCounter + 1);
  }

  if (isOwnedId(groupId, originId)) {
    const tail = parseSpawnId(groupId).tail;
    const slash = tail.lastIndexOf("/");
    const groupCounter = parseTrailingCounter(tail);
    if (groupCounter === null) return;
    const tag = tail.slice(0, slash);
    counters.groupByTag.set(tag, Math.max(counters.groupByTag.get(tag) ?? 0, groupCounter + 1));
  }
};
