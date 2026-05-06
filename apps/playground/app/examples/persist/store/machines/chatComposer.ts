import { createMachine } from "../create-machine";
import type { ChatComposerContext } from "../types";

const initialContext: ChatComposerContext = {
  draft: "",
  lastSubmittedAt: null,
};

export const chatComposer = createMachine({
  config: {
    EMPTY: {
      DRAFT_CHANGED: "WRITING",
      DRAFT_CLEARED: null,
      MESSAGE_SENT: null,
      HISTORY_CLEARED: null,
    },
    WRITING: {
      DRAFT_CHANGED: null,
      DRAFT_CLEARED: "EMPTY",
      MESSAGE_SENT: "EMPTY",
      HISTORY_CLEARED: null,
    },
  },
  initialState: "EMPTY",
  initialContext,
  reducer: (state, action, { nextState }) => {
    switch (action.type) {
      case "DRAFT_CHANGED": {
        state.state = action.payload.value.trim() ? "WRITING" : "EMPTY";
        state.context.draft = action.payload.value;
        break;
      }
      case "DRAFT_CLEARED": {
        state.state = nextState;
        state.context.draft = "";
        break;
      }
      case "MESSAGE_SENT": {
        state.state = nextState;
        state.context.draft = "";
        state.context.lastSubmittedAt = action.payload.message.sentAt;
        break;
      }
    }
  },
});
