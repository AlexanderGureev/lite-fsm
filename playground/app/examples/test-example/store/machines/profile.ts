import type { FSMEvent } from "lite-fsm";

import { createMachine } from "../create-machine";

export type Event = FSMEvent<"SUBSCRIPTION_HYDRATED">;

export const profile = createMachine({
  config: {
    IDLE: {},
    READY: {},
  },
  initialState: "IDLE",
  initialContext: {
    loadedAt: null as null | string,
    requestId: null as null | string,
    subscription: null as null | { id: string },
  },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;
  },
  effects: {},
});
