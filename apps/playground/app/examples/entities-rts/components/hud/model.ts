// Производные view-значения, которые ArmedShell собирает из gameSession/gameSpawn
// и раздаёт презентационным частям HUD.

export type GameStatus = {
  label: string;
  isSpawning: boolean;
  isPaused: boolean;
  isGameOver: boolean;
};

export type SpawnSummary = {
  spawnedUnits: number;
  spawnTarget: number;
  spawnProgress: number;
  spawnedPlayerUnits: number;
  spawnedEnemies: number;
  targetPlayerUnitCount: number;
  targetEnemyCount: number;
  activeSpawnBatchSize: number;
  playerSpawnDetail: string;
  enemySpawnDetail: string;
};
