import type {
  AnyEvent,
  AnyRecord,
  ActorTransition,
  CFG,
  EffectType,
  ManagerAction,
  MachineEffect,
  MachineReducer,
  StateName,
  WILDCARD,
} from "./types";
import type { InternalActorEffectDeps } from "./actorEffects";
import { REGISTER_BAG_DISPOSE } from "./internal";

export type * from "./interfaces";
export { createActorMeta } from "./actor";
export { CreateMachine as Machine, defineMachine } from "./Machine";
export { MachineManager } from "./MachineManager";
export * from "./types";
export { createMachine, type TypedCreateMachineFn } from "./createMachine";
export { LiteFsmError } from "./utils";

export const createReducer = <C extends object, T extends AnyRecord, P extends AnyEvent = AnyEvent>(
  reducer: MachineReducer<C, P, T>,
) => reducer;

export const createConfig = <C extends object, P extends AnyEvent = AnyEvent>(
  cfg: C & CFG<C, P, StateName<C> | WILDCARD>,
): C => cfg;

// Per-owner slot: latest/cancelFn state изолированно между domain (OWNER_DOMAIN) и actor instances
// (self.actorId как ownerKey). Даёт actor-instance level изоляцию `latest`-семантики.
type EffectSlot = { lastId: number; cancel?: () => boolean; dispose?: () => void };

const OWNER_DOMAIN = Symbol.for("lite-fsm.owner.domain");

const take = <
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
  C extends { [key in keyof C]: object } = Record<string, never>,
  N extends StateName<C> | WILDCARD = StateName<C> | WILDCARD,
>({
  type,
  effect,
  cancelFn,
}: {
  type?: EffectType;
  effect: MachineEffect<N, C, P, D>;
  cancelFn?: (deps: Parameters<MachineEffect<N, C, P, D>>[0]) => () => boolean;
}) => {
  const ownerState = new Map<string | symbol, EffectSlot>();

  return (opts: Parameters<MachineEffect<N, C, P, D>>[0]) => {
    const deps = opts as Parameters<MachineEffect<N, C, P, D>>[0] & InternalActorEffectDeps;
    const ownerKey: string | symbol = deps.self?.actorId ?? OWNER_DOMAIN;
    const slot = ownerState.get(ownerKey) ?? { lastId: 0 };
    slot.lastId += 1;
    slot.cancel = cancelFn?.(opts);
    ownerState.set(ownerKey, slot);
    const currentId = slot.lastId;

    if (deps.self && !slot.dispose) {
      /* v8 ignore next -- invoked by actor disposal; only mutates private owner state. */
      slot.dispose = () => ownerState.delete(ownerKey);
      deps[REGISTER_BAG_DISPOSE]?.(deps.self.actorId, Symbol("createEffect"), slot.dispose);
    }

    const canTransition = () => {
      if (type === "latest" && currentId !== ownerState.get(ownerKey)?.lastId) return false;
      return !slot.cancel?.();
    };

    const guardedTransition = Object.assign(
      (action: ManagerAction<P>) => {
        if (!canTransition()) return action;
        return opts.transition(action);
      },
      opts.transition,
    ) as ActorTransition<P>;

    // У actor effect-а opts.transition — ActorTransition с sugar; оборачиваем canTransition guard'ом.
    if (deps.self) {
      const actorTransition = opts.transition as ActorTransition<P>;
      guardedTransition.unscoped = (action) => (canTransition() ? actorTransition.unscoped(action) : action);
      guardedTransition.actor = (id, action) => (canTransition() ? actorTransition.actor(id, action) : action);
      guardedTransition.group = (id, action) => (canTransition() ? actorTransition.group(id, action) : action);
      guardedTransition.tag = (id, action) => (canTransition() ? actorTransition.tag(id, action) : action);
    }

    return effect({ ...opts, transition: guardedTransition });
  };
};

export const createEffect = <
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
  C extends { [key in keyof C]: object } = Record<string, never>,
  N extends StateName<C> | WILDCARD = StateName<C> | WILDCARD,
>(opts: {
  effect: MachineEffect<N, C, P, D>;
  type?: EffectType;
  cancelFn?: (deps: Parameters<MachineEffect<N, C, P, D>>[0]) => () => boolean;
}) => {
  return take(opts);
};
