import type { FSMEvent } from "lite-fsm";

export type Vec2 = { x: number; y: number };

type TickPayload = { now: number; delta: number };
type PlayerSpawnPayload = Vec2 & { hp: number };
type EnemySpawnPayload = Vec2 & { entityId: string; hp: number; maxHp: number; speed: number };
type ProjectileSpawnPayload = Vec2 & { vx: number; vy: number; damage: number; ttl: number };
type MovePayload = Vec2 & { vx: number; vy: number };

export type AppEvents =
  | FSMEvent<"GAME_BOOT", { now: number }>
  | FSMEvent<"TICK", TickPayload>
  | FSMEvent<"BOOT_DONE">
  | FSMEvent<"SPAWN_SKIP">
  | FSMEvent<"MOVE_DONE">
  | FSMEvent<"FIRE_SKIP">
  | FSMEvent<"COMBAT_DONE">
  | FSMEvent<"PLAYER_SPAWN", PlayerSpawnPayload>
  | FSMEvent<"PLAYER_MOVE", MovePayload>
  | FSMEvent<"PLAYER_DAMAGE", { amount: number }>
  | FSMEvent<"PLAYER_HIT">
  | FSMEvent<"PLAYER_DEAD">
  | FSMEvent<"ENEMY_SPAWN", EnemySpawnPayload>
  | FSMEvent<"ENEMY_MOVE", MovePayload>
  | FSMEvent<"DAMAGE", { amount: number }>
  | FSMEvent<"ENEMY_KILLED">
  | FSMEvent<"PROJECTILE_SPAWN", ProjectileSpawnPayload>
  | FSMEvent<"PROJECTILE_MOVE", Vec2 & { ttl: number }>
  | FSMEvent<"DESPAWN">
  | FSMEvent<"BOOST_SPAWN_RATE", { multiplier?: number; reset?: true }>;

export type PlayerBodyContext = Vec2 & {
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
};

export type EnemyBodyContext = Vec2 & {
  entityId: string;
  vx: number;
  vy: number;
  speed: number;
  radius: number;
};

export type EnemyHealthContext = {
  entityId: string;
  current: number;
  max: number;
};

export type ProjectileBodyContext = Vec2 & {
  vx: number;
  vy: number;
  damage: number;
  ttl: number;
  radius: number;
};
