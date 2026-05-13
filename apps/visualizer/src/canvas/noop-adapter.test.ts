import { describe, expect, it } from "vitest";
import {
  clearCanvasOnPipelineInvalidation,
  closeMachineBoard,
  createInitialCanvasState,
  createNoopCanvasAdapter,
  openMachineBoard,
} from "./noop-adapter";
import type { CanvasState } from "./types";

const item = { kind: "diagnostic" as const, diagnosticId: "diagnostic:1" };

describe("machine canvas state helpers", () => {
  it("создает пустой adapter и initial state", () => {
    expect(createNoopCanvasAdapter()).toEqual({ kind: "none" });
    expect(createInitialCanvasState()).toEqual({ adapter: { kind: "none" }, items: [] });
  });

  it("открывает board и сохраняет canvas items", () => {
    const canvas: CanvasState = { adapter: { kind: "none" }, items: [item] };

    expect(openMachineBoard(canvas, 7, "player")).toEqual({
      adapter: { kind: "machine-canvas" },
      items: [item],
      machineBoard: { sourceVersion: 7, machineId: "player" },
    });
  });

  it("возвращает тот же canvas при повторном открытии той же board", () => {
    const canvas = openMachineBoard(createInitialCanvasState(), 7, "player");

    expect(openMachineBoard(canvas, 7, "player")).toBe(canvas);
  });

  it("заменяет board при смене source version или machine id", () => {
    const canvas = openMachineBoard({ adapter: { kind: "none" }, items: [item] }, 7, "player");
    const nextVersion = openMachineBoard(canvas, 8, "player");
    const nextMachine = openMachineBoard(nextVersion, 8, "queue");

    expect(nextVersion).not.toBe(canvas);
    expect(nextVersion).toMatchObject({ machineBoard: { sourceVersion: 8, machineId: "player" } });
    expect(nextVersion.items).toBe(canvas.items);
    expect(nextMachine).not.toBe(nextVersion);
    expect(nextMachine).toMatchObject({ machineBoard: { sourceVersion: 8, machineId: "queue" } });
    expect(nextMachine.items).toBe(canvas.items);
  });

  it("закрывает board, удаляет optional board field и сохраняет canvas items", () => {
    const canvas = openMachineBoard({ adapter: { kind: "none" }, items: [item] }, 7, "player");
    const closed = closeMachineBoard(canvas);

    expect(closed).toEqual({ adapter: { kind: "none" }, items: [item] });
    expect(closed).not.toHaveProperty("machineBoard");
    expect(closed.items).toBe(canvas.items);
  });

  it("возвращает тот же canvas при повторном закрытии пустой board", () => {
    const canvas = createInitialCanvasState();

    expect(closeMachineBoard(canvas)).toBe(canvas);
    expect(clearCanvasOnPipelineInvalidation(canvas)).toBe(canvas);
  });

  it("очищает неконсистентный board state при invalidation", () => {
    const staleBoard: CanvasState = {
      adapter: { kind: "none" },
      items: [item],
      machineBoard: { sourceVersion: 7, machineId: "player" },
    };
    const staleAdapter: CanvasState = {
      adapter: { kind: "machine-canvas" },
      items: [item],
    };

    expect(clearCanvasOnPipelineInvalidation(staleBoard)).toEqual({ adapter: { kind: "none" }, items: [item] });
    expect(clearCanvasOnPipelineInvalidation(staleAdapter)).toEqual({ adapter: { kind: "none" }, items: [item] });
  });
});
