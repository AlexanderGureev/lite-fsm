import { MachineManager } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";

import { lamp } from "./machines/lamp";
import type { AppEvents } from "./types";

const machines = { lamp };

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
