import { u8 } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import type { AppEvents } from "../../types";
import { UNIT_KIND } from "../../unit-model";
import { isUnitAlive } from "../unit-health";

export const ENEMY_INTENT = {
  IDLE: 0,
  CHASE_HERO: 1,
  HOLD_ATTACK_RANGE: 2,
} as const;

export type Events = AppEvents;

export const enemyAi = createMachine({
  storage: "entity",
  despawnOn: "REMOVED",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      TICK: null,
      UNIT_DEAD: "DISABLED",
    },
    DISABLED: {},
    REMOVED: {},
  },
  initialState: "__INIT",
  initialContext: {
    intent: u8({ default: ENEMY_INTENT.IDLE }),
  },
  spawnSchema: {},
  reducer: (_state, action, { entities, self }) => {
    if (action.type === "ENTITY_SPAWNED") {
      for (const entity of self.indices) self.intent[entity] = ENEMY_INTENT.IDLE;
      return;
    }

    if (action.type === "UNIT_DEAD") {
      const identity = entities().get("unitIdentity");

      for (const entity of self.indices) {
        self.intent[entity] = ENEMY_INTENT.IDLE;
        if (identity.kind[entity] !== UNIT_KIND.HERO) self.stateCode[entity] = self.states.REMOVED;
      }
      return;
    }

    if (action.type !== "TICK") return;

    const access = entities();
    const identity = access.get("unitIdentity");
    const movement = access.get("unitMovement");
    const health = access.get("unitHealth");
    const combat = access.get("unitCombat");
    const spatial = access.get("rtsSpatialIndex").index;
    const hero = spatial.heroEntity();
    const combatAttackRange = combat.attackRange;
    const healthHp = health.hp;
    const identityRadius = identity.radius;
    const movementX = movement.x;
    const movementY = movement.y;
    const heroAlive = hero !== null && isUnitAlive(health, hero);
    const heroX = heroAlive ? movementX[hero] : 0;
    const heroY = heroAlive ? movementY[hero] : 0;
    const heroRadius = heroAlive ? identityRadius[hero] : 0;

    for (const entity of self.indices) {
      self.intent[entity] = ENEMY_INTENT.IDLE;

      if (!heroAlive || healthHp[entity] <= 0) continue;

      const range = combatAttackRange[entity] + heroRadius;
      const dx = heroX - movementX[entity];
      const dy = heroY - movementY[entity];
      const distance = dx * dx + dy * dy;

      self.intent[entity] = distance <= range * range ? ENEMY_INTENT.HOLD_ATTACK_RANGE : ENEMY_INTENT.CHASE_HERO;
    }
  },
});
