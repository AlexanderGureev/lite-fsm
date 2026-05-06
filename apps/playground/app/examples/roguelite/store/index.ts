import { MachineManager } from "@lite-fsm/core";
import type { MachinesState } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";

import type { AppDeps } from "./deps";
import { bootSystem } from "./machines/bootSystem";
import { combatSystem } from "./machines/combatSystem";
import { enemyBody } from "./machines/enemyBody";
import { enemyHitFeedback } from "./machines/enemyHitFeedback";
import { enemyHealth } from "./machines/enemyHealth";
import { enemySpawner } from "./machines/enemySpawner";
import { gameSession } from "./machines/gameSession";
import { movementSystem } from "./machines/movementSystem";
import { playerAutoFire } from "./machines/playerAutoFire";
import { playerBody } from "./machines/playerBody";
import { playerInput } from "./machines/playerInput";
import { projectileBody } from "./machines/projectileBody";
import { projectileMotionSystem } from "./machines/projectileMotionSystem";
import type { AppEvents, Vec2 } from "./types";

export const rogueliteMachines = {
  gameSession,
  playerInput,
  bootSystem,
  enemySpawner,
  movementSystem,
  projectileMotionSystem,
  playerAutoFire,
  combatSystem,
  playerBody,
  enemyBody,
  enemyHealth,
  enemyHitFeedback,
  projectileBody,
};

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
export {
  selectEnemyHitFeedbackByEntity,
  selectEnemyHealthByEntity,
  selectGameView,
  selectPlayerBody,
} from "./selectors";
export type { GameStatus, GameView } from "./selectors";
export type { AppEvents } from "./types";
