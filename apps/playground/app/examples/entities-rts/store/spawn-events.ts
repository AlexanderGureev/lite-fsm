import { defineSpawnEvents, spawnEvent } from "@lite-fsm/entities";

import type { GameConfig, UnitSpawnBatchPayload } from "./types";

export const spawnEvents = defineSpawnEvents({
  GAME_START: spawnEvent<GameConfig>(),
  SPAWN_PLAYER_BATCH: spawnEvent<UnitSpawnBatchPayload>(),
  SPAWN_ENEMY_BATCH: spawnEvent<UnitSpawnBatchPayload>(),
});
