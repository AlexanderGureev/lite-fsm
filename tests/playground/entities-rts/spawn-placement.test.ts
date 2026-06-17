import { describe, expect, it } from "vitest";

import {
  createEnemySpawnBatchPlan,
  enemySpeedForSpawn,
  createGameStartSpawnPlan,
  createPlayerSpawnBatchPlan,
  DEFAULT_ENEMY_SPAWN_BATCH_SIZE,
  DEFAULT_PLAYER_SPAWN_BATCH_SIZE,
  RTS_MAP,
} from "../../../apps/playground/app/examples/entities-rts/store/spawn/placement";
import { UNIT_FACTION, UNIT_KIND } from "../../../apps/playground/app/examples/entities-rts/store/unit-model";

describe("spawn placement для RTS", () => {
  it("создает hero, allies и enemies из одного config", () => {
    const plan = createGameStartSpawnPlan({ enemyCount: 64, allyCount: 4, seed: "spawn-seed" });
    const hero = plan[0];
    const allies = plan.filter((unit) => unit.identity.kind === UNIT_KIND.ALLY);
    const enemies = plan.filter((unit) => unit.identity.kind === UNIT_KIND.ENEMY);

    expect(plan).toHaveLength(69);
    expect(hero).toMatchObject({
      id: "unit/hero",
      groupTag: "player",
      identity: {
        kind: UNIT_KIND.HERO,
        faction: UNIT_FACTION.PLAYER,
      },
      movement: {
        x: RTS_MAP.centerX,
        y: RTS_MAP.centerY,
      },
    });
    expect(allies).toHaveLength(4);
    expect(enemies).toHaveLength(64);
    expect(new Set(allies.map((unit) => `${unit.movement.x}:${unit.movement.y}`)).size).toBe(4);
    expect(enemies.every((unit) => unit.groupTag === "enemy" && unit.identity.faction === UNIT_FACTION.ENEMY)).toBe(
      true,
    );
  });

  it("нормализует config и остается детерминированным по seed", () => {
    const left = createGameStartSpawnPlan({ enemyCount: -1, allyCount: 0, seed: "  " });
    const right = createGameStartSpawnPlan({ enemyCount: -1, allyCount: 0, seed: "  " });

    expect(left).toHaveLength(2);
    expect(left).toEqual(right);
    expect(left[1]?.id).toBe("unit/ally/0");
  });

  it("строит детерминированный enemy batch по диапазону индексов", () => {
    const payload = {
      config: { enemyCount: DEFAULT_ENEMY_SPAWN_BATCH_SIZE + 20, allyCount: 1, seed: "enemy-batch" },
      start: DEFAULT_ENEMY_SPAWN_BATCH_SIZE,
      count: 3,
    };
    const left = createEnemySpawnBatchPlan(payload);
    const right = createEnemySpawnBatchPlan(payload);

    expect(left).toEqual(right);
    expect(left.map((unit) => unit.id)).toEqual([
      `unit/enemy/${DEFAULT_ENEMY_SPAWN_BATCH_SIZE}`,
      `unit/enemy/${DEFAULT_ENEMY_SPAWN_BATCH_SIZE + 1}`,
      `unit/enemy/${DEFAULT_ENEMY_SPAWN_BATCH_SIZE + 2}`,
    ]);
    expect(left.every((unit) => unit.identity.kind === UNIT_KIND.ENEMY)).toBe(true);
  });

  it("варьирует скорость enemies и разносит большую орду в широкую полосу от края", () => {
    const plan = createEnemySpawnBatchPlan({
      config: { enemyCount: 10_000, allyCount: 1, seed: "enemy-horde-scale" },
      start: 0,
      count: DEFAULT_ENEMY_SPAWN_BATCH_SIZE,
    });
    const speeds = plan.map((unit) => unit.movement.speed);
    const uniqueRoundedSpeeds = new Set(speeds.map((speed) => Math.round(speed)));
    const maxEdgeDepth = Math.max(
      ...plan.map((unit) =>
        Math.min(unit.movement.x, unit.movement.y, RTS_MAP.width - unit.movement.x, RTS_MAP.height - unit.movement.y),
      ),
    );

    expect(uniqueRoundedSpeeds.size).toBeGreaterThan(12);
    expect(Math.min(...speeds)).toBeGreaterThanOrEqual(68);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(104);
    expect(maxEdgeDepth).toBeGreaterThan(520);
  });

  it("масштабирует вариативность enemy speed от базовой скорости", () => {
    expect(enemySpeedForSpawn(164, () => 0)).toBe(136);
    expect(enemySpeedForSpawn(164, () => 1)).toBe(208);
    expect(enemySpeedForSpawn(0, () => 1)).toBe(0);
  });

  it("откладывает initial enemy batch пока player batch не закрывает allyCount", () => {
    const plan = createGameStartSpawnPlan({
      enemyCount: 4,
      allyCount: DEFAULT_PLAYER_SPAWN_BATCH_SIZE + 1,
      seed: "large-player-start",
    });
    const allies = plan.filter((unit) => unit.identity.kind === UNIT_KIND.ALLY);
    const enemies = plan.filter((unit) => unit.identity.kind === UNIT_KIND.ENEMY);

    expect(plan).toHaveLength(DEFAULT_PLAYER_SPAWN_BATCH_SIZE + 1);
    expect(allies).toHaveLength(DEFAULT_PLAYER_SPAWN_BATCH_SIZE);
    expect(enemies).toHaveLength(0);
  });

  it("строит детерминированный player batch по диапазону индексов", () => {
    const payload = {
      config: { enemyCount: 0, allyCount: DEFAULT_PLAYER_SPAWN_BATCH_SIZE + 20, seed: "player-batch" },
      start: DEFAULT_PLAYER_SPAWN_BATCH_SIZE,
      count: 3,
    };
    const left = createPlayerSpawnBatchPlan(payload);
    const right = createPlayerSpawnBatchPlan(payload);

    expect(left).toEqual(right);
    expect(left.map((unit) => unit.id)).toEqual([
      `unit/ally/${DEFAULT_PLAYER_SPAWN_BATCH_SIZE}`,
      `unit/ally/${DEFAULT_PLAYER_SPAWN_BATCH_SIZE + 1}`,
      `unit/ally/${DEFAULT_PLAYER_SPAWN_BATCH_SIZE + 2}`,
    ]);
    expect(left.every((unit) => unit.identity.kind === UNIT_KIND.ALLY)).toBe(true);
  });
});
