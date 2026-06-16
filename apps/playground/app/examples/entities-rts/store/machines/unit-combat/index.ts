import { f32, i32, resource, type EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import type { AppEvents } from "../../types";
import { UNIT_FACTION } from "../../unit-model";
import type { RtsSpatialIndexView } from "../rts-spatial-index";

const TARGET_BUFFER_SIZE = 64;

type NumericColumn = {
  readonly [entity: EntityIndex]: number;
};

type UnitIdentityView = {
  has(entity: EntityIndex): boolean;
  readonly faction: NumericColumn;
  readonly radius: NumericColumn;
};

type UnitMovementView = {
  has(entity: EntityIndex): boolean;
  readonly x: NumericColumn;
  readonly y: NumericColumn;
};

type UnitHealthView = {
  has(entity: EntityIndex): boolean;
  state(entity: EntityIndex): string | undefined;
  readonly hp: NumericColumn;
};

type UnitCombatSelfView = {
  readonly targetBuffer: Int32Array;
  readonly attackRange: NumericColumn;
  has(entity: EntityIndex): boolean;
};

const distanceSquared = (leftX: number, leftY: number, rightX: number, rightY: number) => {
  const dx = rightX - leftX;
  const dy = rightY - leftY;
  return dx * dx + dy * dy;
};

const nearestEnemyInRange = (
  entity: EntityIndex,
  self: UnitCombatSelfView,
  identity: UnitIdentityView,
  movement: UnitMovementView,
  health: UnitHealthView,
  spatial: RtsSpatialIndexView,
) => {
  const count = spatial.collectEnemyNeighborsAt(movement.x[entity], movement.y[entity], self.targetBuffer);
  let nearest: EntityIndex | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < count; index += 1) {
    const candidate = self.targetBuffer[index] as EntityIndex;
    if (!self.has(candidate) || !identity.has(candidate) || !movement.has(candidate) || !health.has(candidate)) continue;
    if (identity.faction[candidate] !== UNIT_FACTION.ENEMY) continue;
    if (health.state(candidate) !== "ALIVE" || health.hp[candidate] <= 0) continue;

    const range = self.attackRange[entity] + identity.radius[candidate];
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

        for (const entity of self.indices) self.incomingDamage[entity] = 0;

        for (const entity of self.indices) {
          if (!identity.has(entity) || !movement.has(entity) || !health.has(entity)) continue;
          if (health.state(entity) !== "ALIVE" || health.hp[entity] <= 0) continue;

          self.attackTimerMs[entity] = Math.max(0, self.attackTimerMs[entity] - deltaMs);

          if (identity.faction[entity] === UNIT_FACTION.PLAYER) {
            const target = nearestEnemyInRange(entity, self, identity, movement, health, spatial);
            if (target === null || self.attackTimerMs[entity] > 0) continue;

            self.incomingDamage[target] += self.attackDamage[entity];
            self.attackTimerMs[entity] = self.attackCooldownMs[entity];
            continue;
          }

          if (
            hero === null ||
            self.attackTimerMs[entity] > 0 ||
            !self.has(hero) ||
            !identity.has(hero) ||
            !movement.has(hero) ||
            !health.has(hero) ||
            health.state(hero) !== "ALIVE" ||
            health.hp[hero] <= 0
          ) {
            continue;
          }

          const range = self.attackRange[entity] + identity.radius[hero];
          const distance = distanceSquared(movement.x[entity], movement.y[entity], movement.x[hero], movement.y[hero]);

          if (distance > range * range) continue;

          self.incomingDamage[hero] += self.attackDamage[entity];
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
