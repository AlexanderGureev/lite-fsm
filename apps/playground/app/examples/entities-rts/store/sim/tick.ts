import type { EntityIndex } from "@lite-fsm/entities";

import type { AppDeps } from "../deps";
import type { AppEvents } from "../types";
import { UNIT_COMMAND, UNIT_FACTION, UNIT_KIND } from "../unit-model";
import {
  buildRtsSpatialGrids,
  beginRtsTickScratch,
  collectRtsNeighborsAt,
  ensureRtsFlowField,
  getRtsNeighborBuffer,
  readRtsFlowDirectionAt,
  readRtsTickScratch,
  resetRtsSimulationRuntime,
  SEPARATION_SAMPLE_LIMIT,
} from "./runtime";
import { RTS_MAP } from "./spawn-placement";

const TARGET_ARRIVAL_DISTANCE = 6;
const SEPARATION_FORCE = 1.4;

type TickAction = {
  readonly type: "TICK";
  readonly payload: {
    readonly now: number;
    readonly deltaMs: number;
  };
};
type Transition = (event: AppEvents) => void;
type AppEntityAccess = ReturnType<AppDeps["entities"]>;

const asEntityIndex = (index: number) => index as EntityIndex;

const columnLength = (column: ArrayLike<number>) => column.length;

const clampToMap = (value: number, max: number) => Math.min(max, Math.max(0, value));

const distanceSquared = (leftX: number, leftY: number, rightX: number, rightY: number) => {
  const dx = rightX - leftX;
  const dy = rightY - leftY;
  return dx * dx + dy * dy;
};

export const isRtsTickAction = (action: {
  readonly type: string;
  readonly payload?: unknown;
}): action is TickAction => {
  if (action.type !== "TICK" || action.payload === null || typeof action.payload !== "object") return false;

  const payload = action.payload as { readonly deltaMs?: unknown; readonly now?: unknown };
  return typeof payload.deltaMs === "number" && typeof payload.now === "number";
};

export const runRtsSimulationTick = (action: TickAction, access: AppEntityAccess) => {
  const deltaMs = Math.max(0, action.payload.deltaMs);
  const deltaSeconds = deltaMs / 1_000;
  const identity = access.get("unitIdentity");
  const movement = access.get("unitMovement");
  const health = access.get("unitHealth");
  const combat = access.get("unitCombat");
  const command = access.get("unitCommand");
  const capacity = columnLength(movement.x as unknown as ArrayLike<number>);
  const { aliveEntities, batch, enemyEntities, tick } = beginRtsTickScratch(capacity);
  const neighborBuffer = getRtsNeighborBuffer();
  let separationX = 0;
  let separationY = 0;
  let heroEntity: EntityIndex | null = null;

  const entityIsAlive = (entity: EntityIndex) =>
    identity.has(entity) &&
    movement.has(entity) &&
    health.has(entity) &&
    combat.has(entity) &&
    health.state(entity) === "ALIVE" &&
    health.hp[entity] > 0;

  for (let index = 0; index < capacity; index += 1) {
    const entity = asEntityIndex(index);
    if (!entityIsAlive(entity)) continue;

    aliveEntities.push(entity);
    batch.projectedHp[entity] = health.hp[entity];
    batch.combat.touched[entity] = 1;
    batch.combat.attackTimerMs[entity] = Math.max(0, combat.attackTimerMs[entity] - deltaMs);
    tick.hasCombatUpdate = true;

    if (identity.kind[entity] === UNIT_KIND.HERO) heroEntity = entity;
    if (identity.faction[entity] === UNIT_FACTION.ENEMY) enemyEntities.push(entity);
  }

  tick.hasMovementUpdate = aliveEntities.length > 0;

  if (heroEntity === null || batch.projectedHp[heroEntity] <= 0) return;

  const flowField = ensureRtsFlowField({ x: movement.x[heroEntity], y: movement.y[heroEntity] });
  const { unitGrid, enemyGrid } = buildRtsSpatialGrids(
    { x: movement.x as unknown as ArrayLike<number>, y: movement.y as unknown as ArrayLike<number> },
    aliveEntities,
    enemyEntities,
    capacity,
  );

  const applyDamage = (target: EntityIndex, amount: number) => {
    if (!health.has(target) || batch.projectedHp[target] <= 0) return;

    batch.health.touched[target] = 1;
    batch.health.damage[target] += amount;
    batch.projectedHp[target] = Math.max(0, batch.projectedHp[target] - amount);
    tick.hasDamageUpdate = true;
  };

  const writeSeparationFor = (entity: EntityIndex) => {
    const neighborCount = collectRtsNeighborsAt(unitGrid, movement.x[entity], movement.y[entity]);
    separationX = 0;
    separationY = 0;
    let samples = 0;

    for (let index = 0; index < neighborCount && samples < SEPARATION_SAMPLE_LIMIT; index += 1) {
      const neighbor = neighborBuffer[index] as EntityIndex;
      if (neighbor === entity || !movement.has(neighbor) || batch.projectedHp[neighbor] <= 0) continue;

      const awayX = movement.x[entity] - movement.x[neighbor];
      const awayY = movement.y[entity] - movement.y[neighbor];
      const minDistance = identity.radius[entity] + identity.radius[neighbor] + 4;
      const currentDistanceSquared = awayX * awayX + awayY * awayY;

      if (currentDistanceSquared <= 0 || currentDistanceSquared >= minDistance * minDistance) continue;

      const currentDistance = Math.sqrt(currentDistanceSquared);
      const strength = (minDistance - currentDistance) / minDistance;
      separationX += (awayX / currentDistance) * strength;
      separationY += (awayY / currentDistance) * strength;
      samples += 1;
    }
  };

  const writeMovementFor = (entity: EntityIndex, desiredX: number, desiredY: number) => {
    const length = Math.hypot(desiredX, desiredY);

    batch.movement.touched[entity] = 1;

    if (length <= 0.0001 || deltaSeconds === 0) {
      batch.movement.x[entity] = movement.x[entity];
      batch.movement.y[entity] = movement.y[entity];
      batch.movement.vx[entity] = 0;
      batch.movement.vy[entity] = 0;
      return;
    }

    const speed = movement.speed[entity];
    const vx = (desiredX / length) * speed;
    const vy = (desiredY / length) * speed;

    batch.movement.vx[entity] = vx;
    batch.movement.vy[entity] = vy;
    batch.movement.x[entity] = clampToMap(movement.x[entity] + vx * deltaSeconds, RTS_MAP.width);
    batch.movement.y[entity] = clampToMap(movement.y[entity] + vy * deltaSeconds, RTS_MAP.height);
  };

  const nearestEnemyInRange = (entity: EntityIndex) => {
    const neighborCount = collectRtsNeighborsAt(enemyGrid, movement.x[entity], movement.y[entity]);
    let nearest: EntityIndex | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < neighborCount; index += 1) {
      const candidate = neighborBuffer[index] as EntityIndex;
      if (!entityIsAlive(candidate) || identity.faction[candidate] !== UNIT_FACTION.ENEMY) continue;
      if (batch.projectedHp[candidate] <= 0) continue;

      const range = combat.attackRange[entity] + identity.radius[candidate];
      const candidateDistance = distanceSquared(
        movement.x[entity],
        movement.y[entity],
        movement.x[candidate],
        movement.y[candidate],
      );
      if (candidateDistance > range * range || candidateDistance >= nearestDistance) continue;

      nearest = candidate;
      nearestDistance = candidateDistance;
    }

    return nearest;
  };

  for (const entity of aliveEntities) {
    if (identity.faction[entity] !== UNIT_FACTION.PLAYER || batch.projectedHp[entity] <= 0) continue;

    const target = nearestEnemyInRange(entity);
    if (target !== null && batch.combat.attackTimerMs[entity] <= 0) {
      applyDamage(target, combat.attackDamage[entity]);
      batch.combat.attackTimerMs[entity] = combat.attackCooldownMs[entity];
    }

    writeSeparationFor(entity);
    let desiredX = separationX * SEPARATION_FORCE;
    let desiredY = separationY * SEPARATION_FORCE;

    if (
      command.has(entity) &&
      (command.command[entity] === UNIT_COMMAND.MOVE || command.command[entity] === UNIT_COMMAND.ATTACK_MOVE)
    ) {
      const targetDx = command.targetX[entity] - movement.x[entity];
      const targetDy = command.targetY[entity] - movement.y[entity];
      const targetDistance = Math.hypot(targetDx, targetDy);

      if (targetDistance <= TARGET_ARRIVAL_DISTANCE) {
        batch.command.touched[entity] = 1;
        batch.command.command[entity] = UNIT_COMMAND.IDLE;
        tick.hasCommandUpdate = true;
      } else {
        desiredX += targetDx / targetDistance;
        desiredY += targetDy / targetDistance;
      }
    }

    writeMovementFor(entity, desiredX, desiredY);
  }

  for (const entity of enemyEntities) {
    if (batch.projectedHp[entity] <= 0 || batch.projectedHp[heroEntity] <= 0) continue;

    const heroRange = combat.attackRange[entity] + identity.radius[heroEntity];
    const heroDistance = distanceSquared(
      movement.x[entity],
      movement.y[entity],
      movement.x[heroEntity],
      movement.y[heroEntity],
    );

    writeSeparationFor(entity);
    let desiredX = separationX * SEPARATION_FORCE;
    let desiredY = separationY * SEPARATION_FORCE;

    if (heroDistance <= heroRange * heroRange) {
      if (batch.combat.attackTimerMs[entity] <= 0) {
        applyDamage(heroEntity, combat.attackDamage[entity]);
        batch.combat.attackTimerMs[entity] = combat.attackCooldownMs[entity];
      }
    } else {
      const direction = readRtsFlowDirectionAt(flowField, movement.x[entity], movement.y[entity]);
      desiredX += direction.x;
      desiredY += direction.y;
    }

    writeMovementFor(entity, desiredX, desiredY);
  }
};

export const flushRtsSimulationTick = (transition: Transition) => {
  const { batch, tick } = readRtsTickScratch();

  if (tick.hasCommandUpdate) transition({ type: "UNIT_COMMANDS_UPDATED", payload: batch.command });
  if (tick.hasCombatUpdate) transition({ type: "UNIT_COMBAT_TIMERS_UPDATED", payload: batch.combat });
  if (tick.hasMovementUpdate) transition({ type: "UNIT_MOVEMENT_UPDATED", payload: batch.movement });
  if (tick.hasDamageUpdate) transition({ type: "UNIT_DAMAGE_APPLIED", payload: batch.health });
};

export { resetRtsSimulationRuntime };
