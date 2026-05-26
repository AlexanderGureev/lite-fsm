import type { AnyEvent, ManagerAction, ReadonlyManagerAction } from "../../types";
import { IS_DEV } from "../../utils";

export const createReadonlyActionView = <Events extends AnyEvent>(
  action: ManagerAction<Events>,
): ReadonlyManagerAction<Events> => {
  /* v8 ignore next -- production keeps callback action views allocation-free. */
  if (!IS_DEV) return action as ReadonlyManagerAction<Events>;

  const view = { ...action };
  if (action.meta !== undefined) {
    view.meta = Object.freeze({ ...action.meta }) as typeof action.meta;
  }

  return Object.freeze(view) as ReadonlyManagerAction<Events>;
};
