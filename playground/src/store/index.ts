import { MachineManager } from "lite-fsm";
import { immerMiddleware } from "lite-fsm/middleware/immer";

import { lamp } from "./machines/lamp";
import { likes } from "./machines/likes";
import { likesPending } from "./machines/likesPending";
import type { AppEvents } from "./types";

const machines = {
  lamp,
  likes,
  likesPending,
};

export type FSMConfigType = typeof machines;

export const manager = MachineManager<FSMConfigType, AppEvents>(machines, {
  onError: console.error,
  middleware: [immerMiddleware],
});

manager.onTransition((prevState, currentState, action) => {
  console.log("[lite-fsm playground]", {
    action,
    prevState,
    currentState,
  });
});

export type AppState = ReturnType<typeof manager.getState>;

export { useManager, useSelector, useTransition } from "./hooks";
export type { AppEvents } from "./types";
