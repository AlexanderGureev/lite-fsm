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

export type UnitActorSpawnPayload = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: number;
  faction: number;
  radius: number;
  speed: number;
  hp: number;
  maxHp: number;
  attackRange: number;
  attackDamage: number;
  attackCooldownMs: number;
  attackTimerMs: number;
  selected: number;
  command: number;
  targetX: number;
  targetY: number;
  formationOffsetX: number;
  formationOffsetY: number;
};

export type PlannedUnitSpawn = {
  id: string;
  groupTag: string;
  unit: UnitActorSpawnPayload;
};
