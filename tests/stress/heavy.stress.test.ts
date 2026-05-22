// Heavy long-running probe: гоняет churn по wall clock'у заданное число минут и
// печатает heap-сэмплы ПОСЛЕ принудительного `gc()` каждые ~15 сек. Сэмпл после gc отражает
// реальный устойчивый heap (а не transient between major GC), и monotonic trend в этих сэмплах
// — единственный способ отличить leak от обычного allocation throughput.
//
// По умолчанию skipped — нужен env `STRESS_HEAVY_MIN` и флаг `--expose-gc`. Пример запуска:
//
//   STRESS_HEAVY_MIN=2 NODE_OPTIONS=--expose-gc \
//     npx vitest run --config vitest.stress.config.ts \
//     tests/stress/heavy.stress.test.ts --reporter=verbose

import { describe, expect, it } from "vitest";

import { createWorld } from "./_fixture";

const gc: (() => void) | undefined = (globalThis as { gc?: () => void }).gc;
const HEAVY_MIN = Number(process.env.STRESS_HEAVY_MIN ?? "0");
const enabled = Boolean(gc) && HEAVY_MIN > 0;
const describeIf = enabled ? describe : describe.skip;

// Реалистичный persist throttle: в production никто не пишет на каждый transition при high tps.
// 100ms даёт >100k save'ов за 2 минуты при 30k tps — всё ещё много, но не накапливает microtasks.
const PERSIST_THROTTLE_MS = 100;

const SAMPLE_INTERVAL_MS = 15_000;
// Sample-trend пороги: после gc heap должен оставаться в узком окне. Real leak дал бы
// monotonic growth на десятки MB за 2+ минуты при 3M+ циклах.
const SAMPLE_RANGE_THRESHOLD_BYTES = 8 * 1024 * 1024;
const FINAL_DIFF_THRESHOLD_BYTES = 8 * 1024 * 1024;

const formatMb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const settle = async (): Promise<void> => {
  if (!gc) return;
  for (let i = 0; i < 5; i++) {
    gc();
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const measure = async (): Promise<number> => {
  await settle();
  return process.memoryUsage().heapUsed;
};

describeIf(`stress — heavy long-running probe (${HEAVY_MIN} min wall clock)`, () => {
  it(
    `sustained churn ~${HEAVY_MIN}min: gc-снимки stable, final diff < ${formatMb(FINAL_DIFF_THRESHOLD_BYTES)}`,
    async () => {
      const world = createWorld({ persistThrottleMs: PERSIST_THROTTLE_MS });

      // Warmup: JIT, persist setup.
      for (let i = 0; i < 5_000; i++) world.runTick(i);
      const baseline = await measure();

      const startedAt = Date.now();
      const deadlineMs = startedAt + HEAVY_MIN * 60_000;
      let lastSampleAt = startedAt;
      let cycle = 5_000;
      const samples: { elapsedMs: number; cycle: number; heap: number }[] = [];

      // Sample "0 сек" сразу после baseline — точка отсчёта тренда.
      samples.push({ elapsedMs: 0, cycle, heap: baseline });

      while (Date.now() < deadlineMs) {
        // Батч из 1000 циклов + yield event loop'у. Без yield'а busy-loop копит микротаски
        // от persist save chain — это не отражает реальное приложение, где event loop тикает.
        for (let i = 0; i < 1_000; i++) world.runTick(cycle++);
        await new Promise((resolve) => setImmediate(resolve));

        const now = Date.now();
        if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
          // gc() ПЕРЕД measurement — иначе сэмплим transient allocation между major GC,
          // что не отличает leak от throughput.
          const heap = await measure();
          samples.push({ elapsedMs: now - startedAt, cycle, heap });
          lastSampleAt = now;
        }
      }

      const totalCycles = cycle - 5_000;
      const wallMs = Date.now() - startedAt;

      const finalHeap = await measure();
      const finalDiff = finalHeap - baseline;

      // Sample range считаем по всем gc-сэмплам (включая baseline и финальный).
      const allSamples = [...samples.map((s) => s.heap), finalHeap];
      const minHeap = Math.min(...allSamples);
      const maxHeap = Math.max(...allSamples);
      const sampleRange = maxHeap - minHeap;

      console.log(`[stress-heavy] === report ===`);
      console.log(
        `[stress-heavy] wall clock: ${(wallMs / 1000).toFixed(1)}s, total cycles: ${totalCycles.toLocaleString()} (${Math.round(totalCycles / (wallMs / 1000)).toLocaleString()} cycles/sec)`,
      );
      console.log(`[stress-heavy] persist throttle: ${PERSIST_THROTTLE_MS}ms (realistic)`);
      console.log(`[stress-heavy] baseline: ${formatMb(baseline)}`);
      console.log(`[stress-heavy] final (after gc): ${formatMb(finalHeap)}, diff vs baseline: ${formatMb(finalDiff)}`);
      console.log(`[stress-heavy] gc-sample range: min=${formatMb(minHeap)}, max=${formatMb(maxHeap)}, spread=${formatMb(sampleRange)}`);
      console.log(`[stress-heavy] samples (elapsed → cycle → heap after gc):`);
      for (const s of samples) {
        console.log(`  ${(s.elapsedMs / 1000).toFixed(0).padStart(4)}s | cycle ${s.cycle.toLocaleString().padStart(12)} | ${formatMb(s.heap)}`);
      }

      // Проверки на leak — обе про устойчивый heap после gc, не про transient.
      expect(finalDiff).toBeLessThan(FINAL_DIFF_THRESHOLD_BYTES);
      expect(sampleRange).toBeLessThan(SAMPLE_RANGE_THRESHOLD_BYTES);

      // Public state стабилен после всего workload'а.
      expect(Object.keys(world.manager.getState().enemy)).toHaveLength(0);
      expect(world.manager.getState().gameSession.context.ticks).toBe(totalCycles + 5_000);
      expect(world.manager.getState().score.context.kills).toBe(totalCycles + 5_000);

      world.dispose();
    },
    HEAVY_MIN * 60_000 + 60_000,
  );
});
