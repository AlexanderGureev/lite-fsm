import { i32, type EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import type { AppEvents } from "../../types";
import { UNIT_FACTION, UNIT_KIND } from "../../unit-model";

export type Events = AppEvents;

// unitHealth владеет жизненным циклом ALIVE/DEAD и колонкой `hp`. В горячем пути
// признак жизни читается из собственной колонки, чтобы reducers не выполняли
// строковую проверку состояния для каждого соседнего юнита.
type UnitHealthLiveness = {
  has(entity: EntityIndex): boolean;
  readonly hp: { readonly [entity: number]: number };
};

export const isUnitAlive = (health: UnitHealthLiveness, entity: EntityIndex) =>
  health.has(entity) && health.hp[entity] > 0;

export const unitHealth = createMachine({
  storage: "entity",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ALIVE",
    },
    ALIVE: {
      TICK: null,
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    DEAD: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    hp: i32({ default: 0 }),
    maxHp: i32({ default: 0 }),
  },
  spawnSchema: {
    hp: i32(),
    maxHp: i32(),
  },
  reducer: (_state, action, { entities, payloadFor, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const payload = payloadFor(entity);

          self.hp[entity] = payload.hp;
          self.maxHp[entity] = payload.maxHp;
          if (payload.hp <= 0) self.stateCode[entity] = self.states.DEAD;
        }
        return;

      case "TICK": {
        const access = entities();
        const combat = access.get("unitCombat");
        const projectiles = access.get("unitProjectile").projectiles.readIncomingDamage();

        for (const entity of self.indices) {
          if (!combat.has(entity)) continue;

          const projectileDamage = entity < projectiles.length ? projectiles[entity] : 0;
          const damage = combat.incomingDamage[entity] + projectileDamage;
          if (damage <= 0) continue;

          self.hp[entity] = Math.max(0, self.hp[entity] - damage);
          if (self.hp[entity] <= 0) self.stateCode[entity] = self.states.DEAD;
        }
        return;
      }
    }
  },
  effects: {
    DEAD: ({ entities, self, transition }) => {
      const identity = entities().get("unitIdentity");
      const despawnIds: string[] = [];
      const killedEnemyIds: string[] = [];
      let heroDied = false;

      for (const entity of self.indices) {
        const entityId = self.entityId(entity);

        transition.entity(entityId, { type: "UNIT_DIED", payload: { entityId } });

        if (identity.kind[entity] === UNIT_KIND.HERO) {
          heroDied = true;
          continue;
        }

        if (identity.faction[entity] === UNIT_FACTION.ENEMY) killedEnemyIds.push(entityId);

        despawnIds.push(entityId);
      }

      if (heroDied) transition.unscoped({ type: "HERO_DEAD" });
      for (const entityId of killedEnemyIds) transition.unscoped({ type: "ENEMY_KILLED", payload: { entityId } });
      if (despawnIds.length > 0) transition.despawn(despawnIds);
    },
  },
});
