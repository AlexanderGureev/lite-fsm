import { MachineManager, type MachinesState } from "@lite-fsm/core";
import { entitiesPlugin, defineEntitySpawn } from "@lite-fsm/entities";
import { immerMiddleware } from "@lite-fsm/middleware/immer";
import { createJsonStorage, persistManager } from "@lite-fsm/persist";

import type { AppEntityAccess, MachineDeps, RuntimeDeps } from "./deps";
import { blinkActor } from "./machines/blink-actor";
import { enemyActor } from "./machines/enemy-actor";
import { enemySpriteActor } from "./machines/enemy-sprite-actor";
import { worldMachine } from "./machines/world-machine";
import { spawnEvents } from "./spawn-events";
import type { AppEvents } from "./types";

export const machines = {
  worldMachine,
  blinkActor,
  enemyActor,
  enemySpriteActor,
};

export type AppMachines = typeof machines;
export type AppState = MachinesState<AppMachines>;
export type AppDeps = Omit<MachineDeps, "getState"> & {
  getState: () => AppState;
  entities?: AppEntityAccess<AppMachines>;
};

export const spawn = defineEntitySpawn(
  machines,
  spawnEvents,
)({
  SPAWN_ENEMY: (payload) => ({
    id: payload.id,
    groupTag: payload.faction ?? "enemy",
    actors: {
      enemyActor: {
        x: payload.x,
        y: payload.y,
        dx: payload.dx,
        dy: payload.dy,
        hp: payload.hp,
        scoreValue: payload.scoreValue,
        spriteId: payload.spriteId,
        faction: payload.faction,
      },
      enemySpriteActor: {
        spriteId: payload.spriteId,
      },
    },
  }),
});

const createPlugins = () => [entitiesPlugin({ spawn })];

type AppPlugins = ReturnType<typeof createPlugins>;

const shouldPersistBlinkActor = ({ action }: { action: { type: string } }) => {
  switch (action.type) {
    case "START_BLINK_ACTOR":
    case "FLASH_FROM_ENTITY":
    case "STOP_BLINK_ACTOR":
    case "RESET_WORLD":
      return true;
    default:
      return false;
  }
};

export const makeStore = (deps: RuntimeDeps) => {
  const plugins = createPlugins();
  const manager = MachineManager<AppMachines, AppEvents, AppPlugins>(machines, {
    plugins,
    middleware: [immerMiddleware],
    onError: console.error,
    generateActorId: ({ templateKey, action, counter }) => {
      if (templateKey === "blinkActor" && action.type === "START_BLINK_ACTOR") {
        return `${templateKey}/${action.payload.id}`;
      }

      return `${templateKey}/${counter}`;
    },
  });

  manager.setDependencies({
    ...deps,
    getState: manager.getState,
  });

  const persistStorage = createJsonStorage<AppMachines>({
    key: "lite-fsm:ecs-example:v1",
    storage: () => deps.persistStorage ?? globalThis.localStorage,
  });

  // manager.entities.get('')

  const persist = [
    persistManager(manager, {
      storage: persistStorage,
      machines: ["blinkActor"],
      throttleMs: 50,
      shouldSave: shouldPersistBlinkActor,
    }),
  ];

  return { manager, persist };
};

export type AppStore = ReturnType<typeof makeStore>;

export * from "./hooks";
export * from "./selectors";
export type { MachineDeps, RuntimeDeps } from "./deps";
export { createMemorySprites, createMemoryStorage } from "./deps";
export { spawnEvents };
export type { AppEvents } from "./types";
