// @ts-nocheck

import {
  MachineManager,
  createMachine,
  defineSpawnConfig,
  defineSpawnRecipes,
  spawn,
  type MachinesState,
} from "@lite-fsm/core";
import type { ColumnarEntities } from "@lite-fsm/core/columnar";
import { columnar, f32, i16, string } from "@lite-fsm/core/columnar";

/*
 * lite-fsm composition example with the final proposed columnar API.
 *
 * Public gameplay code dispatches regular app events and spawn events:
 * - SPAWN_UNIT
 * - SPAWN_PROJECTILE
 * - TICK
 *
 * Composition lives in spawnRecipes. Actor templates do not know entity types.
 * They are attached to an entity by the runtime and start through ENTITY_SPAWNED.
 *
 * Units:
 * - movementActor + spriteSyncActor
 *
 * Projectiles:
 * - movementActor + spriteSyncActor + projectileActor
 *
 * spriteSyncActor uses sync reactions for external sprite runtime integration.
 * Cross-actor columnar reads go through typed `entities.get("actorKey")`.
 * Data-only actors are intentionally avoided: dx/dy live in movementActor,
 * spriteId lives in spriteSyncActor, lifetime and damage live in projectileActor.
 *
 * projectileActor owns projectile lifetime. `despawnOn: "EXPIRED"` despawns the
 * whole entity in the same dispatch, so movementActor and spriteSyncActor receive
 * scoped ENTITY_DESPAWNED before their rows are removed.
 */

type UnitSpawn = {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  spriteId: string;
};

type ProjectileSpawn = UnitSpawn & {
  ticksLeft: number;
  damage: number;
};

const spawnConfig = defineSpawnConfig({
  SPAWN_UNIT: spawn<UnitSpawn>(),
  SPAWN_PROJECTILE: spawn<ProjectileSpawn>(),
});

type RegularEvents = { type: "TICK" } | { type: "RESET_ROOM" };

type AppEvents = RegularEvents;
// manager.transition(...) still accepts SpawnEventsFrom<typeof spawnConfig>.
// If a machine itself needs to react to spawn intent events, use:
// type AppEvents = RegularEvents | SpawnEventsFrom<typeof spawnConfig>;

// ENTITY_SPAWNED / ENTITY_DESPAWNED are system events provided by
// columnar runtime; game code does not add them to AppEvents.

// AppState is derived from `machines` below. In a real app this usually lives
// in the store entrypoint next to `MachineManager`.
type AppDeps = {
  getState: () => AppState;
  entities: ColumnarEntities<AppState>;
  sprites: SpriteService;
};

export const movementActor = createMachine<AppEvents, AppDeps>({
  storage: "columnar",
  groupTag: "entity",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      TICK: null,
      ENTITY_DESPAWNED: "__RESOLVED",
      RESET_ROOM: "__CANCELLED",
    },
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
    dx: f32(),
    dy: f32(),
  },
  contextSchema: {
    x: f32({ default: 0 }),
    y: f32({ default: 0 }),
    dx: f32({ default: 0 }),
    dy: f32({ default: 0 }),
  },
  reducer: (self, action, { payloadFor }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const spawn = payloadFor(entity);
          self.x[entity] = spawn.x;
          self.y[entity] = spawn.y;
          self.dx[entity] = spawn.dx;
          self.dy[entity] = spawn.dy;
        }
        return;

      case "TICK":
        for (const entity of self.indices) {
          self.x[entity] += self.dx[entity];
          self.y[entity] += self.dy[entity];
        }
        return;
    }
  },
});

export const spriteSyncActor = createMachine<AppEvents, AppDeps>({
  storage: "columnar",
  groupTag: "entity",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "READY",
    },
    READY: {
      TICK: null,
      ENTITY_DESPAWNED: "__RESOLVED",
      RESET_ROOM: "__CANCELLED",
    },
  },
  spawnSchema: {
    spriteId: string(),
  },
  contextSchema: {
    spriteId: string({ default: "" }),
  },
  reducer: (self, action, { payloadFor }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          self.spriteId[entity] = payloadFor(entity).spriteId;
        }
        return;

      // TICK and ENTITY_DESPAWNED use their config edge
      // without changing spriteId.
    }
  },
  reactions: {
    TICK: ({ self, entities, sprites }) => {
      const movement = entities.get("movementActor");

      for (const entity of self.indices) {
        sprites.setPosition(self.spriteId[entity], {
          x: movement.x[entity],
          y: movement.y[entity],
        });
      }
    },

    ENTITY_DESPAWNED: ({ self, sprites }) => {
      for (const entity of self.indices) {
        sprites.remove(self.spriteId[entity]);
      }
    },
  },
});

export const projectileActor = createMachine<AppEvents, AppDeps>({
  storage: "columnar",
  groupTag: "entity",
  despawnOn: "EXPIRED",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      TICK: null,
      ENTITY_DESPAWNED: "__RESOLVED",
      RESET_ROOM: "__CANCELLED",
    },
    EXPIRED: {},
  },
  spawnSchema: {
    ticksLeft: i16(),
    damage: i16(),
  },
  contextSchema: {
    ticksLeft: i16({ default: 0 }),
    damage: i16({ default: 0 }),
  },
  reducer: (self, action, { payloadFor }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const projectile = payloadFor(entity);
          self.ticksLeft[entity] = projectile.ticksLeft;
          self.damage[entity] = projectile.damage;
        }
        return;

      case "TICK":
        for (const entity of self.indices) {
          self.ticksLeft[entity] -= 1;
          if (self.ticksLeft[entity] <= 0) self.stateCode[entity] = self.states.EXPIRED;
        }
        return;

      // ENTITY_DESPAWNED uses its config edge from ACTIVE.
    }
  },
});

const machines = {
  movementActor,
  spriteSyncActor,
  projectileActor,
} as const;

type AppState = MachinesState<typeof machines>;

const spawnRecipes = defineSpawnRecipes<typeof machines, typeof spawnConfig>()({
  SPAWN_UNIT: (payload) => ({
    id: `unit/${payload.id}`,
    tags: ["unit"],
    actors: {
      movementActor: {
        x: payload.x,
        y: payload.y,
        dx: payload.dx,
        dy: payload.dy,
      },
      spriteSyncActor: {
        spriteId: payload.spriteId,
      },
    },
  }),

  SPAWN_PROJECTILE: (payload) => ({
    id: `projectile/${payload.id}`,
    tags: ["projectile"],
    actors: {
      movementActor: {
        x: payload.x,
        y: payload.y,
        dx: payload.dx,
        dy: payload.dy,
      },
      spriteSyncActor: {
        spriteId: payload.spriteId,
      },
      projectileActor: {
        ticksLeft: payload.ticksLeft,
        damage: payload.damage,
      },
    },
  }),
});

const manager = MachineManager(machines, {
  storageHandlers: { columnar },
  spawnConfig,
  spawnRecipes,
});

manager.setDependencies({
  getState: manager.getState,
  entities: manager.entities,
  sprites: new SpriteService(),
});

manager.transition({
  type: "SPAWN_UNIT",
  payload: {
    id: "unit-1",
    x: 10,
    y: 20,
    dx: 1,
    dy: 0,
    spriteId: "unit-sprite-1",
  },
});

manager.transition({
  type: "SPAWN_PROJECTILE",
  payload: {
    id: "arrow-1",
    x: 14,
    y: 20,
    dx: 3,
    dy: 0,
    spriteId: "arrow-sprite-1",
    ticksLeft: 40,
    damage: 10,
  },
});

manager.transition({ type: "TICK" });
