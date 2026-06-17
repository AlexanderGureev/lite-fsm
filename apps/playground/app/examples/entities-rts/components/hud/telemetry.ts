"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { AppStore } from "../../store";
import type { MetricsAdapter, RtsMetricsSnapshot, RtsTimingStats } from "../../store/metrics";
import { readRtsEntityStats, readUnitViews, type RtsEntityStats } from "../../store/selectors";

const EMPTY_STATS: RtsEntityStats = {
  total: 0,
  allies: 0,
  enemies: 0,
  selected: 0,
  heroHp: 0,
  heroMaxHp: 0,
  heroAlive: false,
};

const EMPTY_TIMING_STATS: RtsTimingStats = {
  current: 0,
  min: 0,
  average: 0,
  max: 0,
};

const EMPTY_METRICS: RtsMetricsSnapshot = {
  version: 0,
  fps: EMPTY_TIMING_STATS,
  tick: EMPTY_TIMING_STATS,
  sync: EMPTY_TIMING_STATS,
  flowFieldRebuildMs: 0,
  spatialGridBuildMs: 0,
};

const ENTITY_STATS_READ_INTERVAL_MS = 360;

// Сводка сущностей опрашивается из committed columns с троттлингом через rAF,
// чтобы HUD не перечитывал тысячи строк каждый кадр симуляции.
export function useRtsEntityStats(manager: AppStore, enabled: boolean) {
  const [stats, setStats] = useState<RtsEntityStats>(EMPTY_STATS);

  useEffect(() => {
    if (!enabled) {
      setStats(EMPTY_STATS);
      return;
    }

    let frame = 0;
    let lastRead = 0;

    const readStats = (time: number) => {
      if (time - lastRead >= ENTITY_STATS_READ_INTERVAL_MS) {
        setStats(readRtsEntityStats(readUnitViews(manager)));
        lastRead = time;
      }

      frame = window.requestAnimationFrame(readStats);
    };

    setStats(readRtsEntityStats(readUnitViews(manager)));
    frame = window.requestAnimationFrame(readStats);

    return () => window.cancelAnimationFrame(frame);
  }, [enabled, manager]);

  return stats;
}

export function useRtsPerformanceMetrics(metrics: MetricsAdapter, enabled: boolean) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!enabled) return () => undefined;
      return metrics.subscribe(listener);
    },
    [enabled, metrics],
  );
  const getSnapshot = useCallback(() => (enabled ? metrics.getVersion() : 0), [enabled, metrics]);

  useSyncExternalStore(subscribe, getSnapshot, () => 0);

  return enabled ? metrics.readSnapshot() : EMPTY_METRICS;
}
