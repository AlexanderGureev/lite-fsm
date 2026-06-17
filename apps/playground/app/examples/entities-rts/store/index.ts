import { MachineManager, type MachinesState } from "@lite-fsm/core";
import { defineEntitySpawn, entitiesPlugin } from "@lite-fsm/entities";
import { immerMiddleware } from "@lite-fsm/middleware/immer";

import type { RuntimeDeps } from "./deps";
import { enemyAi } from "./machines/enemy-ai";
import { gameMap } from "./machines/game-map";
import { gameSession } from "./machines/game-session";
import { gameSpawn } from "./machines/game-spawn";
import { rtsSpatialIndex } from "./machines/rts-spatial-index";
import { unitCombat } from "./machines/unit-combat";
import { unitCommand } from "./machines/unit-command";
import { unitHealth } from "./machines/unit-health";
import { unitIdentity } from "./machines/unit-identity";
import { unitMovement } from "./machines/unit-movement";
import { unitOrders } from "./machines/unit-orders";
import { unitProjectile } from "./machines/unit-projectile";
import { unitSelection } from "./machines/unit-selection";
import { createEnemySpawnBatchPlan, createGameStartSpawnPlan, createPlayerSpawnBatchPlan } from "./spawn/placement";
import { spawnEvents } from "./spawn-events";
import type { PlannedUnitSpawn } from "./unit-model";
import type { AppEvents } from "./types";

const unitToEntitySpawnSpec = (unit: PlannedUnitSpawn) => ({
  id: unit.id,
  groupTag: unit.groupTag,
  actors: {
    unitIdentity: unit.identity,
    unitMovement: unit.movement,
    unitHealth: unit.health,
    unitCombat: unit.combat,
    ...(unit.selection ? { unitSelection: unit.selection } : {}),
    ...(unit.command ? { unitCommand: unit.command } : {}),
    ...(unit.enemyAi ? { enemyAi: unit.enemyAi } : {}),
  },
});

export const machines = {
  gameMap,
  gameSession,
  gameSpawn,
  unitOrders,
  unitIdentity,
  rtsSpatialIndex,
  unitCombat,
  unitProjectile,
  unitHealth,
  unitCommand,
  enemyAi,
  unitMovement,
  unitSelection,
};

export type AppMachines = typeof machines;
export type AppState = MachinesState<AppMachines>;

export const spawn = defineEntitySpawn(
  machines,
  spawnEvents,
)({
  GAME_START: (payload) => [
    ...createGameStartSpawnPlan(payload).map(unitToEntitySpawnSpec),
    {
      id: "system/rts-spatial-index",
      groupTag: "system",
      actors: {
        rtsSpatialIndex: {},
      },
    },
    {
      id: "system/unit-projectiles",
      groupTag: "system",
      actors: {
        unitProjectile: {},
      },
    },
  ],
  SPAWN_PLAYER_BATCH: (payload) => createPlayerSpawnBatchPlan(payload).map(unitToEntitySpawnSpec),
  SPAWN_ENEMY_BATCH: (payload) => createEnemySpawnBatchPlan(payload).map(unitToEntitySpawnSpec),
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
export { ENEMY_INTENT } from "./machines/enemy-ai";
export type { AppDeps, RuntimeDeps } from "./deps";
export type { AppEvents, GameConfig, RtsBenchmarkReport, RtsPresetId } from "./types";
