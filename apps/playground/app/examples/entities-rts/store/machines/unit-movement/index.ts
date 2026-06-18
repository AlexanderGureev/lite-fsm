import { f32, resource, type EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import { RTS_MAP } from "../../spawn/placement";
import type { AppEvents } from "../../types";
import { UNIT_COMMAND, UNIT_FACTION, UNIT_KIND } from "../../unit-model";
import { ENEMY_INTENT } from "../enemy-ai";

const TARGET_ARRIVAL_DISTANCE = 6;
const SEPARATION_FORCE = 1.4;
const ENEMY_SEPARATION_FORCE = 1.8;
const UNIT_SEPARATION_GAP = 4;
const ENEMY_SEPARATION_GAP = 16;
const SEPARATION_SAMPLE_LIMIT = 12;
const SEPARATION_COLLECT_LIMIT = 12;
const NEIGHBOR_BUFFER_SIZE = SEPARATION_COLLECT_LIMIT;
const ENEMY_SEPARATION_HERO_RADIUS = 1_240;
const ENEMY_SEPARATION_HERO_RADIUS_SQUARED = ENEMY_SEPARATION_HERO_RADIUS * ENEMY_SEPARATION_HERO_RADIUS;

export type Events = AppEvents;

export const unitMovement = createMachine({
  storage: "entity",
  despawnOn: "REMOVED",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      TICK: null,
      UNIT_DEAD: "STOPPED",
    },
    STOPPED: {},
    REMOVED: {},
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
        const enemyAi = access.get("enemyAi");
        const spatial = access.get("rtsSpatialIndex").index;
        const commandValue = command.command;
        const commandTargetX = command.targetX;
        const commandTargetY = command.targetY;
        const enemyIntent = enemyAi.intent;
        const healthHp = health.hp;
        const identityFaction = identity.faction;
        const identityRadius = identity.radius;
        const movementSpeed = self.speed;
        const movementVx = self.vx;
        const movementVy = self.vy;
        const movementX = self.x;
        const movementY = self.y;
        const hero = spatial.heroEntity();
        const heroAlive = hero !== null && healthHp[hero] > 0;
        const heroX = heroAlive ? movementX[hero] : 0;
        const heroY = heroAlive ? movementY[hero] : 0;

        for (const entity of self.indices) {
          if (healthHp[entity] <= 0) {
            movementVx[entity] = 0;
            movementVy[entity] = 0;
            continue;
          }

          const entityX = movementX[entity];
          const entityY = movementY[entity];
          const faction = identityFaction[entity];
          const shouldResolveSeparation =
            faction === UNIT_FACTION.PLAYER ||
            (heroAlive &&
              (entityX - heroX) * (entityX - heroX) + (entityY - heroY) * (entityY - heroY) <=
                ENEMY_SEPARATION_HERO_RADIUS_SQUARED);
          const neighborCount = shouldResolveSeparation
            ? spatial.collectUnitNeighborsAt(entityX, entityY, self.neighborBuffer, SEPARATION_COLLECT_LIMIT)
            : 0;
          let separationX = 0;
          let separationY = 0;
          let samples = 0;

          for (let index = 0; index < neighborCount && samples < SEPARATION_SAMPLE_LIMIT; index += 1) {
            const neighbor = self.neighborBuffer[index] as EntityIndex;
            if (neighbor === entity || healthHp[neighbor] <= 0) continue;

            const awayX = entityX - movementX[neighbor];
            const awayY = entityY - movementY[neighbor];
            const separationGap = faction === UNIT_FACTION.ENEMY ? ENEMY_SEPARATION_GAP : UNIT_SEPARATION_GAP;
            const minDistance = identityRadius[entity] + identityRadius[neighbor] + separationGap;
            const currentDistanceSquared = awayX * awayX + awayY * awayY;

            if (currentDistanceSquared <= 0 || currentDistanceSquared >= minDistance * minDistance) continue;

            const currentDistance = Math.sqrt(currentDistanceSquared);
            const strength = (minDistance - currentDistance) / minDistance;
            separationX += (awayX / currentDistance) * strength;
            separationY += (awayY / currentDistance) * strength;
            samples += 1;
          }

          const separationForce = faction === UNIT_FACTION.ENEMY ? ENEMY_SEPARATION_FORCE : SEPARATION_FORCE;
          let desiredX = separationX * separationForce;
          let desiredY = separationY * separationForce;

          if (
            faction === UNIT_FACTION.PLAYER &&
            (commandValue[entity] === UNIT_COMMAND.MOVE || commandValue[entity] === UNIT_COMMAND.ATTACK_MOVE)
          ) {
            const targetDx = commandTargetX[entity] - entityX;
            const targetDy = commandTargetY[entity] - entityY;
            const targetDistance = Math.sqrt(targetDx * targetDx + targetDy * targetDy);

            if (targetDistance > TARGET_ARRIVAL_DISTANCE) {
              desiredX += targetDx / targetDistance;
              desiredY += targetDy / targetDistance;
            }
          }

          if (faction === UNIT_FACTION.ENEMY) {
            if (enemyIntent[entity] === ENEMY_INTENT.CHASE_HERO) {
              spatial.readFlowDirectionAt(entityX, entityY, self.flowDirection);
              desiredX += self.flowDirection.x;
              desiredY += self.flowDirection.y;
            }
          }

          const length = Math.sqrt(desiredX * desiredX + desiredY * desiredY);

          if (length <= 0.0001 || deltaSeconds === 0) {
            movementVx[entity] = 0;
            movementVy[entity] = 0;
            continue;
          }

          const vx = (desiredX / length) * movementSpeed[entity];
          const vy = (desiredY / length) * movementSpeed[entity];
          const nextX = entityX + vx * deltaSeconds;
          const nextY = entityY + vy * deltaSeconds;

          movementVx[entity] = vx;
          movementVy[entity] = vy;
          movementX[entity] = nextX < 0 ? 0 : nextX > RTS_MAP.width ? RTS_MAP.width : nextX;
          movementY[entity] = nextY < 0 ? 0 : nextY > RTS_MAP.height ? RTS_MAP.height : nextY;
        }
        return;
      }

      case "UNIT_DEAD": {
        const identity = entities().get("unitIdentity");

        for (const entity of self.indices) {
          self.vx[entity] = 0;
          self.vy[entity] = 0;
          if (identity.kind[entity] !== UNIT_KIND.HERO) self.stateCode[entity] = self.states.REMOVED;
        }
        return;
      }
    }
  },
});
