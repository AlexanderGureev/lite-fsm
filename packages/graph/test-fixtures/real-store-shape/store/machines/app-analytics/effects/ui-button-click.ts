// @ts-nocheck

import { createEffect } from "@/store/create-machine";

export const uiButtonClickEffect = createEffect({
  type: "UI_BUTTON_CLICK",
  effect: ({ transition }) => {
    transition({ type: "UI_BUTTON_CLICK" });
  },
});
