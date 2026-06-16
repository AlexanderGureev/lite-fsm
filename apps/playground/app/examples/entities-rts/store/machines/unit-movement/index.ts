import { f32, resource, type EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import { RTS_MAP } from "../../spawn/placement";
import type { AppEvents } from "../../types";
import { UNIT_COMMAND, UNIT_FACTION } from "../../unit-model";
import { ENEMY_INTENT } from "../enemy-ai";

const TARGET_ARRIVAL_DISTANCE = 6;
const SEPARATION_FORCE = 1.4;
const SEPARATION_SAMPLE_LIMIT = 12;
const NEIGHBOR_BUFFER_SIZE = 64;

const clampToMap = (value: number, max: number) => Math.min(max, Math.max(0, value));

export type Events = AppEvents;

export const unitMovement = createMachine({
  storage: "entity",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      TICK: null,
      UNIT_DIED: "STOPPED",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    STOPPED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    x: f32({ default: 0 }),
    y: f32({ default: 0 }),
    vx: f32({ default: 0 }),
    vy: f32({ default: 0 }),
    speed: f32({ default: 0 }),
    neighborBuffer: resource(() => new Int32Array(NEIGHBOR_BUFFER_SIZE)),
    flowDirection: resource(() => ({ x: 0, y: 0 })),
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
    vx: f32(),
    vy: f32(),
    speed: f32(),
  },
  reducer: (_state, action, { entities, payloadFor, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const payload = payloadFor(entity);

          self.x[entity] = payload.x;
          self.y[entity] = payload.y;
          self.vx[entity] = payload.vx;
          self.vy[entity] = payload.vy;
          self.speed[entity] = payload.speed;
        }
        return;

      case "TICK": {
        const deltaSeconds = Math.max(0, action.payload.deltaMs) / 1_000;
        const access = entities();
        const identity = access.get("unitIdentity");
        const health = access.get("unitHealth");
        const command = access.get("unitCommand");
        const combat = access.get("unitCombat");
        const enemyAi = access.get("enemyAi");
        const spatial = access.get("rtsSpatialIndex").index;

        const stop = (entity: EntityIndex) => {
          self.vx[entity] = 0;
          self.vy[entity] = 0;
        };

        const readSeparation = (entity: EntityIndex) => {
          const neighborCount = spatial.collectUnitNeighborsAt(self.x[entity], self.y[entity], self.neighborBuffer);
          let x = 0;
          let y = 0;
          let samples = 0;

          for (let index = 0; index < neighborCount && samples < SEPARATION_SAMPLE_LIMIT; index += 1) {
            const neighbor = self.neighborBuffer[index] as EntityIndex;
            if (neighbor === entity || !self.has(neighbor) || !identity.has(neighbor) || !health.has(neighbor)) continue;
            if (health.state(neighbor) !== "ALIVE" || health.hp[neighbor] <= 0) continue;

            const awayX = self.x[entity] - self.x[neighbor];
            const awayY = self.y[entity] - self.y[neighbor];
            const minDistance = identity.radius[entity] + identity.radius[neighbor] + 4;
            const currentDistanceSquared = awayX * awayX + awayY * awayY;

            if (currentDistanceSquared <= 0 || currentDistanceSquared >= minDistance * minDistance) continue;

            const currentDistance = Math.sqrt(currentDistanceSquared);
            const strength = (minDistance - currentDistance) / minDistance;
            x += (awayX / currentDistance) * strength;
            y += (awayY / currentDistance) * strength;
            samples += 1;
          }

          return { x, y };
        };

        const moveBy = (entity: EntityIndex, desiredX: number, desiredY: number) => {
          const length = Math.hypot(desiredX, desiredY);

          if (length <= 0.0001 || deltaSeconds === 0) {
            stop(entity);
            return;
          }

          const vx = (desiredX / length) * self.speed[entity];
          const vy = (desiredY / length) * self.speed[entity];

          self.vx[entity] = vx;
          self.vy[entity] = vy;
          self.x[entity] = clampToMap(self.x[entity] + vx * deltaSeconds, RTS_MAP.width);
          self.y[entity] = clampToMap(self.y[entity] + vy * deltaSeconds, RTS_MAP.height);
        };

        for (const entity of self.indices) {
          if (
            !identity.has(entity) ||
            !health.has(entity) ||
            !combat.has(entity) ||
            health.state(entity) !== "ALIVE" ||
            health.hp[entity] <= 0
          ) {
            stop(entity);
            continue;
          }

          const separation = readSeparation(entity);
          let desiredX = separation.x * SEPARATION_FORCE;
          let desiredY = separation.y * SEPARATION_FORCE;

          if (
            identity.faction[entity] === UNIT_FACTION.PLAYER &&
            command.has(entity) &&
            (command.command[entity] === UNIT_COMMAND.MOVE || command.command[entity] === UNIT_COMMAND.ATTACK_MOVE)
          ) {
            const targetDx = command.targetX[entity] - self.x[entity];
            const targetDy = command.targetY[entity] - self.y[entity];
            const targetDistance = Math.hypot(targetDx, targetDy);

            if (targetDistance > TARGET_ARRIVAL_DISTANCE) {
              desiredX += targetDx / targetDistance;
              desiredY += targetDy / targetDistance;
            }
          }

          if (identity.faction[entity] === UNIT_FACTION.ENEMY && enemyAi.has(entity)) {
            if (enemyAi.intent[entity] === ENEMY_INTENT.CHASE_HERO) {
              spatial.readFlowDirectionAt(self.x[entity], self.y[entity], self.flowDirection);
              desiredX += self.flowDirection.x;
              desiredY += self.flowDirection.y;
            }
          }

          moveBy(entity, desiredX, desiredY);
        }
        return;
      }

      case "UNIT_DIED":
        for (const entity of self.indices) {
          self.vx[entity] = 0;
          self.vy[entity] = 0;
        }
        return;
    }
  },
});
