import { createMachine } from "../create-machine";
import type { ChatSessionContext } from "../types";

const initialContext: ChatSessionContext = {
  peer: {
    id: "booting",
    name: "Tab",
    shortName: "T",
    color: "#5d5d66",
  },
  openedAt: null,
};

export const chatSession = createMachine({
  config: {
    BOOTING: {
      SESSION_STARTED: "ONLINE",
    },
    ONLINE: {
      SESSION_STARTED: null,
    },
  },
  initialState: "BOOTING",
  initialContext,
  reducer: (state, action, { nextState }) => {
    switch (action.type) {
      case "SESSION_STARTED": {
        state.state = nextState;
        state.context.peer = action.payload.peer;
        state.context.openedAt = action.payload.openedAt;
        break;
      }
    }
  },
});
