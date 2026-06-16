import { f32, u8 } from "@lite-fsm/entities";

import { createMachine } from "../create-machine";
import type { AppEvents } from "../types";
import { UNIT_COMMAND } from "../unit-model";

export type Events = AppEvents;

export const unitCommand = createMachine({
  storage: "entity",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      UNIT_COMMAND_ASSIGNED: null,
      UNIT_COMMANDS_UPDATED: null,
      UNIT_DIED: "DISABLED",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    DISABLED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    command: u8({ default: UNIT_COMMAND.IDLE }),
    targetX: f32({ default: 0 }),
    targetY: f32({ default: 0 }),
    formationOffsetX: f32({ default: 0 }),
    formationOffsetY: f32({ default: 0 }),
  },
  spawnSchema: {
    command: u8(),
    targetX: f32(),
    targetY: f32(),
    formationOffsetX: f32(),
    formationOffsetY: f32(),
  },
  reducer: (_state, action, { payloadFor, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const payload = payloadFor(entity);

          self.command[entity] = payload.command;
          self.targetX[entity] = payload.targetX;
          self.targetY[entity] = payload.targetY;
          self.formationOffsetX[entity] = payload.formationOffsetX;
          self.formationOffsetY[entity] = payload.formationOffsetY;
        }
        return;

      case "UNIT_COMMAND_ASSIGNED":
        for (const entity of self.indices) {
          if (action.payload.touched[entity] !== 1) continue;

          self.command[entity] = action.payload.command[entity];
          self.targetX[entity] = action.payload.targetX[entity];
          self.targetY[entity] = action.payload.targetY[entity];
          self.formationOffsetX[entity] = action.payload.formationOffsetX[entity];
          self.formationOffsetY[entity] = action.payload.formationOffsetY[entity];
        }
        return;

      case "UNIT_COMMANDS_UPDATED":
        for (const entity of self.indices) {
          if (action.payload.touched[entity] !== 1) continue;
          self.command[entity] = action.payload.command[entity];
        }
        return;

      case "UNIT_DIED":
        for (const entity of self.indices) self.command[entity] = UNIT_COMMAND.IDLE;
        return;
    }
  },
});
