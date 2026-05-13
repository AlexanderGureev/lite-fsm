// @ts-nocheck

import { createConfig, createMachine } from "@/store/create-machine";

const config = createConfig({
  READY: {
    NAVIGATE: null,
  },
});

export const router = createMachine({
  config,
  initialState: "READY",
  initialContext: { path: "/" },
  reducer: (state, action) => {
    if (action.type === "NAVIGATE") state.context.path = action.payload.path;
  },
});
