import { MachineManager } from "lite-fsm";
import type { MachinesState } from "lite-fsm";
import { immerMiddleware } from "lite-fsm/middleware/immer";

import { canvasStroke } from "./machines/canvasStroke";
import type { AppEvents } from "./types";

const machines = { canvasStroke };

export type FSMConfigType = typeof machines;
export type AppState = MachinesState<FSMConfigType>;

export const makeStore = () =>
  MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware],
    schemaVersion: 1,
  });

export type AppStore = ReturnType<typeof makeStore>;

export const strokeEntries = (state: AppState) =>
  Object.entries(state.canvasStroke).map(([actorId, slice]) => ({
    actorId,
    state: slice.state,
    context: slice.context,
  }));

export { useManager, useSelector, useTransition } from "./hooks";
export type { AppEvents } from "./types";
