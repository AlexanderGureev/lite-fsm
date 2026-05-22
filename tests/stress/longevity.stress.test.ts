// Longevity stress: heap diff после большого workload. Цель — поймать cumulative leak
// (микро-утечки, которые не видны на WeakRef-тестах, но накапливаются в долгоживущем
// приложении). Требует --expose-gc:
//   pnpm run test:stress

import { describe, expect, it } from "vitest";

import { createWorld } from "./_fixture";

const gc: (() => void) | undefined = (globalThis as { gc?: () => void }).gc;

// Объёмы подобраны так, чтобы suite укладывался в ~10-20 сек на типичной dev-машине.
// При локальном анализе можно временно увеличить.
const SUSTAINED_CYCLES = 100_000;
const SUBS_CYCLES = 50_000;
const PERSIST_CYCLES = 5_000;
const WARMUP = 2_000;

// Пороги — щедрые, чтобы не быть flaky на CI/разных Node-версиях. Реальный leak с накоплением
// сотен байт на итерацию даст diff в десятки MB и провалит тест уверенно.
const SUSTAINED_THRESHOLD_BYTES = 12 * 1024 * 1024;
const SUBS_THRESHOLD_BYTES = 8 * 1024 * 1024;
const PERSIST_THRESHOLD_BYTES = 8 * 1024 * 1024;

const settle = async (): Promise<void> => {
  if (!gc) return;
  for (let i = 0; i < 5; i++) {
    gc();
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const formatMb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const measure = async (): Promise<number> => {
  await settle();
  return process.memoryUsage().heapUsed;
};

const describeIfGc = gc ? describe : describe.skip;

describeIfGc("stress — longevity heap diff (требует --expose-gc)", () => {
  it(`sustained churn ${SUSTAINED_CYCLES.toLocaleString()} циклов: heap diff < ${formatMb(SUSTAINED_THRESHOLD_BYTES)}`, async () => {
    const world = createWorld();

    // Warmup: JIT и persist setup, чтобы baseline не включал инициализационные allocations.
    for (let i = 0; i < WARMUP; i++) world.runTick(i);
    const baseline = await measure();

    for (let i = WARMUP; i < WARMUP + SUSTAINED_CYCLES; i++) world.runTick(i);
    const after = await measure();

    const diff = after - baseline;
    console.log(`[stress] sustained churn heap diff: ${formatMb(diff)} (baseline=${formatMb(baseline)}, after=${formatMb(after)})`);

    expect(diff).toBeLessThan(SUSTAINED_THRESHOLD_BYTES);

    world.dispose();
  });

  it(`subscribe/unsubscribe churn ${SUBS_CYCLES.toLocaleString()} циклов: heap diff < ${formatMb(SUBS_THRESHOLD_BYTES)}`, async () => {
    const world = createWorld();

    // Прогрев subscriber-цикла.
    for (let i = 0; i < WARMUP; i++) {
      const unsubscribe = world.manager.onTransition(() => {});
      world.manager.transition({ type: "TICK" });
      unsubscribe();
    }
    const baseline = await measure();

    for (let i = 0; i < SUBS_CYCLES; i++) {
      const unsubscribe = world.manager.onTransition(() => {});
      world.manager.transition({ type: "TICK" });
      unsubscribe();
    }
    const after = await measure();

    const diff = after - baseline;
    console.log(`[stress] subscribe churn heap diff: ${formatMb(diff)} (baseline=${formatMb(baseline)}, after=${formatMb(after)})`);

    expect(diff).toBeLessThan(SUBS_THRESHOLD_BYTES);

    world.dispose();
  });

  it(`persist start/stop ${PERSIST_CYCLES.toLocaleString()} циклов: heap diff < ${formatMb(PERSIST_THRESHOLD_BYTES)}`, async () => {
    // Здесь не используем fixture-controller: нам нужен свой manager + цикл start/stop
    // persistController'а, чтобы поймать накопление в taskScope/saveTimer/statusSubscribers.
    const world = createWorld();
    world.dispose(); // отключаем persist из fixture — он будет создаваться вручную.

    const { persistManager } = await import("@lite-fsm/persist");

    for (let i = 0; i < WARMUP; i++) {
      const controller = persistManager(world.manager, {
        storage: { get: () => undefined, set: () => {}, remove: () => {}, subscribe: () => () => {} },
      });
      const stop = controller.start();
      world.manager.transition({ type: "TICK" });
      stop();
    }
    const baseline = await measure();

    for (let i = 0; i < PERSIST_CYCLES; i++) {
      const controller = persistManager(world.manager, {
        storage: { get: () => undefined, set: () => {}, remove: () => {}, subscribe: () => () => {} },
      });
      const stop = controller.start();
      world.manager.transition({ type: "TICK" });
      stop();
    }
    const after = await measure();

    const diff = after - baseline;
    console.log(`[stress] persist start/stop heap diff: ${formatMb(diff)} (baseline=${formatMb(baseline)}, after=${formatMb(after)})`);

    expect(diff).toBeLessThan(PERSIST_THRESHOLD_BYTES);
  });
});
