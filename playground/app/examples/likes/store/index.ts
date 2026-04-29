import { MachineManager } from "lite-fsm";
import { immerMiddleware } from "lite-fsm/middleware/immer";

import { likes } from "./machines/likes";
import { likesPending } from "./machines/likesPending";
import type { AppEvents } from "./types";

const machines = { likes, likesPending };

export type FSMConfigType = typeof machines;

export const makeStore = () =>
  MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware],
  });

export type AppStore = ReturnType<typeof makeStore>;
export type AppState = ReturnType<AppStore["getState"]>;

export { useManager, useSelector, useTransition } from "./hooks";
export type { AppEvents } from "./types";
