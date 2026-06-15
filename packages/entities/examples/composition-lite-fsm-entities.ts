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
import type { EntityAccess, EntitiesPlugin, EntityIndex, SpawnEventsFrom } from "@lite-fsm/entities";

export type UnitSpawn = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly spriteId: string;
  readonly label: string | null;
  readonly hp: number;
  readonly maxHp: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly threat: number;
};

export type ProjectileSpawn = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly spriteId: string;
  readonly label: string | null;
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

export type UnitFrameReport = {
  readonly frameState: "reportA" | "reportB";
  readonly reportedUnits: number;
  readonly totalUnits: number;
  readonly checksum: number;
};

export type GameWorldAdapter = {
  readonly publishUnitFrame: (report: UnitFrameReport) => void;
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

export const targetingActor = createBaseMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    targetX: f32({ default: 0 }),
    targetY: f32({ default: 0 }),
    threat: i32({ default: 0 }),
  },
  spawnSchema: {
    targetX: f32(),
    targetY: f32(),
    threat: i32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "tracking" },
    tracking: { TICK: "tracking", ENTITY_DESPAWNED: "removed" },
    removed: {},
  },
  reducer(_state, action, { self, payloadFor }) {
    for (const entity of self.indices) {
      if (action.type === "ENTITY_SPAWNED") {
        const payload = payloadFor(entity);
        self.targetX[entity] = payload.targetX;
        self.targetY[entity] = payload.targetY;
        self.threat[entity] = payload.threat;
        continue;
      }

      if (action.type === "TICK") {
        self.targetX[entity] += 0.25;
        self.targetY[entity] -= 0.125;
        self.threat[entity] += 1;
      }
    }
  },
});

type EntityPublicSlice = {
  readonly storage: "entity";
  readonly version: number;
  readonly count: number;
  readonly capacity: number;
};

export type AppMachines = {
  readonly movementActor: typeof movementActor;
  readonly targetingActor: typeof targetingActor;
  readonly projectileActor: typeof projectileActor;
};
export type AppState = MachinesState<AppMachines> & {
  readonly healthActor: EntityPublicSlice;
};
export type AppDeps = {
  readonly getState: () => AppState;
  readonly entities: () => EntityAccess<AppMachines>;
  readonly sprites: SpriteAdapter;
  readonly world: GameWorldAdapter;
};

export const createMachine: TypedCreateMachineFn<AppEvent, AppDeps, EntitiesPlugin<AppDeps>> = createLiteFsmMachine;

type UnitFrameEffectDeps = {
  readonly self: {
    readonly indices: readonly EntityIndex[];
    readonly hp: { readonly [entity: EntityIndex]: number };
    readonly maxHp: { readonly [entity: EntityIndex]: number };
    readonly stateCode: { readonly [entity: EntityIndex]: number };
    readonly states: {
      readonly reportA: number;
      readonly reportB: number;
    };
  };
  readonly entities: () => EntityAccess<AppMachines>;
  readonly getState: () => AppState;
  readonly world: GameWorldAdapter;
};

const publishUnitFrame = ({ self, entities, getState, world }: UnitFrameEffectDeps): void => {
  const movement = entities().get("movementActor");
  const targeting = entities().get("targetingActor");
  const state = getState();
  let checksum = state.healthActor.count;

  for (const entity of self.indices) {
    checksum +=
      self.hp[entity] +
      self.maxHp[entity] +
      movement.x[entity] +
      movement.y[entity] +
      targeting.targetX[entity] +
      targeting.targetY[entity] +
      targeting.threat[entity];
  }

  const firstEntity = self.indices[0];
  const frameState = self.stateCode[firstEntity] === self.states.reportA ? "reportA" : "reportB";

  world.publishUnitFrame({
    frameState,
    reportedUnits: self.indices.length,
    totalUnits: state.healthActor.count,
    checksum,
  });
};

export const healthActor = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    hp: i32({ default: 1 }),
    maxHp: i32({ default: 1 }),
    armor: i32({ default: 0 }),
  },
  spawnSchema: {
    hp: i32(),
    maxHp: i32(),
    armor: i32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "alive" },
    alive: { TICK: "reportA", ENTITY_DESPAWNED: "removed" },
    reportA: { TICK: "reportB", ENTITY_DESPAWNED: "removed" },
    reportB: { TICK: "reportA", ENTITY_DESPAWNED: "removed" },
    dead: {},
    removed: {},
  },
  despawnOn: "dead",
  reducer(_state, action, { self, payloadFor }) {
    for (const entity of self.indices) {
      if (action.type === "ENTITY_SPAWNED") {
        const payload = payloadFor(entity);
        self.hp[entity] = payload.hp;
        self.maxHp[entity] = payload.maxHp;
        self.armor[entity] = payload.armor;
        continue;
      }

      if (action.type === "TICK") {
        if (self.hp[entity] < self.maxHp[entity]) self.hp[entity] += 1;
        if (self.hp[entity] <= 0) self.stateCode[entity] = self.states.dead;
      }
    }
  },
  effects: {
    reportA: publishUnitFrame,
    reportB: publishUnitFrame,
  },
});

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
      const movement = entities().get("movementActor");

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
  healthActor,
  targetingActor,
  spriteSyncActor,
  projectileActor,
};

export const spawnEvents = defineSpawnEvents({
  SPAWN_UNIT: spawnEvent<UnitSpawn>(),
  SPAWN_PROJECTILE: spawnEvent<ProjectileSpawn>(),
});

export type EntitySpawnEvents = SpawnEventsFrom<typeof spawnEvents>;

export const spawn = defineEntitySpawn(
  machines,
  spawnEvents,
)({
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
      healthActor: {
        hp: payload.hp,
        maxHp: payload.maxHp,
        armor: 2,
      },
      targetingActor: {
        targetX: payload.targetX,
        targetY: payload.targetY,
        threat: payload.threat,
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

export const createMemoryWorldAdapter = () => {
  const reports: UnitFrameReport[] = [];

  return {
    world: {
      publishUnitFrame: (report: UnitFrameReport) => {
        reports.push(report);
      },
    } satisfies GameWorldAdapter,
    reports,
  };
};

export const createEntitiesExampleManager = (sprites: SpriteAdapter, world: GameWorldAdapter) => {
  const manager = MachineManager(machines, {
    plugins: [entitiesPlugin({ spawn })] as const,
  });

  manager.setDependencies({
    getState: manager.getState,
    entities: manager.entities,
    sprites,
    world,
  });

  return manager;
};

export const runEntitiesCompositionExample = () => {
  const spriteMemory = createMemorySpriteAdapter();
  const worldMemory = createMemoryWorldAdapter();
  const manager = createEntitiesExampleManager(spriteMemory.sprites, worldMemory.world);

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
      hp: 90,
      maxHp: 100,
      targetX: 40,
      targetY: 60,
      threat: 7,
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

  const rootEntities = manager.entities();
  const state = manager.getState() as unknown as AppState;

  return {
    hasRootEntityAccessor: rootEntities === manager.entities(),
    movementCount: state.movementActor.count,
    healthCount: state.healthActor.count,
    targetingCount: state.targetingActor.count,
    unitPosition: spriteMemory.positions.get("sprite/unit-alpha"),
    unitFrameReports: [...worldMemory.reports],
    projectileVisible: spriteMemory.positions.has("sprite/projectile-p1"),
    removedSprites: [...spriteMemory.removed],
  };
};
