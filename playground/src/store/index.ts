import { MachineManager } from "lite-fsm";
import { immerMiddleware } from "lite-fsm/middleware/immer";

import { lamp } from "./machines/lamp";
import { likes } from "./machines/likes";
import { likesPending } from "./machines/likesPending";
import { profileSession } from "./machines/profileSession";
import { widgetFeed } from "./machines/widgetFeed";
import type { AppEvents } from "./types";

const machines = {
  lamp,
  likes,
  likesPending,
  profileSession,
  widgetFeed,
};

export type FSMConfigType = typeof machines;

export const makeStore = () => {
  const manager = MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware],
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
