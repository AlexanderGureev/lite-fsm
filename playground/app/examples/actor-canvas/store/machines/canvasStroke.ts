import { createMachine } from "../create-machine";
import type { CanvasStrokeContext } from "../types";

const initialContext: CanvasStrokeContext = {
  strokeId: "",
  authorId: "alice",
  color: "#0066cc",
  points: [],
  startedAt: 0,
  updatedAt: 0,
};

export const canvasStroke = createMachine({
  groupTag: "stroke",
  persistence: "snapshot",
  config: {
    __INIT: { DRAW_BEGIN: "DRAWING" },
    DRAWING: {
      DRAW_MOVE: null,
      DRAW_END: "COMMITTED",
    },
    COMMITTED: {},
  },
  initialState: "__INIT",
  initialContext,
  reducer: (state, action, { nextState }) => {
    switch (action.type) {
      case "DRAW_BEGIN": {
        state.state = nextState;
        state.context.strokeId = action.payload.strokeId;
        state.context.authorId = action.payload.authorId;
        state.context.color = action.payload.color;
        state.context.points = [action.payload.point];
        state.context.startedAt = action.payload.now;
        state.context.updatedAt = action.payload.now;
        break;
      }
      case "DRAW_MOVE": {
        const prev = state.context.points.at(-1);
        if (prev && Math.hypot(prev.x - action.payload.point.x, prev.y - action.payload.point.y) < 1.5) return;

        state.state = nextState;
        state.context.points.push({ x: action.payload.point.x, y: action.payload.point.y });
        state.context.updatedAt = action.payload.now;
        break;
      }
      case "DRAW_END": {
        state.state = nextState;
        state.context.updatedAt = action.payload.now;
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
