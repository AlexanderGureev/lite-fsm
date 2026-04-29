export const CANVAS_WORLD = {
  width: 680,
  height: 420,
} as const;

export type CanvasPeerId = "alice" | "bob";

export type CanvasPoint = {
  x: number;
  y: number;
};

export const peerColors: Record<CanvasPeerId, string> = {
  alice: "#0066cc",
  bob: "#1d1d1f",
};
