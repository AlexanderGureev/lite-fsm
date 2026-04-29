import type { FSMEvent } from "lite-fsm";

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

export type AppEvents =
  | FSMEvent<"STROKE_BEGIN", StrokeBeginPayload>
  | FSMEvent<"STROKE_APPEND", StrokePointPayload>
  | FSMEvent<"STROKE_COMMIT", StrokeCommitPayload>
  | FSMEvent<"STROKE_REMOVE">;

export type AppDeps = Record<string, never>;
