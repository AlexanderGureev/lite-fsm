import { f32, i32, resource, type EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import type { AppEvents } from "../../types";
import { UNIT_FACTION } from "../../unit-model";
import { isUnitAlive } from "../unit-health";

const TARGET_BUFFER_SIZE = 64;

const distanceSquared = (leftX: number, leftY: number, rightX: number, rightY: number) => {
  const dx = rightX - leftX;
  const dy = rightY - leftY;
  return dx * dx + dy * dy;
};

export type Events = AppEvents;

export const unitCombat = createMachine({
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
    attackRange: f32({ default: 0 }),
    attackDamage: i32({ default: 0 }),
    attackCooldownMs: i32({ default: 0 }),
    attackTimerMs: i32({ default: 0 }),
    incomingDamage: i32({ default: 0 }),
    targetBuffer: resource(() => new Int32Array(TARGET_BUFFER_SIZE)),
  },
  spawnSchema: {
    attackRange: f32(),
    attackDamage: i32(),
    attackCooldownMs: i32(),
    attackTimerMs: i32(),
  },
  reducer: (_state, action, { entities, payloadFor, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const payload = payloadFor(entity);

          self.attackRange[entity] = payload.attackRange;
          self.attackDamage[entity] = payload.attackDamage;
          self.attackCooldownMs[entity] = payload.attackCooldownMs;
          self.attackTimerMs[entity] = payload.attackTimerMs;
          self.incomingDamage[entity] = 0;
        }
        return;

      case "TICK": {
        const deltaMs = Math.max(0, action.payload.deltaMs);
        const access = entities();
        const identity = access.get("unitIdentity");
        const movement = access.get("unitMovement");
        const health = access.get("unitHealth");
        const spatial = access.get("rtsSpatialIndex").index;
        const hero = spatial.heroEntity();

        const inRange = (attacker: EntityIndex, target: EntityIndex) => {
          const range = self.attackRange[attacker] + identity.radius[target];
          const distance = distanceSquared(movement.x[attacker], movement.y[attacker], movement.x[target], movement.y[target]);
          return distance <= range * range;
        };

        const nearestEnemy = (attacker: EntityIndex): EntityIndex | null => {
          const count = spatial.collectEnemyNeighborsAt(movement.x[attacker], movement.y[attacker], self.targetBuffer);
          let nearest: EntityIndex | null = null;
          let nearestDistance = Number.POSITIVE_INFINITY;

          for (let index = 0; index < count; index += 1) {
            const candidate = self.targetBuffer[index] as EntityIndex;
            if (!isUnitAlive(health, candidate) || identity.faction[candidate] !== UNIT_FACTION.ENEMY) continue;
            if (!inRange(attacker, candidate)) continue;

            const distance = distanceSquared(movement.x[attacker], movement.y[attacker], movement.x[candidate], movement.y[candidate]);
            if (distance >= nearestDistance) continue;

            nearest = candidate;
            nearestDistance = distance;
          }

          return nearest;
        };

        const heroTarget = (attacker: EntityIndex): EntityIndex | null =>
          hero !== null && isUnitAlive(health, hero) && inRange(attacker, hero) ? hero : null;

        for (const entity of self.indices) self.incomingDamage[entity] = 0;

        for (const entity of self.indices) {
          if (!isUnitAlive(health, entity)) continue;

          self.attackTimerMs[entity] = Math.max(0, self.attackTimerMs[entity] - deltaMs);
          if (self.attackTimerMs[entity] > 0) continue;

          const target = identity.faction[entity] === UNIT_FACTION.PLAYER ? nearestEnemy(entity) : heroTarget(entity);
          if (target === null) continue;

          self.incomingDamage[target] += self.attackDamage[entity];
          self.attackTimerMs[entity] = self.attackCooldownMs[entity];
        }
        return;
      }

      case "UNIT_DIED":
        for (const entity of self.indices) {
          self.attackTimerMs[entity] = 0;
          self.incomingDamage[entity] = 0;
        }
        return;
    }
  },
});
