import { f32, i32 } from "@lite-fsm/entities";

import { createMachine } from "../create-machine";
import type { AppEvents } from "../types";

export type Events = AppEvents;

export const unitCombat = createMachine({
  storage: "entity",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      UNIT_COMBAT_TIMERS_UPDATED: null,
      UNIT_DIED: "DISABLED",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    DISABLED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    attackRange: f32({ default: 0 }),
    attackDamage: i32({ default: 0 }),
    attackCooldownMs: i32({ default: 0 }),
    attackTimerMs: i32({ default: 0 }),
  },
  spawnSchema: {
    attackRange: f32(),
    attackDamage: i32(),
    attackCooldownMs: i32(),
    attackTimerMs: i32(),
  },
  reducer: (_state, action, { payloadFor, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const payload = payloadFor(entity);

          self.attackRange[entity] = payload.attackRange;
          self.attackDamage[entity] = payload.attackDamage;
          self.attackCooldownMs[entity] = payload.attackCooldownMs;
          self.attackTimerMs[entity] = payload.attackTimerMs;
        }
        return;

      case "UNIT_COMBAT_TIMERS_UPDATED":
        for (const entity of self.indices) {
          if (action.payload.touched[entity] !== 1) continue;
          self.attackTimerMs[entity] = action.payload.attackTimerMs[entity];
        }
        return;

      case "UNIT_DIED":
        for (const entity of self.indices) self.attackTimerMs[entity] = 0;
        return;
    }
  },
});
