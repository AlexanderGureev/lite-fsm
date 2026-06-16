import { applyGameConfigPatch, DEFAULT_GAME_CONFIG } from "../config";
import type { GameConfig } from "../types";
import {
  UNIT_COMMAND,
  UNIT_FACTION,
  UNIT_KIND,
  type PlannedUnitSpawn,
  type UnitActorSpawnPayload,
} from "../unit-model";
import { createFormationTargets } from "./formation";
import { createSeededRandom, randomBetween, randomInt } from "./random";

export const RTS_MAP = {
  width: 8_192,
  height: 8_192,
  centerX: 4_096,
  centerY: 4_096,
} as const;

const ENEMY_GROUP_SIZE = 80;
const ENEMY_EDGE_PADDING = 160;
const ENEMY_GROUP_SPREAD = 220;

const heroStats = {
  radius: 18,
  speed: 120,
  hp: 5_000,
  attackRange: 120,
  attackDamage: 30,
  attackCooldownMs: 420,
};

const allyStats = {
  radius: 8,
  speed: 145,
  hp: 120,
  attackRange: 96,
  attackDamage: 9,
  attackCooldownMs: 650,
};

const enemyStats = {
  radius: 7,
  speed: 82,
  hp: 45,
  attackRange: 54,
  attackDamage: 6,
  attackCooldownMs: 900,
};

const createUnitPayload = (
  values: Pick<
    UnitActorSpawnPayload,
    "x" | "y" | "kind" | "faction" | "radius" | "speed" | "hp" | "attackRange" | "attackDamage" | "attackCooldownMs"
  > &
    Partial<Pick<UnitActorSpawnPayload, "formationOffsetX" | "formationOffsetY">>,
): UnitActorSpawnPayload => ({
  x: values.x,
  y: values.y,
  vx: 0,
  vy: 0,
  kind: values.kind,
  faction: values.faction,
  radius: values.radius,
  speed: values.speed,
  hp: values.hp,
  maxHp: values.hp,
  attackRange: values.attackRange,
  attackDamage: values.attackDamage,
  attackCooldownMs: values.attackCooldownMs,
  attackTimerMs: 0,
  selected: 0,
  command: UNIT_COMMAND.IDLE,
  targetX: values.x,
  targetY: values.y,
  formationOffsetX: values.formationOffsetX ?? 0,
  formationOffsetY: values.formationOffsetY ?? 0,
});

const enemyAnchorForGroup = (group: number, random: () => number) => {
  const edge = group % 4;
  const x = randomBetween(random, ENEMY_EDGE_PADDING, RTS_MAP.width - ENEMY_EDGE_PADDING);
  const y = randomBetween(random, ENEMY_EDGE_PADDING, RTS_MAP.height - ENEMY_EDGE_PADDING);

  switch (edge) {
    case 0:
      return { x, y: ENEMY_EDGE_PADDING };
    case 1:
      return { x: RTS_MAP.width - ENEMY_EDGE_PADDING, y };
    case 2:
      return { x, y: RTS_MAP.height - ENEMY_EDGE_PADDING };
    default:
      return { x: ENEMY_EDGE_PADDING, y };
  }
};

const clampToMap = (value: number, max: number) => Math.min(max, Math.max(0, value));

export const createGameStartSpawnPlan = (config: GameConfig): readonly PlannedUnitSpawn[] => {
  const normalized = applyGameConfigPatch(DEFAULT_GAME_CONFIG, config);
  const random = createSeededRandom(normalized.seed);
  const plan = new Array<PlannedUnitSpawn>(normalized.enemyCount + normalized.allyCount + 1);
  const playerUnitHp = normalized.playerUnitHp;
  const heroX = RTS_MAP.centerX;
  const heroY = RTS_MAP.centerY;
  let cursor = 0;

  plan[cursor] = {
    id: "unit/hero",
    groupTag: "player",
    unit: createUnitPayload({
      x: heroX,
      y: heroY,
      kind: UNIT_KIND.HERO,
      faction: UNIT_FACTION.PLAYER,
      ...heroStats,
      hp: playerUnitHp ?? heroStats.hp,
    }),
  };
  cursor += 1;

  const allyTargets = createFormationTargets({ x: heroX, y: heroY + 84 }, normalized.allyCount, { spacing: 24 });
  for (let index = 0; index < allyTargets.count; index += 1) {
    const x = allyTargets.x[index];
    const y = allyTargets.y[index];

    plan[cursor] = {
      id: `unit/ally/${index}`,
      groupTag: "player",
      unit: createUnitPayload({
        x,
        y,
        kind: UNIT_KIND.ALLY,
        faction: UNIT_FACTION.PLAYER,
        formationOffsetX: x - heroX,
        formationOffsetY: y - heroY,
        ...allyStats,
        hp: playerUnitHp ?? allyStats.hp,
      }),
    };
    cursor += 1;
  }

  const groupCount = Math.max(1, Math.ceil(normalized.enemyCount / ENEMY_GROUP_SIZE));
  const anchorX = new Float32Array(groupCount);
  const anchorY = new Float32Array(groupCount);

  for (let group = 0; group < groupCount; group += 1) {
    const anchor = enemyAnchorForGroup(group, random);
    anchorX[group] = anchor.x;
    anchorY[group] = anchor.y;
  }

  for (let index = 0; index < normalized.enemyCount; index += 1) {
    const group = randomInt(random, 0, groupCount);
    const angle = randomBetween(random, 0, Math.PI * 2);
    const distance = randomBetween(random, 0, ENEMY_GROUP_SPREAD);
    const x = clampToMap(anchorX[group] + Math.cos(angle) * distance, RTS_MAP.width);
    const y = clampToMap(anchorY[group] + Math.sin(angle) * distance, RTS_MAP.height);

    plan[cursor] = {
      id: `unit/enemy/${index}`,
      groupTag: "enemy",
      unit: createUnitPayload({
        x,
        y,
        kind: UNIT_KIND.ENEMY,
        faction: UNIT_FACTION.ENEMY,
        ...enemyStats,
      }),
    };
    cursor += 1;
  }

  return plan;
};
