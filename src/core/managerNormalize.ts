// Action normalization вокруг middleware: ФАЗА 0 pre-normalize и ФАЗА 2 post-normalize.
// Reducer/subscribers/effects всегда видят чистый action, даже если middleware его мутировал.

import { attachMeta, type NormalizeOptions, stripRouting, stripSenderFields } from "./actor";
import type { DispatchContext } from "./dispatchContext";
import { LATE_DISPATCH } from "./internal";
import type { SidecarState } from "./sidecar";
import type { AnyEvent, ManagerAction, MachineStore } from "./types";
import { isSystemAction } from "./utils";

export type Normalizer<S extends MachineStore, P extends AnyEvent> = {
  normalizeAction: (raw: ManagerAction<P>, opts?: NormalizeOptions) => ManagerAction<P> | typeof LATE_DISPATCH;
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
}): Normalizer<S, P> => {
  const { sidecar } = deps;

  const normalizeAction = (
    raw: ManagerAction<P>,
    { sender, forceUnscoped = false }: NormalizeOptions = {},
  ): ManagerAction<P> | typeof LATE_DISPATCH => {
    // Обычный external action без meta не требует копирования.
    if (!sender && !forceUnscoped && !("meta" in raw)) return raw;

    // Sender уже disposed → full no-op.
    if (sender && !sidecar.actorById.has(sender.actorId)) return LATE_DISPATCH;

    // Срезаем sender-поля и переписываем настоящими — middleware не подделает sender.
    const meta = stripSenderFields(raw.meta);
    if (sender) {
      meta.senderActorId = sender.actorId;
      meta.senderGroupId = sender.groupId;
      meta.senderGroupTag = sender.groupTag;
    }

    // transition.unscoped() обязан остаться unscoped — рубим routing и пропускаем default routing.
    if (forceUnscoped) return attachMeta(raw, stripRouting(meta));

    // Default routing: actor-dispatch без явного routing → в свою группу.
    if (sender && meta.actorId === undefined && meta.groupId === undefined && meta.groupTag === undefined) {
      meta.groupId = sender.groupId;
      meta.groupTag = sender.groupTag;
    }
    return attachMeta(raw, meta);
  };

  // ФАЗА 2: post-normalize после middleware. Пишет clean action в ctx.committed.
  const applyPostNormalize = (ctx: DispatchContext<S, P>, action: ManagerAction<P>): void => {
    const normalized = normalizeAction(action, ctx.normalizeOpts);
    if (normalized !== LATE_DISPATCH) ctx.committed = normalized;
  };

  return { normalizeAction, applyPostNormalize };
};
