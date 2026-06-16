import { describe, expect, it } from "vitest";
import type { EntityIndex } from "@lite-fsm/entities";

import {
  makeStore,
  UNIT_COMMAND,
  UNIT_FACTION,
  UNIT_KIND,
} from "../../../apps/playground/app/examples/entities-rts/store";
import { createRtsMetricsAdapter } from "../../../apps/playground/app/examples/entities-rts/store/metrics";
import { readUnitViews, unitSelected } from "../../../apps/playground/app/examples/entities-rts/store/selectors";
import { RTS_MAP } from "../../../apps/playground/app/examples/entities-rts/store/sim/spawn-placement";

const entity = (index: number) => index as EntityIndex;

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

describe("runtime simulation для entities RTS", () => {
  it("выбирает только player units и очищает выбор при клике по enemy", () => {
    const manager = makeTestStore();

    manager.transition({ type: "GAME_START", payload: { enemyCount: 2, allyCount: 2, seed: "selection" } });

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

  it("назначает приказ движения выбранным units одним batch event и сохраняет formation offsets", () => {
    const manager = makeTestStore();

    manager.transition({ type: "GAME_START", payload: { enemyCount: 0, allyCount: 2, seed: "movement" } });

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

  it("назначает attack-move и союзники удаляют погибших enemies через lifecycle", () => {
    const manager = makeTestStore();

    manager.transition({ type: "GAME_START", payload: { enemyCount: 8, allyCount: 2, seed: "attack-move" } });

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

    manager.transition({ type: "GAME_START", payload: { enemyCount: 40, allyCount: 1, seed: "enemy-attack" } });

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

    manager.transition({ type: "GAME_START", payload: { enemyCount: 300, allyCount: 1, seed: "hero-death" } });

    for (let tick = 0; tick < 150 && manager.getState().gameSession.state !== "GAME_OVER"; tick += 1) {
      manager.transition({ type: "TICK", payload: { now: tick * 1_000, deltaMs: 1_000 } });
    }

    expect(manager.getState().gameSession.state).toBe("GAME_OVER");
  });
});
