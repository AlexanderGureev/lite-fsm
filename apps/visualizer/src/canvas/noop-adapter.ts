import type { CanvasAdapter, CanvasState } from "./types";

export const createNoopCanvasAdapter = (): CanvasAdapter => ({ kind: "none" });

export const createInitialCanvasState = (): CanvasState => ({
  adapter: createNoopCanvasAdapter(),
  items: [],
});
