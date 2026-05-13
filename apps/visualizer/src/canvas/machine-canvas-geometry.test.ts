import { describe, expect, it } from "vitest";
import {
  clampMachineCanvasLabelT,
  estimateMachineCanvasLabelBox,
  machineCanvasDirectRoute,
  machineCanvasPolylinePointAt,
  machineCanvasRoundedPolylinePath,
  machineCanvasSelfLoopPath,
  resolveMachineCanvasLabelCollisions,
} from "./machine-canvas-geometry";

describe("геометрия machine canvas", () => {
  it("ограничивает label t и выбирает точку на polyline", () => {
    expect(clampMachineCanvasLabelT(-1)).toBe(0.1);
    expect(clampMachineCanvasLabelT(0.4)).toBe(0.4);
    expect(clampMachineCanvasLabelT(2)).toBe(0.9);
    expect(machineCanvasPolylinePointAt([], 0.5)).toEqual({ x: 0, y: 0 });
    expect(machineCanvasPolylinePointAt([{ x: 5, y: 7 }], 0.5)).toEqual({ x: 5, y: 7 });
    expect(machineCanvasPolylinePointAt([{ x: 0, y: 0 }, { x: 100, y: 0 }], 0.5)).toEqual({ x: 50, y: 0 });
    expect(machineCanvasPolylinePointAt([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 20 }], 0.5)).toEqual({ x: 0, y: 10 });
    expect(machineCanvasPolylinePointAt([{ x: 0, y: 0 }, { x: 20, y: 0 }], 2)).toEqual({ x: 20, y: 0 });
    expect(machineCanvasPolylinePointAt([{ x: 0, y: 0 }, { x: 20, y: 0 }], Number.NaN)).toEqual({ x: 20, y: 0 });
  });

  it("строит rounded polyline path и direct fallback route", () => {
    expect(machineCanvasRoundedPolylinePath([{ x: 0, y: 0 }])).toBe("");
    expect(
      machineCanvasRoundedPolylinePath([
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ], 10),
    ).toBe("M 0 0 L 30 0 Q 40 0, 40 10 L 40 40");
    expect(
      machineCanvasRoundedPolylinePath([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ], 10),
    ).toBe("M 0 0 L 0 0 Q 0 0, 0 0 L 0 0");
    expect(
      machineCanvasDirectRoute({
        sourcePosition: { x: 10, y: 20 },
        sourceSize: { width: 160, height: 70 },
        targetPosition: { x: 300, y: 40 },
        targetSize: { width: 160, height: 90 },
      }),
    ).toEqual([
      { x: 170, y: 55 },
      { x: 300, y: 85 },
    ]);
  });

  it("оценивает label box и сдвигает colliding labels в bounds", () => {
    expect(estimateMachineCanvasLabelBox("START")).toEqual({ width: 46, height: 18 });
    expect(estimateMachineCanvasLabelBox("X".repeat(80)).width).toBe(170);

    const clear = resolveMachineCanvasLabelCollisions([
      { edgeId: "a", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], t: 0.2, width: 20, height: 18 },
      { edgeId: "b", points: [{ x: 0, y: 40 }, { x: 100, y: 40 }], t: 0.2, width: 20, height: 18 },
    ]);
    expect(clear.get("a")).toBe(0.2);
    expect(clear.get("b")).toBe(0.2);

    const shifted = resolveMachineCanvasLabelCollisions([
      { edgeId: "a", points: [{ x: 0, y: 0 }, { x: 500, y: 0 }], t: 0.5, width: 40, height: 18 },
      { edgeId: "b", points: [{ x: 0, y: 0 }, { x: 500, y: 0 }], t: 0.5, width: 40, height: 18 },
    ]);
    expect(shifted.get("a")).toBe(0.5);
    expect(shifted.get("b")).not.toBe(0.5);
    expect(shifted.get("b")).toBeGreaterThanOrEqual(0.1);
    expect(shifted.get("b")).toBeLessThanOrEqual(0.9);

    const bounded = resolveMachineCanvasLabelCollisions([
      { edgeId: "a", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], t: 0.95, width: 200, height: 18 },
      { edgeId: "b", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], t: 0.95, width: 200, height: 18 },
    ]);
    expect(bounded.get("a")).toBe(0.9);
    expect(bounded.get("b")).toBe(0.9);

    const awayFromNode = resolveMachineCanvasLabelCollisions(
      [{ edgeId: "a", points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], t: 0.5, width: 40, height: 18 }],
      [{ x: 130, y: -20, width: 40, height: 40 }],
    );
    expect(awayFromNode.get("a")).not.toBe(0.5);
  });

  it("строит deterministic self-loop stack", () => {
    expect(
      machineCanvasSelfLoopPath({
        sourceX: 260,
        sourceY: 135,
        nodeSize: { width: 160, height: 70 },
        index: 0,
      }),
    ).toEqual({
      path: "M 172 100 C 172 72, 188 72, 188 100",
      labelPoint: { x: 180, y: 62 },
    });
    expect(
      machineCanvasSelfLoopPath({
        sourceX: 260,
        sourceY: 135,
        nodeSize: { width: 160, height: 70 },
        index: 1,
      }).labelPoint,
    ).toEqual({ x: 180, y: 40 });
  });
});
