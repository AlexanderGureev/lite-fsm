// @ts-nocheck

import { createConfig, createMachine, createReducer } from "@/store/create-machine";

const initialContext = { initialized: false };

const config = createConfig({
  IDLE: {
    DO_INIT: "READY",
  },
  READY: {
    APP_MOUNTED: null,
  },
});

const reducer = createReducer<typeof config, typeof initialContext>((state, action, { nextState }) => {
  state.state = nextState;

  switch (action.type) {
    case "APP_MOUNTED":
      state.context.initialized = true;
      break;
  }
});

export const root = createMachine({
  config,
  initialState: "IDLE",
  initialContext,
  reducer,
  effects: {
    READY: ({ transition }) => {
      transition({ type: "APP_MOUNTED" });
    },
  },
});
