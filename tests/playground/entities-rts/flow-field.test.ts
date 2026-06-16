import { describe, expect, it } from "vitest";

import {
  createFlowField,
  flowCellIndexForPoint,
  readFlowDirection,
} from "../../../apps/playground/app/examples/entities-rts/store/machines/rts-spatial-index/flow-field";

describe("flow field для RTS", () => {
  it("строит плотное поле направлений к клетке героя", () => {
    const field = createFlowField({ width: 64, height: 64, cellSize: 16 }, { x: 32, y: 32 });
    const out = { x: 0, y: 0 };

    expect(field.columns).toBe(4);
    expect(field.rows).toBe(4);
    expect(field.targetCell).toBe(10);

    readFlowDirection(field, { x: 0, y: 0 }, out);
    expect(out.x).toBeCloseTo(Math.SQRT1_2);
    expect(out.y).toBeCloseTo(Math.SQRT1_2);

    readFlowDirection(field, { x: 32, y: 32 }, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it("зажимает координаты к границам сетки", () => {
    const field = createFlowField({ width: 40, height: 40, cellSize: 16 }, { x: -10, y: -10 });
    const out = { x: 0, y: 0 };

    expect(field.columns).toBe(3);
    expect(field.rows).toBe(3);
    expect(field.targetCell).toBe(0);
    expect(flowCellIndexForPoint(field, { x: 999, y: 999 })).toBe(8);

    readFlowDirection(field, { x: 999, y: 999 }, out);
    expect(out.x).toBeLessThan(0);
    expect(out.y).toBeLessThan(0);
  });

  it("отклоняет невалидную конфигурацию", () => {
    expect(() => createFlowField({ width: 0, height: 32, cellSize: 16 }, { x: 0, y: 0 })).toThrow(
      "flow field config expects positive width, height and cellSize",
    );
  });
});
