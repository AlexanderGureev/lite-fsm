// @ts-nocheck

import { createConfig, createEffect, createMachine } from "@/store/create-machine";

const config = createConfig({
  READY: {
    NAVIGATION_EVENT_SEND: null,
  },
});

const NAVIGATION_EVENT_SEND = createEffect<typeof config, "NAVIGATION_EVENT_SEND">({
  type: "NAVIGATION_EVENT_SEND",
  effect: ({ transition }) => {
    transition({ type: "NAVIGATION_EVENT_SEND" });
  },
});

export const eventNavigation = createMachine({
  config,
  initialState: "READY",
  initialContext: {},
  effects: {
    READY: NAVIGATION_EVENT_SEND,
  },
});
