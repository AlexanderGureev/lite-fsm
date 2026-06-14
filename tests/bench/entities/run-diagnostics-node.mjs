import { formatDiagnosticsReport, runEntitiesDiagnosticsBenchmark } from "./diagnostics.fixture.mjs";

const result = runEntitiesDiagnosticsBenchmark({
  profile: "node",
  onScenarioStart: (scenario, rowCount) => {
    console.error(`[entities diagnostics] ${scenario.label} / ${rowCount.toLocaleString("en-US")} rows`);
  },
  onScenarioEnd: (scenario) => {
    const publicLayer = scenario.layers.find((layer) => layer.key === "public-transition");
    const kernelLayer = scenario.layers.find((layer) => layer.key === "raw-entity-kernel");
    console.error(
      `[entities diagnostics] done ${scenario.label} / ${scenario.rowCount.toLocaleString(
        "en-US",
      )} rows: kernel ${kernelLayer.median.toFixed(3)}ms, public ${publicLayer.median.toFixed(3)}ms`,
    );
  },
});

console.log(formatDiagnosticsReport(result));
