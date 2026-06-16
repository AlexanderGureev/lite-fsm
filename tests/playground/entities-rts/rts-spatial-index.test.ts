import { describe, expect, it } from "vitest";
import type { EntityIndex } from "@lite-fsm/entities";

import { makeStore } from "../../../apps/playground/app/examples/entities-rts/store";
import { createRtsMetricsAdapter } from "../../../apps/playground/app/examples/entities-rts/store/metrics";
import { readUnitViews } from "../../../apps/playground/app/examples/entities-rts/store/selectors";
import { RTS_MAP } from "../../../apps/playground/app/examples/entities-rts/store/spawn/placement";

const entity = (index: number) => index as EntityIndex;

const makeTestStore = () =>
  makeStore({
    metrics: createRtsMetricsAdapter(() => 0),
    random: () => 0,
    renderer: { reset: () => undefined },
  });

const tick = (manager: ReturnType<typeof makeTestStore>) => {
  manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });
};

describe("rtsSpatialIndex для entities RTS", () => {
  it("после GAME_START и TICK публикует hero через query-only view", () => {
    const manager = makeTestStore();
    const out = { x: 0, y: 0 };

    manager.transition({ type: "GAME_START", payload: { enemyCount: 2, allyCount: 1, seed: "spatial-hero" } });
    tick(manager);

    const view = manager.entities().get("rtsSpatialIndex").index;

    expect(view.heroEntity()).toBe(entity(0));
    expect(view.heroPosition(out)).toEqual({ x: RTS_MAP.centerX, y: RTS_MAP.centerY });
  });

  it("возвращает enemy neighbors из enemyGrid", () => {
    const manager = makeTestStore();

    manager.transition({ type: "GAME_START", payload: { enemyCount: 2, allyCount: 1, seed: "spatial-enemies" } });
    tick(manager);

    const units = readUnitViews(manager);
    const view = manager.entities().get("rtsSpatialIndex").index;
    const enemy = entity(2);
    const out = new Int32Array(8);
    const count = view.collectEnemyNeighborsAt(units.movement.x[enemy], units.movement.y[enemy], out);

    expect(Array.from(out.slice(0, count))).toContain(Number(enemy));
  });

  it("на GAME_RESTART сбрасывает старые hero и enemy facts", () => {
    const manager = makeTestStore();
    const out = new Int32Array(8);

    manager.transition({ type: "GAME_START", payload: { enemyCount: 2, allyCount: 1, seed: "spatial-reset-a" } });
    tick(manager);

    const units = readUnitViews(manager);
    const view = manager.entities().get("rtsSpatialIndex").index;
    const staleEnemy = entity(2);
    const staleX = units.movement.x[staleEnemy];
    const staleY = units.movement.y[staleEnemy];

    expect(view.collectEnemyNeighborsAt(staleX, staleY, out)).toBeGreaterThan(0);

    manager.transition({ type: "GAME_RESTART" });

    expect(view.heroEntity()).toBeNull();
    expect(view.collectEnemyNeighborsAt(staleX, staleY, out)).toBe(0);

    manager.transition({ type: "GAME_START", payload: { enemyCount: 0, allyCount: 1, seed: "spatial-reset-b" } });
    tick(manager);

    expect(view.heroEntity()).not.toBeNull();
    expect(view.heroPosition({ x: 0, y: 0 })).toEqual({ x: RTS_MAP.centerX, y: RTS_MAP.centerY });
    expect(view.collectEnemyNeighborsAt(staleX, staleY, out)).toBe(0);
  });

  it("публикует timings через readMetrics", () => {
    const manager = makeTestStore();

    manager.transition({ type: "GAME_START", payload: { enemyCount: 1, allyCount: 1, seed: "spatial-metrics" } });
    tick(manager);

    const metrics = manager.entities().get("rtsSpatialIndex").index.readMetrics();

    expect(metrics).toEqual({
      flowFieldRebuildMs: expect.any(Number),
      spatialGridBuildMs: expect.any(Number),
    });
  });
});
