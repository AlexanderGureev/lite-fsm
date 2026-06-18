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
import { parentKeyForTracePhase } from "./trace.fixture.mjs";

export const benchmarkName = "mass-despawn-lite-fsm-entities";
export const rowCounts = [30_000, 35_000];
export const batchSizes = [128, 512, 1024, 5_000];
export const warmupIterations = 0;
export const measuredIterations = 1;

const actorRowsPerEntity = 5;
const churnOperationsPerSample = 3;
const spawnActionType = "SPAWN_RTS_UNITS";
const despawnOnActionType = "KILL_RTS_UNITS";
const explicitIdsActionType = "DESPAWN_EXPLICIT_IDS";
const explicitIndicesActionType = "DESPAWN_EXPLICIT_INDICES";
const explicitDespawnActionType = "LITE_FSM_ENTITY_DESPAWN";
const groupTagMode = "unit";

const now = () => globalThis.performance.now();

const sortNumbers = (values) => [...values].sort((left, right) => left - right);

const median = (sortedSamples) => {
  if (sortedSamples.length === 0) throw new Error("Cannot summarize an empty sample series.");
  const mid = Math.floor(sortedSamples.length / 2);
  return sortedSamples.length % 2 === 0 ? (sortedSamples[mid - 1] + sortedSamples[mid]) / 2 : sortedSamples[mid];
};

const percentile = (sortedSamples, rank) => {
  if (sortedSamples.length === 0) throw new Error("Cannot summarize an empty sample series.");
  const index = Math.min(sortedSamples.length - 1, Math.max(0, Math.ceil(sortedSamples.length * rank) - 1));
  return sortedSamples[index];
};

const relativeStdDev = (samples) => {
  if (samples.length <= 1) return 0;
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  if (mean === 0) return 0;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  return Math.sqrt(variance) / Math.abs(mean);
};

const summarize = (samples) => {
  const sorted = sortNumbers(samples);
  return {
    median: median(sorted),
    p95: percentile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    relativeStdDev: relativeStdDev(samples),
    samples,
  };
};

const pushSample = (samplesByKey, key, value) => {
  const samples = samplesByKey.get(key) ?? [];
  samples.push(value);
  samplesByKey.set(key, samples);
};

const lifecycleTargetFor = (target) => (target === undefined ? {} : { ENTITY_DESPAWNED: target });

const createLifecycleReducer = (writeSpawn, writeDespawn) =>
  function lifecycleReducer(_state, action, meta) {
    if (action.type === "ENTITY_SPAWNED") {
      writeSpawn(meta.self, meta.payloadFor);
      return;
    }
    if (action.type === "ENTITY_DESPAWNED") writeDespawn(meta.self);
  };

const createIdentityActor = (lifecycle, lifecycleSink) => {
  const lifecycleTarget = lifecycle === "none" ? undefined : "despawned";
  const actor = {
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      kind: u8({ default: 1 }),
      faction: u8({ default: 0 }),
      radius: f32({ default: 12 }),
      unitIndex: i32({ default: -1 }),
    },
    spawnSchema: {
      kind: u8(),
      faction: u8(),
      radius: f32(),
      unitIndex: i32(),
    },
    config: {
      __INIT: { ENTITY_SPAWNED: "active" },
      active: lifecycleTargetFor(lifecycleTarget),
      despawned: {},
    },
  };

  if (lifecycle === "reducer") {
    actor.reducer = createLifecycleReducer(
      (self, payloadFor) => {
        for (const entity of self.indices) {
          const payload = payloadFor(entity);
          self.kind[entity] = payload.kind;
          self.faction[entity] = payload.faction;
          self.radius[entity] = payload.radius;
          self.unitIndex[entity] = payload.unitIndex;
        }
      },
      (self) => {
        for (const entity of self.indices) self.unitIndex[entity] += 1;
      },
    );
  }

  if (lifecycle === "reaction") {
    actor.reactions = {
      ENTITY_DESPAWNED: ({ self }) => {
        lifecycleSink.value += self.indices.length;
      },
    };
  }

  return actor;
};

const createMovementActor = (lifecycle, lifecycleSink) => {
  const lifecycleTarget = lifecycle === "none" ? undefined : "despawned";
  const actor = {
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
      __INIT: { ENTITY_SPAWNED: "active" },
      active: lifecycleTargetFor(lifecycleTarget),
      despawned: {},
    },
  };

  if (lifecycle === "reducer") {
    actor.reducer = createLifecycleReducer(
      (self, payloadFor) => {
        for (const entity of self.indices) {
          const payload = payloadFor(entity);
          self.x[entity] = payload.x;
          self.y[entity] = payload.y;
          self.vx[entity] = payload.vx;
          self.vy[entity] = payload.vy;
          self.speed[entity] = payload.speed;
        }
      },
      (self) => {
        for (const entity of self.indices) self.speed[entity] = 0;
      },
    );
  }

  if (lifecycle === "reaction") {
    actor.reactions = {
      ENTITY_DESPAWNED: ({ self }) => {
        lifecycleSink.value += self.indices.length;
      },
    };
  }

  return actor;
};

const createHealthActor = (lifecycle, lifecycleSink) => {
  const lifecycleTarget = lifecycle === "none" ? undefined : "despawned";
  const actor = {
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      hp: i32({ default: 100 }),
      maxHp: i32({ default: 100 }),
      pendingKill: u8({ default: 0 }),
    },
    spawnSchema: {
      hp: i32(),
      maxHp: i32(),
      pendingKill: u8(),
    },
    config: {
      __INIT: { ENTITY_SPAWNED: "active" },
      active: {
        [despawnOnActionType]: "dead",
        [explicitIdsActionType]: "explicitIds",
        [explicitIndicesActionType]: "explicitIndices",
        ...lifecycleTargetFor(lifecycleTarget),
      },
      dead: lifecycleTargetFor(lifecycleTarget),
      explicitIds: lifecycleTargetFor(lifecycleTarget),
      explicitIndices: lifecycleTargetFor(lifecycleTarget),
      despawned: {},
    },
    despawnOn: "dead",
    effects: {
      explicitIds: ({ self, transition }) => {
        const ids = new Array(self.indices.length);
        for (let index = 0; index < self.indices.length; index += 1) {
          ids[index] = self.entityId(self.indices[index]);
        }
        transition.despawn(ids);
      },
      explicitIndices: ({ self, transition }) => {
        transition.despawn(self.indices);
      },
    },
  };

  if (lifecycle === "reducer") {
    actor.reducer = createLifecycleReducer(
      (self, payloadFor) => {
        for (const entity of self.indices) {
          const payload = payloadFor(entity);
          self.hp[entity] = payload.hp;
          self.maxHp[entity] = payload.maxHp;
          self.pendingKill[entity] = payload.pendingKill;
        }
      },
      (self) => {
        for (const entity of self.indices) self.pendingKill[entity] = 0;
      },
    );
  }

  if (lifecycle === "reaction") {
    actor.reactions = {
      ENTITY_DESPAWNED: ({ self }) => {
        lifecycleSink.value += self.indices.length;
      },
    };
  }

  return actor;
};

const createCombatActor = (lifecycle, lifecycleSink) => {
  const lifecycleTarget = lifecycle === "none" ? undefined : "despawned";
  const actor = {
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      attackRange: f32({ default: 120 }),
      attackDamage: i32({ default: 12 }),
      cooldownMs: i32({ default: 700 }),
      incomingDamage: i32({ default: 0 }),
    },
    spawnSchema: {
      attackRange: f32(),
      attackDamage: i32(),
      cooldownMs: i32(),
      incomingDamage: i32(),
    },
    config: {
      __INIT: { ENTITY_SPAWNED: "active" },
      active: lifecycleTargetFor(lifecycleTarget),
      despawned: {},
    },
  };

  if (lifecycle === "reducer") {
    actor.reducer = createLifecycleReducer(
      (self, payloadFor) => {
        for (const entity of self.indices) {
          const payload = payloadFor(entity);
          self.attackRange[entity] = payload.attackRange;
          self.attackDamage[entity] = payload.attackDamage;
          self.cooldownMs[entity] = payload.cooldownMs;
          self.incomingDamage[entity] = payload.incomingDamage;
        }
      },
      (self) => {
        for (const entity of self.indices) self.incomingDamage[entity] = 0;
      },
    );
  }

  if (lifecycle === "reaction") {
    actor.reactions = {
      ENTITY_DESPAWNED: ({ self }) => {
        lifecycleSink.value += self.indices.length;
      },
    };
  }

  return actor;
};

const createEnemyAiActor = (lifecycle, lifecycleSink) => {
  const lifecycleTarget = lifecycle === "none" ? undefined : "despawned";
  const actor = {
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      intent: u8({ default: 1 }),
    },
    spawnSchema: {
      intent: u8(),
    },
    config: {
      __INIT: { ENTITY_SPAWNED: "active" },
      active: lifecycleTargetFor(lifecycleTarget),
      despawned: {},
    },
  };

  if (lifecycle === "reducer") {
    actor.reducer = createLifecycleReducer(
      (self, payloadFor) => {
        for (const entity of self.indices) self.intent[entity] = payloadFor(entity).intent;
      },
      (self) => {
        for (const entity of self.indices) self.intent[entity] = 0;
      },
    );
  }

  if (lifecycle === "reaction") {
    actor.reactions = {
      ENTITY_DESPAWNED: ({ self }) => {
        lifecycleSink.value += self.indices.length;
      },
    };
  }

  return actor;
};

const createMachines = (lifecycle, lifecycleSink) => ({
  identity: createIdentityActor(lifecycle, lifecycleSink),
  movement: createMovementActor(lifecycle, lifecycleSink),
  health: createHealthActor(lifecycle, lifecycleSink),
  combat: createCombatActor(lifecycle, lifecycleSink),
  enemyAi: createEnemyAiActor(lifecycle, lifecycleSink),
});

const createSpawnEvents = () =>
  defineSpawnEvents({
    [spawnActionType]: spawnEvent(),
  });

const createUnitSpec = (index, payload) => {
  const unitIndex = payload.startId + index;
  const x = (unitIndex % 512) * 3;
  const y = Math.floor(unitIndex / 512) * 3;
  const faction = unitIndex % 2;

  return {
    id: `unit/${unitIndex}`,
    groupTag: payload.groupTagMode === "factions" ? (faction === 0 ? "player" : "enemy") : "unit",
    actors: {
      identity: {
        kind: 1,
        faction,
        radius: 12,
        unitIndex,
      },
      movement: {
        x,
        y,
        vx: 0,
        vy: 0,
        speed: 42 + (unitIndex % 7),
      },
      health: {
        hp: 100,
        maxHp: 100,
        pendingKill: 0,
      },
      combat: {
        attackRange: 120,
        attackDamage: 10 + (unitIndex % 5),
        cooldownMs: 700,
        incomingDamage: 0,
      },
      enemyAi: {
        intent: 1,
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
      for (let index = 0; index < payload.count; index += 1) specs[index] = createUnitSpec(index, payload);
      return specs;
    },
  });
};

const createManager = (definition) => {
  const lifecycleSink = { value: 0 };
  const machines = createMachines(definition.lifecycle, lifecycleSink);
  const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn: createSpawn(machines) })] });
  return { manager, lifecycleSink };
};

const unitIds = (startId, count) => {
  const ids = new Array(count);
  for (let index = 0; index < count; index += 1) ids[index] = `unit/${startId + index}`;
  return ids;
};

const assertCounts = (manager, expectedLive, context) => {
  const stores = ["identity", "movement", "health", "combat", "enemyAi"].map((key) => manager.entities().get(key));
  for (let index = 0; index < stores.length; index += 1) {
    const count = stores[index].count;
    if (count !== expectedLive) {
      throw new Error(`${context}: actor store ${index} has ${count} live rows, expected ${expectedLive}.`);
    }
  }
};

const transitionForPath = (path) => {
  if (path === "despawnOn") return despawnOnActionType;
  if (path === "explicit-ids") return explicitIdsActionType;
  return explicitIndicesActionType;
};

const selectVictimIds = (liveIds, batchSize, mode) => {
  if (liveIds.length < batchSize) throw new Error(`Cannot despawn ${batchSize} entities from ${liveIds.length}.`);
  if (mode === "churn") return liveIds.splice(0, batchSize);
  return liveIds.slice(0, batchSize);
};

const createScenarioRunner = (definition, rowCount) => {
  let manager;
  let lifecycleSink;
  let liveIds = [];
  let nextSpawnId = rowCount;

  const spawnBatch = (count, startId) => {
    manager.transition({
      type: spawnActionType,
      payload: { count, startId, groupTagMode },
    });
  };

  const reset = () => {
    const created = createManager(definition);
    manager = created.manager;
    lifecycleSink = created.lifecycleSink;
    liveIds = unitIds(0, rowCount);
    nextSpawnId = rowCount;
    spawnBatch(rowCount, 0);
    assertCounts(manager, rowCount, `${definition.key} reset`);
  };

  const runDespawn = () => {
    const setupStartedAt = now();
    const victims = selectVictimIds(liveIds, definition.batchSize, definition.mode);
    const action = {
      type: transitionForPath(definition.path),
      meta: { entityId: victims },
    };
    const setupMs = now() - setupStartedAt;

    const startedAt = now();
    manager.transition(action);
    const despawnMs = now() - startedAt;

    const liveAfterDespawn = rowCount - definition.batchSize;
    assertCounts(manager, liveAfterDespawn, `${definition.key} despawn`);
    return { setupMs, despawnMs, victims, liveAfterDespawn };
  };

  const runReplacementSpawn = () => {
    const startId = nextSpawnId;
    nextSpawnId += definition.batchSize;
    const replacementIds = unitIds(startId, definition.batchSize);
    const startedAt = now();
    spawnBatch(definition.batchSize, startId);
    const replacementSpawnMs = now() - startedAt;
    liveIds.push(...replacementIds);
    assertCounts(manager, rowCount, `${definition.key} replacement spawn`);
    return { replacementSpawnMs, replacementIds };
  };

  const run = () => {
    const despawn = runDespawn();
    let replacement;
    if (definition.mode === "churn") replacement = runReplacementSpawn();

    return {
      setupMs: despawn.setupMs,
      despawnMs: despawn.despawnMs,
      replacementSpawnMs: replacement?.replacementSpawnMs,
      observed: {
        liveBefore: rowCount,
        liveAfterDespawn: despawn.liveAfterDespawn,
        liveAfterOperation: definition.mode === "churn" ? rowCount : despawn.liveAfterDespawn,
        despawnedEntities: definition.batchSize,
        removedActorRows: definition.batchSize * actorRowsPerEntity,
        lifecycleSink: lifecycleSink.value,
      },
    };
  };

  return {
    reset,
    beforeSample() {
      if (definition.mode === "churn") reset();
    },
    beforeOperation() {
      if (definition.mode === "one-shot") reset();
    },
    run,
    afterOperation() {
      if (definition.mode === "one-shot") {
        manager = undefined;
        lifecycleSink = undefined;
        liveIds = [];
      }
    },
    afterSample() {
      if (definition.mode === "churn") {
        manager = undefined;
        lifecycleSink = undefined;
        liveIds = [];
      }
    },
  };
};

const expectedFor = (definition, rowCount) => ({
  liveBefore: rowCount,
  liveAfterDespawn: rowCount - definition.batchSize,
  liveAfterOperation: definition.mode === "churn" ? rowCount : rowCount - definition.batchSize,
  despawnedEntities: definition.batchSize,
  removedActorRows: definition.batchSize * actorRowsPerEntity,
});

const assertObserved = (definition, rowCount, observed) => {
  const expected = expectedFor(definition, rowCount);
  for (const [key, value] of Object.entries(expected)) {
    if (observed[key] !== value) {
      throw new Error(`${definition.key}: observed ${key}=${observed[key]}, expected ${value}.`);
    }
  }
};

const measureRunner = (runner, definition, rowCount) => {
  const operationsPerSample = definition.operationsPerSample;
  for (let sample = 0; sample < warmupIterations; sample += 1) {
    runner.beforeSample();
    for (let operation = 0; operation < operationsPerSample; operation += 1) {
      runner.beforeOperation();
      const result = runner.run();
      assertObserved(definition, rowCount, result.observed);
      runner.afterOperation();
    }
    runner.afterSample();
  }

  const setupSamples = [];
  const despawnSamples = [];
  const replacementSpawnSamples = [];
  let observed;

  for (let sample = 0; sample < measuredIterations; sample += 1) {
    runner.beforeSample();
    let setupMs = 0;
    let despawnMs = 0;
    let replacementSpawnMs = 0;
    for (let operation = 0; operation < operationsPerSample; operation += 1) {
      runner.beforeOperation();
      const result = runner.run();
      assertObserved(definition, rowCount, result.observed);
      setupMs += result.setupMs;
      despawnMs += result.despawnMs;
      replacementSpawnMs += result.replacementSpawnMs ?? 0;
      observed = result.observed;
      runner.afterOperation();
    }
    setupSamples.push(setupMs / operationsPerSample);
    despawnSamples.push(despawnMs / operationsPerSample);
    if (definition.mode === "churn") replacementSpawnSamples.push(replacementSpawnMs / operationsPerSample);
    runner.afterSample();
  }

  return {
    setup: summarize(setupSamples),
    despawn: summarize(despawnSamples),
    ...(definition.mode === "churn" ? { replacementSpawn: summarize(replacementSpawnSamples) } : {}),
    observed,
  };
};

const summarizeRecordGroups = (groups) => {
  const phaseSamplesByKey = new Map();
  const counterSamplesByKey = new Map();

  for (const records of groups) {
    const phases = new Map();
    const counters = new Map();

    for (const record of records) {
      for (const phase of record.phases) {
        phases.set(phase.key, (phases.get(phase.key) ?? 0) + phase.durationMs);
      }
      for (const counter of record.counters) {
        counters.set(counter.key, (counters.get(counter.key) ?? 0) + counter.value);
      }
    }

    for (const [key, value] of phases) pushSample(phaseSamplesByKey, key, value);
    for (const [key, value] of counters) pushSample(counterSamplesByKey, key, value);
  }

  const phases = Array.from(phaseSamplesByKey, ([key, samples]) => ({
    key,
    label: key,
    ...(parentKeyForTracePhase(key) ? { parentKey: parentKeyForTracePhase(key) } : {}),
    ...summarize(samples),
  }));
  const counters = Array.from(counterSamplesByKey, ([key, samples]) => ({
    key,
    label: key,
    ...summarize(samples),
  }));
  const total = phases.find((phase) => phase.key === "core.transition.total");

  return {
    transitionCount: groups.reduce((sum, records) => sum + records.length, 0),
    ...(total ? { total } : {}),
    phases,
    counters,
  };
};

const traceCollectorSymbol = Symbol.for("@lite-fsm/performance-trace");

const runWithCollector = (run) => {
  const collector = { records: [] };
  globalThis[traceCollectorSymbol] = collector;
  try {
    const result = run();
    return { result, records: collector.records };
  } finally {
    delete globalThis[traceCollectorSymbol];
  }
};

const requireRecords = (definition, records, predicate, sectionKey) => {
  const selected = records.filter(predicate);
  if (selected.length === 0) throw new Error(`${definition.key}: trace section '${sectionKey}' produced no records.`);
  return selected;
};

const collectTraceSectionGroups = (definition, operationRecords) => {
  const actionType = transitionForPath(definition.path);
  const sections = [
    {
      key: "despawn-transition",
      label: "despawn transition",
      role: "despawn",
      actionType,
      depth: 0,
      groups: operationRecords.map((records) =>
        requireRecords(
          definition,
          records,
          (record) => record.actionType === actionType && record.depth === 0 && record.status === "ok",
          "despawn-transition",
        ),
      ),
    },
  ];

  if (definition.path !== "despawnOn") {
    sections.push({
      key: "explicit-despawn-transition",
      label: "nested explicit despawn transition",
      role: "explicit-despawn",
      actionType: explicitDespawnActionType,
      depth: 1,
      groups: operationRecords.map((records) =>
        requireRecords(
          definition,
          records,
          (record) => record.actionType === explicitDespawnActionType && record.depth === 1 && record.status === "ok",
          "explicit-despawn-transition",
        ),
      ),
    });
  }

  if (definition.mode === "churn") {
    sections.push({
      key: "replacement-spawn-transition",
      label: "replacement spawn transition",
      role: "replacement-spawn",
      actionType: spawnActionType,
      depth: 0,
      groups: operationRecords.map((records) =>
        requireRecords(
          definition,
          records,
          (record) => record.actionType === spawnActionType && record.depth === 0 && record.status === "ok",
          "replacement-spawn-transition",
        ),
      ),
    });
  }

  return sections.map(({ groups, ...section }) => ({
    ...section,
    ...summarizeRecordGroups(groups),
  }));
};

const traceRunner = (runner, definition, rowCount) => {
  const operationRecords = [];
  let observed;

  for (let sample = 0; sample < measuredIterations; sample += 1) {
    runner.beforeSample();
    for (let operation = 0; operation < definition.operationsPerSample; operation += 1) {
      runner.beforeOperation();
      const { result, records } = runWithCollector(() => runner.run());
      assertObserved(definition, rowCount, result.observed);
      operationRecords.push(records);
      observed = result.observed;
      runner.afterOperation();
    }
    runner.afterSample();
  }

  return {
    sections: collectTraceSectionGroups(definition, operationRecords),
    observed,
  };
};

const scenarioKey = ({ path, lifecycle, mode, batchSize }) =>
  `${path === "despawnOn" ? "despawn-on" : path}-${lifecycle}-${mode}-b${batchSize}`;

const scenarioLabel = ({ path, lifecycle, mode, batchSize }) =>
  `${path} / ${lifecycle} / ${mode} / batch ${batchSize.toLocaleString("en-US")}`;

const createScenarioDefinition = (path, lifecycle, mode, batchSize) => {
  const definition = {
    key: scenarioKey({ path, lifecycle, mode, batchSize }),
    label: scenarioLabel({ path, lifecycle, mode, batchSize }),
    kind: "mass-despawn",
    rowCountMode: "rts-units",
    actorRowsPerEntity,
    batchSize,
    mode,
    path,
    lifecycle,
    operationOrder: mode === "churn" ? "despawn -> spawn replacement" : "despawn only",
    operationsPerSample: mode === "churn" ? churnOperationsPerSample : 1,
  };
  return definition;
};

const createScenarioDefinitions = () => {
  const definitions = [];
  const modes = ["one-shot", "churn"];
  const paths = ["despawnOn", "explicit-ids", "explicit-indices"];

  for (const mode of modes) {
    for (const path of paths) {
      for (const batchSize of batchSizes) definitions.push(createScenarioDefinition(path, "none", mode, batchSize));
      for (const lifecycle of ["edge-only", "reducer", "reaction"]) {
        for (const batchSize of [1024, 5_000]) {
          definitions.push(createScenarioDefinition(path, lifecycle, mode, batchSize));
        }
      }
    }
  }

  return definitions;
};

export const scenarioDefinitions = createScenarioDefinitions();

const filterScenarioDefinitions = (definitions, selectedBatchSizes) => {
  if (!selectedBatchSizes) return definitions;
  const allowed = new Set(selectedBatchSizes);
  return definitions.filter((definition) => allowed.has(definition.batchSize));
};

const runTimingScenario = (definition, rowCount) => {
  const runner = createScenarioRunner(definition, rowCount);
  const measured = measureRunner(runner, definition, rowCount);

  return {
    key: definition.key,
    label: definition.label,
    kind: definition.kind,
    rowCount,
    actorRowsPerEntity: definition.actorRowsPerEntity,
    actorRowCount: rowCount * definition.actorRowsPerEntity,
    batchSize: definition.batchSize,
    mode: definition.mode,
    path: definition.path,
    lifecycle: definition.lifecycle,
    operationOrder: definition.operationOrder,
    iterations: {
      warmup: warmupIterations,
      measured: measuredIterations,
      operationsPerSample: definition.operationsPerSample,
    },
    expected: expectedFor(definition, rowCount),
    observed: measured.observed,
    setup: measured.setup,
    despawn: measured.despawn,
    ...(measured.replacementSpawn ? { replacementSpawn: measured.replacementSpawn } : {}),
  };
};

const runTraceScenario = (definition, rowCount) => {
  const runner = createScenarioRunner(definition, rowCount);
  const traced = traceRunner(runner, definition, rowCount);
  const despawnSection = traced.sections.find((section) => section.key === "despawn-transition");

  return {
    key: definition.key,
    label: definition.label,
    kind: definition.kind,
    rowCount,
    actorRowsPerEntity: definition.actorRowsPerEntity,
    actorRowCount: rowCount * definition.actorRowsPerEntity,
    batchSize: definition.batchSize,
    mode: definition.mode,
    path: definition.path,
    lifecycle: definition.lifecycle,
    operationOrder: definition.operationOrder,
    iterations: {
      warmup: 0,
      measured: measuredIterations,
      operationsPerSample: definition.operationsPerSample,
    },
    expected: expectedFor(definition, rowCount),
    observed: traced.observed,
    sections: traced.sections,
    ...(despawnSection?.total ? { total: despawnSection.total } : {}),
  };
};

export const runEntitiesMassDespawnBenchmark = ({
  profile,
  onScenarioStart,
  onScenarioEnd,
  rowCounts: selectedRowCounts = rowCounts,
  batchSizes: selectedBatchSizes,
  scenarioDefinitions: selectedScenarioDefinitions = scenarioDefinitions,
} = {}) => {
  const scenarios = [];
  const definitions = filterScenarioDefinitions(selectedScenarioDefinitions, selectedBatchSizes);

  for (const definition of definitions) {
    for (const rowCount of selectedRowCounts) {
      if (definition.batchSize > rowCount) continue;
      onScenarioStart?.(definition, rowCount);
      const scenario = runTimingScenario(definition, rowCount);
      scenarios.push(scenario);
      onScenarioEnd?.(scenario);
    }
  }

  return {
    benchmark: benchmarkName,
    profile: profile ?? "node",
    runtime: "production dist",
    rowCounts: selectedRowCounts,
    batchSizes: selectedBatchSizes ?? batchSizes,
    scenarios,
  };
};

export const runEntitiesMassDespawnTraceBenchmark = ({
  profile,
  onScenarioStart,
  onScenarioEnd,
  rowCounts: selectedRowCounts = rowCounts,
  batchSizes: selectedBatchSizes,
  scenarioDefinitions: selectedScenarioDefinitions = scenarioDefinitions,
} = {}) => {
  const scenarios = [];
  const definitions = filterScenarioDefinitions(selectedScenarioDefinitions, selectedBatchSizes);

  for (const definition of definitions) {
    for (const rowCount of selectedRowCounts) {
      if (definition.batchSize > rowCount) continue;
      onScenarioStart?.(definition, rowCount);
      const scenario = runTraceScenario(definition, rowCount);
      scenarios.push(scenario);
      onScenarioEnd?.(scenario);
    }
  }

  return {
    benchmark: benchmarkName,
    profile: profile ?? "node",
    runtime: "production dist",
    rowCounts: selectedRowCounts,
    batchSizes: selectedBatchSizes ?? batchSizes,
    scenarios,
  };
};
