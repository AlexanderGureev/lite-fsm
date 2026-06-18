import type { EntityIndex } from "@lite-fsm/entities";

import { RTS_MAP } from "../../spawn/placement";
import { UNIT_FACTION } from "../../unit-model";
import { isUnitAlive } from "../unit-health";

const INITIAL_PROJECTILE_CAPACITY = 1_024;
const INITIAL_IMPACT_EVENT_CAPACITY = 256;
const INITIAL_HIT_EVENT_CAPACITY = 1_024;
const MAX_IMPACT_EVENTS = 4_096;
const MAX_HIT_EVENTS = 16_384;
const PROJECTILE_AOE_TARGET_LIMIT = 96;

export type ProjectilePool = {
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
  impactEventCursor: number;
  hitEventX: Float32Array;
  hitEventY: Float32Array;
  hitEventCursor: number;
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
  readImpactEventCursor(): number;
  readImpactEventStart(cursor: number): number;
  readImpactEventSlot(cursor: number): number;
  readImpactEventX(): Float32Array;
  readImpactEventY(): Float32Array;
  readImpactEventRadius(): Float32Array;
  readHitEventCount(): number;
  readHitEventCursor(): number;
  readHitEventStart(cursor: number): number;
  readHitEventSlot(cursor: number): number;
  readHitEventX(): Float32Array;
  readHitEventY(): Float32Array;
};

export type ProjectileSpawn = {
  x: number;
  y: number;
  targetEntity: EntityIndex;
  damage: number;
  speed: number;
  radius: number;
  impactRadius: number;
  remainingDistance: number;
};

type ReadonlyNumberColumn = { readonly [entity: number]: number };

type UnitHealthLiveness = {
  has(entity: EntityIndex): boolean;
  readonly hp: ReadonlyNumberColumn;
};

type EnemySpatialQuery = {
  collectEnemyNeighborsAroundAt(x: number, y: number, radius: number, out: Int32Array, limit?: number): number;
};

// Read view сцены, который нужен пулу для разрешения попаданий: spatial query для AoE
// и committed columns живых юнитов. Пул читает мир, но мутирует только свои буферы.
export type ProjectileWorld = {
  spatial: EnemySpatialQuery;
  health: UnitHealthLiveness;
  faction: ReadonlyNumberColumn;
  radius: ReadonlyNumberColumn;
  x: ReadonlyNumberColumn;
  y: ReadonlyNumberColumn;
};

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

export const createProjectilePool = (capacity = INITIAL_PROJECTILE_CAPACITY): ProjectilePool => ({
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
  impactEventX: createF32(Math.max(INITIAL_IMPACT_EVENT_CAPACITY, MAX_IMPACT_EVENTS)),
  impactEventY: createF32(Math.max(INITIAL_IMPACT_EVENT_CAPACITY, MAX_IMPACT_EVENTS)),
  impactEventRadius: createF32(Math.max(INITIAL_IMPACT_EVENT_CAPACITY, MAX_IMPACT_EVENTS)),
  impactEventCursor: 0,
  hitEventX: createF32(Math.max(INITIAL_HIT_EVENT_CAPACITY, MAX_HIT_EVENTS)),
  hitEventY: createF32(Math.max(INITIAL_HIT_EVENT_CAPACITY, MAX_HIT_EVENTS)),
  hitEventCursor: 0,
});

const availableEventCount = (cursor: number, capacity: number) => Math.min(cursor, capacity);

const eventStart = (cursor: number, current: number, capacity: number) => {
  const oldest = Math.max(0, current - capacity);
  if (cursor < oldest || cursor > current) return oldest;
  return cursor;
};

export const exposeProjectilePool = (pool: ProjectilePool): UnitProjectilePoolView => ({
  readCount: () => pool.count,
  readVersion: () => pool.version,
  readX: () => pool.x,
  readY: () => pool.y,
  readVx: () => pool.vx,
  readVy: () => pool.vy,
  readRadius: () => pool.radius,
  readIncomingDamage: () => pool.incomingDamage,
  readImpactEventCount: () => availableEventCount(pool.impactEventCursor, pool.impactEventX.length),
  readImpactEventCursor: () => pool.impactEventCursor,
  readImpactEventStart: (cursor) => eventStart(cursor, pool.impactEventCursor, pool.impactEventX.length),
  readImpactEventSlot: (cursor) => cursor % pool.impactEventX.length,
  readImpactEventX: () => pool.impactEventX,
  readImpactEventY: () => pool.impactEventY,
  readImpactEventRadius: () => pool.impactEventRadius,
  readHitEventCount: () => availableEventCount(pool.hitEventCursor, pool.hitEventX.length),
  readHitEventCursor: () => pool.hitEventCursor,
  readHitEventStart: (cursor) => eventStart(cursor, pool.hitEventCursor, pool.hitEventX.length),
  readHitEventSlot: (cursor) => cursor % pool.hitEventX.length,
  readHitEventX: () => pool.hitEventX,
  readHitEventY: () => pool.hitEventY,
});

export const clearProjectileDamage = (pool: ProjectilePool) => {
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

export const ensureDamageBufferCapacity = (pool: ProjectilePool, required: number) => {
  if (required <= pool.incomingDamage.length) return;

  const capacity = nextCapacity(pool.incomingDamage.length, required);
  pool.incomingDamage = growI32(pool.incomingDamage, capacity);
  pool.damageTargets = growI32(pool.damageTargets, capacity);
  pool.impactTargetBuffer = growI32(pool.impactTargetBuffer, capacity);
};

export const resetProjectilePool = (pool: ProjectilePool) => {
  clearProjectileDamage(pool);
  pool.impactEventCursor = 0;
  pool.hitEventCursor = 0;
  pool.count = 0;
  pool.version += 1;
};

const recordImpactEvent = (pool: ProjectilePool, x: number, y: number, radius: number) => {
  const index = pool.impactEventCursor % pool.impactEventX.length;
  pool.impactEventX[index] = x;
  pool.impactEventY[index] = y;
  pool.impactEventRadius[index] = radius;
  pool.impactEventCursor += 1;
};

const recordHitEvent = (pool: ProjectilePool, x: number, y: number) => {
  const index = pool.hitEventCursor % pool.hitEventX.length;
  pool.hitEventX[index] = x;
  pool.hitEventY[index] = y;
  pool.hitEventCursor += 1;
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
  world: ProjectileWorld,
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
  recordHitEvent(pool, world.x[primaryTarget], world.y[primaryTarget]);
  if (radius <= 0) return;

  const count = world.spatial.collectEnemyNeighborsAroundAt(
    impactX,
    impactY,
    radius,
    pool.impactTargetBuffer,
    PROJECTILE_AOE_TARGET_LIMIT,
  );

  for (let index = 0; index < count; index += 1) {
    const target = pool.impactTargetBuffer[index] as EntityIndex;

    if (target === primaryTarget) continue;
    if (world.faction[target] !== UNIT_FACTION.ENEMY || !isUnitAlive(world.health, target)) continue;

    const range = radius + world.radius[target];
    const dx = world.x[target] - impactX;
    const dy = world.y[target] - impactY;
    if (dx * dx + dy * dy > range * range) continue;

    recordProjectileDamage(pool, target, damage);
    recordHitEvent(pool, world.x[target], world.y[target]);
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

export const appendProjectile = (pool: ProjectilePool, spawn: ProjectileSpawn) => {
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

// Снаряд достиг цели: пишет урон/эффекты по AoE и удаляет снаряд из пула.
const applyProjectileImpact = (pool: ProjectilePool, world: ProjectileWorld, index: number, target: EntityIndex) => {
  recordProjectileImpactDamage(
    pool,
    world,
    target,
    world.x[target],
    world.y[target],
    pool.impactRadius[index],
    pool.damage[index],
  );
  removeProjectileAt(pool, index);
};

export const updateProjectiles = (pool: ProjectilePool, deltaSeconds: number, world: ProjectileWorld) => {
  let index = 0;

  while (index < pool.count) {
    const target = pool.targetEntity[index] as EntityIndex;

    if (!isUnitAlive(world.health, target)) {
      removeProjectileAt(pool, index);
      continue;
    }

    const x = pool.x[index];
    const y = pool.y[index];
    const dx = world.x[target] - x;
    const dy = world.y[target] - y;
    const distanceSquared = dx * dx + dy * dy;
    const hitRadius = pool.radius[index] + world.radius[target];

    if (distanceSquared <= hitRadius * hitRadius) {
      applyProjectileImpact(pool, world, index, target);
      continue;
    }

    const distance = Math.sqrt(distanceSquared);
    const travelDistance = pool.speed[index] * deltaSeconds;

    if (distance <= 0.0001 || travelDistance >= distance) {
      applyProjectileImpact(pool, world, index, target);
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
