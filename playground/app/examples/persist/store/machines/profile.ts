import type { FSMEvent } from "lite-fsm";

import { createMachine } from "../create-machine";

export type Event = FSMEvent<"FETCH_PROFILE_RESOLVE", { id: string }>;

export const profile = createMachine({
  config: {
    IDLE: {
      DO_INIT: "FETCH_PROFILE_PENDING",
    },
    FETCH_PROFILE_PENDING: {
      FETCH_PROFILE_RESOLVE: "READY",
    },
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
      // данные появляются раньше чем загрузится server component ServerLoad и при первом рендере Demo.tsx будет ошибка гидрации
      await new Promise((res) => setTimeout(res, 2000));
      transition({
        type: "FETCH_PROFILE_RESOLVE",
        payload: {
          id: "user",
        },
      });
    },
  },
});
