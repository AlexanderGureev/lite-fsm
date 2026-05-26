// Action normalization вокруг middleware: ФАЗА 0 pre-normalize и ФАЗА 2 post-normalize.
// Reducer/subscribers/effects всегда видят чистый action, даже если middleware его мутировал.

import { attachMeta, type NormalizeOptions } from "./actor";
import type { DispatchContext } from "./dispatchContext";
import type { RoutingRuntime } from "./runtime/kernel/routing";
import type { SidecarState } from "./sidecar";
import type { AnyEvent, ManagerAction, MachineStore } from "./types";
import { isSystemAction } from "./utils";

export type NormalizeActionResult<P extends AnyEvent> =
  | { readonly type: "continue"; readonly action: ManagerAction<P> }
  | { readonly type: "drop" };

export type Normalizer<S extends MachineStore, P extends AnyEvent> = {
  normalizeAction: (raw: ManagerAction<P>, opts?: NormalizeOptions) => NormalizeActionResult<P>;
  applyPostNormalize: (ctx: DispatchContext<S, P>, action: ManagerAction<P>) => void;
};

// User-actions не могут диспатчить зарезервированные `@@lite-fsm/*` types.
export const assertUserAction = (action: { type: string }): void => {
  if (isSystemAction(action)) {
    throw new Error(`[lite-fsm] reserved system action '${action.type}' cannot be dispatched.`);
  }
};

export const createNormalizer = <S extends MachineStore, P extends AnyEvent>(deps: {
  sidecar: SidecarState;
  routing: RoutingRuntime;
}): Normalizer<S, P> => {
  const { routing, sidecar } = deps;

  const normalizeAction = (
    raw: ManagerAction<P>,
    { sender, routingMode = "default" }: NormalizeOptions = {},
  ): NormalizeActionResult<P> => {
    // Обычный external action без meta не требует копирования.
    if (!sender && routingMode === "default" && !("meta" in raw)) return { type: "continue", action: raw };

    // Sender уже disposed → full no-op.
    if (sender && !sidecar.actorById.has(sender.actorId)) return { type: "drop" };

    // Срезаем sender-поля и переписываем настоящими — middleware не подделает sender.
    const meta = routing.stripSenderFields(raw.meta);
    if (sender) {
      meta.senderActorId = sender.actorId;
      meta.senderGroupId = sender.groupId;
      meta.senderGroupTag = sender.groupTag;
    }

    // transition.unscoped() обязан остаться unscoped — рубим routing и пропускаем default routing.
    if (routingMode === "unscoped") {
      const normalized = attachMeta(raw, routing.stripRouting(meta));
      routing.resolveRoute(normalized as ManagerAction<AnyEvent>);
      return { type: "continue", action: normalized };
    }

    // Default routing: actor-dispatch без явного routing → в свою группу.
    if (sender && !routing.hasRoute(meta)) {
      meta.groupId = sender.groupId;
      meta.groupTag = sender.groupTag;
    }
    const normalized = attachMeta(raw, meta);
    routing.resolveRoute(normalized as ManagerAction<AnyEvent>);
    return { type: "continue", action: normalized };
  };

  // ФАЗА 2: post-normalize после middleware. Пишет clean action в ctx.committed.
  const applyPostNormalize = (ctx: DispatchContext<S, P>, action: ManagerAction<P>): void => {
    const normalized = normalizeAction(action, ctx.normalizeOpts);
    if (normalized.type === "continue") ctx.committed = normalized.action;
  };

  return { normalizeAction, applyPostNormalize };
};
