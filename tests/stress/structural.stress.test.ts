// Structural stress: sustained churn в реалистичном приложении (domain + actor + middleware +
// subscriber + persist). Проверяет, что внутренние структуры менеджера не растут с количеством
// циклов. Не требует --expose-gc, но запускается через `pnpm run test:stress` (отдельный suite).

import { describe, expect, it } from "vitest";

import { EMPTY_ACTOR_RECORD } from "@lite-fsm/core/internal/actor";

import { createWorld } from "./_fixture";

// Базовый объём — 10k циклов. На моей машине весь suite укладывается в ~1-2 сек.
// Запускающий может временно поднять, если хочется убедиться вручную.
const CYCLES = 10_000;

describe("stress — structural assertions", () => {
  it(`sustained churn (${CYCLES} циклов): public state и счётчики стабильны, actor record возвращается к EMPTY singleton`, () => {
    const world = createWorld();

    const enemyRecordBefore = world.manager.getState().enemy;
    expect(enemyRecordBefore).toBe(EMPTY_ACTOR_RECORD);

    for (let i = 0; i < CYCLES; i++) world.runTick(i);

    const state = world.manager.getState();

    // (1) actor record вернулся к singleton EMPTY_ACTOR_RECORD — ключевой contract для React useSelector.
    expect(state.enemy).toBe(EMPTY_ACTOR_RECORD);
    expect(Object.keys(state.enemy)).toHaveLength(0);

    // (2) Domain machines накопили ожидаемые значения — поведенческий sanity check.
    expect(state.gameSession.context.ticks).toBe(CYCLES);
    expect(state.score.context.kills).toBe(CYCLES);

    // (3) Middleware/subscriber вызывались строго 4 раза за цикл (TICK + SPAWN + KILL + DESPAWN).
    //     Если кто-то начнёт дёргать subscriber лишний раз — поймаем здесь, без зависимости от GC.
    expect(world.middlewareCalls.count).toBe(4 * CYCLES);
    expect(world.subscriberCalls.count).toBe(4 * CYCLES);

    // (4) dehydrate envelope содержит только домены и пустые actor records.
    //     Если sidecar забыл удалить актора — он вылезет здесь.
    const snapshot = world.manager.dehydrate();
    expect(snapshot.machines).toMatchObject({ gameSession: expect.anything(), score: expect.anything() });
    expect(snapshot.machines).not.toHaveProperty("enemy");

    world.dispose();
  });

  it(`subscribe/unsubscribe churn (${CYCLES} циклов): отписанные callback не вызываются`, () => {
    const world = createWorld();

    // На каждой итерации — пара subscribe/unsubscribe + один transition.
    // Если unsubscribe сломается, totalEphemeralCalls вырастет выше CYCLES.
    let totalEphemeralCalls = 0;
    for (let i = 0; i < CYCLES; i++) {
      const ephemeral = world.manager.onTransition(() => {
        totalEphemeralCalls += 1;
      });
      world.manager.transition({ type: "TICK" });
      ephemeral();
      // Следующий TICK уже не должен зайти в ephemeral subscriber.
      world.manager.transition({ type: "TICK" });
    }

    // Каждая итерация регистрирует subscriber → делает 1 transition (он считается) →
    // unsubscribes → ещё 1 transition (не считается). Итого ровно CYCLES вызовов.
    expect(totalEphemeralCalls).toBe(CYCLES);

    // Долгоживущий subscriber из fixture должен зацепить все 2*CYCLES транзакций.
    expect(world.subscriberCalls.count).toBe(2 * CYCLES);

    // gameSession досчитал все TICK'и без потерь.
    expect(world.manager.getState().gameSession.context.ticks).toBe(2 * CYCLES);

    world.dispose();
  });
});
