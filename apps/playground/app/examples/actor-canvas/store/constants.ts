export const CANVAS_WORLD = {
  width: 680,
  height: 420,
} as const;

export type CanvasPeerId = string;

export type CanvasPoint = {
  x: number;
  y: number;
};

export const createStrokeActorId = (peerId: CanvasPeerId, strokeId: string): string => `${peerId}#stroke/${strokeId}`;

const peerColors: Record<string, string> = {
  alice: "#0066cc",
  bob: "#1d1d1f",
};

export const getPeerColor = (peerId: CanvasPeerId): string => peerColors[peerId] ?? "#0066cc";
