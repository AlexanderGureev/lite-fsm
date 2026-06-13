import { createConfig, createEffect, createMachine, createReducer } from "../create-machine";
import type { WorldEvents } from "../types";

export type Events = WorldEvents;

type WorldContext = {
  frame: number;
  elapsedMs: number;
  sampledAt: number;
  spawnedEnemies: number;
  liveEnemies: number;
  alerts: number;
};

const initialContext: WorldContext = {
  frame: 0,
  elapsedMs: 0,
  sampledAt: 0,
  spawnedEnemies: 0,
  liveEnemies: 0,
  alerts: 0,
};

const config = createConfig({
  IDLE: {
    START_GAME: "RUNNING",
    RESET_WORLD: "IDLE",
  },
  RUNNING: {
    TICK: "SAMPLING",
    SPAWN_ENEMY: null,
    ENEMY_ALERTED: null,
    RESET_WORLD: "IDLE",
  },
  SAMPLING: {
    TICK: "SAMPLING",
    WORLD_SAMPLE_READY: "RUNNING",
    SPAWN_ENEMY: null,
    ENEMY_ALERTED: null,
    RESET_WORLD: "IDLE",
  },
});

const reducer = createReducer<typeof config, WorldContext>((state, action, { nextState }) => {
  state.state = nextState;

  switch (action.type) {
    case "START_GAME":
      state.context.frame = 0;
      state.context.elapsedMs = 0;
      state.context.sampledAt = 0;
      state.context.liveEnemies = 0;
      state.context.alerts = 0;
      return;

    case "TICK":
      state.context.frame = action.payload.frame;
      state.context.elapsedMs += action.payload.deltaMs;
      return;

    case "SPAWN_ENEMY":
      state.context.spawnedEnemies += 1;
      return;

    case "WORLD_SAMPLE_READY":
      state.context.sampledAt = action.payload.sampledAt;
      state.context.liveEnemies = action.payload.enemyCount;
      return;

    case "ENEMY_ALERTED":
      state.context.alerts += action.payload.entityIds.length;
      return;

    case "RESET_WORLD":
      state.context.frame = 0;
      state.context.elapsedMs = 0;
      state.context.sampledAt = 0;
      state.context.spawnedEnemies = 0;
      state.context.liveEnemies = 0;
      state.context.alerts = 0;
      return;
  }
});

const sampleWorld = createEffect<typeof config, "SAMPLING">({
  type: "latest",
  effect: async ({ action, clock, getState, transition }) => {
    if (action.type !== "TICK") return;

    const enemyCount = getState().enemyActor.count;

    transition({
      type: "WORLD_SAMPLE_READY",
      payload: {
        frame: action.payload.frame,
        sampledAt: clock.now(),
        enemyCount,
      },
    });
  },
});

export const worldMachine = createMachine({
  config,
  initialState: "IDLE",
  initialContext,
  reducer,
  effects: {
    SAMPLING: sampleWorld,
  },
});
