import { MachineManager } from "lite-fsm";
import { immerMiddleware } from "lite-fsm/middleware/immer";

import { likeSync } from "./machines/likeSync";
import { likesV2 } from "./machines/likesV2";
import type { AppEvents } from "./types";

const machines = { likesV2, likeSync };

export type FSMConfigType = typeof machines;

export const makeStore = () =>
  MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware],
  });

export type AppStore = ReturnType<typeof makeStore>;
export type AppState = ReturnType<AppStore["getState"]>;

export { useManager, useSelector, useTransition } from "./hooks";
export type { AppEvents } from "./types";
