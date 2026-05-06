// Actor-aware effects: condition() с dispose-wins, transition sugar, bag-cleanup, ФАЗА 12 loop.
// Forward-declared transition/userDeps приходят в `refs` — заполняются manager'ом после wiring.

import type { ActorRuntime, NormalizeOptions, RuntimeActorSlice } from "./actor";
import { REGISTER_BAG_DISPOSE } from "./internal";
import type { SidecarState } from "./sidecar";
import type {
  ActorTransition,
  AnyEvent,
  AnyRecord,
  ManagerAction,
  Self,
} from "./types";
import { isSystemAction, LiteFsmError } from "./utils";

// === Internal effect-deps shape =============================================

// Symbol-slot для `createEffect`: per-instance cleanup-callback в actor bag без расширения публичного API.
export type InternalActorEffectDeps = {
  self?: { actorId: string };
  [REGISTER_BAG_DISPOSE]?: (actorId: string, key: symbol, dispose: () => void) => void;
};

// === Runtime wiring =========================================================

type RootStateView = Record<string, unknown>;
type ActorRecord = Record<string, RuntimeActorSlice>;
type MachineLike = {
  invokeEffect(prevState: string, currentState: string, deps: AnyRecord): Promise<void>;
};
type EffectsTargets = ActorRuntime[];
type DomainTransition<P extends AnyEvent> = (action: ManagerAction<P>) => ManagerAction<P>;
type EffectSubscriber<P extends AnyEvent> = (
  prev: unknown,
  current: unknown,
  action: ManagerAction<P> | { type: string },
) => void;

// Mutable refs: manager заполняет после wiring; все поля обязательны к первому invoke.
export type ActorEffectsRefs<P extends AnyEvent> = {
  transition: (action: ManagerAction<P>, opts?: NormalizeOptions) => ManagerAction<P>;
  userDeps: AnyRecord;
};

export type ActorEffectsDeps<P extends AnyEvent> = {
  sidecar: SidecarState;
  machines: Record<string, MachineLike>;
  domainKeys: readonly string[];
  refs: ActorEffectsRefs<P>;
  onTransition: (cb: EffectSubscriber<P>) => () => void;
  onError?: (err: unknown) => void;
};

export type ActorEffectsRuntime<P extends AnyEvent> = {
  condition: (predicate: (a: ManagerAction<P>) => boolean) => Promise<boolean>;
  invokeEffects: (
    prevState: RootStateView,
    currentState: RootStateView,
    action: ManagerAction<P>,
    targets: EffectsTargets,
  ) => void;
};

export const createActorEffectsRuntime = <P extends AnyEvent>(
  deps: ActorEffectsDeps<P>,
): ActorEffectsRuntime<P> => {
  const { sidecar, machines, domainKeys, refs, onTransition, onError } = deps;

  const registerInBag = (actorId: string, key: symbol, dispose: () => void) => {
    sidecar.actorById.get(actorId)?.bag.set(key, dispose);
  };

  const unregisterFromBag = (actorId: string, key: symbol) => {
    sidecar.actorById.get(actorId)?.bag.delete(key);
  };

  // === condition() ===========================================================
  // Если задан `self` — dispose-wins: исчезновение актора из sidecar reject'ит promise,
  // даже когда predicate уже вернул true.

  const wrappedCondition = (predicate: (a: ManagerAction<P>) => boolean, self?: Self) =>
    new Promise<boolean>((resolve, reject) => {
      const ownerLost = () => self !== undefined && !sidecar.actorById.has(self.actorId);
      const disposedError = () =>
        new LiteFsmError("LITE_FSM_ACTOR_DISPOSED", "Actor was disposed before condition resolved.");

      // condition() мог быть вызван уже после dispose'а актора.
      if (ownerLost()) return reject(disposedError());

      let bagKey: symbol | undefined;
      const teardown = () => {
        unsubscribe();
        if (self && bagKey) unregisterFromBag(self.actorId, bagKey);
      };

      const unsubscribe = onTransition((_prev, _current, action) => {
        if (isSystemAction(action)) return;
        // Bag-cleanup сделает reject, здесь silently bail.
        if (ownerLost()) return unsubscribe();
        try {
          if (!predicate(action as ManagerAction<P>)) return;
          // predicate мог reentrant'но убить owner'а — финальный dispose-check перед resolve.
          if (ownerLost()) return unsubscribe();
          teardown();
          resolve(true);
        } catch (err) {
          teardown();
          reject(err);
        }
      });

      if (self) {
        bagKey = Symbol("condition");
        registerInBag(self.actorId, bagKey, () => {
          unsubscribe();
          reject(disposedError());
        });
      }
    });

  const condition = (predicate: (a: ManagerAction<P>) => boolean) => wrappedCondition(predicate);

  // === Actor transition sugar =================================================
  // callable + .unscoped/.actor/.group/.tag. `sender: self` нужен normalize для late-dispatch и sender meta.

  const buildActorTransition = (self: Self): ActorTransition<P> => {
    const base = ((action: ManagerAction<P>) => refs.transition(action, { sender: self })) as ActorTransition<P>;
    base.unscoped = (action) => refs.transition(action as ManagerAction<P>, { sender: self, forceUnscoped: true });
    base.actor = (id, action) =>
      refs.transition({ ...action, meta: { actorId: id } } as ManagerAction<P>, { sender: self });
    base.group = (id, action) =>
      refs.transition({ ...action, meta: { groupId: id } } as ManagerAction<P>, { sender: self });
    base.tag = (id, action) =>
      refs.transition({ ...action, meta: { groupTag: id } } as ManagerAction<P>, { sender: self });
    return base;
  };

  // === Effect invocation (ФАЗА 12) ===========================================
  // Domain — на каждом committed action. Actor — только для delivered/spawned (terminal уже отфильтрованы).

  const invokeDomainEffects = (
    prevState: RootStateView,
    currentState: RootStateView,
    action: ManagerAction<P>,
  ) => {
    const transition: DomainTransition<P> = (nextAction) => refs.transition(nextAction);
    for (const name of domainKeys) {
      const machine = machines[name];
      const prev = prevState[name] as { state: string; context: AnyRecord };
      const current = currentState[name] as { state: string; context: AnyRecord };
      machine
        .invokeEffect(prev.state, current.state, {
          ...refs.userDeps,
          transition,
          action,
          condition,
        })
        .catch((err) => onError?.(err));
    }
  };

  const invokeActorEffects = (
    prevState: RootStateView,
    currentState: RootStateView,
    action: ManagerAction<P>,
    targets: EffectsTargets,
  ) => {
    for (const actor of targets) {
      const { actorId, groupId, groupTag } = actor.meta;
      const machine = machines[actor.templateKey];
      const prevRecord = prevState[actor.templateKey] as ActorRecord | undefined;
      const currentRecord = currentState[actor.templateKey] as ActorRecord | undefined;
      const prevSlice = prevRecord?.[actorId];
      const currentSlice = currentRecord?.[actorId];
      // Nested transition между commit и ФАЗОЙ 12 мог удалить актора — пропускаем.
      if (!currentSlice) continue;

      const self: Self = { actorId, groupId, groupTag };

      machine
        .invokeEffect(prevSlice?.state ?? "__INIT", currentSlice.state, {
          ...refs.userDeps,
          transition: buildActorTransition(self),
          action,
          condition: (predicate: (a: ManagerAction<P>) => boolean) => wrappedCondition(predicate, self),
          self,
          [REGISTER_BAG_DISPOSE]: registerInBag,
        })
        .catch((err) => onError?.(err));
    }
  };

  const invokeEffects = (
    prevState: RootStateView,
    currentState: RootStateView,
    action: ManagerAction<P>,
    targets: EffectsTargets,
  ) => {
    invokeDomainEffects(prevState, currentState, action);
    invokeActorEffects(prevState, currentState, action, targets);
  };

  return { condition, invokeEffects };
};
