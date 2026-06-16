import { i32 } from "@lite-fsm/entities";

import { createMachine } from "../create-machine";
import type { AppEvents } from "../types";
import { UNIT_KIND } from "../unit-model";

export type Events = AppEvents;

export const unitHealth = createMachine({
  storage: "entity",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ALIVE",
    },
    ALIVE: {
      UNIT_DAMAGE_APPLIED: null,
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    DEAD: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    hp: i32({ default: 0 }),
    maxHp: i32({ default: 0 }),
  },
  spawnSchema: {
    hp: i32(),
    maxHp: i32(),
  },
  reducer: (_state, action, { payloadFor, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const payload = payloadFor(entity);

          self.hp[entity] = payload.hp;
          self.maxHp[entity] = payload.maxHp;
          if (payload.hp <= 0) self.stateCode[entity] = self.states.DEAD;
        }
        return;

      case "UNIT_DAMAGE_APPLIED":
        for (const entity of self.indices) {
          if (action.payload.touched[entity] !== 1) continue;

          self.hp[entity] = Math.max(0, self.hp[entity] - action.payload.damage[entity]);
          if (self.hp[entity] <= 0) self.stateCode[entity] = self.states.DEAD;
        }
        return;
    }
  },
  effects: {
    DEAD: ({ entities, self, transition }) => {
      const identity = entities().get("unitIdentity");
      const despawnIds: string[] = [];
      let heroDied = false;

      for (const entity of self.indices) {
        const entityId = self.entityId(entity);

        transition.entity(entityId, { type: "UNIT_DIED", payload: { entityId } });

        if (identity.kind[entity] === UNIT_KIND.HERO) {
          heroDied = true;
          continue;
        }

        despawnIds.push(entityId);
      }

      if (despawnIds.length > 0) transition.despawn(despawnIds);
      if (heroDied) transition.unscoped({ type: "HERO_DEAD" });
    },
  },
});
