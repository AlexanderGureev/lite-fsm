import type { CanvasAdapter, CanvasState } from "./types";

export const createNoopCanvasAdapter = (): CanvasAdapter => ({ kind: "none" });

const createMachineCanvasAdapter = (): CanvasAdapter => ({ kind: "machine-canvas" });

export const createInitialCanvasState = (): CanvasState => ({
  adapter: createNoopCanvasAdapter(),
  items: [],
});

export const openMachineBoard = (
  canvas: CanvasState,
  sourceVersion: number,
  machineId: string,
): CanvasState => {
  if (
    canvas.adapter.kind === "machine-canvas" &&
    canvas.machineBoard?.sourceVersion === sourceVersion &&
    canvas.machineBoard.machineId === machineId
  ) {
    return canvas;
  }

  return {
    ...canvas,
    adapter: createMachineCanvasAdapter(),
    machineBoard: { sourceVersion, machineId },
  };
};

export const closeMachineBoard = (canvas: CanvasState): CanvasState => {
  if (canvas.adapter.kind === "none" && !canvas.machineBoard) return canvas;

  const { machineBoard: _machineBoard, ...rest } = canvas;

  return {
    ...rest,
    adapter: createNoopCanvasAdapter(),
  };
};

export const clearCanvasOnPipelineInvalidation = (canvas: CanvasState): CanvasState =>
  closeMachineBoard(canvas);
