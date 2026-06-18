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
import { captureRtsBenchmarkReport } from "../../../apps/playground/app/examples/entities-rts/store/benchmark-report";
import {
  createRtsMetricsAdapter,
  type MetricsAdapter,
} from "../../../apps/playground/app/examples/entities-rts/store/metrics";
import {
  readRtsEntityStats,
  readProjectileView,
  readUnitViews,
  unitSelected,
} from "../../../apps/playground/app/examples/entities-rts/store/selectors";
import { RTS_MAP } from "../../../apps/playground/app/examples/entities-rts/store/spawn/placement";
import { UNIT_SELECTION } from "../../../apps/playground/app/examples/entities-rts/store/unit-model";

const entity = (index: number) => index as EntityIndex;

const mutableColumn = (column: { readonly [entity: EntityIndex]: number }) =>
  column as { [entity: EntityIndex]: number };

const makeTestStore = (metrics: MetricsAdapter = createRtsMetricsAdapter(() => 0)) =>
  makeStore({
    metrics,
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

type DeathAuditAction = {
  readonly type: string;
  readonly payload?: { readonly count?: number };
  readonly meta?: { readonly entityId?: string | readonly string[] };
};

const toEntityRoutes = (entityId: string | readonly string[] | undefined) => {
  if (entityId === undefined) return [];
  return typeof entityId === "string" ? [entityId] : [...entityId];
};

const collectDeathAudit = (manager: ReturnType<typeof makeTestStore>) => {
  const audit = {
    unitDeadRoutes: [] as string[][],
    heroDeadCount: 0,
    enemiesKilledCounts: [] as number[],
  };

  manager.onTransition((_prev, _next, action) => {
    const event = action as DeathAuditAction;

    if (event.type === "UNIT_DEAD") {
      audit.unitDeadRoutes.push(toEntityRoutes(event.meta?.entityId));
      return;
    }

    if (event.type === "HERO_DEAD") {
      audit.heroDeadCount += 1;
      return;
    }

    if (event.type === "ENEMIES_KILLED") {
      audit.enemiesKilledCounts.push(event.payload?.count ?? 0);
    }
  });

  return audit;
};

describe("runtime simulation для entities RTS", () => {
  it("simulation hot path принимает явный TICK без FRAME coordinator", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 0, allyCount: 1, seed: "explicit-tick" });

    const ticksBeforeTick = manager.getState().gameSession.context.tickCount;
    const tickEvents: string[] = [];
    const unsubscribeTickAudit = manager.onTransition((_prev, _next, action) => {
      tickEvents.push(action.type);
    });

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });
    unsubscribeTickAudit();

    expect(tickEvents).toEqual(["TICK"]);
    expect(manager.getState().gameSession.context.tickCount).toBe(ticksBeforeTick + 1);
  });

  it("player commands игнорируются store при PAUSED gameSession", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 0, allyCount: 1, seed: "command-gate" });

    const units = readUnitViews(manager);
    const hero = entity(0);

    manager.transition({ type: "SELECT_ENTITY", payload: { entityId: "unit/hero" } });
    expect(unitSelected(units, hero)).toBe(1);

    manager.transition({ type: "GAME_PAUSE" });
    manager.transition({ type: "CLEAR_SELECTION" });
    manager.transition({ type: "ISSUE_MOVE", payload: { x: RTS_MAP.centerX + 320, y: RTS_MAP.centerY } });

    expect(unitSelected(units, hero)).toBe(1);
    expect(units.command.command[hero]).toBe(UNIT_COMMAND.IDLE);
  });

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

  it("projectile impact накапливает события эффектов для AOE-центра и каждого задетого enemy", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 2, allyCount: 1, seed: "player-projectile-effects" });

    const units = readUnitViews(manager);
    const projectiles = readProjectileView(manager);
    const hero = entity(0);
    const ally = entity(1);
    const primaryEnemy = entity(2);
    const nearbyEnemy = entity(3);

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

    const impactCursor = projectiles.readImpactEventCursor();
    const hitCursor = projectiles.readHitEventCursor();

    runTicks(manager, 16, 16);

    const nextImpactCursor = projectiles.readImpactEventCursor();
    const nextHitCursor = projectiles.readHitEventCursor();
    const firstImpact = projectiles.readImpactEventSlot(projectiles.readImpactEventStart(impactCursor));

    expect(nextImpactCursor).toBeGreaterThan(impactCursor);
    expect(projectiles.readImpactEventRadius()[firstImpact]).toBeGreaterThan(0);
    expect(nextHitCursor - projectiles.readHitEventStart(hitCursor)).toBeGreaterThanOrEqual(2);
    expect("clearEffectEvents" in projectiles).toBe(false);
    expect(projectiles.readImpactEventStart(nextImpactCursor)).toBe(nextImpactCursor);
    expect(projectiles.readHitEventStart(nextHitCursor)).toBe(nextHitCursor);
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
    const initialEnemies = readRtsEntityStats(units).enemies;

    manager.transition({
      type: "SELECT_RECT",
      payload: { x: RTS_MAP.centerX - 240, y: RTS_MAP.centerY - 240, width: 480, height: 480 },
    });
    manager.transition({ type: "ISSUE_ATTACK_MOVE", payload: { x: RTS_MAP.centerX, y: 160 } });

    expect(units.command.command[entity(0)]).toBe(UNIT_COMMAND.ATTACK_MOVE);
    expect(units.command.command[entity(1)]).toBe(UNIT_COMMAND.ATTACK_MOVE);

    runTicks(manager, 60);

    expect(readRtsEntityStats(units).enemies).toBeLessThan(initialEnemies);
    expect(manager.getState().gameSession.context.killedEnemyCount).toBeGreaterThan(0);
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

  it("завершает бенч, когда уничтожены все enemies, и фиксирует отчет", () => {
    const metrics = createRtsMetricsAdapter(() => 0);
    const manager = makeTestStore(metrics);

    startGame(manager, { enemyCount: 2, allyCount: 0, seed: "benchmark-complete" });

    manager.transition({ type: "TICK", payload: { now: 100, deltaMs: 100 } });
    manager.transition({ type: "ENEMY_KILLED", payload: { entityId: "unit/enemy/0" } });

    expect(manager.getState().gameSession.state).toBe("READY");

    manager.transition({ type: "TICK", payload: { now: 200, deltaMs: 100 } });
    manager.transition({ type: "ENEMY_KILLED", payload: { entityId: "unit/enemy/1" } });

    expect(manager.getState().gameSession.state).toBe("BENCHMARK_COMPLETE");
    expect(manager.getState().gameSession.context.killedEnemyCount).toBe(2);
    expect(manager.getState().gameSession.context.elapsedMs).toBeGreaterThan(0);

    metrics.recordFrame(16);
    metrics.recordTickMs(2.5);
    metrics.recordSyncMs(3.5);
    metrics.recordSimulationMetrics({ flowFieldRebuildMs: 1.25, spatialGridBuildMs: 2.5 });

    captureRtsBenchmarkReport(manager, metrics);

    const report = manager.getState().gameSession.context.report;

    expect(report).toMatchObject({
      run: 1,
      seed: "benchmark-complete",
      enemyCount: 2,
      allyCount: 1,
      enemiesKilled: 2,
      tickCount: expect.any(Number),
      metrics: {
        flowFieldRebuildMs: 1.25,
        spatialGridBuildMs: 2.5,
      },
    });
    expect(report?.killsPerSecond).toBeGreaterThan(0);
  });

  it("учитывает batch уничтоженных enemies без отдельных событий на каждую строку", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 3, allyCount: 0, seed: "benchmark-batch-complete" });

    manager.transition({ type: "TICK", payload: { now: 100, deltaMs: 100 } });
    manager.transition({ type: "ENEMIES_KILLED", payload: { count: 3 } });

    expect(manager.getState().gameSession.state).toBe("BENCHMARK_COMPLETE");
    expect(manager.getState().gameSession.context.killedEnemyCount).toBe(3);
  });

  it("смерть нескольких enemies отправляет один batched UNIT_DEAD и despawn-ит non-hero actors", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 2, allyCount: 1, seed: "unit-dead-batch" });

    const units = readUnitViews(manager);
    const audit = collectDeathAudit(manager);
    const hero = entity(0);
    const ally = entity(1);
    const firstEnemy = entity(2);
    const secondEnemy = entity(3);

    mutableColumn(units.movement.x)[firstEnemy] = RTS_MAP.centerX + 80;
    mutableColumn(units.movement.y)[firstEnemy] = RTS_MAP.centerY;
    mutableColumn(units.movement.x)[secondEnemy] = RTS_MAP.centerX + 96;
    mutableColumn(units.movement.y)[secondEnemy] = RTS_MAP.centerY + 8;
    mutableColumn(units.movement.speed)[firstEnemy] = 0;
    mutableColumn(units.movement.speed)[secondEnemy] = 0;
    mutableColumn(units.health.hp)[firstEnemy] = 1;
    mutableColumn(units.health.hp)[secondEnemy] = 1;
    mutableColumn(units.combat.attackDamage)[hero] = 10_000;
    mutableColumn(units.combat.attackRange)[hero] = 1_000;
    mutableColumn(units.combat.attackTimerMs)[hero] = 0;
    mutableColumn(units.combat.projectileSpeed)[hero] = 10_000;
    mutableColumn(units.combat.projectileImpactRadius)[hero] = 256;
    mutableColumn(units.combat.attackDamage)[ally] = 0;
    mutableColumn(units.combat.attackTimerMs)[ally] = 10_000;

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });
    manager.transition({ type: "TICK", payload: { now: 1_016, deltaMs: 1_000 } });

    expect(audit.unitDeadRoutes).toHaveLength(1);
    expect([...audit.unitDeadRoutes[0]].sort()).toEqual(["unit/enemy/0", "unit/enemy/1"]);
    expect(audit.enemiesKilledCounts).toEqual([2]);
    expect(audit.heroDeadCount).toBe(0);
    expect(manager.getState().gameSession.context.killedEnemyCount).toBe(2);
    expect(units.identity.has(firstEnemy)).toBe(false);
    expect(units.identity.has(secondEnemy)).toBe(false);
    expect(units.movement.has(firstEnemy)).toBe(false);
    expect(units.movement.has(secondEnemy)).toBe(false);
    expect(units.health.has(firstEnemy)).toBe(false);
    expect(units.health.has(secondEnemy)).toBe(false);
    expect(units.combat.has(firstEnemy)).toBe(false);
    expect(units.combat.has(secondEnemy)).toBe(false);
    expect(manager.entities().get("enemyAi").has(firstEnemy)).toBe(false);
    expect(manager.entities().get("enemyAi").has(secondEnemy)).toBe(false);

    manager.transition({ type: "TICK", payload: { now: 2_016, deltaMs: 1_000 } });

    expect(audit.unitDeadRoutes).toHaveLength(1);
    expect([...audit.unitDeadRoutes[0]].sort()).toEqual(["unit/enemy/0", "unit/enemy/1"]);
    expect(audit.enemiesKilledCounts).toEqual([2]);
    expect(audit.heroDeadCount).toBe(0);
  });

  it("UNIT_DEAD очищает hot columns и переводит routed non-hero rows в despawn", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 1, allyCount: 1, seed: "unit-dead-cleanup" });

    const units = readUnitViews(manager);
    const enemyAi = manager.entities().get("enemyAi");
    const ally = entity(1);
    const enemy = entity(2);

    mutableColumn(units.movement.vx)[ally] = 10;
    mutableColumn(units.movement.vy)[ally] = 11;
    mutableColumn(units.movement.vx)[enemy] = 12;
    mutableColumn(units.movement.vy)[enemy] = 13;
    mutableColumn(units.combat.attackTimerMs)[ally] = 100;
    mutableColumn(units.combat.incomingDamage)[ally] = 200;
    mutableColumn(units.combat.projectileTargetEntity)[ally] = enemy;
    mutableColumn(units.combat.projectileDamage)[ally] = 300;
    mutableColumn(units.command.command)[ally] = UNIT_COMMAND.ATTACK_MOVE;
    mutableColumn(units.command.targetX)[ally] = 123;
    mutableColumn(units.command.targetY)[ally] = 456;
    mutableColumn(units.command.formationOffsetX)[ally] = 7;
    mutableColumn(units.command.formationOffsetY)[ally] = 8;
    mutableColumn(units.selection.selected)[ally] = UNIT_SELECTION.SELECTED;
    mutableColumn(enemyAi.intent)[enemy] = ENEMY_INTENT.CHASE_HERO;

    manager.transition({
      type: "UNIT_DEAD",
      meta: { entityId: ["unit/ally/0", "unit/enemy/0"] },
    } as never);

    expect(units.movement.vx[ally]).toBe(0);
    expect(units.movement.vy[ally]).toBe(0);
    expect(units.movement.vx[enemy]).toBe(0);
    expect(units.movement.vy[enemy]).toBe(0);
    expect(units.combat.attackTimerMs[ally]).toBe(0);
    expect(units.combat.incomingDamage[ally]).toBe(0);
    expect(units.combat.projectileTargetEntity[ally]).toBe(-1);
    expect(units.combat.projectileDamage[ally]).toBe(0);
    expect(units.command.command[ally]).toBe(UNIT_COMMAND.IDLE);
    expect(units.command.targetX[ally]).toBe(0);
    expect(units.command.targetY[ally]).toBe(0);
    expect(units.command.formationOffsetX[ally]).toBe(0);
    expect(units.command.formationOffsetY[ally]).toBe(0);
    expect(units.selection.selected[ally]).toBe(UNIT_SELECTION.UNSELECTED);
    expect(enemyAi.intent[enemy]).toBe(ENEMY_INTENT.IDLE);
    expect(units.identity.has(ally)).toBe(false);
    expect(units.command.has(ally)).toBe(false);
    expect(units.selection.has(ally)).toBe(false);
    expect(units.identity.has(enemy)).toBe(false);
    expect(enemyAi.has(enemy)).toBe(false);
  });

  it("смерть hero переводит gameSession в GAME_OVER", () => {
    const manager = makeTestStore();

    startGame(manager, { enemyCount: 1, allyCount: 1, seed: "hero-death" });

    const units = readUnitViews(manager);
    const audit = collectDeathAudit(manager);
    const hero = entity(0);
    const ally = entity(1);
    const enemy = entity(2);

    mutableColumn(units.health.hp)[hero] = 1;
    mutableColumn(units.movement.x)[enemy] = RTS_MAP.centerX + 40;
    mutableColumn(units.movement.y)[enemy] = RTS_MAP.centerY;
    mutableColumn(units.movement.speed)[enemy] = 0;
    mutableColumn(units.combat.attackDamage)[hero] = 0;
    mutableColumn(units.combat.attackDamage)[ally] = 0;
    mutableColumn(units.combat.attackDamage)[enemy] = 10_000;
    mutableColumn(units.combat.attackTimerMs)[enemy] = 0;
    mutableColumn(units.movement.vx)[hero] = 10;
    mutableColumn(units.movement.vy)[hero] = 11;
    mutableColumn(units.combat.attackTimerMs)[hero] = 100;
    mutableColumn(units.combat.incomingDamage)[hero] = 200;
    mutableColumn(units.combat.projectileTargetEntity)[hero] = enemy;
    mutableColumn(units.combat.projectileDamage)[hero] = 300;
    mutableColumn(units.command.command)[hero] = UNIT_COMMAND.MOVE;
    mutableColumn(units.command.targetX)[hero] = 123;
    mutableColumn(units.command.targetY)[hero] = 456;
    mutableColumn(units.command.formationOffsetX)[hero] = 7;
    mutableColumn(units.command.formationOffsetY)[hero] = 8;
    mutableColumn(units.selection.selected)[hero] = UNIT_SELECTION.SELECTED;

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 1_000 } });

    expect(manager.getState().gameSession.state).toBe("GAME_OVER");
    expect(audit.unitDeadRoutes).toEqual([["unit/hero"]]);
    expect(audit.heroDeadCount).toBe(1);
    expect(audit.enemiesKilledCounts).toEqual([]);
    expect(units.identity.has(hero)).toBe(true);
    expect(units.health.has(hero)).toBe(true);
    expect(units.movement.has(hero)).toBe(true);
    expect(units.combat.has(hero)).toBe(true);
    expect(units.command.has(hero)).toBe(true);
    expect(units.selection.has(hero)).toBe(true);
    expect(units.health.state(hero)).toBe("DEAD");
    expect(units.movement.state(hero)).toBe("STOPPED");
    expect(units.combat.state(hero)).toBe("DISABLED");
    expect(units.command.state(hero)).toBe("DISABLED");
    expect(units.selection.state(hero)).toBe("DISABLED");
    expect(units.movement.vx[hero]).toBe(0);
    expect(units.movement.vy[hero]).toBe(0);
    expect(units.combat.attackTimerMs[hero]).toBe(0);
    expect(units.combat.incomingDamage[hero]).toBe(0);
    expect(units.combat.projectileTargetEntity[hero]).toBe(-1);
    expect(units.combat.projectileDamage[hero]).toBe(0);
    expect(units.command.command[hero]).toBe(UNIT_COMMAND.IDLE);
    expect(units.command.targetX[hero]).toBe(0);
    expect(units.command.targetY[hero]).toBe(0);
    expect(units.command.formationOffsetX[hero]).toBe(0);
    expect(units.command.formationOffsetY[hero]).toBe(0);
    expect(units.selection.selected[hero]).toBe(UNIT_SELECTION.UNSELECTED);

    manager.transition({ type: "TICK", payload: { now: 1_016, deltaMs: 1_000 } });

    expect(audit.unitDeadRoutes).toEqual([["unit/hero"]]);
    expect(audit.heroDeadCount).toBe(1);
    expect(audit.enemiesKilledCounts).toEqual([]);
  });
});
