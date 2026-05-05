import { MachineManager } from "lite-fsm";
import { immerMiddleware } from "lite-fsm/middleware/immer";
import { devToolsMiddleware } from "lite-fsm/middleware/devTools";

import { profile } from "./machines/profile";
import type { AppEvents } from "./types";

const machines = { profile };

export type FSMConfigType = typeof machines;

export const makeStore = () =>
  MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware, devToolsMiddleware()],
  });

export type AppStore = ReturnType<typeof makeStore>;
export type AppState = ReturnType<AppStore["getState"]>;

export { useManager, useSelector, useTransition } from "./hooks";
export type { AppEvents } from "./types";
