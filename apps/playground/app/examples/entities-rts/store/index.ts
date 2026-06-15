import { MachineManager, type MachinesState } from "@lite-fsm/core";
import { defineEntitySpawn, entitiesPlugin } from "@lite-fsm/entities";
import { immerMiddleware } from "@lite-fsm/middleware/immer";

import type { AppDeps, RuntimeDeps } from "./deps";
import { gameSession } from "./machines/game-session";
import { unitActor } from "./machines/unit-actor";
import { createGameStartSpawnPlan } from "./sim/spawn-placement";
import { spawnEvents } from "./spawn-events";
import type { AppEvents } from "./types";

export const machines = {
  gameSession,
  unitActor,
};

export type AppMachines = typeof machines;
export type AppState = MachinesState<AppMachines>;

export const spawn = defineEntitySpawn(
  machines,
  spawnEvents,
)({
  GAME_START: (payload) =>
    createGameStartSpawnPlan(payload).map((unit) => ({
      id: unit.id,
      groupTag: unit.groupTag,
      actors: {
        unitActor: unit.unit,
      },
    })),
});

export const makeStore = (deps: RuntimeDeps) => {
  const plugins = [entitiesPlugin({ spawn })];
  const manager = MachineManager<AppMachines, AppEvents, typeof plugins>(machines, {
    plugins,
    middleware: [immerMiddleware],
    onError: console.error,
  });

  manager.setDependencies({
    ...deps,
    entities: manager.entities,
    getState: manager.getState,
  });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;

export { useManager, useSelector, useTransition } from "./hooks";
export { DEFAULT_GAME_CONFIG, GAME_PRESETS } from "./config";
export { spawnEvents } from "./spawn-events";
export { UNIT_COMMAND, UNIT_FACTION, UNIT_KIND } from "./unit-model";
export type { AppDeps, RuntimeDeps } from "./deps";
export type { AppEvents, GameConfig, RtsPresetId } from "./types";
