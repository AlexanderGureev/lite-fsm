import type { FSMEvent } from "lite-fsm";

import { createMachine } from "../create-machine";

export type Event = FSMEvent<"FETCH_PROFILE_RESOLVE", { id: string }>;

export const profile = createMachine({
  config: {
    "*": { FETCH_PROFILE_RESOLVE: "READY" },
    IDLE: {
      DO_INIT: "FETCH_PROFILE_PENDING",
    },
    FETCH_PROFILE_PENDING: {},
    READY: {},
  },
  initialState: "IDLE",
  initialContext: {
    id: "",
  },
  reducer: (s, action, { nextState }) => {
    s.state = nextState;

    switch (action.type) {
      case "FETCH_PROFILE_RESOLVE":
        s.context = action.payload;
        break;
    }
  },
  effects: {
    FETCH_PROFILE_PENDING: async ({ transition }) => {
      // Данные появляются раньше, чем загрузится ServerLoad; useSelector должен гидрировать Demo по server snapshot.
      await new Promise((res) => setTimeout(res, 3000));
      transition({
        type: "FETCH_PROFILE_RESOLVE",
        payload: {
          id: "user-client",
        },
      });
    },
  },
});
