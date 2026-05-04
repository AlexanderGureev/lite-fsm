// DispatchContext — ledger одного dispatch-цикла. Живёт от ФАЗЫ 0 до ФАЗЫ 12,
// все фазы пишут в один ctx (накопленные pending-ops, draft counters, post-commit targets).

import {
  type ActorIdentity,
  type ActorRuntime,
  cloneCounters,
  type Counters,
  EMPTY_ACTOR_RECORD,
  type NormalizeOptions,
  type RuntimeActorSlice,
  SPAWN_ID_SEP,
} from "./actor";
import type { AnyEvent, GenerateSpawnIdFn, ManagerAction, MachineStore, MachinesState } from "./types";
import { LiteFsmError, validateGeneratedId } from "./utils";

// Per-manager wiring для генерации actor/group id. Собирается один раз в конструкторе
// MachineManager и передаётся в reserveActorId/reserveGroupId на каждом dispatch.
export type SpawnIdConfig<P extends AnyEvent> = {
  originId: string | undefined;
  generateActorId: GenerateSpawnIdFn<P> | undefined;
  generateGroupId: GenerateSpawnIdFn<P> | undefined;
};

// Defaults S/P позволяют sidecar.ts читать DispatchContext как structural тип без generic-параметров.
export type DispatchContext<S extends MachineStore = MachineStore, P extends AnyEvent = AnyEvent> = {
  normalizeOpts: NormalizeOptions;

  // Post-normalize action: reducer/subscribers/effects всегда читают именно его.
  committed?: ManagerAction<P>;
  // prev-state на момент commit; нужен effects (даже если nested transition уже сдвинул live state).
  committedPrevState?: MachinesState<S>;
  // Базовые counters держим ссылкой; clone нужен только при spawn.
  countersBase: Counters;
  // Клон counters создаётся только когда dispatch резервирует actor/group id.
  countersDraft?: Counters;

  // Накопленные pending-ops core reducer'а; sidecar применит их O(diff) на commit.
  pendingSpawned: ActorIdentity[];
  pendingDelivered: ActorIdentity[];
  pendingDeleted: ActorIdentity[];

  // Copy-on-write draft-кэш actor-template записей внутри одного dispatch.
  touchedActorRecords: Map<string, Record<string, RuntimeActorSlice>>;

  // Заполняется после commit; ФАЗА 12 итерирует по этому deduped списку.
  effectsTargets: ActorRuntime[];
};

export const createDispatchContext = <S extends MachineStore, P extends AnyEvent>(
  normalizeOpts: NormalizeOptions,
  counters: Counters,
): DispatchContext<S, P> => ({
  normalizeOpts,
  countersBase: counters,
  pendingSpawned: [],
  pendingDelivered: [],
  pendingDeleted: [],
  touchedActorRecords: new Map(),
  effectsTargets: [],
});

const ensureCountersDraft = (ctx: DispatchContext): Counters => {
  if (!ctx.countersDraft) ctx.countersDraft = cloneCounters(ctx.countersBase);
  return ctx.countersDraft;
};

const buildDefaultId = (originId: string | undefined, prefix: string, counter: number): string =>
  originId ? `${originId}${SPAWN_ID_SEP}${prefix}/${counter}` : `${prefix}/${counter}`;

// Резервирует groupId/actorId в draft counters (live counters обновятся на commit).
// Counter инкрементируется ВСЕГДА — даже если custom generator возвращает свой id —
// чтобы fallback после изменения generator оставался monotonic в пределах manager'а.
export const reserveGroupId = <P extends AnyEvent>(
  ctx: DispatchContext,
  groupTag: string,
  action: ManagerAction<P>,
  cfg: SpawnIdConfig<P>,
  isTaken: (id: string) => boolean,
): string => {
  const countersDraft = ensureCountersDraft(ctx);
  const counter = countersDraft.groupByTag.get(groupTag) ?? 0;
  countersDraft.groupByTag.set(groupTag, counter + 1);
  const id = cfg.generateGroupId
    ? validateGeneratedId(
        cfg.generateGroupId({ templateKey: groupTag, groupTag, counter, originId: cfg.originId, action }),
        "group",
      )
    : buildDefaultId(cfg.originId, groupTag, counter);
  if (isTaken(id)) {
    throw new LiteFsmError("LITE_FSM_INVALID_GENERATED_ID", `[lite-fsm] groupId '${id}' is already in use.`);
  }
  return id;
};

export const reserveActorId = <P extends AnyEvent>(
  ctx: DispatchContext,
  templateKey: string,
  groupTag: string,
  action: ManagerAction<P>,
  cfg: SpawnIdConfig<P>,
  isTaken: (id: string) => boolean,
): string => {
  const countersDraft = ensureCountersDraft(ctx);
  const counter = countersDraft.actor;
  countersDraft.actor = counter + 1;
  const id = cfg.generateActorId
    ? validateGeneratedId(
        cfg.generateActorId({ templateKey, groupTag, counter, originId: cfg.originId, action }),
        "actor",
      )
    : buildDefaultId(cfg.originId, templateKey, counter);
  if (isTaken(id)) {
    throw new LiteFsmError("LITE_FSM_INVALID_GENERATED_ID", `[lite-fsm] actorId '${id}' is already in use.`);
  }
  return id;
};

// CoW для actor-template record: spawn/reduce/collapse в одном dispatch видят одну ссылку.
export const ensureRecord = <S extends MachineStore>(
  ctx: DispatchContext<S>,
  root: MachinesState<S>,
  templateKey: string,
): { root: MachinesState<S>; record: Record<string, RuntimeActorSlice> } => {
  const cached = ctx.touchedActorRecords.get(templateKey);
  if (cached) return { root, record: cached };

  const current = root[templateKey] as Record<string, RuntimeActorSlice>;
  const record: Record<string, RuntimeActorSlice> = current === EMPTY_ACTOR_RECORD ? {} : { ...current };
  const nextRoot = { ...root, [templateKey]: record } as MachinesState<S>;
  ctx.touchedActorRecords.set(templateKey, record);
  return { root: nextRoot, record };
};
