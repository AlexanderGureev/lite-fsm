import {
  i32,
  string as stringColumn,
  type EntityAccess,
  type EntityId,
  type EntityIndex,
  type EntitiesPlugin,
} from "@lite-fsm/entities";
import {
  createMachine as createLiteFsmMachine,
  type TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { MachineDeps } from "../deps";
import type { AppEvents } from "../types";
import type { enemyActor } from "./enemy-actor";

type EnemyReadMachines = {
  readonly enemyActor: typeof enemyActor;
};

type EnemySpriteDeps = MachineDeps & {
  readonly entities?: EntityAccess<EnemyReadMachines>;
};

const createEnemySpriteMachine: TypedCreateMachineFn<
  AppEvents,
  EnemySpriteDeps,
  EntitiesPlugin<EnemySpriteDeps>
> = createLiteFsmMachine;

const SPRITE_DESPAWN_TICKS = 1_000;

const toEntityIds = (
  indices: readonly EntityIndex[],
  entityId: (entity: EntityIndex) => EntityId,
): readonly EntityId[] => indices.map((entity) => entityId(entity));

export const enemySpriteActor = createEnemySpriteMachine({
  storage: "entity",
  despawnOn: "EXPIRED",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "VISIBLE",
    },
    VISIBLE: {
      TICK: null,
      DAMAGE_ENTITY: "ALERTING",
      RESET_WORLD: "EXPIRED",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    ALERTING: {
      TICK: null,
      DAMAGE_ENTITY: null,
      RECOVER_ENTITY: "VISIBLE",
      RESET_WORLD: "EXPIRED",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    ESCAPED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    EXPIRED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    spriteId: stringColumn({ default: "" }),
    ticks: i32({ default: 0 }),
  },
  spawnSchema: {
    spriteId: stringColumn(),
  },
  reducer: (_state, action, { payloadFor, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          self.spriteId[entity] = payloadFor(entity).spriteId;
          self.ticks[entity] = 0;
        }
        return;

      case "TICK":
        for (const entity of self.indices) {
          self.ticks[entity] += 1;
          if (self.ticks[entity] > SPRITE_DESPAWN_TICKS) self.stateCode[entity] = self.states.ESCAPED;
        }
        return;
    }
  },
  effects: {
    VISIBLE: ({ action, self, transition }) => {
      if (action.type !== "ENTITY_SPAWNED") return;

      const firstEntity = self.indices[0];
      if (firstEntity === undefined) return;

      const firstEntityId = self.entityId(firstEntity);

      transition.actor("blinkActor/hud", {
        type: "FLASH_FROM_ENTITY",
        payload: { source: firstEntityId, intensity: 0.4 },
      });
    },

    ALERTING: ({ self, transition }) => {
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
        payload: { source: firstEntityId, intensity: self.indices.length > 1 ? 1 : 0.7 },
      });
    },

    ESCAPED: ({ self, transition }) => {
      transition.despawn(self.indices);
    },
  },
  reactions: {
    TICK: ({ entities, self, sprites }) => {
      const enemies = entities.get("enemyActor");

      for (const entity of self.indices) {
        if (!enemies.has(entity)) continue;

        sprites.syncEnemy(
          self.entityId(entity),
          self.spriteId[entity],
          {
            x: enemies.x[entity],
            y: enemies.y[entity],
          },
          enemies.hp[entity],
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
