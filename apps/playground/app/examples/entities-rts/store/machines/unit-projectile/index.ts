import { resource, type EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import { RTS_MAP } from "../../spawn/placement";
import type { AppEvents } from "../../types";
import { UNIT_FACTION } from "../../unit-model";
import { slotCount } from "../column-slot-count";
import { isUnitAlive } from "../unit-health";

const INITIAL_PROJECTILE_CAPACITY = 1_024;
const INITIAL_IMPACT_EVENT_CAPACITY = 256;
const INITIAL_HIT_EVENT_CAPACITY = 1_024;
const MAX_IMPACT_EVENTS = 4_096;
const MAX_HIT_EVENTS = 16_384;
const PROJECTILE_RANGE_GRACE = 96;
const PROJECTILE_AOE_TARGET_LIMIT = 96;
const MIN_PROJECTILE_SPEED = 1;

type ProjectilePool = {
  count: number;
  version: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  speed: Float32Array;
  radius: Float32Array;
  impactRadius: Float32Array;
  remainingDistance: Float32Array;
  damage: Int32Array;
  targetEntity: Int32Array;
  incomingDamage: Int32Array;
  damageTargets: Int32Array;
  impactTargetBuffer: Int32Array;
  damageTargetCount: number;
  impactEventX: Float32Array;
  impactEventY: Float32Array;
  impactEventRadius: Float32Array;
  impactEventCount: number;
  hitEventX: Float32Array;
  hitEventY: Float32Array;
  hitEventCount: number;
};

export type UnitProjectilePoolView = {
  readCount(): number;
  readVersion(): number;
  readX(): Float32Array;
  readY(): Float32Array;
  readVx(): Float32Array;
  readVy(): Float32Array;
  readRadius(): Float32Array;
  readIncomingDamage(): Int32Array;
  // Косметические события попаданий накапливаются за кадр и сливаются рендером:
  // центр и радиус AOE-вспышки плюс позиции всех задетых врагов.
  readImpactEventCount(): number;
  readImpactEventX(): Float32Array;
  readImpactEventY(): Float32Array;
  readImpactEventRadius(): Float32Array;
  readHitEventCount(): number;
  readHitEventX(): Float32Array;
  readHitEventY(): Float32Array;
  clearEffectEvents(): void;
};

type ProjectileSpawn = {
  x: number;
  y: number;
  targetEntity: EntityIndex;
  damage: number;
  speed: number;
  radius: number;
  impactRadius: number;
  remainingDistance: number;
};

type UnitHealthLiveness = {
  has(entity: EntityIndex): boolean;
  readonly hp: { readonly [entity: number]: number };
};

type EnemySpatialQuery = {
  collectEnemyNeighborsAroundAt(x: number, y: number, radius: number, out: Int32Array, limit?: number): number;
};

export type Events = AppEvents;

const createF32 = (capacity: number) => new Float32Array(Math.max(0, capacity));
const createI32 = (capacity: number) => new Int32Array(Math.max(0, capacity));

const growF32 = (source: Float32Array, capacity: number) => {
  const next = createF32(capacity);
  next.set(source);
  return next;
};

const growI32 = (source: Int32Array, capacity: number) => {
  const next = createI32(capacity);
  next.set(source);
  return next;
};

const nextCapacity = (current: number, required: number) => {
  let capacity = Math.max(1, current);
  while (capacity < required) capacity *= 2;
  return capacity;
};

const createProjectilePool = (capacity = INITIAL_PROJECTILE_CAPACITY): ProjectilePool => ({
  count: 0,
  version: 0,
  x: createF32(capacity),
  y: createF32(capacity),
  vx: createF32(capacity),
  vy: createF32(capacity),
  speed: createF32(capacity),
  radius: createF32(capacity),
  impactRadius: createF32(capacity),
  remainingDistance: createF32(capacity),
  damage: createI32(capacity),
  targetEntity: createI32(capacity),
  incomingDamage: createI32(1),
  damageTargets: createI32(1),
  impactTargetBuffer: createI32(1),
  damageTargetCount: 0,
  impactEventX: createF32(INITIAL_IMPACT_EVENT_CAPACITY),
  impactEventY: createF32(INITIAL_IMPACT_EVENT_CAPACITY),
  impactEventRadius: createF32(INITIAL_IMPACT_EVENT_CAPACITY),
  impactEventCount: 0,
  hitEventX: createF32(INITIAL_HIT_EVENT_CAPACITY),
  hitEventY: createF32(INITIAL_HIT_EVENT_CAPACITY),
  hitEventCount: 0,
});

const exposeProjectilePool = (pool: ProjectilePool): UnitProjectilePoolView => ({
  readCount: () => pool.count,
  readVersion: () => pool.version,
  readX: () => pool.x,
  readY: () => pool.y,
  readVx: () => pool.vx,
  readVy: () => pool.vy,
  readRadius: () => pool.radius,
  readIncomingDamage: () => pool.incomingDamage,
  readImpactEventCount: () => pool.impactEventCount,
  readImpactEventX: () => pool.impactEventX,
  readImpactEventY: () => pool.impactEventY,
  readImpactEventRadius: () => pool.impactEventRadius,
  readHitEventCount: () => pool.hitEventCount,
  readHitEventX: () => pool.hitEventX,
  readHitEventY: () => pool.hitEventY,
  clearEffectEvents: () => {
    pool.impactEventCount = 0;
    pool.hitEventCount = 0;
  },
});

const clearProjectileDamage = (pool: ProjectilePool) => {
  for (let index = 0; index < pool.damageTargetCount; index += 1) {
    pool.incomingDamage[pool.damageTargets[index]] = 0;
  }

  pool.damageTargetCount = 0;
};

const ensureProjectileCapacity = (pool: ProjectilePool, required: number) => {
  if (required <= pool.x.length) return;

  const capacity = nextCapacity(pool.x.length, required);
  pool.x = growF32(pool.x, capacity);
  pool.y = growF32(pool.y, capacity);
  pool.vx = growF32(pool.vx, capacity);
  pool.vy = growF32(pool.vy, capacity);
  pool.speed = growF32(pool.speed, capacity);
  pool.radius = growF32(pool.radius, capacity);
  pool.impactRadius = growF32(pool.impactRadius, capacity);
  pool.remainingDistance = growF32(pool.remainingDistance, capacity);
  pool.damage = growI32(pool.damage, capacity);
  pool.targetEntity = growI32(pool.targetEntity, capacity);
};

const ensureDamageBufferCapacity = (pool: ProjectilePool, required: number) => {
  if (required <= pool.incomingDamage.length) return;

  const capacity = nextCapacity(pool.incomingDamage.length, required);
  pool.incomingDamage = growI32(pool.incomingDamage, capacity);
  pool.damageTargets = growI32(pool.damageTargets, capacity);
  pool.impactTargetBuffer = growI32(pool.impactTargetBuffer, capacity);
};

const resetProjectilePool = (pool: ProjectilePool) => {
  clearProjectileDamage(pool);
  pool.impactEventCount = 0;
  pool.hitEventCount = 0;
  pool.count = 0;
  pool.version += 1;
};

const recordImpactEvent = (pool: ProjectilePool, x: number, y: number, radius: number) => {
  if (pool.impactEventCount >= MAX_IMPACT_EVENTS) return;

  if (pool.impactEventCount >= pool.impactEventX.length) {
    const capacity = Math.min(MAX_IMPACT_EVENTS, nextCapacity(pool.impactEventX.length, pool.impactEventCount + 1));
    pool.impactEventX = growF32(pool.impactEventX, capacity);
    pool.impactEventY = growF32(pool.impactEventY, capacity);
    pool.impactEventRadius = growF32(pool.impactEventRadius, capacity);
  }

  const index = pool.impactEventCount;
  pool.impactEventX[index] = x;
  pool.impactEventY[index] = y;
  pool.impactEventRadius[index] = radius;
  pool.impactEventCount += 1;
};

const recordHitEvent = (pool: ProjectilePool, x: number, y: number) => {
  if (pool.hitEventCount >= MAX_HIT_EVENTS) return;

  if (pool.hitEventCount >= pool.hitEventX.length) {
    const capacity = Math.min(MAX_HIT_EVENTS, nextCapacity(pool.hitEventX.length, pool.hitEventCount + 1));
    pool.hitEventX = growF32(pool.hitEventX, capacity);
    pool.hitEventY = growF32(pool.hitEventY, capacity);
  }

  const index = pool.hitEventCount;
  pool.hitEventX[index] = x;
  pool.hitEventY[index] = y;
  pool.hitEventCount += 1;
};

const recordProjectileDamage = (pool: ProjectilePool, target: EntityIndex, damage: number) => {
  if (target < 0 || target >= pool.incomingDamage.length || damage <= 0) return;

  if (pool.incomingDamage[target] === 0) {
    pool.damageTargets[pool.damageTargetCount] = target;
    pool.damageTargetCount += 1;
  }

  pool.incomingDamage[target] += damage;
};

const recordProjectileImpactDamage = (
  pool: ProjectilePool,
  spatial: EnemySpatialQuery,
  health: UnitHealthLiveness,
  identityFaction: { readonly [entity: number]: number },
  targetRadius: { readonly [entity: number]: number },
  targetX: { readonly [entity: number]: number },
  targetY: { readonly [entity: number]: number },
  primaryTarget: EntityIndex,
  impactX: number,
  impactY: number,
  impactRadius: number,
  damage: number,
) => {
  if (damage <= 0) return;

  const radius = Math.max(0, impactRadius);
  recordProjectileDamage(pool, primaryTarget, damage);
  recordImpactEvent(pool, impactX, impactY, radius);
  recordHitEvent(pool, targetX[primaryTarget], targetY[primaryTarget]);
  if (radius <= 0) {
    return;
  }

  const count = spatial.collectEnemyNeighborsAroundAt(
    impactX,
    impactY,
    radius,
    pool.impactTargetBuffer,
    PROJECTILE_AOE_TARGET_LIMIT,
  );

  for (let index = 0; index < count; index += 1) {
    const target = pool.impactTargetBuffer[index] as EntityIndex;

    if (target === primaryTarget) continue;
    if (identityFaction[target] !== UNIT_FACTION.ENEMY || !isUnitAlive(health, target)) continue;

    const range = radius + targetRadius[target];
    const dx = targetX[target] - impactX;
    const dy = targetY[target] - impactY;
    if (dx * dx + dy * dy > range * range) continue;

    recordProjectileDamage(pool, target, damage);
    recordHitEvent(pool, targetX[target], targetY[target]);
  }
};

const removeProjectileAt = (pool: ProjectilePool, index: number) => {
  const last = pool.count - 1;

  if (index !== last) {
    pool.x[index] = pool.x[last];
    pool.y[index] = pool.y[last];
    pool.vx[index] = pool.vx[last];
    pool.vy[index] = pool.vy[last];
    pool.speed[index] = pool.speed[last];
    pool.radius[index] = pool.radius[last];
    pool.impactRadius[index] = pool.impactRadius[last];
    pool.remainingDistance[index] = pool.remainingDistance[last];
    pool.damage[index] = pool.damage[last];
    pool.targetEntity[index] = pool.targetEntity[last];
  }

  pool.count = last;
  pool.version += 1;
};

const appendProjectile = (pool: ProjectilePool, spawn: ProjectileSpawn) => {
  ensureProjectileCapacity(pool, pool.count + 1);

  const index = pool.count;
  pool.x[index] = spawn.x;
  pool.y[index] = spawn.y;
  pool.vx[index] = 0;
  pool.vy[index] = 0;
  pool.speed[index] = spawn.speed;
  pool.radius[index] = spawn.radius;
  pool.impactRadius[index] = spawn.impactRadius;
  pool.remainingDistance[index] = spawn.remainingDistance;
  pool.damage[index] = spawn.damage;
  pool.targetEntity[index] = spawn.targetEntity;
  pool.count += 1;
  pool.version += 1;
};

const updateProjectiles = (
  pool: ProjectilePool,
  deltaSeconds: number,
  spatial: EnemySpatialQuery,
  health: UnitHealthLiveness,
  identityFaction: { readonly [entity: number]: number },
  targetRadius: { readonly [entity: number]: number },
  targetX: { readonly [entity: number]: number },
  targetY: { readonly [entity: number]: number },
) => {
  let index = 0;

  while (index < pool.count) {
    const target = pool.targetEntity[index] as EntityIndex;

    if (!isUnitAlive(health, target)) {
      removeProjectileAt(pool, index);
      continue;
    }

    const x = pool.x[index];
    const y = pool.y[index];
    const dx = targetX[target] - x;
    const dy = targetY[target] - y;
    const distanceSquared = dx * dx + dy * dy;
    const hitRadius = pool.radius[index] + targetRadius[target];

    if (distanceSquared <= hitRadius * hitRadius) {
      recordProjectileImpactDamage(
        pool,
        spatial,
        health,
        identityFaction,
        targetRadius,
        targetX,
        targetY,
        target,
        targetX[target],
        targetY[target],
        pool.impactRadius[index],
        pool.damage[index],
      );
      removeProjectileAt(pool, index);
      continue;
    }

    const distance = Math.sqrt(distanceSquared);
    const travelDistance = pool.speed[index] * deltaSeconds;

    if (distance <= 0.0001 || travelDistance >= distance) {
      recordProjectileImpactDamage(
        pool,
        spatial,
        health,
        identityFaction,
        targetRadius,
        targetX,
        targetY,
        target,
        targetX[target],
        targetY[target],
        pool.impactRadius[index],
        pool.damage[index],
      );
      removeProjectileAt(pool, index);
      continue;
    }

    const directionX = dx / distance;
    const directionY = dy / distance;
    const nextX = x + directionX * travelDistance;
    const nextY = y + directionY * travelDistance;

    pool.x[index] = nextX;
    pool.y[index] = nextY;
    pool.vx[index] = directionX * pool.speed[index];
    pool.vy[index] = directionY * pool.speed[index];
    pool.remainingDistance[index] -= travelDistance;

    if (
      pool.remainingDistance[index] <= 0 ||
      nextX < 0 ||
      nextX > RTS_MAP.width ||
      nextY < 0 ||
      nextY > RTS_MAP.height
    ) {
      removeProjectileAt(pool, index);
      continue;
    }

    index += 1;
  }
};

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
    const spatial = access.get("rtsSpatialIndex").index;
    const capacity = slotCount(movement.x);

    clearProjectileDamage(self.projectiles);
    ensureDamageBufferCapacity(self.projectiles, slotCount(health.hp));

    updateProjectiles(
      self.projectiles,
      deltaSeconds,
      spatial,
      health,
      identity.faction,
      identity.radius,
      movement.x,
      movement.y,
    );

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
