import { f32, i16, i32, optional, string as stringColumn, u8 } from "@lite-fsm/entities";

import { createMachine } from "../create-machine";

const ENEMY_ESCAPED_X = 320;
const FLAG_DESPAWNED = 1;

export const enemyActor = createMachine({
  storage: "entity",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ALIVE",
    },
    ALIVE: {
      TICK: "ALIVE",
      DAMAGE_ENTITY: "STUNNED",
      BOOST_ENEMIES: "ALIVE",
      RESET_WORLD: "DEAD",
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    STUNNED: {
      TICK: "STUNNED",
      RECOVER_ENTITY: "ALIVE",
      DAMAGE_ENTITY: "STUNNED",
      BOOST_ENEMIES: "STUNNED",
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
  reducer: (_state, action, { payloadFor, self }) => {
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
});
