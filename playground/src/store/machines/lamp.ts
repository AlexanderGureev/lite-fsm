import type { FSMEvent } from "lite-fsm";

import { createMachine } from "../create-machine";

export type LampEvent = FSMEvent<"TURN_ON"> | FSMEvent<"TURN_OFF"> | FSMEvent<"RESET">;

export const lamp = createMachine({
  config: {
    OFF: {
      TURN_ON: "ON",
      RESET: "OFF",
    },
    ON: {
      TURN_OFF: "OFF",
      RESET: "OFF",
    },
  },
  initialState: "OFF",
  initialContext: {
    toggleCount: 0,
  },
  reducer: (state, event, { nextState }) => {
    state.state = nextState;

    if (event.type === "RESET") {
      state.context.toggleCount = 0;
      return;
    }

    state.context.toggleCount += 1;
  },
});
