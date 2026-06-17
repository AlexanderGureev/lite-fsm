import { describe, expect, it } from "vitest";

import { makeStore } from "../../../apps/playground/app/examples/entities-rts/store";
import {
  createCumulativeMetric,
  createRtsMetricsAdapter,
} from "../../../apps/playground/app/examples/entities-rts/store/metrics";

describe("metrics helper для RTS", () => {
  it("считает current, min, average и max за весь запуск", () => {
    const metric = createCumulativeMetric();

    metric.record(2);
    metric.record(4);
    metric.record(6);

    expect(metric.read()).toEqual({ current: 6, min: 2, average: 4, max: 6 });

    metric.record(8);

    expect(metric.read()).toEqual({ current: 8, min: 2, average: 5, max: 8 });
  });

  it("сохраняет max за весь запуск после меньших значений", () => {
    const metric = createCumulativeMetric();

    metric.record(10);
    metric.record(4);
    metric.record(3);

    const stats = metric.read();

    expect(stats.current).toBe(3);
    expect(stats.min).toBe(3);
    expect(stats.average).toBeCloseTo(17 / 3);
    expect(stats.max).toBe(10);
  });

  it("сохраняет min за весь запуск после больших значений", () => {
    const metric = createCumulativeMetric();

    metric.record(3);
    metric.record(8);
    metric.record(10);

    expect(metric.read()).toEqual({ current: 10, min: 3, average: 7, max: 10 });
  });

  it("нормализует нечисловые и отрицательные значения", () => {
    const metric = createCumulativeMetric();

    metric.record(Number.NaN);
    metric.record(-5);

    expect(metric.read()).toEqual({ current: 0, min: 0, average: 0, max: 0 });
  });

  it("сбрасывает накопленную статистику перед новым запуском", () => {
    const metric = createCumulativeMetric();

    metric.record(10);
    metric.record(20);
    metric.reset();

    expect(metric.read()).toEqual({ current: 0, min: 0, average: 0, max: 0 });

    metric.record(5);

    expect(metric.read()).toEqual({ current: 5, min: 5, average: 5, max: 5 });
  });

  it("очищает адаптер метрик на GAME_START", () => {
    const metrics = createRtsMetricsAdapter(() => 0);
    const manager = makeStore({
      metrics,
      random: () => 0,
      renderer: { reset: () => undefined },
    });

    metrics.recordFrame(10);
    metrics.recordTickMs(4);
    metrics.recordSyncMs(6);
    metrics.recordSimulationMetrics({ flowFieldRebuildMs: 7, spatialGridBuildMs: 8 });

    const versionBeforeStart = metrics.getVersion();

    manager.transition({ type: "GAME_START", payload: { enemyCount: 0, allyCount: 1, seed: "metrics-reset" } });

    expect(metrics.readSnapshot()).toMatchObject({
      fps: { current: 0, min: 0, average: 0, max: 0 },
      tick: { current: 0, min: 0, average: 0, max: 0 },
      sync: { current: 0, min: 0, average: 0, max: 0 },
      flowFieldRebuildMs: 0,
      spatialGridBuildMs: 0,
    });
    expect(metrics.getVersion()).toBeGreaterThan(versionBeforeStart);
  });
});
