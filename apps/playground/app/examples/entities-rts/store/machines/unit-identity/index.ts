import { f32, i32, u8 } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import type { AppEvents } from "../../types";

export type Events = AppEvents;

export const unitIdentity = createMachine({
  storage: "entity",
  despawnOn: "REMOVED",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "PRESENT",
    },
    PRESENT: {
      GAME_RESTART: "REMOVED",
    },
    REMOVED: {},
  },
  initialState: "__INIT",
  initialContext: {
    kind: u8({ default: 0 }),
    faction: u8({ default: 0 }),
    radius: f32({ default: 0 }),
    unitIndex: i32({ default: -1 }),
  },
  spawnSchema: {
    kind: u8(),
    faction: u8(),
    radius: f32(),
    unitIndex: i32(),
  },
  reducer: (_state, action, { payloadFor, self }) => {
    if (action.type !== "ENTITY_SPAWNED") return;

    for (const entity of self.indices) {
      const payload = payloadFor(entity);

      self.kind[entity] = payload.kind;
      self.faction[entity] = payload.faction;
      self.radius[entity] = payload.radius;
      self.unitIndex[entity] = payload.unitIndex;
    }
  },
});
