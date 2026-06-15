// Legacy synthetic calibration runner. The active optimization record workflow uses
// `pnpm run bench:entities:record -- --include gate,trace`.

import { formatDiagnosticsReport, runEntitiesDiagnosticsBenchmark } from "./diagnostics.fixture.mjs";

const result = runEntitiesDiagnosticsBenchmark({
  profile: "node",
  onScenarioStart: (scenario, rowCount) => {
    console.error(`[entities legacy diagnostics] ${scenario.label} / ${rowCount.toLocaleString("en-US")} rows`);
  },
  onScenarioEnd: (scenario) => {
    const publicLayer = scenario.layers.find((layer) => layer.key === "public-transition");
    const kernelLayer = scenario.layers.find((layer) => layer.key === "raw-entity-kernel");
    console.error(
      `[entities legacy diagnostics] done ${scenario.label} / ${scenario.rowCount.toLocaleString(
        "en-US",
      )} rows: kernel ${kernelLayer.median.toFixed(3)}ms, public ${publicLayer.median.toFixed(3)}ms`,
    );
  },
});

console.log(formatDiagnosticsReport(result));
