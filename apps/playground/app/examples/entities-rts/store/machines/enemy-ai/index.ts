import { u8 } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import type { AppEvents } from "../../types";
import { isUnitAlive } from "../unit-health";

export const ENEMY_INTENT = {
  IDLE: 0,
  CHASE_HERO: 1,
  HOLD_ATTACK_RANGE: 2,
} as const;

export type Events = AppEvents;

const distanceSquared = (leftX: number, leftY: number, rightX: number, rightY: number) => {
  const dx = rightX - leftX;
  const dy = rightY - leftY;
  return dx * dx + dy * dy;
};

export const enemyAi = createMachine({
  storage: "entity",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      TICK: null,
      UNIT_DIED: "DISABLED",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    DISABLED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    intent: u8({ default: ENEMY_INTENT.IDLE }),
  },
  spawnSchema: {},
  reducer: (_state, action, { entities, self }) => {
    if (action.type === "ENTITY_SPAWNED" || action.type === "UNIT_DIED") {
      for (const entity of self.indices) self.intent[entity] = ENEMY_INTENT.IDLE;
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

    for (const entity of self.indices) {
      self.intent[entity] = ENEMY_INTENT.IDLE;

      if (hero === null || !isUnitAlive(health, entity) || !isUnitAlive(health, hero)) continue;

      const range = combat.attackRange[entity] + identity.radius[hero];
      const distance = distanceSquared(movement.x[entity], movement.y[entity], movement.x[hero], movement.y[hero]);

      self.intent[entity] = distance <= range * range ? ENEMY_INTENT.HOLD_ATTACK_RANGE : ENEMY_INTENT.CHASE_HERO;
    }
  },
});
