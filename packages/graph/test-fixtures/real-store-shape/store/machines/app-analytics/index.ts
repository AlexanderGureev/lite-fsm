// @ts-nocheck

import { createMachine } from "@/store/create-machine";
import { uiButtonClickEffect } from "./effects/ui-button-click";

export const appAnalytics = createMachine({
  config: {
    READY: {
      UI_BUTTON_CLICK: null,
    },
  },
  initialState: "READY",
  initialContext: {},
  effects: {
    READY: (deps) => {
      uiButtonClickEffect(deps);
    },
  },
});
