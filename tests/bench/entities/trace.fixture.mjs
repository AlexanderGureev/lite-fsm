/* global globalThis */

import {
  benchmarkName as compositionBenchmarkName,
  measuredIterations as compositionMeasuredIterations,
  scenarioDefinitions as compositionScenarioDefinitions,
  warmupIterations as compositionWarmupIterations,
} from "./composition-lite-fsm-entities.fixture.mjs";

export const benchmarkName = compositionBenchmarkName;
export const measuredIterations = compositionMeasuredIterations;
export const scenarioDefinitions = compositionScenarioDefinitions;
export const warmupIterations = compositionWarmupIterations;

const transitionTraceCollectorSymbol = Symbol.for("@lite-fsm/performance-trace");
const tickActionType = "TICK";
const rowCounts = [50_000];

const topLevelCorePhaseKeys = [
  "core.assertUserAction",
  "core.createDispatch",
  "core.prepareAction.total",
  "core.beforeReduce.total",
  "core.interceptors",
  "core.hooks.beforeReduce",
  "core.rootReducer",
  "core.markExternallyChangedBuckets",
  "core.hooks.afterReduce",
  "core.hooks.beforeCommit",
  "core.commit.total",
  "core.hooks.beforeSubscribers",
  "core.reactions.total",
  "core.subscribers",
  "core.hooks.beforeEffects",
  "core.effects.total",
  "core.hooks.afterEffects",
];

const coverageDefinitions = [
  {
    key: "core.topLevel",
    label: "core top-level coverage",
    parentKey: "core.transition.total",
    numeratorKeys: topLevelCorePhaseKeys,
  },
  {
    key: "entities.reduce",
    label: "entities reduce coverage",
    parentKey: "entities.reduce.total",
    numeratorKeys: [
      "entities.reduce.spawnLifecycle",
      "entities.reduce.spawnCleanup",
      "entities.reduce.collectPublicBatches",
      "entities.reduce.publicBatch.total",
      "entities.reduce.publicCleanup",
    ],
  },
  {
    key: "entities.spawnStage",
    label: "entities spawn stage coverage",
    parentKey: "entities.spawn.stage",
    numeratorKeys: ["entities.spawn.stage.recipe", "entities.spawn.stage.normalize", "entities.spawn.stage.validate"],
  },
  {
    key: "entities.spawnLifecycle",
    label: "entities spawn lifecycle coverage",
    parentKey: "entities.reduce.spawnLifecycle",
    numeratorKeys: [
      "entities.reduce.spawnLifecycle.applyStagedSpawns",
      "entities.reduce.spawnLifecycle.reduceBatches",
      "entities.reduce.spawnLifecycle.reactions",
    ],
  },
  {
    key: "entities.reactions",
    label: "entities reactions coverage",
    parentKey: "entities.reactions.total",
    numeratorKeys: ["entities.reactions.captureScope", "entities.reactions.createDeps", "entities.reactions.user"],
  },
  {
    key: "entities.effects",
    label: "entities effects coverage",
    parentKey: "core.effects.total",
    numeratorKeys: ["entities.effects.resolve", "entities.effects.invoke"],
  },
];

const phaseLabelOverrides = {
  "core.transition.total": "total transition",
  "core.assertUserAction": "assert user action",
  "core.createDispatch": "create dispatch",
  "core.prepareAction.total": "prepare action total",
  "core.beforeReduce.total": "before reduce total",
  "core.interceptors": "interceptors",
  "core.hooks.beforeReduce": "before reduce hooks",
  "core.rootReducer": "root reducer",
  "core.markExternallyChangedBuckets": "mark externally changed buckets",
  "core.hooks.afterReduce": "after reduce hooks",
  "core.hooks.beforeCommit": "before commit hooks",
  "core.commit.total": "commit total",
  "core.hooks.beforeSubscribers": "before subscribers hooks",
  "core.reactions.total": "reactions total",
  "core.subscribers": "subscribers",
  "core.hooks.beforeEffects": "before effects hooks",
  "core.effects.total": "effects total",
  "core.hooks.afterEffects": "after effects hooks",
  "entities.prepare.transaction": "prepare transaction",
  "entities.prepare.explicitDespawn": "prepare explicit despawn",
  "entities.spawn.stage": "spawn stage",
  "entities.spawn.stage.recipe": "spawn stage recipe",
  "entities.spawn.stage.normalize": "spawn stage normalize",
  "entities.spawn.stage.validate": "spawn stage validate",
  "entities.reduce.total": "reduce total",
  "entities.reduce.spawnLifecycle": "spawn lifecycle",
  "entities.reduce.spawnLifecycle.applyStagedSpawns": "spawn lifecycle apply staged spawns",
  "entities.reduce.spawnLifecycle.reduceBatches": "spawn lifecycle reduce batches",
  "entities.reduce.spawnLifecycle.batch.total": "spawn lifecycle batch total",
  "entities.reduce.spawnLifecycle.batch.defaultTransitions": "spawn lifecycle batch default transitions",
  "entities.reduce.spawnLifecycle.batch.userReducer": "spawn lifecycle batch user reducer",
  "entities.reduce.spawnLifecycle.batch.postProcess": "spawn lifecycle batch post process",
  "entities.reduce.spawnLifecycle.batch.markTouched": "spawn lifecycle batch mark touched",
  "entities.reduce.spawnLifecycle.batch.scheduleEffects": "spawn lifecycle batch schedule effects",
  "entities.reduce.spawnLifecycle.batch.scheduleReactions": "spawn lifecycle batch schedule reactions",
  "entities.reduce.spawnLifecycle.batch.updateStateBuckets": "spawn lifecycle batch update state buckets",
  "entities.reduce.spawnLifecycle.reactions": "spawn lifecycle reactions",
  "entities.reduce.spawnLifecycle.reactions.captureScope": "spawn lifecycle reaction capture scope",
  "entities.reduce.spawnLifecycle.reactions.createDeps": "spawn lifecycle reaction deps",
  "entities.reduce.spawnLifecycle.reactions.user": "spawn lifecycle user reaction",
  "entities.reduce.spawnCleanup": "spawn cleanup",
  "entities.reduce.collectPublicBatches": "collect public batches",
  "entities.reduce.publicBatch.total": "public batch total",
  "entities.reduce.publicBatch.defaultTransitions": "public batch default transitions",
  "entities.reduce.publicBatch.userReducer": "public batch user reducer",
  "entities.reduce.publicBatch.postProcess": "public batch post process",
  "entities.reduce.publicBatch.markTouched": "public batch mark touched",
  "entities.reduce.publicBatch.scheduleEffects": "public batch schedule effects",
  "entities.reduce.publicBatch.scheduleReactions": "public batch schedule reactions",
  "entities.reduce.publicBatch.updateStateBuckets": "public batch update state buckets",
  "entities.reduce.publicCleanup": "public cleanup",
  "entities.cleanup.spawn.collectPlan": "spawn cleanup collect plan",
  "entities.cleanup.spawn.lifecycle": "spawn cleanup lifecycle",
  "entities.cleanup.spawn.removeActorRows": "spawn cleanup remove actor rows",
  "entities.cleanup.spawn.removeEntityRecords": "spawn cleanup remove entity records",
  "entities.cleanup.public.collectPlan": "public cleanup collect plan",
  "entities.cleanup.public.lifecycle": "public cleanup lifecycle",
  "entities.cleanup.public.removeActorRows": "public cleanup remove actor rows",
  "entities.cleanup.public.removeEntityRecords": "public cleanup remove entity records",
  "entities.commit.restorePublicSlices": "restore public slices",
  "entities.reactions.total": "entities reactions total",
  "entities.reactions.captureScope": "capture reaction scope",
  "entities.reactions.createDeps": "create reaction deps",
  "entities.reactions.user": "user reaction",
  "entities.effects.resolve": "resolve effects",
  "entities.effects.invoke": "invoke effects",
};

const coreBucketParentPrefixes = [
  ["core.bucket.prepareAction.", "core.prepareAction.total"],
  ["core.bucket.beforeReduce.", "core.beforeReduce.total"],
  ["core.bucket.reduce.", "core.rootReducer"],
  ["core.bucket.commit.", "core.commit.total"],
  ["core.bucket.reactions.", "core.reactions.total"],
  ["core.bucket.effects.resolve.", "core.effects.total"],
  ["core.bucket.effects.invoke.", "core.effects.total"],
];

export const parentKeyForTracePhase = (key) => {
  if (key === "core.transition.total") return undefined;
  if (topLevelCorePhaseKeys.includes(key)) return "core.transition.total";

  for (const [prefix, parentKey] of coreBucketParentPrefixes) {
    if (key.startsWith(prefix)) return parentKey;
  }

  if (key === "entities.prepare.transaction") return "core.bucket.prepareAction.entity";
  if (key === "entities.prepare.explicitDespawn") return "entities.prepare.transaction";
  if (key === "entities.spawn.stage") return "core.hooks.beforeReduce";
  if (key.startsWith("entities.spawn.stage.")) return "entities.spawn.stage";
  if (key === "entities.reduce.total") return "core.bucket.reduce.entity";
  if (
    [
      "entities.reduce.spawnLifecycle",
      "entities.reduce.spawnCleanup",
      "entities.reduce.collectPublicBatches",
      "entities.reduce.publicBatch.total",
      "entities.reduce.publicCleanup",
    ].includes(key)
  ) {
    return "entities.reduce.total";
  }
  if (
    [
      "entities.reduce.spawnLifecycle.applyStagedSpawns",
      "entities.reduce.spawnLifecycle.reduceBatches",
      "entities.reduce.spawnLifecycle.reactions",
    ].includes(key)
  ) {
    return "entities.reduce.spawnLifecycle";
  }
  if (key === "entities.reduce.spawnLifecycle.batch.total") {
    return "entities.reduce.spawnLifecycle.reduceBatches";
  }
  if (key.startsWith("entities.reduce.spawnLifecycle.batch.")) return "entities.reduce.spawnLifecycle.batch.total";
  if (key.startsWith("entities.reduce.spawnLifecycle.reactions.")) {
    return "entities.reduce.spawnLifecycle.reactions";
  }
  if (key.startsWith("entities.reduce.publicBatch.")) return "entities.reduce.publicBatch.total";
  if (key.startsWith("entities.cleanup.spawn.")) return "entities.reduce.spawnCleanup";
  if (key.startsWith("entities.cleanup.public.")) return "entities.reduce.publicCleanup";
  if (key === "entities.commit.restorePublicSlices") return "core.bucket.commit.entity";
  if (key === "entities.reactions.total") return "core.bucket.reactions.entity";
  if (["entities.reactions.captureScope", "entities.reactions.createDeps", "entities.reactions.user"].includes(key)) {
    return "entities.reactions.total";
  }
  if (key === "entities.effects.resolve") return "core.bucket.effects.resolve.entity";
  if (key === "entities.effects.invoke") return "core.bucket.effects.invoke.entity";

  return undefined;
};

const inferRuntimeKind = (key) => {
  for (const [prefix] of coreBucketParentPrefixes) {
    if (key.startsWith(prefix)) return key.slice(prefix.length);
  }
  return undefined;
};

const labelForPhase = (key) => {
  const runtimeKind = inferRuntimeKind(key);
  if (runtimeKind) return `${key.slice(0, -runtimeKind.length - 1)} (${runtimeKind})`;
  return phaseLabelOverrides[key] ?? key;
};

const sortNumbers = (values) => [...values].sort((left, right) => left - right);

const median = (sortedSamples) => {
  if (sortedSamples.length === 0) throw new Error("Cannot summarize an empty trace sample series.");
  const mid = Math.floor(sortedSamples.length / 2);
  return sortedSamples.length % 2 === 0 ? (sortedSamples[mid - 1] + sortedSamples[mid]) / 2 : sortedSamples[mid];
};

const percentile = (sortedSamples, rank) => {
  if (sortedSamples.length === 0) throw new Error("Cannot summarize an empty trace sample series.");
  const index = Math.min(sortedSamples.length - 1, Math.max(0, Math.ceil(sortedSamples.length * rank) - 1));
  return sortedSamples[index];
};

const relativeStdDev = (values) => {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
};

const summarizeSamples = (samples) => {
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

const sumRecordPhases = (record) => {
  const durations = new Map();
  const runtimeKinds = new Map();

  for (const phase of record.phases) {
    durations.set(phase.key, (durations.get(phase.key) ?? 0) + phase.durationMs);
    if (phase.runtimeKind !== undefined) runtimeKinds.set(phase.key, phase.runtimeKind);
  }

  return { durations, runtimeKinds };
};

const collectMeasuredTransitions = (records, actionType) =>
  records
    .filter((record) => record.actionType === actionType && record.depth === 0 && record.status === "ok")
    .map(sumRecordPhases);

const runWithCollector = (runner) => {
  const collector = { records: [] };
  globalThis[transitionTraceCollectorSymbol] = collector;
  try {
    runner.run();
  } finally {
    delete globalThis[transitionTraceCollectorSymbol];
  }
  return collector.records;
};

const runWarmup = (runner, operationsPerSample, selectedWarmupIterations) => {
  for (let sampleIndex = 0; sampleIndex < selectedWarmupIterations; sampleIndex += 1) {
    runner.beforeSample();
    for (let operationIndex = 0; operationIndex < operationsPerSample; operationIndex += 1) {
      runner.beforeOperation?.();
      runner.run();
      runner.afterOperation?.();
    }
    runner.afterSample();
  }
};

const collectTraceSamples = (
  runner,
  operationsPerSample,
  { actionType, measuredIterations: selectedMeasuredIterations, warmupIterations: selectedWarmupIterations },
) => {
  runWarmup(runner, operationsPerSample, selectedWarmupIterations);

  const transitions = [];
  for (let sampleIndex = 0; sampleIndex < selectedMeasuredIterations; sampleIndex += 1) {
    runner.beforeSample();
    for (let operationIndex = 0; operationIndex < operationsPerSample; operationIndex += 1) {
      runner.beforeOperation?.();
      transitions.push(...collectMeasuredTransitions(runWithCollector(runner), actionType));
      runner.afterOperation?.();
    }
    runner.afterSample();
  }

  return transitions;
};

const summarizeCoverage = (transitions, definition) => {
  const coverageSamples = [];
  const unattributedSamples = [];

  for (const transition of transitions) {
    const parentValue = transition.durations.get(definition.parentKey);
    if (parentValue === undefined || parentValue <= 0) continue;
    if (!definition.numeratorKeys.some((key) => transition.durations.has(key))) continue;

    const attributed = definition.numeratorKeys.reduce((sum, key) => sum + (transition.durations.get(key) ?? 0), 0);
    coverageSamples.push(attributed / parentValue);
    unattributedSamples.push(parentValue - attributed);
  }

  if (coverageSamples.length === 0) return undefined;

  return {
    key: definition.key,
    label: definition.label,
    parentKey: definition.parentKey,
    numeratorKeys: definition.numeratorKeys,
    ...summarizeSamples(coverageSamples),
    unattributed: summarizeSamples(unattributedSamples),
  };
};

const summarizeTransitions = (transitions) => {
  const phaseSamplesByKey = new Map();
  const percentOfTransitionByKey = new Map();
  const percentOfParentByKey = new Map();
  const runtimeKindsByKey = new Map();

  for (const transition of transitions) {
    const transitionTotal = transition.durations.get("core.transition.total");

    for (const [key, durationMs] of transition.durations) {
      pushSample(phaseSamplesByKey, key, durationMs);

      const runtimeKind = transition.runtimeKinds.get(key) ?? inferRuntimeKind(key);
      if (runtimeKind !== undefined) runtimeKindsByKey.set(key, runtimeKind);

      if (transitionTotal !== undefined && transitionTotal > 0 && topLevelCorePhaseKeys.includes(key)) {
        pushSample(percentOfTransitionByKey, key, durationMs / transitionTotal);
      }

      const parentKey = parentKeyForTracePhase(key);
      const parentDuration = parentKey ? transition.durations.get(parentKey) : undefined;
      if (parentDuration !== undefined && parentDuration > 0) {
        pushSample(percentOfParentByKey, key, durationMs / parentDuration);
      }
    }
  }

  const phases = Array.from(phaseSamplesByKey, ([key, samples]) => {
    const parentKey = parentKeyForTracePhase(key);
    const runtimeKind = runtimeKindsByKey.get(key);
    const percentOfTransitionSamples = percentOfTransitionByKey.get(key);
    const percentOfParentSamples = percentOfParentByKey.get(key);

    return {
      key,
      label: labelForPhase(key),
      ...(parentKey ? { parentKey } : {}),
      ...(runtimeKind !== undefined ? { runtimeKind } : {}),
      ...summarizeSamples(samples),
      ...(percentOfTransitionSamples
        ? { percentOfTransition: summarizeSamples(percentOfTransitionSamples).median }
        : {}),
      ...(percentOfParentSamples ? { percentOfParent: summarizeSamples(percentOfParentSamples).median } : {}),
    };
  });

  return {
    transitionCount: transitions.length,
    phases,
    coverage: coverageDefinitions.map((definition) => summarizeCoverage(transitions, definition)).filter(Boolean),
  };
};

const runTraceScenario = (definition, rowCount, config) => {
  const runner = definition.createEntityRunner(rowCount);
  const actionType = definition.actionType ?? tickActionType;
  const transitions = collectTraceSamples(runner, definition.operationsPerSample, {
    actionType,
    measuredIterations: config.measuredIterations,
    warmupIterations: config.warmupIterations,
  });
  if (transitions.length === 0) {
    throw new Error(`Trace scenario '${definition.key}' produced no measured '${actionType}' transitions.`);
  }
  const summary = summarizeTransitions(transitions);

  runner.read?.();

  return {
    key: definition.key,
    label: definition.label,
    kind: definition.kind,
    rowCount,
    ...(definition.actorRowsPerEntity
      ? {
          actorRowsPerEntity: definition.actorRowsPerEntity,
          actorRowCount: rowCount * definition.actorRowsPerEntity,
        }
      : {}),
    iterations: {
      warmup: config.warmupIterations,
      measured: config.measuredIterations,
      operationsPerSample: definition.operationsPerSample,
    },
    ...summary,
  };
};

export const runEntitiesTraceBenchmark = ({
  profile,
  benchmark: selectedBenchmark = benchmarkName,
  measuredIterations: selectedMeasuredIterations = measuredIterations,
  onScenarioStart,
  onScenarioEnd,
  rowCounts: selectedRowCounts = rowCounts,
  scenarioDefinitions: selectedScenarioDefinitions = scenarioDefinitions,
  warmupIterations: selectedWarmupIterations = warmupIterations,
} = {}) => {
  const scenarios = [];
  const config = {
    measuredIterations: selectedMeasuredIterations,
    warmupIterations: selectedWarmupIterations,
  };

  for (const definition of selectedScenarioDefinitions) {
    for (const rowCount of selectedRowCounts) {
      onScenarioStart?.(definition, rowCount);
      const scenario = runTraceScenario(definition, rowCount, config);
      scenarios.push(scenario);
      onScenarioEnd?.(scenario);
    }
  }

  return {
    benchmark: selectedBenchmark,
    profile: profile ?? "node",
    runtime: "production dist",
    rowCounts: selectedRowCounts,
    scenarios,
  };
};
