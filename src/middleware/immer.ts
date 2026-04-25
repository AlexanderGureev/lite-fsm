import { produce } from "immer";

import type { AnyEvent, MiddlewareApi, VoidReducerMiddleware } from "../core/types";
import { VOID_REDUCER_MIDDLEWARE_MARKER } from "../core/utils";

const createMiddleware = <S, P extends AnyEvent>(api: MiddlewareApi<S, P>) => {
  api.replaceReducer((reducer) => {
    const newReducer = produce((draft, action) => {
      const result = reducer(draft as S, action);

      if (typeof result === "object" && result !== null) {
        const next = result as Record<string, unknown>;
        const target = draft as Record<string, unknown>;

        for (const k of Object.keys(result)) {
          if (next[k] !== undefined) target[k] = next[k];
        }
      }

      return draft;
    }, api.getState());

    return newReducer;
  });

  return (next: (action: P) => P) => next;
};

const middleware = createMiddleware as VoidReducerMiddleware;

middleware[VOID_REDUCER_MIDDLEWARE_MARKER] = true;

export const immerMiddleware = middleware;
