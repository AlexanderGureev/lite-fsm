import type { FSMEvent } from "@lite-fsm/core";

import type { UnitCommandAssignmentBatchPayload, UnitSelectionBatchPayload } from "./machines/unit-orders/batches";
import type { RtsMetricsSnapshot } from "./metrics";

export type RtsPresetId = "small" | "medium" | "stress";

export type GameConfig = {
  enemyCount: number;
  allyCount: number;
  seed: string;
  playerUnitHp?: number;
};

export type GameConfigPatch = Partial<GameConfig>;

export type UnitSpawnBatchPayload = {
  config: GameConfig;
  start: number;
  count: number;
};

export type Point = {
  x: number;
  y: number;
};

export type SelectionRect = Point & {
  width: number;
  height: number;
};

export type RtsBenchmarkReport = {
  run: number;
  seed: string;
  enemyCount: number;
  allyCount: number;
  enemiesKilled: number;
  elapsedMs: number;
  tickCount: number;
  killsPerSecond: number;
  metrics: RtsMetricsSnapshot;
};

export type AppEvents =
  | FSMEvent<"GAME_CONFIG_CHANGED", GameConfigPatch>
  | FSMEvent<"GAME_START", GameConfig>
  | FSMEvent<"SPAWN_TICK", { now: number; deltaMs: number }>
  | FSMEvent<"SPAWN_PLAYER_BATCH", UnitSpawnBatchPayload>
  | FSMEvent<"SPAWN_ENEMY_BATCH", UnitSpawnBatchPayload>
  | FSMEvent<"GAME_SPAWN_COMPLETED">
  | FSMEvent<"GAME_RESTART">
  | FSMEvent<"GAME_PAUSE">
  | FSMEvent<"GAME_RESUME">
  | FSMEvent<"TICK", { now: number; deltaMs: number }>
  | FSMEvent<"SELECT_RECT", SelectionRect>
  | FSMEvent<"SELECT_ENTITY", { entityId: string }>
  | FSMEvent<"CLEAR_SELECTION">
  | FSMEvent<"ISSUE_MOVE", Point>
  | FSMEvent<"ISSUE_ATTACK_MOVE", Point>
  | FSMEvent<"UNIT_SELECTION_UPDATED", UnitSelectionBatchPayload>
  | FSMEvent<"UNIT_SELECTION_RESOLVED">
  | FSMEvent<"UNIT_COMMAND_ASSIGNED", UnitCommandAssignmentBatchPayload>
  | FSMEvent<"UNIT_COMMAND_RESOLVED">
  | FSMEvent<"UNIT_DEAD">
  | FSMEvent<"ENEMY_KILLED", { entityId: string }>
  | FSMEvent<"ENEMIES_KILLED", { count: number }>
  | FSMEvent<"BENCHMARK_REPORT_CAPTURED", RtsMetricsSnapshot>
  | FSMEvent<"HERO_DEAD">;
