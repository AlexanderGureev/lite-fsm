/* global globalThis */

import { MachineManager } from "../../../packages/core/dist/index.js";
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  f32,
  i32,
  spawnEvent,
  u8,
} from "../../../packages/entities/dist/index.js";

export const benchmarkName = "spawn-lite-fsm-entities";
export const warmupIterations = 0;
export const measuredIterations = 1;

const rowCounts = [35_000];
const spawnActionType = "SPAWN_RTS_ENEMY_BATCH";
const actorRowsPerEntity = 5;

const now = () => globalThis.performance.now();
const noop = () => {};

const median = (sortedSamples) => {
  const mid = Math.floor(sortedSamples.length / 2);
  return sortedSamples.length % 2 === 0 ? (sortedSamples[mid - 1] + sortedSamples[mid]) / 2 : sortedSamples[mid];
};

const percentile = (sortedSamples, rank) => {
  const index = Math.min(sortedSamples.length - 1, Math.max(0, Math.ceil(sortedSamples.length * rank) - 1));
  return sortedSamples[index];
};

const summarize = (samples) => {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    median: median(sorted),
    p95: percentile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    samples,
  };
};

const measure = (runner, operationsPerSample) => {
  for (let i = 0; i < warmupIterations; i += 1) {
    runner.beforeSample();
    for (let op = 0; op < operationsPerSample; op += 1) {
      runner.beforeOperation?.();
      runner.run();
      runner.afterOperation?.();
    }
    runner.afterSample();
  }

  const samples = [];
  for (let i = 0; i < measuredIterations; i += 1) {
    runner.beforeSample();
    let elapsed = 0;
    for (let op = 0; op < operationsPerSample; op += 1) {
      runner.beforeOperation?.();
      const startedAt = now();
      runner.run();
      elapsed += now() - startedAt;
      runner.afterOperation?.();
    }
    samples.push(elapsed / operationsPerSample);
    runner.afterSample();
  }

  return summarize(samples);
};

const createUnitIdentityActor = () => ({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    kind: u8({ default: 0 }),
    faction: u8({ default: 0 }),
    radius: f32({ default: 0 }),
    unitIndex: i32({ default: -1 }),
  },
  spawnSchema: {
    kind: u8(),
    faction: u8(),
    radius: f32(),
    unitIndex: i32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "PRESENT" },
    PRESENT: {},
  },
  reducer(_state, action, { self, payloadFor }) {
    if (action.type !== "ENTITY_SPAWNED") return;

    for (const entity of self.indices) {
      const payload = payloadFor(entity);
      self.kind[entity] = payload.kind;
      self.faction[entity] = payload.faction;
      self.radius[entity] = payload.radius;
      self.unitIndex[entity] = payload.unitIndex;
    }
  },
});

const createUnitMovementActor = () => ({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    x: f32({ default: 0 }),
    y: f32({ default: 0 }),
    vx: f32({ default: 0 }),
    vy: f32({ default: 0 }),
    speed: f32({ default: 0 }),
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
    vx: f32(),
    vy: f32(),
    speed: f32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "ACTIVE" },
    ACTIVE: {},
  },
  reducer(_state, action, { self, payloadFor }) {
    if (action.type !== "ENTITY_SPAWNED") return;

    for (const entity of self.indices) {
      const payload = payloadFor(entity);
      self.x[entity] = payload.x;
      self.y[entity] = payload.y;
      self.vx[entity] = payload.vx;
      self.vy[entity] = payload.vy;
      self.speed[entity] = payload.speed;
    }
  },
});

const createUnitHealthActor = () => ({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    hp: i32({ default: 0 }),
    maxHp: i32({ default: 0 }),
  },
  spawnSchema: {
    hp: i32(),
    maxHp: i32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "ALIVE" },
    ALIVE: {},
    DEAD: {},
  },
  reducer(_state, action, { self, payloadFor }) {
    if (action.type !== "ENTITY_SPAWNED") return;

    for (const entity of self.indices) {
      const payload = payloadFor(entity);
      self.hp[entity] = payload.hp;
      self.maxHp[entity] = payload.maxHp;
      if (payload.hp <= 0) self.stateCode[entity] = self.states.DEAD;
    }
  },
});

const createUnitCombatActor = () => ({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    attackRange: f32({ default: 0 }),
    attackDamage: i32({ default: 0 }),
    attackCooldownMs: i32({ default: 0 }),
    attackTimerMs: i32({ default: 0 }),
    incomingDamage: i32({ default: 0 }),
    projectileSpeed: f32({ default: 0 }),
    projectileRadius: f32({ default: 0 }),
    projectileImpactRadius: f32({ default: 0 }),
    projectileTargetEntity: i32({ default: -1 }),
    projectileDamage: i32({ default: 0 }),
  },
  spawnSchema: {
    attackRange: f32(),
    attackDamage: i32(),
    attackCooldownMs: i32(),
    attackTimerMs: i32(),
    projectileSpeed: f32(),
    projectileRadius: f32(),
    projectileImpactRadius: f32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "ACTIVE" },
    ACTIVE: {},
    DISABLED: {},
  },
  reducer(_state, action, { self, payloadFor }) {
    if (action.type !== "ENTITY_SPAWNED") return;

    for (const entity of self.indices) {
      const payload = payloadFor(entity);
      self.attackRange[entity] = payload.attackRange;
      self.attackDamage[entity] = payload.attackDamage;
      self.attackCooldownMs[entity] = payload.attackCooldownMs;
      self.attackTimerMs[entity] = payload.attackTimerMs;
      self.incomingDamage[entity] = 0;
      self.projectileSpeed[entity] = payload.projectileSpeed;
      self.projectileRadius[entity] = payload.projectileRadius;
      self.projectileImpactRadius[entity] = payload.projectileImpactRadius;
      self.projectileTargetEntity[entity] = -1;
      self.projectileDamage[entity] = 0;
    }
  },
});

const createEnemyAiActor = () => ({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    intent: u8({ default: 0 }),
    targetEntity: i32({ default: -1 }),
    thinkCooldownMs: i32({ default: 0 }),
    leashX: f32({ default: 0 }),
    leashY: f32({ default: 0 }),
  },
  spawnSchema: {
    intent: u8(),
    targetEntity: i32(),
    thinkCooldownMs: i32(),
    leashX: f32(),
    leashY: f32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "ACTIVE" },
    ACTIVE: {},
    DISABLED: {},
  },
  reducer(_state, action, { self, payloadFor }) {
    if (action.type !== "ENTITY_SPAWNED") return;

    for (const entity of self.indices) {
      const payload = payloadFor(entity);
      self.intent[entity] = payload.intent;
      self.targetEntity[entity] = payload.targetEntity;
      self.thinkCooldownMs[entity] = payload.thinkCooldownMs;
      self.leashX[entity] = payload.leashX;
      self.leashY[entity] = payload.leashY;
    }
  },
});

const createMachines = () => ({
  unitIdentity: createUnitIdentityActor(),
  unitMovement: createUnitMovementActor(),
  unitHealth: createUnitHealthActor(),
  unitCombat: createUnitCombatActor(),
  enemyAi: createEnemyAiActor(),
});

const createSpawnEvents = () =>
  defineSpawnEvents({
    [spawnActionType]: spawnEvent(),
  });

const createEnemySpec = (index, payload) => {
  const unitIndex = payload.startId + index;
  const x = (unitIndex % 512) * 3;
  const y = Math.floor(unitIndex / 512) * 3;
  const hp = payload.hp;

  return {
    id: `enemy/${unitIndex}`,
    groupTag: "enemy",
    actors: {
      unitIdentity: {
        kind: 1,
        faction: 2,
        radius: 12,
        unitIndex,
      },
      unitMovement: {
        x,
        y,
        vx: 0,
        vy: 0,
        speed: 42 + (unitIndex % 7),
      },
      unitHealth: {
        hp,
        maxHp: hp,
      },
      unitCombat: {
        attackRange: 120,
        attackDamage: 10 + (unitIndex % 5),
        attackCooldownMs: 700,
        attackTimerMs: unitIndex % 700,
        projectileSpeed: 320,
        projectileRadius: 3,
        projectileImpactRadius: 8,
      },
      enemyAi: {
        intent: 1,
        targetEntity: -1,
        thinkCooldownMs: unitIndex % 250,
        leashX: x,
        leashY: y,
      },
    },
  };
};

const createSpawn = (machines) => {
  const spawnEvents = createSpawnEvents();

  return defineEntitySpawn(
    machines,
    spawnEvents,
  )({
    [spawnActionType]: (payload) => {
      const specs = new Array(payload.count);
      for (let index = 0; index < payload.count; index += 1) specs[index] = createEnemySpec(index, payload);
      return specs;
    },
  });
};

const createManager = () => {
  const machines = createMachines();
  return MachineManager(machines, { plugins: [entitiesPlugin({ spawn: createSpawn(machines) })] });
};

const createRtsSpawnEntityRunner = (rowCount) => {
  let manager;
  let checksum = 0;

  return {
    beforeSample: noop,
    beforeOperation: () => {
      manager = createManager();
    },
    run: () => {
      manager.transition({
        type: spawnActionType,
        payload: { count: rowCount, startId: 0, hp: 50_000 },
      });
    },
    afterOperation: () => {
      checksum += manager.entities().get("unitIdentity").count;
      checksum += manager.entities().get("enemyAi").count;
      manager = undefined;
    },
    afterSample: noop,
    read: () => checksum,
  };
};

export const spawnScenarioDefinitions = [
  {
    key: "rts-enemy-spawn",
    label: "RTS enemy spawn batch",
    kind: "spawn",
    actionType: spawnActionType,
    actorRowsPerEntity,
    operationsPerSample: 1,
    createEntityRunner: createRtsSpawnEntityRunner,
  },
];

const runScenario = (definition, rowCount) => {
  const runner = definition.createEntityRunner(rowCount);
  const total = measure(runner, definition.operationsPerSample);

  runner.read?.();

  return {
    key: definition.key,
    label: definition.label,
    kind: definition.kind,
    rowCount,
    actorRowsPerEntity: definition.actorRowsPerEntity,
    actorRowCount: rowCount * definition.actorRowsPerEntity,
    iterations: {
      warmup: warmupIterations,
      measured: measuredIterations,
      operationsPerSample: definition.operationsPerSample,
    },
    total,
  };
};

export const runEntitiesSpawnBenchmark = ({
  profile,
  onScenarioStart,
  onScenarioEnd,
  rowCounts: selectedRowCounts = rowCounts,
} = {}) => {
  const scenarios = [];

  for (const definition of spawnScenarioDefinitions) {
    for (const rowCount of selectedRowCounts) {
      onScenarioStart?.(definition, rowCount);
      const scenario = runScenario(definition, rowCount);
      scenarios.push(scenario);
      onScenarioEnd?.(scenario);
    }
  }

  return {
    benchmark: benchmarkName,
    profile: profile ?? "node",
    runtime: "production dist",
    rowCounts: selectedRowCounts,
    scenarios,
  };
};
