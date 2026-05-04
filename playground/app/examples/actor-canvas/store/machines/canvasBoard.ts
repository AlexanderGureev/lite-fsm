import { createStrokeActorId } from "../constants";
import { createMachine } from "../create-machine";
import type { CanvasBoardContext } from "../types";

const initialContext: CanvasBoardContext = {
  activeActorId: null,
};

export const canvasBoard = createMachine({
  config: {
    SYNCED: {
      DRAW_BEGIN: "DRAWING",
      DRAW_END: null,
    },
    DRAWING: {
      DRAW_MOVE: null,
      DRAW_END: "SYNCED",
    },
  },
  initialState: "SYNCED",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "DRAW_BEGIN": {
        state.context.activeActorId = createStrokeActorId(action.payload.authorId, action.payload.strokeId);
        break;
      }
      case "DRAW_END": {
        state.context.activeActorId = null;
        break;
      }
    }
  },
});
