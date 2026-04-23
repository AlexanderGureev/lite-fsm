import { produce } from "immer";

import type { Middleware } from "../core/types";
import { VOID_REDUCER_MIDDLEWARE_MARKER } from "../core/utils";

type ImmerMiddleware = Middleware & {
  [VOID_REDUCER_MIDDLEWARE_MARKER]: true;
};

const middleware = ((api) => {
  api.replaceReducer((reducer) => {
    const newReducer = produce((draft, action) => {
      const result = reducer(draft, action);

      if (typeof result === "object") {
        for (const k of Object.keys(result)) {
          if (result[k] !== undefined) draft[k] = result[k];
        }
      }

      return draft;
    }, api.getState());

    return newReducer;
  });

  return (next) => next;
}) as ImmerMiddleware;

middleware[VOID_REDUCER_MIDDLEWARE_MARKER] = true;

export const immerMiddleware = middleware;
