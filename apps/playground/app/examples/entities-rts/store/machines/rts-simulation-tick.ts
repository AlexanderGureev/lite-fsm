import { createMachine } from "../create-machine";
import { isRtsTickAction, runRtsSimulationTick } from "../sim/tick";
import type { AppEvents } from "../types";

export type Events = AppEvents;

export const rtsSimulationTick = createMachine({
  storage: "entity",
  despawnOn: "REMOVED",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "READY",
    },
    READY: {
      TICK: null,
      GAME_RESTART: "REMOVED",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    REMOVED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {},
  spawnSchema: {},
  reactions: {
    TICK: ({ action, entities }) => {
      if (!isRtsTickAction(action)) return;
      runRtsSimulationTick(action, entities());
    },
  },
});
