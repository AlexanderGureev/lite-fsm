import { normalizeGameConfig } from "../config";
import type { GameConfig, UnitSpawnBatchPayload } from "../types";
import {
  UNIT_COMMAND,
  UNIT_FACTION,
  UNIT_KIND,
  UNIT_SELECTION,
  type PlannedUnitSpawn,
  type UnitCombatSpawnPayload,
  type UnitHealthSpawnPayload,
  type UnitIdentitySpawnPayload,
  type UnitMovementSpawnPayload,
} from "../unit-model";
import { createSeededRandom, randomBetween, randomInt, type RandomSource } from "./random";

export const RTS_MAP = {
  width: 8_192,
  height: 8_192,
  centerX: 4_096,
  centerY: 4_096,
} as const;

const ENEMY_GROUP_SIZE = 64;
const ENEMY_EDGE_PADDING = 160;
const ENEMY_GROUP_TANGENT_SPREAD = 240;
const ENEMY_GROUP_DEPTH_SPREAD = 280;
const ENEMY_HORDE_SPREAD_REFERENCE_COUNT = 10_000;
const ENEMY_MAX_SPREAD_MULTIPLIER = 1.55;
const ENEMY_SPEED_MIN_FACTOR = 68 / 82;
const ENEMY_SPEED_MAX_FACTOR = 104 / 82;
const PLAYER_FORMATION_SPACING = 24;

export const DEFAULT_ENEMY_SPAWN_BATCH_SIZE = 1024;
export const DEFAULT_PLAYER_SPAWN_BATCH_SIZE = 1024;

const heroStats = {
  radius: 18,
  speed: 120,
  hp: 5_000,
  attackRange: 120,
  attackDamage: 30,
  attackCooldownMs: 420,
  projectileSpeed: 720,
  projectileRadius: 10,
  projectileImpactRadius: 96,
};

const allyStats = {
  radius: 8,
  speed: 145,
  hp: 120,
  attackRange: 900,
  attackDamage: 9,
  attackCooldownMs: 650,
  projectileSpeed: 640,
  projectileRadius: 7,
  projectileImpactRadius: 72,
};

const enemyStats = {
  radius: 7,
  speed: 182,
  hp: 45,
  attackRange: 54,
  attackDamage: 6,
  attackCooldownMs: 900,
  projectileSpeed: 0,
  projectileRadius: 0,
  projectileImpactRadius: 0,
};

type UnitSpawnValues = UnitIdentitySpawnPayload &
  Pick<UnitMovementSpawnPayload, "x" | "y" | "speed"> &
  Pick<UnitHealthSpawnPayload, "hp"> &
  Pick<
    UnitCombatSpawnPayload,
    | "attackRange"
    | "attackDamage"
    | "attackCooldownMs"
    | "projectileSpeed"
    | "projectileRadius"
    | "projectileImpactRadius"
  > & {
    readonly formationOffsetX?: number;
    readonly formationOffsetY?: number;
  };

const createUnitComponents = (values: UnitSpawnValues): Omit<PlannedUnitSpawn, "id" | "groupTag"> => {
  const components: Omit<PlannedUnitSpawn, "id" | "groupTag"> = {
    identity: {
      kind: values.kind,
      faction: values.faction,
      radius: values.radius,
      unitIndex: values.unitIndex,
    },
    movement: {
      x: values.x,
      y: values.y,
      vx: 0,
      vy: 0,
      speed: values.speed,
    },
    health: {
      hp: values.hp,
      maxHp: values.hp,
    },
    combat: {
      attackRange: values.attackRange,
      attackDamage: values.attackDamage,
      attackCooldownMs: values.attackCooldownMs,
      attackTimerMs: 0,
      projectileSpeed: values.projectileSpeed,
      projectileRadius: values.projectileRadius,
      projectileImpactRadius: values.projectileImpactRadius,
    },
  };

  if (values.faction !== UNIT_FACTION.PLAYER) {
    return {
      ...components,
      enemyAi: {},
    };
  }

  return {
    ...components,
    selection: {
      selected: UNIT_SELECTION.UNSELECTED,
    },
    command: {
      command: UNIT_COMMAND.IDLE,
      targetX: values.x,
      targetY: values.y,
      formationOffsetX: values.formationOffsetX ?? 0,
      formationOffsetY: values.formationOffsetY ?? 0,
    },
  };
};

const enemyAnchorForGroup = (group: number, random: () => number) => {
  const edge = group % 4;
  const x = randomBetween(random, ENEMY_EDGE_PADDING, RTS_MAP.width - ENEMY_EDGE_PADDING);
  const y = randomBetween(random, ENEMY_EDGE_PADDING, RTS_MAP.height - ENEMY_EDGE_PADDING);

  switch (edge) {
    case 0:
      return { edge, x, y: ENEMY_EDGE_PADDING };
    case 1:
      return { edge, x: RTS_MAP.width - ENEMY_EDGE_PADDING, y };
    case 2:
      return { edge, x, y: RTS_MAP.height - ENEMY_EDGE_PADDING };
    default:
      return { edge, x: ENEMY_EDGE_PADDING, y };
  }
};

const clampToMap = (value: number, max: number) => Math.min(max, Math.max(0, value));

const enemyHordeSpreadMultiplier = (enemyCount: number) => {
  const normalizedEnemyCount = Math.max(0, Math.trunc(enemyCount));
  const hordeScale = Math.sqrt(normalizedEnemyCount / ENEMY_HORDE_SPREAD_REFERENCE_COUNT);

  return 1 + Math.min(1, hordeScale) * (ENEMY_MAX_SPREAD_MULTIPLIER - 1);
};

export const enemySpeedForSpawn = (baseSpeed: number, random: RandomSource) => {
  if (baseSpeed <= 0) return 0;

  return randomBetween(random, baseSpeed * ENEMY_SPEED_MIN_FACTOR, baseSpeed * ENEMY_SPEED_MAX_FACTOR);
};

const playerFormationPointForIndex = (config: GameConfig, allyIndex: number) => {
  const unitCount = Math.max(0, Math.trunc(config.allyCount));
  const index = Math.max(0, Math.trunc(allyIndex));
  const columns = Math.ceil(Math.sqrt(unitCount));
  const rows = Math.ceil(unitCount / columns);
  const left = ((columns - 1) * PLAYER_FORMATION_SPACING) / 2;
  const top = ((rows - 1) * PLAYER_FORMATION_SPACING) / 2;
  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    x: RTS_MAP.centerX + column * PLAYER_FORMATION_SPACING - left,
    y: RTS_MAP.centerY + 84 + row * PLAYER_FORMATION_SPACING - top,
  };
};

const createEnemyAnchors = (config: GameConfig) => {
  const groupCount = Math.max(1, Math.ceil(config.enemyCount / ENEMY_GROUP_SIZE));
  const anchorX = new Float32Array(groupCount);
  const anchorY = new Float32Array(groupCount);
  const edge = new Uint8Array(groupCount);
  const random = createSeededRandom(config.seed);

  for (let group = 0; group < groupCount; group += 1) {
    const anchor = enemyAnchorForGroup(group, random);
    anchorX[group] = anchor.x;
    anchorY[group] = anchor.y;
    edge[group] = anchor.edge;
  }

  return { anchorX, anchorY, edge, groupCount };
};

const enemyPositionForSpawn = (
  anchors: ReturnType<typeof createEnemyAnchors>,
  group: number,
  random: () => number,
  spreadMultiplier: number,
) => {
  const tangent = randomBetween(
    random,
    -ENEMY_GROUP_TANGENT_SPREAD * spreadMultiplier,
    ENEMY_GROUP_TANGENT_SPREAD * spreadMultiplier,
  );
  const depth = randomBetween(random, 0, ENEMY_GROUP_DEPTH_SPREAD * spreadMultiplier);
  const x = anchors.anchorX[group];
  const y = anchors.anchorY[group];

  switch (anchors.edge[group]) {
    case 0:
      return { x: clampToMap(x + tangent, RTS_MAP.width), y: clampToMap(y + depth, RTS_MAP.height) };
    case 1:
      return { x: clampToMap(x - depth, RTS_MAP.width), y: clampToMap(y + tangent, RTS_MAP.height) };
    case 2:
      return { x: clampToMap(x + tangent, RTS_MAP.width), y: clampToMap(y - depth, RTS_MAP.height) };
    default:
      return { x: clampToMap(x + depth, RTS_MAP.width), y: clampToMap(y + tangent, RTS_MAP.height) };
  }
};

const createEnemyUnit = (
  config: GameConfig,
  anchors: ReturnType<typeof createEnemyAnchors>,
  enemyIndex: number,
): PlannedUnitSpawn => {
  const random = createSeededRandom(`${config.seed}:enemy:${enemyIndex}`);
  const group = randomInt(random, 0, anchors.groupCount);
  const position = enemyPositionForSpawn(anchors, group, random, enemyHordeSpreadMultiplier(config.enemyCount));

  return {
    id: `unit/enemy/${enemyIndex}`,
    groupTag: "enemy",
    ...createUnitComponents({
      x: position.x,
      y: position.y,
      kind: UNIT_KIND.ENEMY,
      faction: UNIT_FACTION.ENEMY,
      unitIndex: enemyIndex,
      ...enemyStats,
      speed: enemySpeedForSpawn(enemyStats.speed, random),
    }),
  };
};

const createPlayerUnit = (config: GameConfig, allyIndex: number): PlannedUnitSpawn => {
  const point = playerFormationPointForIndex(config, allyIndex);
  const playerUnitHp = config.playerUnitHp;

  return {
    id: `unit/ally/${allyIndex}`,
    groupTag: "player",
    ...createUnitComponents({
      x: point.x,
      y: point.y,
      kind: UNIT_KIND.ALLY,
      faction: UNIT_FACTION.PLAYER,
      unitIndex: allyIndex,
      formationOffsetX: point.x - RTS_MAP.centerX,
      formationOffsetY: point.y - RTS_MAP.centerY,
      ...allyStats,
      hp: playerUnitHp ?? allyStats.hp,
    }),
  };
};

export const playerSpawnBatchCount = (targetPlayerUnitCount: number, spawnedPlayerUnitCount: number) =>
  Math.min(
    DEFAULT_PLAYER_SPAWN_BATCH_SIZE,
    Math.max(0, Math.trunc(targetPlayerUnitCount) - Math.max(0, Math.trunc(spawnedPlayerUnitCount))),
  );

export const enemySpawnBatchCount = (targetEnemyCount: number, spawnedEnemyCount: number) =>
  Math.min(
    DEFAULT_ENEMY_SPAWN_BATCH_SIZE,
    Math.max(0, Math.trunc(targetEnemyCount) - Math.max(0, Math.trunc(spawnedEnemyCount))),
  );

export const initialPlayerSpawnBatchCount = (config: GameConfig) =>
  playerSpawnBatchCount(normalizeGameConfig(config).allyCount, 0);

export const initialEnemySpawnBatchCount = (config: GameConfig) => {
  const normalized = normalizeGameConfig(config);

  return initialPlayerSpawnBatchCount(normalized) >= normalized.allyCount
    ? enemySpawnBatchCount(normalized.enemyCount, 0)
    : 0;
};

export const createPlayerSpawnBatchPlan = (payload: UnitSpawnBatchPayload): readonly PlannedUnitSpawn[] => {
  const config = normalizeGameConfig(payload.config);
  const start = Math.min(config.allyCount, Math.max(0, Math.trunc(payload.start)));
  const count = Math.min(Math.max(0, Math.trunc(payload.count)), config.allyCount - start);
  if (count <= 0) return [];

  const plan = new Array<PlannedUnitSpawn>(count);

  for (let offset = 0; offset < count; offset += 1) {
    plan[offset] = createPlayerUnit(config, start + offset);
  }

  return plan;
};

export const createEnemySpawnBatchPlan = (payload: UnitSpawnBatchPayload): readonly PlannedUnitSpawn[] => {
  const config = normalizeGameConfig(payload.config);
  const start = Math.min(config.enemyCount, Math.max(0, Math.trunc(payload.start)));
  const count = Math.min(Math.max(0, Math.trunc(payload.count)), config.enemyCount - start);
  if (count <= 0) return [];

  const anchors = createEnemyAnchors(config);
  const plan = new Array<PlannedUnitSpawn>(count);

  for (let offset = 0; offset < count; offset += 1) {
    plan[offset] = createEnemyUnit(config, anchors, start + offset);
  }

  return plan;
};

export const createGameStartSpawnPlan = (config: GameConfig): readonly PlannedUnitSpawn[] => {
  const normalized = normalizeGameConfig(config);
  const initialPlayerUnitCount = initialPlayerSpawnBatchCount(normalized);
  const initialEnemyCount = initialEnemySpawnBatchCount(normalized);
  const plan = new Array<PlannedUnitSpawn>(initialPlayerUnitCount + initialEnemyCount + 1);
  const playerUnitHp = normalized.playerUnitHp;
  const heroX = RTS_MAP.centerX;
  const heroY = RTS_MAP.centerY;
  let cursor = 0;

  plan[cursor] = {
    id: "unit/hero",
    groupTag: "player",
    ...createUnitComponents({
      x: heroX,
      y: heroY,
      kind: UNIT_KIND.HERO,
      faction: UNIT_FACTION.PLAYER,
      unitIndex: 0,
      ...heroStats,
      hp: playerUnitHp ?? heroStats.hp,
    }),
  };
  cursor += 1;

  const players = createPlayerSpawnBatchPlan({
    config: normalized,
    start: 0,
    count: initialPlayerUnitCount,
  });
  for (const player of players) {
    plan[cursor] = player;
    cursor += 1;
  }

  const enemies = createEnemySpawnBatchPlan({
    config: normalized,
    start: 0,
    count: initialEnemyCount,
  });
  for (const enemy of enemies) {
    plan[cursor] = enemy;
    cursor += 1;
  }

  return plan;
};
