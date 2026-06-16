import { createMachine } from "../create-machine";
import { flushRtsSimulationTick, resetRtsSimulationRuntime } from "../sim/tick";
import type { AppEvents } from "../types";

type Context = {};

export type Events = AppEvents;

const initialContext: Context = {};

export const rtsSimulation = createMachine({
  config: {
    IDLE: {
      GAME_START: "READY",
      GAME_RESTART: null,
    },
    READY: {
      TICK: null,
      GAME_RESTART: "IDLE",
      HERO_DEAD: "STOPPED",
    },
    STOPPED: {
      GAME_RESTART: "IDLE",
    },
  },
  initialState: "IDLE",
  initialContext,
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    "*": ({ action, getState, transition }) => {
      if (action.type === "GAME_START" || action.type === "GAME_RESTART") resetRtsSimulationRuntime();
      if (action.type === "TICK" && getState().rtsSimulation.state === "READY") flushRtsSimulationTick(transition);
    },
  },
});
