import { defineSpawnEvents, spawnEvent } from "@lite-fsm/entities";

import type { GameConfig } from "./types";

export const spawnEvents = defineSpawnEvents({
  GAME_START: spawnEvent<GameConfig>(),
});
