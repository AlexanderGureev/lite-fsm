import { defineSpawnEvents, spawnEvent, type EntityId, type SpawnEventsFrom } from "@lite-fsm/entities";

export type EnemySpawnPayload = {
  id: EntityId;
  x: number;
  y: number;
  dx: number;
  dy: number;
  hp: number;
  scoreValue: number;
  spriteId: string;
  faction: string | null;
};

export const spawnEvents = defineSpawnEvents({
  SPAWN_ENEMY: spawnEvent<EnemySpawnPayload>(),
});

export type SpawnEvents = SpawnEventsFrom<typeof spawnEvents>;
