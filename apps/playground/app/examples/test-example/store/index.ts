import { MachineManager } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";
import { devToolsMiddleware } from "@lite-fsm/middleware/devTools";

import { onboarding } from "./machines/onboarding";
import { profile } from "./machines/profile";
import type { AppEvents } from "./types";

const machines = { onboarding, profile };

export type FSMConfigType = typeof machines;

export const makeStore = () => {
  const manager = MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware, devToolsMiddleware()],
  });

  manager.setDependencies({ getState: manager.getState });
  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;
export type AppState = ReturnType<AppStore["getState"]>;

export { useManager, useSelector, useTransition } from "./hooks";
export type { AppEvents } from "./types";
