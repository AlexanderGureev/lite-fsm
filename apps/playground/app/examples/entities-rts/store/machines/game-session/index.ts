import { createMachine } from "../../create-machine";
import { applyGameConfigPatch, DEFAULT_GAME_CONFIG, normalizeGameConfig } from "../../config";
import type { AppEvents, GameConfig, RtsBenchmarkReport } from "../../types";

type Context = {
  config: GameConfig;
  startedRuns: number;
  killedEnemyCount: number;
  elapsedMs: number;
  tickCount: number;
  report: RtsBenchmarkReport | null;
};

export type Events = AppEvents;

const initialContext: Context = {
  config: DEFAULT_GAME_CONFIG,
  startedRuns: 0,
  killedEnemyCount: 0,
  elapsedMs: 0,
  tickCount: 0,
  report: null,
};

const killsPerSecond = (killedEnemyCount: number, elapsedMs: number) => {
  if (elapsedMs <= 0) return 0;
  return killedEnemyCount / (elapsedMs / 1_000);
};

export const gameSession = createMachine({
  config: {
    CONFIGURING: {
      GAME_CONFIG_CHANGED: null,
      GAME_START: "SPAWNING",
      GAME_RESTART: null,
    },
    SPAWNING: {
      GAME_SPAWN_COMPLETED: "READY",
    },
    READY: {
      GAME_PAUSE: "PAUSED",
      TICK: null,
      ENEMY_KILLED: null,
      ENEMIES_KILLED: null,
      SELECT_RECT: null,
      SELECT_ENTITY: null,
      CLEAR_SELECTION: null,
      ISSUE_MOVE: null,
      ISSUE_ATTACK_MOVE: null,
      HERO_DEAD: "GAME_OVER",
    },
    PAUSED: {
      GAME_RESUME: "READY",
    },
    BENCHMARK_COMPLETE: {
      BENCHMARK_REPORT_CAPTURED: null,
    },
    GAME_OVER: {},
    "*": {
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
        state.context.killedEnemyCount = 0;
        state.context.elapsedMs = 0;
        state.context.tickCount = 0;
        state.context.report = null;
        return;

      case "TICK":
        state.context.elapsedMs += Math.max(0, action.payload.deltaMs);
        state.context.tickCount += 1;
        return;

      case "ENEMY_KILLED": {
        state.context.killedEnemyCount += 1;

        if (state.context.config.enemyCount > 0 && state.context.killedEnemyCount >= state.context.config.enemyCount) {
          state.state = "BENCHMARK_COMPLETE";
        }
        return;
      }

      case "ENEMIES_KILLED": {
        state.context.killedEnemyCount += Math.max(0, Math.trunc(action.payload.count));

        if (state.context.config.enemyCount > 0 && state.context.killedEnemyCount >= state.context.config.enemyCount) {
          state.state = "BENCHMARK_COMPLETE";
        }
        return;
      }

      case "BENCHMARK_REPORT_CAPTURED":
        if (state.context.report !== null) return;

        state.context.report = {
          run: state.context.startedRuns,
          seed: state.context.config.seed,
          enemyCount: state.context.config.enemyCount,
          allyCount: state.context.config.allyCount,
          enemiesKilled: state.context.killedEnemyCount,
          elapsedMs: state.context.elapsedMs,
          tickCount: state.context.tickCount,
          killsPerSecond: killsPerSecond(state.context.killedEnemyCount, state.context.elapsedMs),
          metrics: action.payload,
        };
        return;

      case "GAME_RESTART":
        state.context.killedEnemyCount = 0;
        state.context.elapsedMs = 0;
        state.context.tickCount = 0;
        state.context.report = null;
        return;
    }
  },
  effects: {
    SPAWNING: ({ metrics }) => {
      metrics.reset();
    },
    READY: ({ action, metrics }) => {
      if (action.type === "GAME_SPAWN_COMPLETED") metrics.reset();
    },
  },
});
