import { MachineManager } from "../../../packages/core/dist/index.js";
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  f32,
  i32,
  spawnEvent,
  string as entityString,
} from "../../../packages/entities/dist/index.js";

export const benchmarkName = "composition-lite-fsm-entities";
export const warmupIterations = 5;
export const measuredIterations = 30;

const rowCounts = [10_000, 50_000];
const tickAction = { type: "TICK" };
const cleanupBatchSize = 128;
const ratioBudgets = {
  "reducer-only": 1.5,
  "full-pipeline": 2,
};
const allocationGuardBudget = {
  iterations: 20,
  bytesPerRowGrowth: 8,
  noiseFloorBytes: 256 * 1024,
};

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

const createMovementActor = () =>
  ({
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      x: f32(),
      y: f32(),
      dx: f32({ default: 1 }),
      dy: f32({ default: 1 }),
    },
    spawnSchema: {
      x: f32(),
      y: f32(),
      dx: f32(),
      dy: f32(),
    },
    config: {
      __INIT: { ENTITY_SPAWNED: "active" },
      active: { TICK: "active" },
    },
    reducer(_state, action, { self, payloadFor }) {
      for (const entity of self.indices) {
        if (action.type === "ENTITY_SPAWNED") {
          const payload = payloadFor(entity);
          self.x[entity] = payload.x;
          self.y[entity] = payload.y;
          self.dx[entity] = payload.dx;
          self.dy[entity] = payload.dy;
          continue;
        }

        self.x[entity] += self.dx[entity];
        self.y[entity] += self.dy[entity];
      }
    },
  });

const createProjectileActor = (mode) =>
  ({
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      ticksLeft: i32(),
      damage: i32(),
    },
    spawnSchema: {
      ticksLeft: i32(),
      damage: i32(),
    },
    config: {
      __INIT: { ENTITY_SPAWNED: "active" },
      active: { TICK: "active" },
      expired: {},
    },
    despawnOn: mode === "cleanup" ? "expired" : undefined,
    reducer(_state, action, { self, payloadFor }) {
      for (const entity of self.indices) {
        if (action.type === "ENTITY_SPAWNED") {
          const payload = payloadFor(entity);
          self.ticksLeft[entity] = payload.ticksLeft;
          self.damage[entity] = payload.damage;
          continue;
        }

        self.ticksLeft[entity] -= 1;
        if (mode === "cleanup" && self.ticksLeft[entity] <= 0) self.stateCode[entity] = self.states.expired;
      }
    },
  });

const createSpriteActor = (spriteAccumulator) =>
  ({
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      spriteId: entityString(),
    },
    spawnSchema: {
      spriteId: entityString(),
    },
    config: {
      __INIT: { ENTITY_SPAWNED: "visible" },
      visible: { TICK: "visible" },
    },
    reducer(_state, action, { self, payloadFor }) {
      if (action.type !== "ENTITY_SPAWNED") return;

      for (const entity of self.indices) {
        self.spriteId[entity] = payloadFor(entity).spriteId;
      }
    },
    reactions: {
      TICK: ({ self, entities }) => {
        const movement = entities.get("movementActor");
        let checksum = 0;

        for (const entity of self.indices) {
          checksum += movement.x[entity] + movement.y[entity] + self.spriteId[entity].length;
        }

        spriteAccumulator.value += checksum;
      },
    },
  });

const createSpawnEvents = () =>
  defineSpawnEvents({
    SPAWN_BENCH_BATCH: spawnEvent(),
  });

const createSpawn = (machines, createSpec) => {
  const spawnEvents = createSpawnEvents();

  return defineEntitySpawn(machines, spawnEvents)({
    SPAWN_BENCH_BATCH: (payload) => {
      const specs = new Array(payload.count);
      for (let index = 0; index < payload.count; index += 1) specs[index] = createSpec(index, payload);
      return specs;
    },
  });
};

const createMovementEntityRunner = (rowCount) => {
  const movementActor = createMovementActor();
  const machines = { movementActor };
  const spawn = createSpawn(machines, (index, payload) => ({
    id: `unit/${payload.startId + index}`,
    groupTag: "unit",
    actors: {
      movementActor: {
        x: index % 1024,
        y: index % 2048,
        dx: 1 + (index % 3),
        dy: 1 + (index % 5),
      },
    },
  }));
  const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] });

  manager.transition({ type: "SPAWN_BENCH_BATCH", payload: { count: rowCount, startId: 0 } });

  return {
    beforeSample: noop,
    run: () => manager.transition(tickAction),
    afterSample: noop,
  };
};

const createProjectileEntityRunner = (rowCount, mode) => {
  const projectileActor = createProjectileActor(mode);
  const machines = { projectileActor };
  const initialTicksLeft = 1_000_000;
  const spawn = createSpawn(machines, (index, payload) => ({
    id: `projectile/${payload.startId + index}`,
    groupTag: "projectile",
    actors: {
      projectileActor: {
        ticksLeft: index < (payload.expireCount ?? 0) ? 1 : initialTicksLeft,
        damage: 10 + (index % 7),
      },
    },
  }));
  const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] });

  if (mode !== "cleanup") {
    manager.transition({ type: "SPAWN_BENCH_BATCH", payload: { count: rowCount, startId: 0, expireCount: 0 } });

    return {
      beforeSample: noop,
      run: () => manager.transition(tickAction),
      afterSample: noop,
    };
  }

  let nextId = 0;
  let needsReplacement = false;
  const spawnBatch = (count, expireCount) => {
    manager.transition({
      type: "SPAWN_BENCH_BATCH",
      payload: { count, startId: nextId, expireCount },
    });
    nextId += count;
  };

  spawnBatch(rowCount, cleanupBatchSize);

  return {
    beforeSample: noop,
    beforeOperation: () => {
      if (needsReplacement) spawnBatch(cleanupBatchSize, cleanupBatchSize);
      needsReplacement = false;
    },
    run: () => manager.transition(tickAction),
    afterOperation: () => {
      needsReplacement = true;
    },
    afterSample: noop,
  };
};

const createSpriteEntityRunner = (rowCount) => {
  const spriteAccumulator = { value: 0 };
  const movementActor = createMovementActor();
  const spriteSyncActor = createSpriteActor(spriteAccumulator);
  const machines = { movementActor, spriteSyncActor };
  const spawn = createSpawn(machines, (index, payload) => ({
    id: `sprite/${payload.startId + index}`,
    groupTag: "unit",
    actors: {
      movementActor: {
        x: index % 1024,
        y: index % 2048,
        dx: 1 + (index % 3),
        dy: 1 + (index % 5),
      },
      spriteSyncActor: {
        spriteId: `sprite-${index}`,
      },
    },
  }));
  const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] });

  manager.transition({ type: "SPAWN_BENCH_BATCH", payload: { count: rowCount, startId: 0 } });

  return {
    beforeSample: noop,
    run: () => manager.transition(tickAction),
    afterSample: noop,
    read: () => spriteAccumulator.value,
  };
};

const createSoaRows = (rowCount) => {
  const indices = new Int32Array(rowCount);
  const accepted = new Int32Array(rowCount);
  const presence = new Uint8Array(rowCount);
  const stateCode = new Int32Array(rowCount);
  const prevStateCode = new Int32Array(rowCount);
  const rowVersion = new Uint32Array(rowCount);
  const x = new Float32Array(rowCount);
  const y = new Float32Array(rowCount);
  const dx = new Float32Array(rowCount);
  const dy = new Float32Array(rowCount);
  const ticksLeft = new Int32Array(rowCount);
  const damage = new Int32Array(rowCount);
  const spriteIds = new Array(rowCount);
  const ids = new Array(rowCount);

  for (let i = 0; i < rowCount; i += 1) {
    indices[i] = i;
    presence[i] = 1;
    stateCode[i] = 0;
    x[i] = i % 1024;
    y[i] = i % 2048;
    dx[i] = 1 + (i % 3);
    dy[i] = 1 + (i % 5);
    ticksLeft[i] = 1_000_000;
    damage[i] = 10 + (i % 7);
    spriteIds[i] = `sprite-${i}`;
    ids[i] = `entity/${i}`;
  }

  return {
    count: rowCount,
    version: 0,
    indices,
    accepted,
    presence,
    stateCode,
    prevStateCode,
    rowVersion,
    x,
    y,
    dx,
    dy,
    ticksLeft,
    damage,
    spriteIds,
    ids,
    indexById: Object.create(null),
    checksum: 0,
  };
};

const fillIndexById = (rows) => {
  rows.indexById = Object.create(null);
  for (let i = 0; i < rows.count; i += 1) rows.indexById[rows.ids[i]] = i;
};

const createMovementSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);

  return {
    beforeSample: noop,
    run: () => {
      const { indices, accepted, presence, stateCode, prevStateCode, rowVersion, x, y, dx, dy } = rows;
      let acceptedCount = 0;

      for (let offset = 0; offset < rowCount; offset += 1) {
        const entity = indices[offset];
        if (presence[entity] === 0 || stateCode[entity] !== 0) continue;
        prevStateCode[entity] = stateCode[entity];
        accepted[acceptedCount] = entity;
        acceptedCount += 1;
        x[entity] += dx[entity];
        y[entity] += dy[entity];
      }

      for (let offset = 0; offset < acceptedCount; offset += 1) rowVersion[accepted[offset]] += 1;
      rows.version += 1;
    },
    afterSample: noop,
  };
};

const createProjectileSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);

  return {
    beforeSample: noop,
    run: () => {
      const { indices, accepted, presence, stateCode, prevStateCode, rowVersion, ticksLeft, damage } = rows;
      let acceptedCount = 0;

      for (let offset = 0; offset < rowCount; offset += 1) {
        const entity = indices[offset];
        if (presence[entity] === 0 || stateCode[entity] !== 0) continue;
        prevStateCode[entity] = stateCode[entity];
        accepted[acceptedCount] = entity;
        acceptedCount += 1;
        ticksLeft[entity] -= 1;
        damage[entity] += 0;
      }

      for (let offset = 0; offset < acceptedCount; offset += 1) rowVersion[accepted[offset]] += 1;
      rows.version += 1;
    },
    afterSample: noop,
  };
};

const createCleanupSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);
  const reset = () => {
    rows.count = rowCount;
    rows.version += 1;
    for (let index = 0; index < rowCount; index += 1) rows.indices[index] = index;
    rows.presence.fill(1);
    rows.stateCode.fill(0);
    rows.prevStateCode.fill(0);
    rows.ticksLeft.fill(1_000_000);
    for (let index = 0; index < cleanupBatchSize; index += 1) rows.ticksLeft[index] = 1;
    fillIndexById(rows);
  };

  return {
    beforeSample: noop,
    beforeOperation: reset,
    run: () => {
      const { indices, accepted, presence, stateCode, prevStateCode, rowVersion, ticksLeft, ids, indexById } = rows;
      let write = 0;
      let acceptedCount = 0;

      for (let offset = 0; offset < rowCount; offset += 1) {
        const entity = indices[offset];
        if (presence[entity] === 0 || stateCode[entity] !== 0) continue;

        prevStateCode[entity] = stateCode[entity];
        accepted[acceptedCount] = entity;
        acceptedCount += 1;
        ticksLeft[entity] -= 1;
        if (ticksLeft[entity] <= 0) {
          presence[entity] = 0;
          stateCode[entity] = 1;
          delete indexById[ids[entity]];
          continue;
        }

        indices[write] = entity;
        write += 1;
      }

      rows.count = write;
      for (let offset = 0; offset < acceptedCount; offset += 1) rowVersion[accepted[offset]] += 1;
      rows.version += 1;
    },
    afterSample: noop,
  };
};

const createSpriteSoaRunner = (rowCount) => {
  const rows = createSoaRows(rowCount);

  return {
    beforeSample: noop,
    run: () => {
      const { indices, accepted, presence, stateCode, prevStateCode, rowVersion, x, y, dx, dy, spriteIds } = rows;
      let acceptedCount = 0;
      let checksum = 0;

      for (let offset = 0; offset < rowCount; offset += 1) {
        const entity = indices[offset];
        if (presence[entity] === 0 || stateCode[entity] !== 0) continue;
        prevStateCode[entity] = stateCode[entity];
        accepted[acceptedCount] = entity;
        acceptedCount += 1;
        x[entity] += dx[entity];
        y[entity] += dy[entity];
        checksum += x[entity] + y[entity] + spriteIds[entity].length;
      }

      for (let offset = 0; offset < acceptedCount; offset += 1) rowVersion[accepted[offset]] += 1;
      rows.version += 1;
      rows.checksum += checksum;
    },
    afterSample: noop,
    read: () => rows.checksum,
  };
};

const scenarioDefinitions = [
  {
    key: "movement-update",
    label: "movement update",
    kind: "reducer-only",
    operationsPerSample: 5,
    createEntityRunner: createMovementEntityRunner,
    createBaselineRunner: createMovementSoaRunner,
  },
  {
    key: "projectile-lifetime",
    label: "projectile lifetime update",
    kind: "reducer-only",
    operationsPerSample: 5,
    createEntityRunner: (rowCount) => createProjectileEntityRunner(rowCount, "lifetime"),
    createBaselineRunner: createProjectileSoaRunner,
  },
  {
    key: "despawn-on-cleanup",
    label: "despawnOn cleanup",
    kind: "full-pipeline",
    operationsPerSample: 5,
    createEntityRunner: (rowCount) => createProjectileEntityRunner(rowCount, "cleanup"),
    createBaselineRunner: createCleanupSoaRunner,
  },
  {
    key: "sprite-sync-reaction",
    label: "sprite sync reaction",
    kind: "full-pipeline",
    operationsPerSample: 5,
    createEntityRunner: createSpriteEntityRunner,
    createBaselineRunner: createSpriteSoaRunner,
  },
];

const runScenario = (definition, rowCount) => {
  const baselineRunner = definition.createBaselineRunner(rowCount);
  const entityRunner = definition.createEntityRunner(rowCount);
  const baseline = measure(baselineRunner, definition.operationsPerSample);
  const entity = measure(entityRunner, definition.operationsPerSample);
  const ratio = entity.median / baseline.median;
  const budget = ratioBudgets[definition.kind];

  baselineRunner.read?.();
  entityRunner.read?.();

  return {
    key: definition.key,
    label: definition.label,
    kind: definition.kind,
    rowCount,
    iterations: {
      warmup: warmupIterations,
      measured: measuredIterations,
      operationsPerSample: definition.operationsPerSample,
    },
    baseline,
    entity,
    ratio,
    budget,
    passed: ratio <= budget,
  };
};

const retainedHeap = () => {
  if (typeof process === "undefined" || typeof process.memoryUsage !== "function") return undefined;
  return process.memoryUsage().heapUsed;
};

const runAllocationGuard = (forceGc) => {
  if (!forceGc || retainedHeap() === undefined) {
    return {
      skipped: true,
      reason: "GC and heap usage are not available in this profile.",
      budget: allocationGuardBudget,
    };
  }

  const samples = rowCounts.map((rowCount) => {
    const runner = createMovementEntityRunner(rowCount);
    for (let i = 0; i < warmupIterations; i += 1) runner.run();

    forceGc();
    const before = retainedHeap();
    for (let i = 0; i < allocationGuardBudget.iterations; i += 1) runner.run();
    forceGc();
    const after = retainedHeap();
    const retainedBytes = Math.max(0, after - before);

    return {
      rowCount,
      retainedBytes,
      bytesPerRow: retainedBytes / rowCount,
    };
  });
  const [small, large] = samples;
  const bytesPerRowGrowth = Math.max(0, large.bytesPerRow - small.bytesPerRow);
  const retainedGrowth = Math.max(0, large.retainedBytes - small.retainedBytes);
  const passed =
    bytesPerRowGrowth <= allocationGuardBudget.bytesPerRowGrowth ||
    retainedGrowth <= allocationGuardBudget.noiseFloorBytes;

  return {
    skipped: false,
    budget: allocationGuardBudget,
    samples,
    bytesPerRowGrowth,
    retainedGrowth,
    passed,
  };
};

export const runEntitiesBenchmarkProfile = ({ profile, forceGc, onScenarioStart, onScenarioEnd } = {}) => {
  const scenarios = [];

  for (const definition of scenarioDefinitions) {
    for (const rowCount of rowCounts) {
      onScenarioStart?.(definition, rowCount);
      const scenario = runScenario(definition, rowCount);
      scenarios.push(scenario);
      onScenarioEnd?.(scenario);
    }
  }

  const allocationGuard = runAllocationGuard(forceGc);
  const passed = scenarios.every((scenario) => scenario.passed) && (allocationGuard.skipped || allocationGuard.passed);

  return {
    benchmark: benchmarkName,
    profile: profile ?? "node",
    runtime: "production dist",
    rowCounts,
    scenarios,
    allocationGuard,
    passed,
  };
};

const formatMs = (value) => `${value.toFixed(3)}ms`;
const formatRatio = (value) => `${value.toFixed(2)}x`;

export const formatBenchmarkReport = (result) => {
  const lines = [
    `${result.benchmark} (${result.profile}, ${result.runtime})`,
    `iterations: warmup=${warmupIterations}, measured=${measuredIterations}`,
    "",
    "| Scenario | Rows | Gate | SoA median | SoA p95 | entities median | entities p95 | Ratio | Budget | Status |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const scenario of result.scenarios) {
    lines.push(
      [
        scenario.label,
        scenario.rowCount.toLocaleString("en-US"),
        scenario.kind,
        formatMs(scenario.baseline.median),
        formatMs(scenario.baseline.p95),
        formatMs(scenario.entity.median),
        formatMs(scenario.entity.p95),
        formatRatio(scenario.ratio),
        formatRatio(scenario.budget),
        scenario.passed ? "pass" : "fail",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }

  lines.push("");

  if (result.allocationGuard.skipped) {
    lines.push(`allocation guard: skipped (${result.allocationGuard.reason})`);
  } else {
    lines.push(
      `allocation guard: ${result.allocationGuard.passed ? "pass" : "fail"}; retained growth=${result.allocationGuard.retainedGrowth.toFixed(
        0,
      )} bytes; per-row growth=${result.allocationGuard.bytesPerRowGrowth.toFixed(3)} bytes/row; budget=${result.allocationGuard.budget.bytesPerRowGrowth} bytes/row or ${result.allocationGuard.budget.noiseFloorBytes} bytes noise floor`,
    );
  }

  return lines.join("\n");
};
