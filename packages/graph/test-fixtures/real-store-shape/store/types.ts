// @ts-nocheck

import type { FSMEvent } from "lite-fsm";

export type AppEvents =
  | FSMEvent<"DO_INIT">
  | FSMEvent<"APP_MOUNTED">
  | FSMEvent<"NAVIGATE", { path: string }>
  | FSMEvent<"SET_THEME", { theme: string }>
  | FSMEvent<"UI_BUTTON_CLICK">
  | FSMEvent<"NAVIGATION_EVENT_SEND">;

export type Dependencies = {
  services: Record<string, unknown>;
  getState: () => unknown;
};
