import { f32, i32, u8 } from "@lite-fsm/entities";
import type { EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../create-machine";
import { createFormationTargets } from "../sim/formation";
import {
  buildRtsSpatialGrids,
  beginRtsTickScratch,
  collectRtsNeighborsAt,
  ensureRtsFlowField,
  getRtsNeighborBuffer,
  readRtsFlowDirectionAt,
  resetRtsSimulationRuntime,
  SEPARATION_SAMPLE_LIMIT,
} from "../sim/runtime";
import { RTS_MAP } from "../sim/spawn-placement";
import { UNIT_COMMAND, UNIT_FACTION, UNIT_KIND } from "../unit-model";

const SELECTED = 1;
const UNSELECTED = 0;
const FORMATION_SPACING = 28;
const TARGET_ARRIVAL_DISTANCE = 6;
const SEPARATION_FORCE = 1.4;

const clampToMap = (value: number, max: number) => Math.min(max, Math.max(0, value));

const distanceSquared = (leftX: number, leftY: number, rightX: number, rightY: number) => {
  const dx = rightX - leftX;
  const dy = rightY - leftY;
  return dx * dx + dy * dy;
};

const normalizedRect = (rect: { x: number; y: number; width: number; height: number }) => {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  return {
    minX: Math.min(rect.x, right),
    maxX: Math.max(rect.x, right),
    minY: Math.min(rect.y, bottom),
    maxY: Math.max(rect.y, bottom),
  };
};

export const unitActor = createMachine({
  storage: "entity",
  despawnOn: "REMOVED",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ALIVE",
    },
    ALIVE: {
      TICK: null,
      SELECT_RECT: null,
      SELECT_ENTITY: null,
      CLEAR_SELECTION: null,
      ISSUE_MOVE: null,
      ISSUE_ATTACK_MOVE: null,
      GAME_RESTART: "REMOVED",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    DEAD: {
      GAME_RESTART: "REMOVED",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    REMOVED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    x: f32({ default: 0 }),
    y: f32({ default: 0 }),
    vx: f32({ default: 0 }),
    vy: f32({ default: 0 }),
    kind: u8({ default: 0 }),
    faction: u8({ default: 0 }),
    radius: f32({ default: 0 }),
    speed: f32({ default: 0 }),
    hp: i32({ default: 0 }),
    maxHp: i32({ default: 0 }),
    attackRange: f32({ default: 0 }),
    attackDamage: i32({ default: 0 }),
    attackCooldownMs: i32({ default: 0 }),
    attackTimerMs: i32({ default: 0 }),
    selected: u8({ default: 0 }),
    command: u8({ default: 0 }),
    targetX: f32({ default: 0 }),
    targetY: f32({ default: 0 }),
    formationOffsetX: f32({ default: 0 }),
    formationOffsetY: f32({ default: 0 }),
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
    vx: f32(),
    vy: f32(),
    kind: u8(),
    faction: u8(),
    radius: f32(),
    speed: f32(),
    hp: i32(),
    maxHp: i32(),
    attackRange: f32(),
    attackDamage: i32(),
    attackCooldownMs: i32(),
    attackTimerMs: i32(),
    selected: u8(),
    command: u8(),
    targetX: f32(),
    targetY: f32(),
    formationOffsetX: f32(),
    formationOffsetY: f32(),
  },
  reducer: (_state, action, { payloadFor, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        resetRtsSimulationRuntime();

        for (const entity of self.indices) {
          const payload = payloadFor(entity);

          self.x[entity] = payload.x;
          self.y[entity] = payload.y;
          self.vx[entity] = payload.vx;
          self.vy[entity] = payload.vy;
          self.kind[entity] = payload.kind;
          self.faction[entity] = payload.faction;
          self.radius[entity] = payload.radius;
          self.speed[entity] = payload.speed;
          self.hp[entity] = payload.hp;
          self.maxHp[entity] = payload.maxHp;
          self.attackRange[entity] = payload.attackRange;
          self.attackDamage[entity] = payload.attackDamage;
          self.attackCooldownMs[entity] = payload.attackCooldownMs;
          self.attackTimerMs[entity] = payload.attackTimerMs;
          self.selected[entity] = payload.selected;
          self.command[entity] = payload.command;
          self.targetX[entity] = payload.targetX;
          self.targetY[entity] = payload.targetY;
          self.formationOffsetX[entity] = payload.formationOffsetX;
          self.formationOffsetY[entity] = payload.formationOffsetY;
        }
        return;

      case "GAME_RESTART":
        resetRtsSimulationRuntime();
        return;

      case "SELECT_RECT": {
        const rect = normalizedRect(action.payload);

        for (const entity of self.indices) {
          if (self.faction[entity] !== UNIT_FACTION.PLAYER) continue;

          const isInside =
            self.x[entity] >= rect.minX &&
            self.x[entity] <= rect.maxX &&
            self.y[entity] >= rect.minY &&
            self.y[entity] <= rect.maxY;

          self.selected[entity] = isInside ? SELECTED : UNSELECTED;
        }

        return;
      }

      case "SELECT_ENTITY": {
        let selectedEntityId = "";

        for (const entity of self.indices) {
          if (self.faction[entity] !== UNIT_FACTION.PLAYER) continue;
          if (self.entityId(entity) !== action.payload.entityId) continue;

          selectedEntityId = action.payload.entityId;
          break;
        }

        for (const entity of self.indices) {
          if (self.faction[entity] !== UNIT_FACTION.PLAYER) continue;
          self.selected[entity] = selectedEntityId !== "" && self.entityId(entity) === selectedEntityId ? SELECTED : UNSELECTED;
        }

        return;
      }

      case "CLEAR_SELECTION":
        for (const entity of self.indices) {
          if (self.faction[entity] === UNIT_FACTION.PLAYER) self.selected[entity] = UNSELECTED;
        }
        return;

      case "ISSUE_MOVE":
      case "ISSUE_ATTACK_MOVE": {
        let selectedCount = 0;

        for (const entity of self.indices) {
          if (self.faction[entity] === UNIT_FACTION.PLAYER && self.selected[entity] === SELECTED) selectedCount += 1;
        }

        if (selectedCount === 0) return;

        const targets = createFormationTargets(action.payload, selectedCount, { spacing: FORMATION_SPACING });
        const command = action.type === "ISSUE_MOVE" ? UNIT_COMMAND.MOVE : UNIT_COMMAND.ATTACK_MOVE;
        let targetIndex = 0;

        for (const entity of self.indices) {
          if (self.faction[entity] !== UNIT_FACTION.PLAYER || self.selected[entity] !== SELECTED) continue;

          const targetX = clampToMap(targets.x[targetIndex], RTS_MAP.width);
          const targetY = clampToMap(targets.y[targetIndex], RTS_MAP.height);

          self.command[entity] = command;
          self.targetX[entity] = targetX;
          self.targetY[entity] = targetY;
          self.formationOffsetX[entity] = targetX - action.payload.x;
          self.formationOffsetY[entity] = targetY - action.payload.y;
          targetIndex += 1;
        }

        return;
      }

      case "TICK": {
        const deltaMs = Math.max(0, action.payload.deltaMs);
        const deltaSeconds = deltaMs / 1_000;
        const { aliveEntities, enemyEntities } = beginRtsTickScratch();
        let heroEntity: EntityIndex | null = null;

        for (const entity of self.indices) {
          if (self.attackTimerMs[entity] > 0) self.attackTimerMs[entity] = Math.max(0, self.attackTimerMs[entity] - deltaMs);

          if (self.hp[entity] <= 0) {
            self.vx[entity] = 0;
            self.vy[entity] = 0;
            self.selected[entity] = UNSELECTED;
            self.stateCode[entity] = self.states.DEAD;
            continue;
          }

          aliveEntities.push(entity);

          if (self.kind[entity] === UNIT_KIND.HERO) heroEntity = entity;
          if (self.faction[entity] === UNIT_FACTION.ENEMY) enemyEntities.push(entity);
        }

        if (heroEntity === null || self.hp[heroEntity] <= 0) return;

        const flowField = ensureRtsFlowField({ x: self.x[heroEntity], y: self.y[heroEntity] });
        const { unitGrid, enemyGrid } = buildRtsSpatialGrids(
          { x: self.x, y: self.y },
          aliveEntities,
          enemyEntities,
          self.x.length,
        );
        const neighborBuffer = getRtsNeighborBuffer();
        const separation = { x: 0, y: 0 };

        const applyDamage = (target: EntityIndex, amount: number) => {
          if (self.hp[target] <= 0) return;

          self.hp[target] = Math.max(0, self.hp[target] - amount);

          if (self.hp[target] > 0) return;

          self.vx[target] = 0;
          self.vy[target] = 0;
          self.selected[target] = UNSELECTED;
          self.stateCode[target] = self.states.DEAD;
        };

        const writeSeparationFor = (entity: EntityIndex) => {
          const neighborCount = collectRtsNeighborsAt(unitGrid, self.x[entity], self.y[entity]);
          separation.x = 0;
          separation.y = 0;
          let samples = 0;

          for (let index = 0; index < neighborCount && samples < SEPARATION_SAMPLE_LIMIT; index += 1) {
            const neighbor = neighborBuffer[index] as EntityIndex;
            if (neighbor === entity || !self.has(neighbor) || self.hp[neighbor] <= 0) continue;

            const awayX = self.x[entity] - self.x[neighbor];
            const awayY = self.y[entity] - self.y[neighbor];
            const minDistance = self.radius[entity] + self.radius[neighbor] + 4;
            const currentDistanceSquared = awayX * awayX + awayY * awayY;

            if (currentDistanceSquared <= 0 || currentDistanceSquared >= minDistance * minDistance) continue;

            const currentDistance = Math.sqrt(currentDistanceSquared);
            const strength = (minDistance - currentDistance) / minDistance;
            separation.x += (awayX / currentDistance) * strength;
            separation.y += (awayY / currentDistance) * strength;
            samples += 1;
          }
        };

        const moveWithDesiredDirection = (entity: EntityIndex, desiredX: number, desiredY: number) => {
          const length = Math.hypot(desiredX, desiredY);

          if (length <= 0.0001 || deltaSeconds === 0) {
            self.vx[entity] = 0;
            self.vy[entity] = 0;
            return;
          }

          const speed = self.speed[entity];
          self.vx[entity] = (desiredX / length) * speed;
          self.vy[entity] = (desiredY / length) * speed;
          self.x[entity] = clampToMap(self.x[entity] + self.vx[entity] * deltaSeconds, RTS_MAP.width);
          self.y[entity] = clampToMap(self.y[entity] + self.vy[entity] * deltaSeconds, RTS_MAP.height);
        };

        const nearestEnemyInRange = (entity: EntityIndex) => {
          const neighborCount = collectRtsNeighborsAt(enemyGrid, self.x[entity], self.y[entity]);
          let nearest: EntityIndex | null = null;
          let nearestDistance = Number.POSITIVE_INFINITY;

          for (let index = 0; index < neighborCount; index += 1) {
            const candidate = neighborBuffer[index] as EntityIndex;
            if (!self.has(candidate) || self.faction[candidate] !== UNIT_FACTION.ENEMY || self.hp[candidate] <= 0) continue;
            if (self.stateCode[candidate] !== self.states.ALIVE) continue;

            const range = self.attackRange[entity] + self.radius[candidate];
            const candidateDistance = distanceSquared(self.x[entity], self.y[entity], self.x[candidate], self.y[candidate]);
            if (candidateDistance > range * range || candidateDistance >= nearestDistance) continue;

            nearest = candidate;
            nearestDistance = candidateDistance;
          }

          return nearest;
        };

        for (const entity of aliveEntities) {
          if (self.faction[entity] !== UNIT_FACTION.PLAYER || self.stateCode[entity] !== self.states.ALIVE) continue;

          const target = nearestEnemyInRange(entity);
          if (target !== null && self.attackTimerMs[entity] <= 0) {
            applyDamage(target, self.attackDamage[entity]);
            self.attackTimerMs[entity] = self.attackCooldownMs[entity];
          }

          writeSeparationFor(entity);
          let desiredX = separation.x * SEPARATION_FORCE;
          let desiredY = separation.y * SEPARATION_FORCE;

          if (self.command[entity] === UNIT_COMMAND.MOVE || self.command[entity] === UNIT_COMMAND.ATTACK_MOVE) {
            const targetDx = self.targetX[entity] - self.x[entity];
            const targetDy = self.targetY[entity] - self.y[entity];
            const targetDistance = Math.hypot(targetDx, targetDy);

            if (targetDistance <= TARGET_ARRIVAL_DISTANCE) {
              self.command[entity] = UNIT_COMMAND.IDLE;
            } else {
              desiredX += targetDx / targetDistance;
              desiredY += targetDy / targetDistance;
            }
          }

          moveWithDesiredDirection(entity, desiredX, desiredY);
        }

        for (const entity of enemyEntities) {
          if (self.hp[entity] <= 0 || self.stateCode[entity] !== self.states.ALIVE || self.hp[heroEntity] <= 0) continue;

          const heroRange = self.attackRange[entity] + self.radius[heroEntity];
          const heroDistance = distanceSquared(self.x[entity], self.y[entity], self.x[heroEntity], self.y[heroEntity]);
          writeSeparationFor(entity);
          let desiredX = separation.x * SEPARATION_FORCE;
          let desiredY = separation.y * SEPARATION_FORCE;

          if (heroDistance <= heroRange * heroRange) {
            if (self.attackTimerMs[entity] <= 0) {
              applyDamage(heroEntity, self.attackDamage[entity]);
              self.attackTimerMs[entity] = self.attackCooldownMs[entity];
            }
          } else {
            const direction = readRtsFlowDirectionAt(flowField, self.x[entity], self.y[entity]);
            desiredX += direction.x;
            desiredY += direction.y;
          }

          moveWithDesiredDirection(entity, desiredX, desiredY);
        }

        return;
      }
    }
  },
  effects: {
    DEAD: ({ self, transition }) => {
      const despawnIds: string[] = [];
      let heroDied = false;

      for (const entity of self.indices) {
        if (self.kind[entity] === UNIT_KIND.HERO) {
          heroDied = true;
          continue;
        }

        despawnIds.push(self.entityId(entity));
      }

      if (despawnIds.length > 0) transition.despawn(despawnIds);
      if (heroDied) transition.unscoped({ type: "HERO_DEAD" });
    },
  },
});
