import { createMachine } from "../../create-machine";
import { DEFAULT_GAME_CONFIG, normalizeGameConfig } from "../../config";
import {
  DEFAULT_ENEMY_SPAWN_BATCH_SIZE,
  DEFAULT_PLAYER_SPAWN_BATCH_SIZE,
  initialEnemySpawnBatchCount,
  initialPlayerSpawnBatchCount,
} from "../../spawn/placement";
import type { AppEvents, GameConfig } from "../../types";

type Context = {
  config: GameConfig;
  targetPlayerUnitCount: number;
  spawnedPlayerUnitCount: number;
  targetEnemyCount: number;
  spawnedEnemyCount: number;
  playerBatchSize: number;
  enemyBatchSize: number;
};

export type Events = AppEvents;

const initialContext: Context = {
  config: DEFAULT_GAME_CONFIG,
  targetPlayerUnitCount: 0,
  spawnedPlayerUnitCount: 0,
  targetEnemyCount: 0,
  spawnedEnemyCount: 0,
  playerBatchSize: DEFAULT_PLAYER_SPAWN_BATCH_SIZE,
  enemyBatchSize: DEFAULT_ENEMY_SPAWN_BATCH_SIZE,
};

const nextPlayerBatchCount = (context: Context) =>
  Math.min(context.playerBatchSize, Math.max(0, context.targetPlayerUnitCount - context.spawnedPlayerUnitCount));

const nextEnemyBatchCount = (context: Context) =>
  Math.min(context.enemyBatchSize, Math.max(0, context.targetEnemyCount - context.spawnedEnemyCount));

const spawnIsComplete = (context: Context) =>
  context.spawnedPlayerUnitCount >= context.targetPlayerUnitCount &&
  context.spawnedEnemyCount >= context.targetEnemyCount;

export const gameSpawn = createMachine({
  config: {
    IDLE: {
      GAME_START: "SPAWNING",
      GAME_RESTART: null,
    },
    SPAWNING: {
      SPAWN_TICK: "SPAWNING_STEP",
      GAME_RESTART: "IDLE",
      HERO_DEAD: "IDLE",
      GAME_SPAWN_COMPLETED: "IDLE",
    },
    SPAWNING_STEP: {
      SPAWN_PLAYER_BATCH: "SPAWNING",
      SPAWN_ENEMY_BATCH: "SPAWNING",
      GAME_SPAWN_COMPLETED: "IDLE",
      GAME_RESTART: "IDLE",
      HERO_DEAD: "IDLE",
    },
  },
  initialState: "IDLE",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "GAME_START": {
        const config = normalizeGameConfig(action.payload);
        const spawnedPlayerUnitCount = initialPlayerSpawnBatchCount(config);
        const spawnedEnemyCount = initialEnemySpawnBatchCount(config);

        state.context.config = config;
        state.context.targetPlayerUnitCount = config.allyCount;
        state.context.spawnedPlayerUnitCount = spawnedPlayerUnitCount;
        state.context.targetEnemyCount = config.enemyCount;
        state.context.spawnedEnemyCount = spawnedEnemyCount;
        state.context.playerBatchSize = DEFAULT_PLAYER_SPAWN_BATCH_SIZE;
        state.context.enemyBatchSize = DEFAULT_ENEMY_SPAWN_BATCH_SIZE;
        return;
      }

      case "SPAWN_PLAYER_BATCH": {
        const nextSpawnedPlayerUnitCount = Math.min(
          state.context.targetPlayerUnitCount,
          action.payload.start + action.payload.count,
        );

        state.context.spawnedPlayerUnitCount = Math.max(
          state.context.spawnedPlayerUnitCount,
          nextSpawnedPlayerUnitCount,
        );
        state.state = spawnIsComplete(state.context) ? "IDLE" : "SPAWNING";
        return;
      }

      case "SPAWN_ENEMY_BATCH": {
        const nextSpawnedEnemyCount = Math.min(
          state.context.targetEnemyCount,
          action.payload.start + action.payload.count,
        );

        state.context.spawnedEnemyCount = Math.max(state.context.spawnedEnemyCount, nextSpawnedEnemyCount);
        state.state = spawnIsComplete(state.context) ? "IDLE" : "SPAWNING";
        return;
      }

      case "GAME_RESTART":
      case "HERO_DEAD":
        state.context.targetPlayerUnitCount = 0;
        state.context.spawnedPlayerUnitCount = 0;
        state.context.targetEnemyCount = 0;
        state.context.spawnedEnemyCount = 0;
        state.state = "IDLE";
        return;

      case "GAME_SPAWN_COMPLETED":
        state.state = "IDLE";
        return;
    }
  },
  effects: {
    SPAWNING_STEP: ({ getState, transition }) => {
      const { context } = getState().gameSpawn;
      const playerCount = nextPlayerBatchCount(context);

      if (playerCount > 0) {
        const nextSpawnedPlayerUnitCount = context.spawnedPlayerUnitCount + playerCount;

        transition({
          type: "SPAWN_PLAYER_BATCH",
          payload: {
            config: context.config,
            start: context.spawnedPlayerUnitCount,
            count: playerCount,
          },
        });

        if (
          nextSpawnedPlayerUnitCount >= context.targetPlayerUnitCount &&
          context.spawnedEnemyCount >= context.targetEnemyCount
        ) {
          transition({ type: "GAME_SPAWN_COMPLETED" });
        }
        return;
      }

      const enemyCount = nextEnemyBatchCount(context);
      const nextSpawnedEnemyCount = context.spawnedEnemyCount + enemyCount;

      if (enemyCount <= 0) {
        transition({ type: "GAME_SPAWN_COMPLETED" });
        return;
      }

      transition({
        type: "SPAWN_ENEMY_BATCH",
        payload: {
          config: context.config,
          start: context.spawnedEnemyCount,
          count: enemyCount,
        },
      });

      if (nextSpawnedEnemyCount >= context.targetEnemyCount) {
        transition({ type: "GAME_SPAWN_COMPLETED" });
      }
    },
  },
});
