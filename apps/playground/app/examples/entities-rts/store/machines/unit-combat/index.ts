import { f32, i32, resource, type EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import type { AppEvents } from "../../types";
import { UNIT_FACTION } from "../../unit-model";
import { isUnitAlive } from "../unit-health";

const TARGET_BUFFER_SIZE = 64;

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
    projectileSpeed: f32({ default: 0 }),
    projectileRadius: f32({ default: 0 }),
    projectileImpactRadius: f32({ default: 0 }),
    projectileTargetEntity: i32({ default: -1 }),
    projectileDamage: i32({ default: 0 }),
    targetBuffer: resource(() => new Int32Array(TARGET_BUFFER_SIZE)),
  },
  spawnSchema: {
    attackRange: f32(),
    attackDamage: i32(),
    attackCooldownMs: i32(),
    attackTimerMs: i32(),
    projectileSpeed: f32(),
    projectileRadius: f32(),
    projectileImpactRadius: f32(),
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
          self.projectileSpeed[entity] = payload.projectileSpeed;
          self.projectileRadius[entity] = payload.projectileRadius;
          self.projectileImpactRadius[entity] = payload.projectileImpactRadius;
          self.projectileTargetEntity[entity] = -1;
          self.projectileDamage[entity] = 0;
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
        const attackCooldownMs = self.attackCooldownMs;
        const attackDamage = self.attackDamage;
        const attackRange = self.attackRange;
        const attackTimerMs = self.attackTimerMs;
        const incomingDamage = self.incomingDamage;
        const projectileDamage = self.projectileDamage;
        const projectileTargetEntity = self.projectileTargetEntity;
        const healthHp = health.hp;
        const identityFaction = identity.faction;
        const identityRadius = identity.radius;
        const movementX = movement.x;
        const movementY = movement.y;
        const heroAlive = hero !== null && isUnitAlive(health, hero);
        const heroX = heroAlive ? movementX[hero] : 0;
        const heroY = heroAlive ? movementY[hero] : 0;
        const heroRadius = heroAlive ? identityRadius[hero] : 0;

        for (const entity of self.indices) {
          incomingDamage[entity] = 0;
          projectileTargetEntity[entity] = -1;
          projectileDamage[entity] = 0;
        }

        for (const entity of self.indices) {
          if (healthHp[entity] <= 0) continue;

          attackTimerMs[entity] = Math.max(0, attackTimerMs[entity] - deltaMs);
          if (attackTimerMs[entity] > 0) continue;

          let target: EntityIndex | null = null;
          const attackerX = movementX[entity];
          const attackerY = movementY[entity];
          const rangeBase = attackRange[entity];

          if (identityFaction[entity] === UNIT_FACTION.PLAYER) {
            const count = spatial.collectEnemyNeighborsAroundAt(attackerX, attackerY, rangeBase, self.targetBuffer);
            let nearestDistance = Number.POSITIVE_INFINITY;

            for (let index = 0; index < count; index += 1) {
              const candidate = self.targetBuffer[index] as EntityIndex;
              const range = rangeBase + identityRadius[candidate];
              const dx = movementX[candidate] - attackerX;
              const dy = movementY[candidate] - attackerY;
              const distance = dx * dx + dy * dy;

              if (distance > range * range || distance >= nearestDistance) continue;

              target = candidate;
              nearestDistance = distance;
            }
          } else if (heroAlive) {
            const range = rangeBase + heroRadius;
            const dx = heroX - attackerX;
            const dy = heroY - attackerY;
            if (dx * dx + dy * dy <= range * range) target = hero;
          }

          if (target === null) continue;

          if (identityFaction[entity] === UNIT_FACTION.PLAYER) {
            projectileTargetEntity[entity] = target;
            projectileDamage[entity] = attackDamage[entity];
          } else {
            incomingDamage[target] += attackDamage[entity];
          }
          attackTimerMs[entity] = attackCooldownMs[entity];
        }
        return;
      }

      case "UNIT_DIED":
        for (const entity of self.indices) {
          self.attackTimerMs[entity] = 0;
          self.incomingDamage[entity] = 0;
          self.projectileTargetEntity[entity] = -1;
          self.projectileDamage[entity] = 0;
        }
        return;
    }
  },
});
