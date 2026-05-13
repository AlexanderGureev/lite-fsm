// @ts-nocheck

import { createMachine } from "@/store/create-machine";

export const theme = createMachine({
  config: {
    IDLE: {
      SET_THEME: null,
    },
  },
  initialState: "IDLE",
  initialContext: { theme: "theme-light" },
  reducer: (state, action) => {
    if (action.type === "SET_THEME") state.context.theme = action.payload.theme;
  },
});
