import { describe, expect, it } from "vitest";

import {
  createGameStartSpawnPlan,
  RTS_MAP,
} from "../../../apps/playground/app/examples/entities-rts/store/sim/spawn-placement";
import { UNIT_FACTION, UNIT_KIND } from "../../../apps/playground/app/examples/entities-rts/store/unit-model";

describe("spawn placement для RTS", () => {
  it("создает hero, allies и enemies из одного config", () => {
    const plan = createGameStartSpawnPlan({ enemyCount: 241, allyCount: 4, seed: "spawn-seed" });
    const hero = plan[0];
    const allies = plan.filter((unit) => unit.unit.kind === UNIT_KIND.ALLY);
    const enemies = plan.filter((unit) => unit.unit.kind === UNIT_KIND.ENEMY);

    expect(plan).toHaveLength(246);
    expect(hero).toMatchObject({
      id: "unit/hero",
      groupTag: "player",
      unit: {
        x: RTS_MAP.centerX,
        y: RTS_MAP.centerY,
        kind: UNIT_KIND.HERO,
        faction: UNIT_FACTION.PLAYER,
      },
    });
    expect(allies).toHaveLength(4);
    expect(enemies).toHaveLength(241);
    expect(new Set(allies.map((unit) => `${unit.unit.x}:${unit.unit.y}`)).size).toBe(4);
    expect(enemies.every((unit) => unit.groupTag === "enemy" && unit.unit.faction === UNIT_FACTION.ENEMY)).toBe(true);
  });

  it("нормализует config и остается детерминированным по seed", () => {
    const left = createGameStartSpawnPlan({ enemyCount: -1, allyCount: 0, seed: "  " });
    const right = createGameStartSpawnPlan({ enemyCount: -1, allyCount: 0, seed: "  " });

    expect(left).toHaveLength(2);
    expect(left).toEqual(right);
    expect(left[1]?.id).toBe("unit/ally/0");
  });
});
