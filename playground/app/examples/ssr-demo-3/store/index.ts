import { MachineManager } from "lite-fsm";
import type { MachinesState } from "lite-fsm";
import { immerMiddleware } from "lite-fsm/middleware/immer";

import { entityList } from "./machines/entityList";
import { grid } from "./machines/grid";
import type { AppEvents } from "./types";

const machines = { grid, entityList };

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
