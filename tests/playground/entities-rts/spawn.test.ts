import { describe, expect, it } from "vitest";
import type { EntityIndex } from "@lite-fsm/entities";

import { makeStore, UNIT_FACTION, UNIT_KIND } from "../../../apps/playground/app/examples/entities-rts/store";
import { createRtsMetricsAdapter } from "../../../apps/playground/app/examples/entities-rts/store/metrics";
import { readUnitViews } from "../../../apps/playground/app/examples/entities-rts/store/selectors";
import {
  DEFAULT_ENEMY_SPAWN_BATCH_SIZE,
  DEFAULT_PLAYER_SPAWN_BATCH_SIZE,
} from "../../../apps/playground/app/examples/entities-rts/store/spawn/placement";

const makeTestStore = () =>
  makeStore({
    metrics: createRtsMetricsAdapter(() => 0),
    random: () => 0,
    renderer: { reset: () => undefined },
  });

const spawnTick = (manager: ReturnType<typeof makeTestStore>, tick = 1) => {
  manager.transition({ type: "SPAWN_TICK", payload: { now: tick * 16, deltaMs: 16 } });
};

describe("spawn через @lite-fsm/entities", () => {
  it("создает нужное число entity rows и завершает загрузку через SPAWN_TICK", () => {
    const manager = makeTestStore();

    manager.transition({ type: "GAME_START", payload: { enemyCount: 3, allyCount: 2, seed: "runtime-spawn" } });
    expect(manager.getState().gameSession.state).toBe("SPAWNING");

    spawnTick(manager);

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

  it("дозирует большой enemy spawn по SPAWN_TICK до заданного лимита", () => {
    const manager = makeTestStore();
    const enemyCount = DEFAULT_ENEMY_SPAWN_BATCH_SIZE + 2;

    manager.transition({ type: "GAME_START", payload: { enemyCount, allyCount: 1, seed: "batched-spawn" } });

    expect(manager.entities().get("unitIdentity").count).toBe(DEFAULT_ENEMY_SPAWN_BATCH_SIZE + 2);
    expect(manager.getState().gameSpawn.state).toBe("SPAWNING");
    expect(manager.getState().gameSpawn.context.spawnedEnemyCount).toBe(DEFAULT_ENEMY_SPAWN_BATCH_SIZE);

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });

    expect(manager.entities().get("unitIdentity").count).toBe(DEFAULT_ENEMY_SPAWN_BATCH_SIZE + 2);
    expect(manager.getState().gameSpawn.context.spawnedEnemyCount).toBe(DEFAULT_ENEMY_SPAWN_BATCH_SIZE);

    spawnTick(manager);

    expect(manager.entities().get("unitIdentity").count).toBe(enemyCount + 2);
    expect(manager.getState().gameSpawn.state).toBe("IDLE");
    expect(manager.getState().gameSpawn.context.spawnedEnemyCount).toBe(enemyCount);
    expect(manager.getState().gameSession.state).toBe("READY");
  });

  it("дозирует большой player spawn перед enemy spawn", () => {
    const manager = makeTestStore();
    const allyCount = DEFAULT_PLAYER_SPAWN_BATCH_SIZE + 2;
    const enemyCount = 2;

    manager.transition({ type: "GAME_START", payload: { enemyCount, allyCount, seed: "player-batched-spawn" } });

    expect(manager.entities().get("unitIdentity").count).toBe(DEFAULT_PLAYER_SPAWN_BATCH_SIZE + 1);
    expect(manager.getState().gameSpawn.context.spawnedPlayerUnitCount).toBe(DEFAULT_PLAYER_SPAWN_BATCH_SIZE);
    expect(manager.getState().gameSpawn.context.spawnedEnemyCount).toBe(0);

    manager.transition({ type: "TICK", payload: { now: 16, deltaMs: 16 } });

    expect(manager.entities().get("unitIdentity").count).toBe(DEFAULT_PLAYER_SPAWN_BATCH_SIZE + 1);

    spawnTick(manager);

    expect(manager.entities().get("unitIdentity").count).toBe(allyCount + 1);
    expect(manager.getState().gameSpawn.context.spawnedPlayerUnitCount).toBe(allyCount);
    expect(manager.getState().gameSpawn.context.spawnedEnemyCount).toBe(0);
    expect(manager.getState().gameSession.state).toBe("SPAWNING");

    spawnTick(manager, 2);

    const units = readUnitViews(manager);
    const enemyUnitIndexes: number[] = [];
    for (let raw = 0; raw < units.capacity; raw += 1) {
      const entity = raw as EntityIndex;
      if (!units.identity.has(entity)) continue;
      if (units.identity.kind[entity] !== UNIT_KIND.ENEMY) continue;
      enemyUnitIndexes.push(units.identity.unitIndex[entity]);
    }

    expect(manager.entities().get("unitIdentity").count).toBe(allyCount + enemyCount + 1);
    expect(manager.getState().gameSpawn.context.spawnedEnemyCount).toBe(enemyCount);
    expect(manager.getState().gameSession.state).toBe("READY");
    expect(enemyUnitIndexes).toEqual([0, 1]);
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
