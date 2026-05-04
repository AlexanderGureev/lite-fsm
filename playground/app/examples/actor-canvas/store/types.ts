import type { FSMEvent, FSMEventMeta } from "lite-fsm";

import type { CanvasPeerId, CanvasPoint } from "./constants";

type StrokeBeginPayload = {
  strokeId: string;
  authorId: CanvasPeerId;
  color: string;
  point: CanvasPoint;
  now: number;
};

type StrokePointPayload = {
  point: CanvasPoint;
  now: number;
};

type StrokeCommitPayload = {
  now: number;
};

export type CanvasBoardContext = {
  activeActorId: string | null;
};

export type CanvasStrokeContext = {
  strokeId: string;
  authorId: CanvasPeerId;
  color: string;
  points: CanvasPoint[];
  startedAt: number;
  updatedAt: number;
};

export type PeerView = {
  id: CanvasPeerId;
  label: string;
};

export type CanvasSnapshot = {
  schemaVersion?: number;
  machines: Partial<{
    canvasNetwork: {
      state: "ONLINE";
      context: CanvasNetworkContext;
    };
    canvasStroke: Record<string, unknown>;
  }>;
};

export type SyncPacket = {
  from: CanvasPeerId;
  to: CanvasPeerId[];
  sentAt: number;
  actorCount: number;
  snapshot: CanvasSnapshot;
};

export type CanvasNetworkContext = {
  peers: PeerView[];
  lastPacket: SyncPacket | null;
};

export type CanvasPeerStore = {
  dehydrate(opts?: { machines?: ReadonlyArray<"canvasNetwork" | "canvasStroke"> }): CanvasSnapshot;
  hydrate(snapshot: CanvasSnapshot, opts?: { strategy?: "merge" | "replace" }): void;
};

export type AppEvents = (
  | FSMEvent<"DRAW_BEGIN", StrokeBeginPayload>
  | FSMEvent<"DRAW_MOVE", StrokePointPayload>
  | FSMEvent<"DRAW_END", StrokeCommitPayload>
  | FSMEvent<"PACKET_SENT", SyncPacket>
) & { meta?: FSMEventMeta };

export type AppDeps = {
  getPeerId: () => CanvasPeerId;
  getState: () => {
    canvasNetwork: {
      context: CanvasNetworkContext;
    };
  };
  getPeerStore: (peerId: CanvasPeerId) => CanvasPeerStore | null;
};
