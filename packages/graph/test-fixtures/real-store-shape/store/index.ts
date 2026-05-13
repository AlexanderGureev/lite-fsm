// @ts-nocheck

import * as playerServices from "@player/services";
import { machines as playerMachines } from "@player/store";
import type { MachinesState } from "lite-fsm";
import { MachineManager } from "lite-fsm";
import { devToolsMiddleware, immerMiddleware } from "lite-fsm/middleware";

import * as webMachines from "./machines";
import type { AppEvents, Dependencies } from "./types";

const { root, ...rest } = webMachines;

const cfg = {
  root,
  ...rest,
  ...playerMachines,
};

export type FSMConfigType = typeof cfg;

export const makeStore = () => {
  const middlewares = [immerMiddleware];

  const manager = MachineManager<FSMConfigType, AppEvents>(cfg, {
    onError: console.error,
    middleware:
      process.env.NEXT_PUBLIC_DEV === "true"
        ? [...middlewares, devToolsMiddleware({ blacklistActions: [] })]
        : middlewares,
  });

  const deps: Dependencies = {
    services: {
      ...playerServices,
    },
    getState: manager.getState,
  };

  manager.setDependencies<Dependencies>(deps);

  return manager;
};

export type AppState = MachinesState<FSMConfigType>;
export type AppStore = ReturnType<typeof makeStore>;
