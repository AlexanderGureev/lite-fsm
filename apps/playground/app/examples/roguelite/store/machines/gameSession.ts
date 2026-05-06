import { createMachine } from "../create-machine";

type GameSessionContext = {
  status: "idle" | "running" | "paused" | "game-over";
  startedAt: number;
  tick: number;
  kills: number;
  shots: number;
  hits: number;
};

const initialContext: GameSessionContext = {
  status: "idle",
  startedAt: 0,
  tick: 0,
  kills: 0,
  shots: 0,
  hits: 0,
};

export const gameSession = createMachine({
  config: {
    IDLE: {
      GAME_BOOT: "RUNNING",
    },
    RUNNING: {
      GAME_BOOT: null,
      PAUSE_GAME: "PAUSED",
      TICK: null,
      ENEMY_SPAWN: null,
      PROJECTILE_SPAWN: null,
      DAMAGE: null,
      ENEMY_KILLED: null,
      PLAYER_HIT: null,
      PLAYER_DEAD: "GAME_OVER",
    },
    PAUSED: {
      GAME_BOOT: "RUNNING",
      RESUME_GAME: "RUNNING",
    },
    GAME_OVER: { GAME_BOOT: "RUNNING" },
  },
  initialState: "IDLE",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "GAME_BOOT":
        state.context.status = "running";
        state.context.startedAt = action.payload.now;
        state.context.tick = 0;
        state.context.kills = 0;
        state.context.shots = 0;
        state.context.hits = 0;
        break;
      case "PAUSE_GAME":
        state.context.status = "paused";
        break;
      case "RESUME_GAME":
        state.context.status = "running";
        break;
      case "TICK":
        state.context.tick += 1;
        break;
      case "PROJECTILE_SPAWN":
        state.context.shots += 1;
        break;
      case "DAMAGE":
        state.context.hits += 1;
        break;
      case "ENEMY_KILLED":
        state.context.kills += 1;
        break;
      case "PLAYER_DEAD":
        state.context.status = "game-over";
        break;
    }
  },
});
