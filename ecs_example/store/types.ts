import type { EntityId } from "@lite-fsm/entities";
import type { FSMEvent } from "@lite-fsm/core";

import type { SpawnEvents } from "./spawn-events";

export type TickPayload = {
  frame: number;
  deltaMs: number;
};

export type WorldEvents =
  | FSMEvent<"START_GAME">
  | FSMEvent<"TICK", TickPayload>
  | FSMEvent<"WORLD_SAMPLE_READY", { frame: number; sampledAt: number; enemyCount: number }>
  | FSMEvent<"ENEMY_ALERTED", { entityIds: readonly EntityId[] }>
  | FSMEvent<"RESET_WORLD">;

export type BlinkEvents =
  | FSMEvent<"START_BLINK_ACTOR", { id: string; maxTicks: number }>
  | FSMEvent<"FLASH_FROM_ENTITY", { source: string; intensity: number }>
  | FSMEvent<"BLINK_FLASHED">
  | FSMEvent<"STOP_BLINK_ACTOR", { id: string }>
  | FSMEvent<"TICK", TickPayload>
  | FSMEvent<"RESET_WORLD">;

export type EnemyEvents =
  | FSMEvent<"TICK", TickPayload>
  | FSMEvent<"DAMAGE_ENTITY", { amount: number; source: "player" | "hazard" }>
  | FSMEvent<"BOOST_ENEMIES", { dx: number; dy: number }>
  | FSMEvent<"RECOVER_ENTITY">
  | FSMEvent<"RESET_WORLD">;

export type AppEvents = SpawnEvents | WorldEvents | BlinkEvents | EnemyEvents;
