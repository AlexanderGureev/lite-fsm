import { createMachine } from "../create-machine";
import type { ChatThreadContext } from "../types";

const maxMessages = 32;

const initialContext: ChatThreadContext = {
  messages: [],
  updatedAt: null,
  lastClearedAt: null,
};

export const chatThread = createMachine({
  config: {
    EMPTY: {
      MESSAGE_SENT: "ACTIVE",
      HISTORY_CLEARED: null,
    },
    ACTIVE: {
      MESSAGE_SENT: null,
      HISTORY_CLEARED: "EMPTY",
    },
  },
  initialState: "EMPTY",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "MESSAGE_SENT": {
        state.context.messages.push(action.payload.message);
        if (state.context.messages.length > maxMessages) {
          state.context.messages = state.context.messages.slice(-maxMessages);
        }
        state.context.updatedAt = action.payload.message.sentAt;
        break;
      }
      case "HISTORY_CLEARED": {
        state.context.messages = [];
        state.context.updatedAt = action.payload.clearedAt;
        state.context.lastClearedAt = action.payload.clearedAt;
        break;
      }
    }
  },
});
