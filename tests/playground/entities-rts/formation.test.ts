import { describe, expect, it } from "vitest";

import { createFormationTargets } from "../../../apps/playground/app/examples/entities-rts/store/machines/unit-orders/formation";

describe("formation helper для RTS", () => {
  it("возвращает разные target positions для группы", () => {
    const targets = createFormationTargets({ x: 100, y: 200 }, 4, { spacing: 20 });
    const unique = new Set(Array.from({ length: targets.count }, (_, index) => `${targets.x[index]}:${targets.y[index]}`));

    expect(targets.count).toBe(4);
    expect(unique.size).toBe(4);
    expect(Array.from(targets.x)).toEqual([90, 110, 90, 110]);
    expect(Array.from(targets.y)).toEqual([190, 190, 210, 210]);
  });

  it("поддерживает пустую группу и нормализует дробный count", () => {
    expect(createFormationTargets({ x: 0, y: 0 }, 0).count).toBe(0);

    const targets = createFormationTargets({ x: 0, y: 0 }, 2.8);

    expect(targets.count).toBe(2);
    expect(Array.from(targets.x)).toEqual([-14, 14]);
    expect(Array.from(targets.y)).toEqual([0, 0]);
  });
});
