import { MachineManager } from "@lite-fsm/core";
import type { MachinesState } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";

import { profileSession } from "./machines/profileSession";
import { widgetFeed } from "./machines/widgetFeed";
import type { AppEvents } from "./types";

const machines = { profileSession, widgetFeed };

export type FSMConfigType = typeof machines;
export type AppState = MachinesState<FSMConfigType>;

export const makeStore = () => {
  const manager = MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware],
  });

  manager.setDependencies({ getState: manager.getState });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;

export { useManager, useSelector, useTransition } from "./hooks";
export type { AppEvents } from "./types";
