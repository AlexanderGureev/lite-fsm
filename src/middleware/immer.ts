import { produce } from "immer";

import type { AnyEvent, ManagerAction, MiddlewareApi, VoidReducerMiddleware } from "../core/types";
import { VOID_REDUCER_MIDDLEWARE_MARKER } from "../core/utils";

const createMiddleware = <S, P extends AnyEvent>(api: MiddlewareApi<S, P>) => {
  api.replaceReducer((reducer) => {
    return produce((draft, action) => {
      const result = reducer(draft as S, action);

      // Top-level merge для domain replaceReducer wrappers. Actor record replacement
      // остаётся ответственностью core commit/reconcile, immer — обычный reducer enhancer.
      if (typeof result === "object" && result !== null) {
        const next = result as Record<string, unknown>;
        const target = draft as Record<string, unknown>;
        for (const key of Object.keys(next)) {
          if (next[key] !== undefined) target[key] = next[key];
        }
      }

      return draft;
    }, api.getState());
  });

  return (next: (action: ManagerAction<P>) => ManagerAction<P>) => next;
};

const middleware = createMiddleware as VoidReducerMiddleware;

middleware[VOID_REDUCER_MIDDLEWARE_MARKER] = true;

export const immerMiddleware = middleware;
