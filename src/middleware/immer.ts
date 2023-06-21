import { produce } from "immer";
import { Middleware } from "~/core/types";

export const immerMiddleware: Middleware = (api) => {
  api.replaceReducer((reducer) => {
    const newReducer = produce((draft, action) => {
      const result = reducer(draft, action);

      for (const k of Object.keys(result)) {
        if (result[k] !== undefined) draft[k] = result[k];
      }

      return draft;
    }, api.getState());

    return newReducer;
  });

  return (next) => next;
};
