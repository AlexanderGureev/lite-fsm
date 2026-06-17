import { describe, expect, it } from "vitest";
import type { EntityIndex } from "@lite-fsm/entities";

import {
  ENEMY_INTENT,
  makeStore,
  UNIT_COMMAND,
  UNIT_FACTION,
  UNIT_KIND,
  type GameConfig,
} from "../../../apps/playground/app/examples/entities-rts/store";
import { createRtsMetricsAdapter } from "../../../apps/playground/app/examples/entities-rts/store/metrics";
import {
  readProjectileView,
  readUnitViews,
  unitSelected,
} from "../../../apps/playground/app/examples/entities-rts/store/selectors";
import { RTS_MAP } from "../../../apps/playground/app/examples/entities-rts/store/spawn/placement";

const entity = (index: number) => index as EntityIndex;

const mutableColumn = (column: { readonly [entity: EntityIndex]: number }) =>
  column as { [entity: EntityIndex]: number };

const makeTestStore = () =>
  makeStore({
    metrics: createRtsMetricsAdapter(() => 0),
    random: () => 0,
    renderer: { reset: () => undefined },
  });

const runTicks = (manager: ReturnType<typeof makeTestStore>, count: number, deltaMs = 1_000) => {
  for (let tick = 0; tick < count; tick += 1) {
    manager.transition({ type: "TICK", payload: { now: tick * deltaMs, deltaMs } });
  }
};

const completeSpawn = (manager: ReturnType<typeof makeTestStore>) => {
  for (let tick = 0; tick < 1_000 && manager.getState().gameSession.state !== "READY"; tick += 1) {
    manager.transition({ type: "SPAWN_TICK", payload: { now: tick * 16, deltaMs: 16 } });
  }

  expect(manager.getState().gameSession.state).toBe("READY");
};

const startGame = (manager: ReturnType<typeof makeTestStore>, config: GameConfig) => {
  manager.transition({ type: "GAME_START", payload: config });
  completeSpawn(manager);
};

describe("runtime simulation для entities RTS", () => {
  it("выбирает только player units и очищает выбор при клике по enemy", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 2, allyCount: 2, seed: "selection" });

    const units = readUnitViews(manager);

    manager.transition({
      type: "SELECT_RECT",
      payload: { x: RTS_MAP.centerX - 200, y: RTS_MAP.centerY - 200, width: 400, height: 400 },
    });

    expect(unitSelected(units, entity(0))).toBe(1);
    expect(unitSelected(units, entity(1))).toBe(1);
    expect(unitSelected(units, entity(2))).toBe(1);
    expect(unitSelected(units, entity(3))).toBe(0);
    expect(unitSelected(units, entity(4))).toBe(0);

    manager.transition({ type: "SELECT_ENTITY", payload: { entityId: "unit/ally/0" } });

    expect(unitSelected(units, entity(0))).toBe(0);
    expect(unitSelected(units, entity(1))).toBe(1);
    expect(unitSelected(units, entity(2))).toBe(0);

    manager.transition({ type: "SELECT_ENTITY", payload: { entityId: "unit/enemy/0" } });

    expect(unitSelected(units, entity(0))).toBe(0);
    expect(unitSelected(units, entity(1))).toBe(0);
    expect(unitSelected(units, entity(2))).toBe(0);

    manager.transition({
      type: "SELECT_RECT",
      payload: { x: RTS_MAP.centerX - 200, y: RTS_MAP.centerY - 200, width: 400, height: 400 },
    });
    manager.transition({ type: "CLEAR_SELECTION" });

    expect(unitSelected(units, entity(0))).toBe(0);
    expect(unitSelected(units, entity(1))).toBe(0);
    expect(unitSelected(units, entity(2))).toBe(0);
  });

  it("назначает приказ движения выбранным units и сохраняет formation offsets", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 0, allyCount: 2, seed: "movement" });

    const units = readUnitViews(manager);
    const beforeHeroX = units.movement.x[entity(0)];

    manager.transition({
      type: "SELECT_RECT",
      payload: { x: RTS_MAP.centerX - 240, y: RTS_MAP.centerY - 240, width: 480, height: 480 },
    });
    manager.transition({ type: "ISSUE_MOVE", payload: { x: RTS_MAP.centerX + 320, y: RTS_MAP.centerY } });

    const assignedTargets = new Set(
      [0, 1, 2].map(
        (index) =>
          `${Math.round(units.command.targetX[entity(index)])}:${Math.round(units.command.targetY[entity(index)])}`,
      ),
    );

    expect(assignedTargets.size).toBe(3);
    expect(units.command.command[entity(0)]).toBe(UNIT_COMMAND.MOVE);
    expect(units.command.command[entity(1)]).toBe(UNIT_COMMAND.MOVE);
    expect(units.command.command[entity(2)]).toBe(UNIT_COMMAND.MOVE);

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 100 } });

    expect(units.movement.x[entity(0)]).toBeGreaterThan(beforeHeroX);
  });

  it("unitCommand сбрасывает arrived MOVE в IDLE на TICK", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 0, allyCount: 1, seed: "command-arrival" });

    const units = readUnitViews(manager);
    const hero = entity(0);

    manager.transition({ type: "SELECT_ENTITY", payload: { entityId: "unit/hero" } });
    manager.transition({ type: "ISSUE_MOVE", payload: { x: units.movement.x[hero], y: units.movement.y[hero] } });

    expect(units.command.command[hero]).toBe(UNIT_COMMAND.MOVE);

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });

    expect(units.command.command[hero]).toBe(UNIT_COMMAND.IDLE);
  });

  it("enemyAi выставляет CHASE_HERO и HOLD_ATTACK_RANGE в контролируемом сценарии", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 1, allyCount: 1, seed: "enemy-intent" });

    const units = readUnitViews(manager);
    const enemyAi = manager.entities().get("enemyAi");
    const enemy = entity(2);

    mutableColumn(units.movement.x)[enemy] = RTS_MAP.centerX + 1_000;
    mutableColumn(units.movement.y)[enemy] = RTS_MAP.centerY;

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });

    expect(enemyAi.intent[enemy]).toBe(ENEMY_INTENT.CHASE_HERO);

    mutableColumn(units.movement.x)[enemy] = RTS_MAP.centerX + 40;
    mutableColumn(units.movement.y)[enemy] = RTS_MAP.centerY;
    mutableColumn(units.health.hp)[enemy] = units.health.maxHp[enemy];

    manager.transition({ type: "TICK", payload: { now: 32, deltaMs: 16 } });

    expect(enemyAi.intent[enemy]).toBe(ENEMY_INTENT.HOLD_ATTACK_RANGE);
  });

  it("enemies атакуют hero через incomingDamage и unitHealth на одном TICK", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 1, allyCount: 1, seed: "incoming-damage" });

    const units = readUnitViews(manager);
    const hero = entity(0);
    const enemy = entity(2);
    const initialHeroHp = units.health.hp[hero];

    mutableColumn(units.movement.x)[enemy] = RTS_MAP.centerX + 40;
    mutableColumn(units.movement.y)[enemy] = RTS_MAP.centerY;
    mutableColumn(units.health.hp)[enemy] = units.health.maxHp[enemy];

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 1_000 } });

    expect(units.combat.incomingDamage[hero]).toBeGreaterThan(0);
    expect(units.health.hp[hero]).toBeLessThan(initialHeroHp);
  });

  it("player units выпускают projectiles вместо мгновенного урона в радиусе", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 1, allyCount: 1, seed: "player-projectiles" });

    const units = readUnitViews(manager);
    const projectiles = readProjectileView(manager);
    const hero = entity(0);
    const enemy = entity(2);
    const initialEnemyHp = units.health.hp[enemy];

    mutableColumn(units.movement.x)[enemy] = RTS_MAP.centerX + 90;
    mutableColumn(units.movement.y)[enemy] = RTS_MAP.centerY;
    mutableColumn(units.health.hp)[enemy] = units.health.maxHp[enemy];
    mutableColumn(units.combat.attackTimerMs)[hero] = 0;

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });

    expect(units.combat.incomingDamage[enemy]).toBe(0);
    expect(units.health.hp[enemy]).toBe(initialEnemyHp);
    expect(projectiles.readCount()).toBeGreaterThan(0);

    runTicks(manager, 16, 16);

    expect(units.health.hp[enemy]).toBeLessThan(initialEnemyHp);
  });

  it("player projectiles наносят aoe-урон соседним enemies через spatial index", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 2, allyCount: 1, seed: "player-projectile-aoe" });

    const units = readUnitViews(manager);
    const hero = entity(0);
    const ally = entity(1);
    const primaryEnemy = entity(2);
    const nearbyEnemy = entity(3);
    const initialPrimaryHp = units.health.hp[primaryEnemy];
    const initialNearbyHp = units.health.hp[nearbyEnemy];

    mutableColumn(units.movement.x)[primaryEnemy] = RTS_MAP.centerX + 90;
    mutableColumn(units.movement.y)[primaryEnemy] = RTS_MAP.centerY;
    mutableColumn(units.movement.speed)[primaryEnemy] = 0;
    mutableColumn(units.movement.x)[nearbyEnemy] = RTS_MAP.centerX + 145;
    mutableColumn(units.movement.y)[nearbyEnemy] = RTS_MAP.centerY + 12;
    mutableColumn(units.movement.speed)[nearbyEnemy] = 0;
    mutableColumn(units.health.hp)[primaryEnemy] = units.health.maxHp[primaryEnemy];
    mutableColumn(units.health.hp)[nearbyEnemy] = units.health.maxHp[nearbyEnemy];
    mutableColumn(units.combat.attackTimerMs)[hero] = 0;
    mutableColumn(units.combat.attackTimerMs)[ally] = 10_000;

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });

    expect(units.combat.incomingDamage[primaryEnemy]).toBe(0);
    expect(units.combat.incomingDamage[nearbyEnemy]).toBe(0);

    runTicks(manager, 16, 16);

    expect(units.health.hp[primaryEnemy]).toBeLessThan(initialPrimaryHp);
    expect(units.health.hp[nearbyEnemy]).toBeLessThan(initialNearbyHp);
  });

  it("attackRange расширяет поиск цели для player projectiles за пределами соседних grid cells", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 1, allyCount: 1, seed: "long-range-projectiles" });

    const units = readUnitViews(manager);
    const projectiles = readProjectileView(manager);
    const hero = entity(0);
    const enemy = entity(2);

    mutableColumn(units.movement.x)[enemy] = RTS_MAP.centerX + 1_600;
    mutableColumn(units.movement.y)[enemy] = RTS_MAP.centerY;
    mutableColumn(units.health.hp)[enemy] = units.health.maxHp[enemy];
    mutableColumn(units.combat.attackRange)[hero] = 9_600;
    mutableColumn(units.combat.attackTimerMs)[hero] = 0;

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });

    expect(units.combat.projectileTargetEntity[hero]).toBe(enemy);
    expect(projectiles.readCount()).toBeGreaterThan(0);
  });

  it("назначает attack-move и союзники удаляют погибших enemies через lifecycle", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 8, allyCount: 2, seed: "attack-move" });

    const units = readUnitViews(manager);
    const initialCount = units.identity.count;

    manager.transition({
      type: "SELECT_RECT",
      payload: { x: RTS_MAP.centerX - 240, y: RTS_MAP.centerY - 240, width: 480, height: 480 },
    });
    manager.transition({ type: "ISSUE_ATTACK_MOVE", payload: { x: RTS_MAP.centerX, y: 160 } });

    expect(units.command.command[entity(0)]).toBe(UNIT_COMMAND.ATTACK_MOVE);
    expect(units.command.command[entity(1)]).toBe(UNIT_COMMAND.ATTACK_MOVE);

    runTicks(manager, 60);

    expect(units.identity.count).toBeLessThan(initialCount);
  });

  it("enemy units идут к hero по tick simulation и атакуют его в радиусе", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 40, allyCount: 1, seed: "enemy-attack" });

    const units = readUnitViews(manager);
    const hero = entity(0);
    const initialHeroHp = units.health.hp[hero];

    runTicks(manager, 50);

    expect(units.identity.kind[hero]).toBe(UNIT_KIND.HERO);
    expect(units.identity.faction[hero]).toBe(UNIT_FACTION.PLAYER);
    expect(units.health.hp[hero]).toBeLessThan(initialHeroHp);
  });

  it("смерть hero переводит gameSession в GAME_OVER", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 300, allyCount: 1, seed: "hero-death" });

    const units = readUnitViews(manager);
    mutableColumn(units.combat.attackDamage)[entity(0)] = 0;
    mutableColumn(units.combat.attackDamage)[entity(1)] = 0;

    for (let tick = 0; tick < 150 && manager.getState().gameSession.state !== "GAME_OVER"; tick += 1) {
      manager.transition({ type: "TICK", payload: { now: tick * 1_000, deltaMs: 1_000 } });
    }

    expect(manager.getState().gameSession.state).toBe("GAME_OVER");
  });
});
