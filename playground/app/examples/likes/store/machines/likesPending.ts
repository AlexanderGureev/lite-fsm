import { createMachine } from "../create-machine";

export const likesPending = createMachine({
  config: {
    "*": {
      LIKE: "SYNC_LIKE_STATE_PENDING",
      DISLIKE: "SYNC_LIKE_STATE_PENDING",
      SYNC_LIKE_STATE_RESOLVE: "IDLE",
      SYNC_LIKE_STATE_REJECT: "IDLE",
    },
    IDLE: {},
    SYNC_LIKE_STATE_PENDING: {},
  },
  initialState: "IDLE",
  initialContext: {
    pendingCount: 0,
  },
  reducer: (state, action) => {
    switch (action.type) {
      case "LIKE":
      case "DISLIKE":
        state.context.pendingCount += 1;
        state.state = "SYNC_LIKE_STATE_PENDING";
        break;

      case "SYNC_LIKE_STATE_RESOLVE":
      case "SYNC_LIKE_STATE_REJECT":
        state.context.pendingCount = Math.max(0, state.context.pendingCount - 1);
        state.state = state.context.pendingCount > 0 ? "SYNC_LIKE_STATE_PENDING" : "IDLE";
        break;
    }
  },
});
