export const UNIT_KIND = {
  HERO: 1,
  ALLY: 2,
  ENEMY: 3,
} as const;

export const UNIT_FACTION = {
  PLAYER: 1,
  ENEMY: 2,
} as const;

export const UNIT_COMMAND = {
  IDLE: 0,
  MOVE: 1,
  ATTACK_MOVE: 2,
} as const;

export const UNIT_SELECTION = {
  UNSELECTED: 0,
  SELECTED: 1,
} as const;

export type UnitIdentitySpawnPayload = {
  kind: number;
  faction: number;
  radius: number;
};

export type UnitMovementSpawnPayload = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
};

export type UnitHealthSpawnPayload = {
  hp: number;
  maxHp: number;
};

export type UnitCombatSpawnPayload = {
  attackRange: number;
  attackDamage: number;
  attackCooldownMs: number;
  attackTimerMs: number;
};

export type UnitSelectionSpawnPayload = {
  selected: number;
};

export type UnitCommandSpawnPayload = {
  command: number;
  targetX: number;
  targetY: number;
  formationOffsetX: number;
  formationOffsetY: number;
};

export type EnemyAiSpawnPayload = {};

export type PlannedUnitSpawn = {
  id: string;
  groupTag: string;
  identity: UnitIdentitySpawnPayload;
  movement: UnitMovementSpawnPayload;
  health: UnitHealthSpawnPayload;
  combat: UnitCombatSpawnPayload;
  selection?: UnitSelectionSpawnPayload;
  command?: UnitCommandSpawnPayload;
  enemyAi?: EnemyAiSpawnPayload;
};
