import {
  ENEMY_BASE_HP,
  ENEMY_BASE_SPEED,
  ENEMY_LIMIT,
  ENEMY_SPAWN_INTERVAL,
  ENEMY_SPAWN_MAX_INTERVAL,
  ENEMY_SPAWN_MIN_INTERVAL,
  WORLD,
} from "../constants";
import { createMachine } from "../create-machine";
import { clamp } from "../utils";

const createEnemySpawn = (random: () => number, entityId: string, spawnedAt: number) => {
  const side = Math.floor(random() * 4);
  const xInside = WORLD.padding + random() * (WORLD.width - WORLD.padding * 2);
  const yInside = WORLD.padding + random() * (WORLD.height - WORLD.padding * 2);

  return {
    entityId,
    x: side === 0 ? WORLD.padding : side === 1 ? WORLD.width - WORLD.padding : xInside,
    y: side === 2 ? WORLD.padding : side === 3 ? WORLD.height - WORLD.padding : yInside,
    hp: ENEMY_BASE_HP,
    maxHp: ENEMY_BASE_HP,
    speed: ENEMY_BASE_SPEED + random() * 34,
    spawnedAt,
  };
};

export const enemySpawner = createMachine({
  config: {
    READY: { TICK: "CHECKING", BOOST_SPAWN_RATE: null },
    CHECKING: { ENEMY_SPAWN: "READY", SPAWN_SKIP: "READY" },
  },
  initialState: "READY",
  initialContext: {
    total: 0,
    lastSpawnAt: -ENEMY_SPAWN_INTERVAL,
    interval: ENEMY_SPAWN_INTERVAL,
  },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    if (action.type === "ENEMY_SPAWN") {
      state.context.total += 1;
      state.context.lastSpawnAt = action.payload.spawnedAt;
    }

    if (action.type === "BOOST_SPAWN_RATE") {
      const interval = action.payload.reset
        ? ENEMY_SPAWN_INTERVAL
        : state.context.interval * (action.payload.multiplier ?? 1);
      state.context.interval = clamp(interval, ENEMY_SPAWN_MIN_INTERVAL, ENEMY_SPAWN_MAX_INTERVAL);
    }
  },
  effects: {
    CHECKING: ({ action, transition, getState, random }) => {
      const root = getState();
      const now = action.payload.now;
      const hasPlayer = Object.keys(root.playerBody).length > 0;
      const canSpawn =
        root.gameSession.context.status === "running" &&
        hasPlayer &&
        Object.keys(root.enemyBody).length < ENEMY_LIMIT &&
        now - root.enemySpawner.context.lastSpawnAt >= root.enemySpawner.context.interval;

      if (!canSpawn) {
        transition({ type: "SPAWN_SKIP" });
        return;
      }

      transition({
        type: "ENEMY_SPAWN",
        payload: createEnemySpawn(random, `enemy-${root.enemySpawner.context.total}`, now),
      });
    },
  },
});
