import type { RtsSimulationMetrics } from "./machines/rts-spatial-index";

export const RTS_METRICS_WINDOW = 120;

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
  publish(now?: number): void;
  getVersion(): number;
  readSnapshot(): RtsMetricsSnapshot;
  subscribe(listener: () => void): () => void;
};

type RollingMetric = {
  record(value: number): void;
  read(): RtsTimingStats;
};

const normalizeMetricValue = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
};

export const createRollingMetric = (windowSize = RTS_METRICS_WINDOW): RollingMetric => {
  const size = Math.max(1, Math.trunc(windowSize));
  const values = new Float32Array(size);
  const stats: RtsTimingStats = {
    current: 0,
    min: 0,
    average: 0,
    max: 0,
  };
  let cursor = 0;
  let count = 0;
  let sum = 0;

  const recomputeBounds = () => {
    let min = values[0];
    let max = values[0];

    for (let index = 1; index < count; index += 1) {
      const value = values[index];
      if (value < min) min = value;
      if (value > max) max = value;
    }

    stats.min = min;
    stats.max = max;
  };

  return {
    record(value) {
      const next = normalizeMetricValue(value);
      const full = count === size;
      const previous = full ? values[cursor] : 0;

      values[cursor] = next;
      cursor = (cursor + 1) % size;
      if (count < size) count += 1;

      sum += next - previous;
      stats.current = next;
      stats.average = sum / count;

      if (count === 1) {
        stats.min = next;
        stats.max = next;
        return;
      }

      if (next > stats.max) stats.max = next;
      if (next < stats.min) stats.min = next;

      if (full && (previous >= stats.max || previous <= stats.min)) recomputeBounds();
    },
    read() {
      return stats;
    },
  };
};

// Local example note: the stress surface is one batched entity-storage TICK over
// thousands of rows, lifecycle cleanup, combat writes and Phaser reads from committed columns.
export const createRtsMetricsAdapter = (now: () => number, notifyIntervalMs = 120): MetricsAdapter => {
  const fps = createRollingMetric();
  const tick = createRollingMetric();
  const sync = createRollingMetric();
  const listeners = new Set<() => void>();
  const snapshot: RtsMetricsSnapshot = {
    version: 0,
    fps: fps.read(),
    tick: tick.read(),
    sync: sync.read(),
    flowFieldRebuildMs: 0,
    spatialGridBuildMs: 0,
  };
  let lastPublishedAt = 0;

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
    publish(publishedAt = now()) {
      if (snapshot.version > 0 && publishedAt - lastPublishedAt < notifyIntervalMs) return;

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
