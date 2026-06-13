import {
  createMachine as createLiteFsmMachine,
  MachineManager,
  type MachinesState,
  type TypedCreateMachineFn,
} from "@lite-fsm/core";
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  f32,
  i32,
  optional,
  spawnEvent,
  string as entityString,
} from "@lite-fsm/entities";
import type { EntityAccess, EntitiesPlugin, SpawnEventsFrom } from "@lite-fsm/entities";

export type UnitSpawn = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly spriteId: string;
  readonly label: string | null;
};

export type ProjectileSpawn = UnitSpawn & {
  readonly ticksLeft: number;
  readonly damage: number;
};

type AppEvent = { readonly type: "TICK" };

export type SpritePosition = {
  readonly x: number;
  readonly y: number;
};

export type SpriteAdapter = {
  readonly sync: (spriteId: string, position: SpritePosition) => void;
  readonly remove: (spriteId: string) => void;
};

const createBaseMachine: TypedCreateMachineFn<AppEvent, {}, EntitiesPlugin<{}>> = createLiteFsmMachine;

export const movementActor = createBaseMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    x: f32({ default: 0 }),
    y: f32({ default: 0 }),
    dx: f32({ default: 0 }),
    dy: f32({ default: 0 }),
    label: entityString({ default: "unit" }),
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
    dx: f32(),
    dy: f32(),
    label: optional(entityString()),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "active" },
    active: { TICK: "active", ENTITY_DESPAWNED: "removed" },
    removed: {},
  },
  reducer(_state, action, { self, payloadFor }) {
    for (const entity of self.indices) {
      if (action.type === "ENTITY_SPAWNED") {
        const payload = payloadFor(entity);
        self.x[entity] = payload.x;
        self.y[entity] = payload.y;
        self.dx[entity] = payload.dx;
        self.dy[entity] = payload.dy;
        self.label[entity] = payload.label ?? "unit";
        continue;
      }

      if (action.type === "TICK") {
        self.x[entity] += self.dx[entity];
        self.y[entity] += self.dy[entity];
      }
    }
  },
});

export const projectileActor = createBaseMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    ticksLeft: i32({ default: 0 }),
    damage: i32({ default: 0 }),
  },
  spawnSchema: {
    ticksLeft: i32(),
    damage: i32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "active" },
    active: { TICK: "active", ENTITY_DESPAWNED: "removed" },
    expired: {},
    removed: {},
  },
  despawnOn: "expired",
  reducer(_state, action, { self, payloadFor }) {
    for (const entity of self.indices) {
      if (action.type === "ENTITY_SPAWNED") {
        const payload = payloadFor(entity);
        self.ticksLeft[entity] = payload.ticksLeft;
        self.damage[entity] = payload.damage;
        continue;
      }

      if (action.type === "TICK") {
        self.ticksLeft[entity] -= 1;
        if (self.ticksLeft[entity] <= 0) self.stateCode[entity] = self.states.expired;
      }
    }
  },
});

export type AppMachines = {
  readonly movementActor: typeof movementActor;
  readonly projectileActor: typeof projectileActor;
};
export type AppState = MachinesState<AppMachines>;
export type AppDeps = {
  readonly getState?: () => AppState;
  readonly entities?: EntityAccess<AppMachines>;
  readonly sprites: SpriteAdapter;
};

export const createMachine: TypedCreateMachineFn<AppEvent, AppDeps, EntitiesPlugin<AppDeps>> = createLiteFsmMachine;

export const spriteSyncActor = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    spriteId: entityString({ default: "" }),
  },
  spawnSchema: {
    spriteId: entityString(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "visible" },
    visible: { TICK: "visible", ENTITY_DESPAWNED: "removed" },
    removed: {},
  },
  reducer(_state, action, { self, payloadFor }) {
    if (action.type !== "ENTITY_SPAWNED") return;

    for (const entity of self.indices) {
      self.spriteId[entity] = payloadFor(entity).spriteId;
    }
  },
  reactions: {
    TICK: ({ self, entities, sprites }) => {
      const movement = entities.get("movementActor");

      for (const entity of self.indices) {
        sprites.sync(self.spriteId[entity], {
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

export const machines = {
  movementActor,
  spriteSyncActor,
  projectileActor,
};

export const spawnEvents = defineSpawnEvents({
  SPAWN_UNIT: spawnEvent<UnitSpawn>(),
  SPAWN_PROJECTILE: spawnEvent<ProjectileSpawn>(),
});

export type EntitySpawnEvents = SpawnEventsFrom<typeof spawnEvents>;

export const spawn = defineEntitySpawn(machines, spawnEvents)({
  SPAWN_UNIT: (payload) => ({
    id: `unit/${payload.id}`,
    groupTag: "unit",
    actors: {
      movementActor: {
        x: payload.x,
        y: payload.y,
        dx: payload.dx,
        dy: payload.dy,
        label: payload.label,
      },
      spriteSyncActor: {
        spriteId: payload.spriteId,
      },
    },
  }),
  SPAWN_PROJECTILE: (payload) => ({
    id: `projectile/${payload.id}`,
    groupTag: "projectile",
    actors: {
      movementActor: {
        x: payload.x,
        y: payload.y,
        dx: payload.dx,
        dy: payload.dy,
        label: payload.label,
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

export const createMemorySpriteAdapter = () => {
  const positions = new Map<string, SpritePosition>();
  const removed: string[] = [];

  return {
    sprites: {
      sync: (spriteId: string, position: SpritePosition) => {
        positions.set(spriteId, position);
      },
      remove: (spriteId: string) => {
        removed.push(spriteId);
        positions.delete(spriteId);
      },
    } satisfies SpriteAdapter,
    positions,
    removed,
  };
};

export const createEntitiesExampleManager = (sprites: SpriteAdapter) => {
  const manager = MachineManager(machines, {
    plugins: [entitiesPlugin({ spawn })] as const,
  });

  manager.setDependencies({
    getState: manager.getState,
    sprites,
  });

  return manager;
};

export const runEntitiesCompositionExample = () => {
  const spriteMemory = createMemorySpriteAdapter();
  const manager = createEntitiesExampleManager(spriteMemory.sprites);

  manager.transition({
    type: "SPAWN_UNIT",
    payload: {
      id: "alpha",
      x: 10,
      y: 20,
      dx: 1,
      dy: 2,
      spriteId: "sprite/unit-alpha",
      label: null,
    },
  });
  manager.transition({
    type: "SPAWN_PROJECTILE",
    payload: {
      id: "p1",
      x: 100,
      y: 200,
      dx: 4,
      dy: 0,
      spriteId: "sprite/projectile-p1",
      label: "projectile",
      ticksLeft: 1,
      damage: 25,
    },
  });
  manager.transition({ type: "TICK" });

  const rootEntities = manager.entities;
  const state = manager.getState();

  return {
    hasRootEntityAccessor: rootEntities === manager.entities,
    movementCount: state.movementActor.count,
    unitPosition: spriteMemory.positions.get("sprite/unit-alpha"),
    projectileVisible: spriteMemory.positions.has("sprite/projectile-p1"),
    removedSprites: [...spriteMemory.removed],
  };
};
