import { MachineManager } from "lite-fsm";
import { immerMiddleware } from "lite-fsm/middleware/immer";

import { lamp } from "./machines/lamp";
import { likes } from "./machines/likes";
import { likesPending } from "./machines/likesPending";
import { profileSession } from "./machines/profileSession";
import { entityList } from "./machines/entityList";
import { ssrDemo2Grid } from "./machines/ssrDemo2Grid";
import { ssrDemo3EntityList } from "./machines/ssrDemo3EntityList";
import { ssrDemo3Grid } from "./machines/ssrDemo3Grid";
import { widgetFeed } from "./machines/widgetFeed";
import type { AppEvents } from "./types";

const machines = {
  lamp,
  likes,
  likesPending,
  profileSession,
  ssrDemo2Grid,
  ssrDemo3Grid,
  ssrDemo3EntityList,
  entityList,
  widgetFeed,
};

export type FSMConfigType = typeof machines;

export const makeStore = () => {
  const manager = MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware],
    schemaVersion: 1,
  });

  manager.setDependencies({
    getState: manager.getState,
  });

  manager.onTransition((prevState, currentState, action) => {
    if (typeof window === "undefined") return;

    console.log("[lite-fsm playground]", {
      action,
      prevState,
      currentState,
    });
  });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;
export type AppState = ReturnType<AppStore["getState"]>;

export { useManager, useSelector, useTransition } from "./hooks";
export type { AppEvents } from "./types";
