import { formatBenchmarkReport, runEntitiesBenchmarkProfile } from "./composition-lite-fsm-entities.fixture.mjs";

const result = runEntitiesBenchmarkProfile({
  profile: "node",
  forceGc: typeof globalThis.gc === "function" ? globalThis.gc : undefined,
  onScenarioStart: (scenario, rowCount) => {
    console.error(`[entities bench] ${scenario.label} / ${rowCount.toLocaleString("en-US")} rows`);
  },
  onScenarioEnd: (scenario) => {
    console.error(
      `[entities bench] ${scenario.passed ? "pass" : "fail"} ${scenario.label} / ${scenario.rowCount.toLocaleString(
        "en-US",
      )} rows: median ${scenario.entity.median.toFixed(3)}ms, p95 ${scenario.entity.p95.toFixed(3)}ms, ratio ${scenario.ratio.toFixed(2)}x`,
    );
  },
});

console.log(formatBenchmarkReport(result));

if (!result.passed) {
  process.exitCode = 1;
}
