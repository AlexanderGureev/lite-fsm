import type { RtsSimulationMetrics } from "./machines/rts-spatial-index";

export type RtsTimingStats = {
  current: number;
  min: number;
  average: number;
  max: number;
};

export type RtsMetricsSnapshot = {
  version: number;
  fps: RtsTimingStats;
  tick: RtsTimingStats;
  sync: RtsTimingStats;
  flowFieldRebuildMs: number;
  spatialGridBuildMs: number;
};

export type MetricsAdapter = {
  now(): number;
  recordFrame(deltaMs: number): void;
  recordTickMs(durationMs: number): void;
  recordSyncMs(durationMs: number): void;
  recordSimulationMetrics(metrics: RtsSimulationMetrics): void;
  reset(): void;
  publish(now?: number): void;
  getVersion(): number;
  readSnapshot(): RtsMetricsSnapshot;
  subscribe(listener: () => void): () => void;
};

type CumulativeMetric = {
  record(value: number): void;
  reset(): void;
  read(): RtsTimingStats;
};

const normalizeMetricValue = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
};

export const createCumulativeMetric = (): CumulativeMetric => {
  const stats: RtsTimingStats = {
    current: 0,
    min: 0,
    average: 0,
    max: 0,
  };
  let count = 0;
  let sum = 0;

  const reset = () => {
    count = 0;
    sum = 0;
    stats.current = 0;
    stats.min = 0;
    stats.average = 0;
    stats.max = 0;
  };

  return {
    record(value) {
      const next = normalizeMetricValue(value);

      count += 1;
      sum += next;
      stats.current = next;
      stats.average = sum / count;

      if (count === 1) {
        stats.min = next;
        stats.max = next;
        return;
      }

      if (next > stats.max) stats.max = next;
      if (next < stats.min) stats.min = next;
    },
    reset,
    read() {
      return stats;
    },
  };
};

const resetSnapshotMetrics = (snapshot: RtsMetricsSnapshot) => {
  snapshot.flowFieldRebuildMs = 0;
  snapshot.spatialGridBuildMs = 0;
};

export const createRollingMetric = (_windowSize?: number) => createCumulativeMetric();

// Local example note: the stress surface is one batched entity-storage TICK over
// thousands of rows, lifecycle cleanup, combat writes and Phaser reads from committed columns.
export const createRtsMetricsAdapter = (now: () => number, notifyIntervalMs = 120): MetricsAdapter => {
  const fps = createCumulativeMetric();
  const tick = createCumulativeMetric();
  const sync = createCumulativeMetric();
  const listeners = new Set<() => void>();
  const snapshot: RtsMetricsSnapshot = {
    version: 0,
    fps: fps.read(),
    tick: tick.read(),
    sync: sync.read(),
    flowFieldRebuildMs: 0,
    spatialGridBuildMs: 0,
  };
  let lastPublishedAt = Number.NEGATIVE_INFINITY;

  const notify = () => {
    snapshot.version += 1;

    for (const listener of listeners) listener();
  };

  return {
    now,
    recordFrame(deltaMs) {
      fps.record(deltaMs > 0 ? 1_000 / deltaMs : 0);
    },
    recordTickMs(durationMs) {
      tick.record(durationMs);
    },
    recordSyncMs(durationMs) {
      sync.record(durationMs);
    },
    recordSimulationMetrics(metrics) {
      snapshot.flowFieldRebuildMs = metrics.flowFieldRebuildMs;
      snapshot.spatialGridBuildMs = metrics.spatialGridBuildMs;
    },
    reset() {
      fps.reset();
      tick.reset();
      sync.reset();
      resetSnapshotMetrics(snapshot);
      lastPublishedAt = Number.NEGATIVE_INFINITY;
      notify();
    },
    publish(publishedAt = now()) {
      if (publishedAt - lastPublishedAt < notifyIntervalMs) return;

      lastPublishedAt = publishedAt;
      notify();
    },
    getVersion() {
      return snapshot.version;
    },
    readSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
