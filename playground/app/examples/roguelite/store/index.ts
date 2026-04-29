import { MachineManager } from "lite-fsm";
import type { MachinesState } from "lite-fsm";
import { immerMiddleware } from "lite-fsm/middleware/immer";

import type { AppDeps } from "./deps";
import { rogueliteMachines } from "./machines";
import type { AppEvents, Vec2 } from "./types";

export type FSMConfigType = typeof rogueliteMachines;
export type AppState = MachinesState<FSMConfigType>;

export const makeStore = (deps: Omit<AppDeps, "getState">) => {
  const manager = MachineManager<FSMConfigType, AppEvents>(rogueliteMachines, {
    onError: console.error,
    middleware: [immerMiddleware],
  });

  manager.setDependencies({
    ...deps,
    getState: manager.getState,
  });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;

export type { Vec2 };
export { useManager, useSelector, useTransition } from "./hooks";
export type { AppEvents } from "./types";
