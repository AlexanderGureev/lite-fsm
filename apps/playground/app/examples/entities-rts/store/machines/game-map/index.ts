import { createMachine } from "../../create-machine";
import { RTS_MAP } from "../../spawn/placement";
import type { AppEvents } from "../../types";

type Context = typeof RTS_MAP;

export type Events = AppEvents;

const initialContext: Context = RTS_MAP;

export const gameMap = createMachine({
  config: {
    READY: {
      GAME_START: null,
      GAME_RESTART: null,
    },
  },
  initialState: "READY",
  initialContext,
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
});
