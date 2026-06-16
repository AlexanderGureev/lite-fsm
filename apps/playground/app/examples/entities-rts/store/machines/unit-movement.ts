import { f32 } from "@lite-fsm/entities";

import { createMachine } from "../create-machine";
import type { AppEvents } from "../types";

export type Events = AppEvents;

export const unitMovement = createMachine({
  storage: "entity",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      UNIT_MOVEMENT_UPDATED: null,
      UNIT_DIED: "STOPPED",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    STOPPED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    x: f32({ default: 0 }),
    y: f32({ default: 0 }),
    vx: f32({ default: 0 }),
    vy: f32({ default: 0 }),
    speed: f32({ default: 0 }),
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
    vx: f32(),
    vy: f32(),
    speed: f32(),
  },
  reducer: (_state, action, { payloadFor, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const payload = payloadFor(entity);

          self.x[entity] = payload.x;
          self.y[entity] = payload.y;
          self.vx[entity] = payload.vx;
          self.vy[entity] = payload.vy;
          self.speed[entity] = payload.speed;
        }
        return;

      case "UNIT_MOVEMENT_UPDATED":
        for (const entity of self.indices) {
          if (action.payload.touched[entity] !== 1) continue;

          self.x[entity] = action.payload.x[entity];
          self.y[entity] = action.payload.y[entity];
          self.vx[entity] = action.payload.vx[entity];
          self.vy[entity] = action.payload.vy[entity];
        }
        return;

      case "UNIT_DIED":
        for (const entity of self.indices) {
          self.vx[entity] = 0;
          self.vy[entity] = 0;
        }
        return;
    }
  },
});
