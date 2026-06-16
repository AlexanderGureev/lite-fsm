import { describe, expect, it } from "vitest";
import type { EntityIndex } from "@lite-fsm/entities";

import {
  makeStore,
  UNIT_FACTION,
  UNIT_KIND,
} from "../../../apps/playground/app/examples/entities-rts/store";
import { createRtsMetricsAdapter } from "../../../apps/playground/app/examples/entities-rts/store/metrics";
import { readUnitViews } from "../../../apps/playground/app/examples/entities-rts/store/selectors";

const makeTestStore = () =>
  makeStore({
    metrics: createRtsMetricsAdapter(() => 0),
    random: () => 0,
    renderer: { reset: () => undefined },
  });

describe("spawn через @lite-fsm/entities", () => {
  it("создает нужное число entity rows из одного GAME_START", () => {
    const manager = makeTestStore();

    manager.transition({ type: "GAME_START", payload: { enemyCount: 3, allyCount: 2, seed: "runtime-spawn" } });

    const units = readUnitViews(manager);
    const counters = { heroes: 0, allies: 0, enemies: 0, player: 0, enemy: 0 };

    for (let raw = 0; raw < 12; raw += 1) {
      const entity = raw as EntityIndex;
      if (!units.identity.has(entity)) continue;

      if (units.identity.kind[entity] === UNIT_KIND.HERO) counters.heroes += 1;
      if (units.identity.kind[entity] === UNIT_KIND.ALLY) counters.allies += 1;
      if (units.identity.kind[entity] === UNIT_KIND.ENEMY) counters.enemies += 1;
      if (units.identity.faction[entity] === UNIT_FACTION.PLAYER) counters.player += 1;
      if (units.identity.faction[entity] === UNIT_FACTION.ENEMY) counters.enemy += 1;

      expect(units.health.state(entity)).toBe("ALIVE");
      expect(units.health.hp[entity]).toBe(units.health.maxHp[entity]);
    }

    expect(manager.getState().gameSession.state).toBe("READY");
    expect(units.identity.count).toBe(6);
    expect(counters).toEqual({ heroes: 1, allies: 2, enemies: 3, player: 3, enemy: 3 });
  });

  it("очищает rows при GAME_RESTART перед следующим запуском", () => {
    const manager = makeTestStore();

    manager.transition({ type: "GAME_START", payload: { enemyCount: 2, allyCount: 1, seed: "first-run" } });
    expect(manager.entities().get("unitIdentity").count).toBe(4);

    manager.transition({ type: "GAME_RESTART" });
    expect(manager.entities().get("unitIdentity").count).toBe(0);

    manager.transition({ type: "GAME_START", payload: { enemyCount: 1, allyCount: 1, seed: "second-run" } });
    expect(manager.entities().get("unitIdentity").count).toBe(3);
  });
});
