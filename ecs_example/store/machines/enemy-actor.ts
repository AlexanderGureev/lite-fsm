import type { EntityId, EntityIndex } from "@lite-fsm/entities";
import { f32, i16, i32, optional, string as stringColumn, u8 } from "@lite-fsm/entities";
import type { FSMEvent } from "@lite-fsm/core";

import { createMachine } from "../create-machine";
import type { TickPayload } from "./world-machine";

export type Events =
  | FSMEvent<"TICK", TickPayload>
  | FSMEvent<"DAMAGE_ENTITY", { amount: number; source: "player" | "hazard" }>
  | FSMEvent<"BOOST_ENEMIES", { dx: number; dy: number }>
  | FSMEvent<"RECOVER_ENTITY">
  | FSMEvent<"RESET_WORLD">;

const ENEMY_ESCAPED_X = 320;
const FLAG_DESPAWNED = 1;

const toEntityIds = (
  indices: readonly EntityIndex[],
  entityId: (entity: EntityIndex) => EntityId,
): readonly EntityId[] => indices.map((entity) => entityId(entity));

export const enemyActor = createMachine({
  storage: "entity",
  despawnOn: "DEAD",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ALIVE",
    },
    ALIVE: {
      TICK: null,
      DAMAGE_ENTITY: "STUNNED",
      BOOST_ENEMIES: null,
      RESET_WORLD: "DEAD",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    STUNNED: {
      TICK: null,
      RECOVER_ENTITY: "ALIVE",
      DAMAGE_ENTITY: null,
      BOOST_ENEMIES: null,
      RESET_WORLD: "DEAD",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    ESCAPED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    DEAD: {},
  },
  initialState: "__INIT",
  initialContext: {
    x: f32({ default: 0 }),
    y: f32({ default: 0 }),
    dx: f32({ default: 0 }),
    dy: f32({ default: 0 }),
    hp: i16({ default: 1 }),
    scoreValue: i32({ default: 0 }),
    flags: u8({ default: 0 }),
    spriteId: stringColumn({ default: "" }),
    faction: stringColumn({ default: "enemy" }),
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
    dx: f32(),
    dy: f32(),
    hp: i16(),
    scoreValue: i32(),
    spriteId: stringColumn(),
    faction: optional(stringColumn()),
  },
  reducer: (self, action, { payloadFor }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const payload = payloadFor(entity);
          self.x[entity] = payload.x;
          self.y[entity] = payload.y;
          self.dx[entity] = payload.dx;
          self.dy[entity] = payload.dy;
          self.hp[entity] = payload.hp;
          self.scoreValue[entity] = payload.scoreValue;
          self.flags[entity] = 0;
          self.spriteId[entity] = payload.spriteId;
          self.faction[entity] = payload.faction ?? "enemy";
        }
        return;

      case "TICK":
        for (const entity of self.indices) {
          self.x[entity] += self.dx[entity] * action.payload.deltaMs;
          self.y[entity] += self.dy[entity] * action.payload.deltaMs;
          if (self.x[entity] > ENEMY_ESCAPED_X) self.stateCode[entity] = self.states.ESCAPED;
        }
        return;

      case "DAMAGE_ENTITY":
        for (const entity of self.indices) {
          self.hp[entity] -= action.payload.amount;
          if (self.hp[entity] <= 0) self.stateCode[entity] = self.states.DEAD;
        }
        return;

      case "BOOST_ENEMIES":
        for (const entity of self.indices) {
          self.dx[entity] += action.payload.dx;
          self.dy[entity] += action.payload.dy;
        }
        return;

      case "ENTITY_DESPAWNED":
        for (const entity of self.indices) {
          self.flags[entity] |= FLAG_DESPAWNED;
        }
        return;
    }
  },
  effects: {
    ALIVE: ({ action, self, transition }) => {
      if (action.type !== "ENTITY_SPAWNED") return;

      const entityIds = toEntityIds(self.indices, self.entityId);
      const firstEntityId = entityIds[0];
      if (!firstEntityId) return;

      transition.actor("blinkActor/hud", {
        type: "FLASH_FROM_ENTITY",
        payload: { source: firstEntityId, intensity: 0.4 },
      });
    },

    STUNNED: ({ entities, self, transition }) => {
      const enemyStore = entities.get("enemyActor");
      const entityIds = toEntityIds(self.indices, self.entityId);
      const firstEntityId = entityIds[0];

      transition({
        type: "ENEMY_ALERTED",
        payload: { entityIds },
      });

      transition.entity(entityIds, { type: "RECOVER_ENTITY" });

      if (!firstEntityId) return;

      transition.tag("screen-flash", {
        type: "FLASH_FROM_ENTITY",
        payload: { source: firstEntityId, intensity: enemyStore.count > 1 ? 1 : 0.7 },
      });
    },

    ESCAPED: ({ self, transition }) => {
      transition.despawn(self.indices);
    },
  },
  reactions: {
    TICK: ({ entities, self, sprites }) => {
      const enemyStore = entities.maybe("enemyActor");

      for (const entity of self.indices) {
        if (!enemyStore.has(entity)) continue;

        sprites.syncEnemy(
          self.entityId(entity),
          enemyStore.spriteId[entity],
          {
            x: enemyStore.x[entity],
            y: enemyStore.y[entity],
          },
          enemyStore.hp[entity],
        );
      }
    },

    ENTITY_DESPAWNED: ({ self, sprites }) => {
      for (const entity of self.indices) {
        sprites.removeEnemy(self.entityId(entity), self.spriteId[entity]);
      }
    },
  },
});
