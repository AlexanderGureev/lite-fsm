import type { CanvasPeerId, CanvasPoint } from "../constants";
import { createMachine } from "../create-machine";

export type CanvasStrokeContext = {
  strokeId: string;
  authorId: CanvasPeerId;
  color: string;
  points: CanvasPoint[];
  startedAt: number;
  updatedAt: number;
};

const initialContext: CanvasStrokeContext = {
  strokeId: "",
  authorId: "alice",
  color: "#0066cc",
  points: [],
  startedAt: 0,
  updatedAt: 0,
};

const copyPoint = (point: CanvasPoint): CanvasPoint => ({ x: point.x, y: point.y });

const appendPoint = (points: CanvasPoint[], point: CanvasPoint) => {
  const prev = points.at(-1);
  if (prev && Math.hypot(prev.x - point.x, prev.y - point.y) < 1.5) return;
  points.push(copyPoint(point));
};

export const canvasStroke = createMachine({
  groupTag: "stroke",
  persistence: "snapshot",
  config: {
    __INIT: { STROKE_BEGIN: "DRAWING" },
    DRAWING: {
      STROKE_APPEND: null,
      STROKE_COMMIT: "COMMITTED",
      STROKE_REMOVE: "__CANCELLED",
    },
    COMMITTED: {
      STROKE_REMOVE: "__CANCELLED",
    },
  },
  initialState: "__INIT",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "STROKE_BEGIN": {
        state.context.strokeId = action.payload.strokeId;
        state.context.authorId = action.payload.authorId;
        state.context.color = action.payload.color;
        state.context.points = [action.payload.point];
        state.context.startedAt = action.payload.now;
        state.context.updatedAt = action.payload.now;
        break;
      }
      case "STROKE_APPEND": {
        appendPoint(state.context.points, action.payload.point);
        state.context.updatedAt = action.payload.now;
        break;
      }
      case "STROKE_COMMIT": {
        state.context.updatedAt = action.payload.now;
        break;
      }
      case "STROKE_REMOVE": {
        state.state = "__CANCELLED";
        break;
      }
    }
  },
  dehydrate: (slice) => ({
    state: slice.state,
    context: slice.context,
  }),
  hydrate: (_prev, snapshot) => ({
    state: snapshot.state,
    context: snapshot.context,
  }),
});
