import { resource, type EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import type { AppEvents } from "../../types";
import { UNIT_FACTION } from "../../unit-model";
import { slotCount } from "../column-slot-count";
import { isUnitAlive } from "../unit-health";
import {
  appendProjectile,
  clearProjectileDamage,
  createProjectilePool,
  ensureDamageBufferCapacity,
  exposeProjectilePool,
  resetProjectilePool,
  updateProjectiles,
  type ProjectileWorld,
} from "./projectile-pool";

export type { UnitProjectilePoolView } from "./projectile-pool";

const PROJECTILE_RANGE_GRACE = 96;
const MIN_PROJECTILE_SPEED = 1;

export type Events = AppEvents;

export const unitProjectile = createMachine({
  storage: "entity",
  despawnOn: "REMOVED",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      TICK: null,
      GAME_RESTART: "REMOVED",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    REMOVED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    projectiles: resource(createProjectilePool, exposeProjectilePool),
  },
  spawnSchema: {},
  reducer: (_state, action, { entities, self }) => {
    if (action.type === "ENTITY_SPAWNED" || action.type === "GAME_RESTART") {
      resetProjectilePool(self.projectiles);
      return;
    }

    if (action.type !== "TICK") return;

    const deltaSeconds = Math.max(0, action.payload.deltaMs) / 1_000;
    const access = entities();
    const combat = access.get("unitCombat");
    const health = access.get("unitHealth");
    const identity = access.get("unitIdentity");
    const movement = access.get("unitMovement");
    const world: ProjectileWorld = {
      spatial: access.get("rtsSpatialIndex").index,
      health,
      faction: identity.faction,
      radius: identity.radius,
      x: movement.x,
      y: movement.y,
    };

    clearProjectileDamage(self.projectiles);
    ensureDamageBufferCapacity(self.projectiles, slotCount(health.hp));
    updateProjectiles(self.projectiles, deltaSeconds, world);

    // Игроки выпускают снаряды по intent из unitCombat: цель, урон и скорость на этот TICK.
    const capacity = slotCount(movement.x);
    const combatProjectileDamage = combat.projectileDamage;
    const combatProjectileImpactRadius = combat.projectileImpactRadius;
    const combatProjectileRadius = combat.projectileRadius;
    const combatProjectileSpeed = combat.projectileSpeed;
    const combatProjectileTargetEntity = combat.projectileTargetEntity;
    const combatAttackRange = combat.attackRange;
    const healthHp = health.hp;
    const identityFaction = identity.faction;
    const identityRadius = identity.radius;
    const movementX = movement.x;
    const movementY = movement.y;

    for (let index = 0; index < capacity; index += 1) {
      const entity = index as EntityIndex;
      const damage = combatProjectileDamage[entity];

      if (damage <= 0) continue;
      if (!combat.has(entity) || identityFaction[entity] !== UNIT_FACTION.PLAYER || healthHp[entity] <= 0) continue;

      const target = combatProjectileTargetEntity[entity] as EntityIndex;
      if (!isUnitAlive(health, target)) continue;

      const speed = combatProjectileSpeed[entity];
      if (speed < MIN_PROJECTILE_SPEED) continue;

      appendProjectile(self.projectiles, {
        x: movementX[entity],
        y: movementY[entity],
        targetEntity: target,
        damage,
        speed,
        radius: combatProjectileRadius[entity],
        impactRadius: combatProjectileImpactRadius[entity],
        remainingDistance: combatAttackRange[entity] + identityRadius[target] + PROJECTILE_RANGE_GRACE,
      });
    }
  },
});
