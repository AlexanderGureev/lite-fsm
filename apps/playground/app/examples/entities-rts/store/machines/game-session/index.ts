import { createMachine } from "../../create-machine";
import { applyGameConfigPatch, DEFAULT_GAME_CONFIG, normalizeGameConfig } from "../../config";
import type { AppEvents, GameConfig } from "../../types";

type Context = {
  config: GameConfig;
  startedRuns: number;
};

export type Events = AppEvents;

const initialContext: Context = {
  config: DEFAULT_GAME_CONFIG,
  startedRuns: 0,
};

export const gameSession = createMachine({
  config: {
    CONFIGURING: {
      GAME_CONFIG_CHANGED: null,
      GAME_START: "READY",
    },
    READY: {
      GAME_PAUSE: "PAUSED",
      GAME_RESTART: "CONFIGURING",
      TICK: null,
      SELECT_RECT: null,
      SELECT_ENTITY: null,
      CLEAR_SELECTION: null,
      ISSUE_MOVE: null,
      ISSUE_ATTACK_MOVE: null,
      HERO_DEAD: "GAME_OVER",
    },
    PAUSED: {
      GAME_RESUME: "READY",
      GAME_RESTART: "CONFIGURING",
    },
    GAME_OVER: {
      GAME_RESTART: "CONFIGURING",
    },
  },
  initialState: "CONFIGURING",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "GAME_CONFIG_CHANGED":
        state.context.config = applyGameConfigPatch(state.context.config, action.payload);
        return;

      case "GAME_START":
        state.context.config = normalizeGameConfig(action.payload);
        state.context.startedRuns += 1;
        return;
    }
  },
});
