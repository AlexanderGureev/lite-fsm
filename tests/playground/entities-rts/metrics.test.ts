import { describe, expect, it } from "vitest";

import { createRollingMetric } from "../../../apps/playground/app/examples/entities-rts/store/metrics";

describe("metrics helper для RTS", () => {
  it("считает current, rolling average и max в пределах окна", () => {
    const metric = createRollingMetric(3);

    metric.record(2);
    metric.record(4);
    metric.record(6);

    expect(metric.read()).toEqual({ current: 6, average: 4, max: 6 });

    metric.record(8);

    expect(metric.read()).toEqual({ current: 8, average: 6, max: 8 });
  });

  it("пересчитывает max после вытеснения старого значения", () => {
    const metric = createRollingMetric(2);

    metric.record(10);
    metric.record(4);
    metric.record(3);

    expect(metric.read()).toEqual({ current: 3, average: 3.5, max: 4 });
  });

  it("нормализует нечисловые и отрицательные значения", () => {
    const metric = createRollingMetric(2);

    metric.record(Number.NaN);
    metric.record(-5);

    expect(metric.read()).toEqual({ current: 0, average: 0, max: 0 });
  });
});
