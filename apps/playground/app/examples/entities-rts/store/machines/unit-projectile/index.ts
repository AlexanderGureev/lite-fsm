import { resource, type EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import { RTS_MAP } from "../../spawn/placement";
import type { AppEvents } from "../../types";
import { UNIT_FACTION } from "../../unit-model";
import { slotCount } from "../column-slot-count";
import { isUnitAlive } from "../unit-health";

const INITIAL_PROJECTILE_CAPACITY = 1_024;
const PROJECTILE_RANGE_GRACE = 96;
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
  remainingDistance: Float32Array;
  damage: Int32Array;
  targetEntity: Int32Array;
  incomingDamage: Int32Array;
  damageTargets: Int32Array;
  damageTargetCount: number;
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
};

type ProjectileSpawn = {
  x: number;
  y: number;
  targetEntity: EntityIndex;
  damage: number;
  speed: number;
  radius: number;
  remainingDistance: number;
};

type UnitHealthLiveness = {
  has(entity: EntityIndex): boolean;
  readonly hp: { readonly [entity: number]: number };
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
  remainingDistance: createF32(capacity),
  damage: createI32(capacity),
  targetEntity: createI32(capacity),
  incomingDamage: createI32(1),
  damageTargets: createI32(1),
  damageTargetCount: 0,
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
  pool.remainingDistance = growF32(pool.remainingDistance, capacity);
  pool.damage = growI32(pool.damage, capacity);
  pool.targetEntity = growI32(pool.targetEntity, capacity);
};

const ensureDamageCapacity = (pool: ProjectilePool, required: number) => {
  if (required <= pool.incomingDamage.length) return;

  const capacity = nextCapacity(pool.incomingDamage.length, required);
  pool.incomingDamage = growI32(pool.incomingDamage, capacity);
  pool.damageTargets = growI32(pool.damageTargets, capacity);
};

const resetProjectilePool = (pool: ProjectilePool) => {
  clearProjectileDamage(pool);
  pool.count = 0;
  pool.version += 1;
};

const recordProjectileDamage = (pool: ProjectilePool, target: EntityIndex, damage: number) => {
  if (target < 0 || target >= pool.incomingDamage.length || damage <= 0) return;

  if (pool.incomingDamage[target] === 0) {
    pool.damageTargets[pool.damageTargetCount] = target;
    pool.damageTargetCount += 1;
  }

  pool.incomingDamage[target] += damage;
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
  pool.remainingDistance[index] = spawn.remainingDistance;
  pool.damage[index] = spawn.damage;
  pool.targetEntity[index] = spawn.targetEntity;
  pool.count += 1;
  pool.version += 1;
};

const updateProjectiles = (
  pool: ProjectilePool,
  deltaSeconds: number,
  health: UnitHealthLiveness,
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
      recordProjectileDamage(pool, target, pool.damage[index]);
      removeProjectileAt(pool, index);
      continue;
    }

    const distance = Math.sqrt(distanceSquared);
    const travelDistance = pool.speed[index] * deltaSeconds;

    if (distance <= 0.0001 || travelDistance >= distance) {
      recordProjectileDamage(pool, target, pool.damage[index]);
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
    const capacity = slotCount(movement.x);

    clearProjectileDamage(self.projectiles);
    ensureDamageCapacity(self.projectiles, slotCount(health.hp));

    updateProjectiles(self.projectiles, deltaSeconds, health, identity.radius, movement.x, movement.y);

    const combatProjectileDamage = combat.projectileDamage;
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
        remainingDistance: combatAttackRange[entity] + identityRadius[target] + PROJECTILE_RANGE_GRACE,
      });
    }
  },
});
