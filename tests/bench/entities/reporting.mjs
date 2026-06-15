import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { join } from "node:path";

const schemaVersion = 1;
const benchmarkName = "entities";
const highVarianceThreshold = 0.15;
const timerNoiseThresholdMs = 0.05;
const significantChangeThreshold = 10;
const traceOverheadWarningThreshold = 2;

const gateScenarioKey = (scenario) => `${scenario.key}::${scenario.rowCount}`;
const layerKey = (scenario, layer) => `${gateScenarioKey(scenario)}::${layer.key}`;
const phaseRowKey = (scenario, phase) => `${gateScenarioKey(scenario)}::${phase.key}`;

const sortNumbers = (values) => [...values].sort((left, right) => left - right);

const median = (sortedValues) => {
  if (sortedValues.length === 0) throw new Error("Cannot summarize an empty numeric series.");
  const mid = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0 ? (sortedValues[mid - 1] + sortedValues[mid]) / 2 : sortedValues[mid];
};

const percentile = (sortedValues, rank) => {
  if (sortedValues.length === 0) throw new Error("Cannot summarize an empty numeric series.");
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * rank) - 1));
  return sortedValues[index];
};

const relativeStdDev = (values) => {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
};

const summarizeSeries = (values) => {
  const sorted = sortNumbers(values);
  return {
    medianOfMedians: median(sorted),
    minMedian: sorted[0],
    maxMedian: sorted[sorted.length - 1],
    p95OfMedians: percentile(sorted, 0.95),
    relativeStdDev: relativeStdDev(values),
  };
};

const summarizeMeasurements = (measurements) => {
  const medianSummary = summarizeSeries(measurements.map((measurement) => measurement.median));
  const p95Values = measurements.map((measurement) => measurement.p95);
  const sortedP95 = sortNumbers(p95Values);
  return {
    ...medianSummary,
    medianOfP95s: median(sortedP95),
    p95OfP95s: percentile(sortedP95, 0.95),
    minOfMins: Math.min(...measurements.map((measurement) => measurement.min)),
    maxOfMaxs: Math.max(...measurements.map((measurement) => measurement.max)),
  };
};

const cloneMeasurement = (measurement) => ({
  median: measurement.median,
  p95: measurement.p95,
  min: measurement.min,
  max: measurement.max,
  samples: Array.isArray(measurement.samples) ? measurement.samples : [],
});

const cloneTraceMetric = (metric) => ({
  median: metric.median,
  p95: metric.p95,
  min: metric.min,
  max: metric.max,
  relativeStdDev: metric.relativeStdDev,
  samples: Array.isArray(metric.samples) ? metric.samples : [],
});

const metricFromMeasurementSummary = (summary) => ({
  median: summary.medianOfMedians,
  p95: summary.medianOfP95s,
  min: summary.minOfMins,
  max: summary.maxOfMaxs,
  summary,
});

const traceMetricFromRuns = (runs) => {
  const summary = summarizeMeasurements(runs);
  return {
    ...metricFromMeasurementSummary(summary),
    relativeStdDev: summary.relativeStdDev,
    samples: runs.flatMap((run) => (Array.isArray(run.samples) ? run.samples : [])),
  };
};

const traceShareFromRuns = (runs, key) => {
  const values = runs.map((run) => run[key]).filter((value) => typeof value === "number");
  if (values.length === 0) return undefined;
  const summary = summarizeSeries(values);
  return {
    value: summary.medianOfMedians,
    summary,
  };
};

const commandOutput = (command, args, cwd) => {
  try {
    const output = execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
};

const readPackageManager = async (cwd) => {
  try {
    const packageJson = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
    return packageJson.packageManager;
  } catch {
    return undefined;
  }
};

export const collectEnvironmentMetadata = async ({ cwd }) => {
  const cpuInfo = cpus();
  const packageManager = process.env.npm_config_user_agent?.split(" ")[0] ?? (await readPackageManager(cwd));
  const dirtyOutput = commandOutput("git", ["status", "--porcelain"], cwd);

  return {
    gitSha: commandOutput("git", ["rev-parse", "HEAD"], cwd),
    gitBranch: commandOutput("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    gitDirty: Boolean(dirtyOutput),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpuInfo[0]?.model,
    cpuCount: cpuInfo.length,
    packageManager,
  };
};

export const safeTimestamp = (createdAt) => createdAt.replace(/[:.]/g, "-");

export const safeFilePart = (value) => {
  const normalized = String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "record";
};

const assertScenarioResult = (scenario, groupName) => {
  if (!scenario || typeof scenario !== "object") throw new Error(`Invalid ${groupName} scenario result.`);
  if (typeof scenario.key !== "string") throw new Error(`Invalid ${groupName} scenario key.`);
  if (typeof scenario.label !== "string") throw new Error(`Invalid ${groupName} scenario label.`);
  if (typeof scenario.rowCount !== "number") throw new Error(`Invalid ${groupName} scenario rowCount.`);
};

export const aggregateGateRuns = (runs) => {
  if (runs.length === 0) throw new Error("Cannot aggregate gate benchmark without runs.");

  const scenariosByKey = new Map();
  for (const [runIndex, run] of runs.entries()) {
    if (!Array.isArray(run.scenarios)) throw new Error("Invalid gate benchmark result: scenarios must be an array.");

    for (const scenario of run.scenarios) {
      assertScenarioResult(scenario, "gate");
      const key = gateScenarioKey(scenario);
      const existing =
        scenariosByKey.get(key) ??
        {
          key: scenario.key,
          label: scenario.label,
          rowCount: scenario.rowCount,
          kind: scenario.kind,
          budget: scenario.budget,
          runs: [],
        };

      existing.runs.push({
        runIndex: runIndex + 1,
        iterations: scenario.iterations,
        baseline: cloneMeasurement(scenario.baseline),
        entity: cloneMeasurement(scenario.entity),
        ratio: scenario.ratio,
        budget: scenario.budget,
        status: scenario.passed ? "pass" : "fail",
      });
      scenariosByKey.set(key, existing);
    }
  }

  const scenarios = Array.from(scenariosByKey.values()).map((scenario) => {
    const baselineSummary = summarizeMeasurements(scenario.runs.map((run) => run.baseline));
    const entitySummary = summarizeMeasurements(scenario.runs.map((run) => run.entity));
    const ratioSummary = summarizeSeries(scenario.runs.map((run) => run.ratio));
    const status = scenario.runs.every((run) => run.status === "pass") ? "pass" : "fail";

    return {
      ...scenario,
      baseline: metricFromMeasurementSummary(baselineSummary),
      entity: metricFromMeasurementSummary(entitySummary),
      ratio: {
        median: ratioSummary.medianOfMedians,
        min: ratioSummary.minMedian,
        max: ratioSummary.maxMedian,
        p95: ratioSummary.p95OfMedians,
        summary: ratioSummary,
      },
      status,
      summary: entitySummary,
    };
  });

  const allocationGuardRuns = runs.map((run, index) => ({
    runIndex: index + 1,
    ...run.allocationGuard,
  }));

  return {
    benchmark: runs[0].benchmark,
    profile: runs[0].profile,
    runtime: runs[0].runtime,
    config: {
      rowCounts: runs[0].rowCounts,
      runs: runs.length,
    },
    scenarios,
    allocationGuard: {
      runs: allocationGuardRuns,
      status: allocationGuardRuns.every((run) => run.skipped || run.passed) ? "pass" : "fail",
    },
    passed: scenarios.every((scenario) => scenario.status === "pass") &&
      allocationGuardRuns.every((run) => run.skipped || run.passed),
  };
};

export const aggregateDiagnosticsRuns = (runs) => {
  if (runs.length === 0) throw new Error("Cannot aggregate diagnostics benchmark without runs.");

  const scenariosByKey = new Map();
  for (const [runIndex, run] of runs.entries()) {
    if (!Array.isArray(run.scenarios)) {
      throw new Error("Invalid diagnostics benchmark result: scenarios must be an array.");
    }

    for (const scenario of run.scenarios) {
      assertScenarioResult(scenario, "diagnostics");
      if (!Array.isArray(scenario.layers)) throw new Error("Invalid diagnostics scenario: layers must be an array.");
      const key = gateScenarioKey(scenario);
      const existing =
        scenariosByKey.get(key) ??
        {
          key: scenario.key,
          label: scenario.label,
          rowCount: scenario.rowCount,
          runs: [],
          layerRunsByKey: new Map(),
        };
      const layers = [];

      for (const layer of scenario.layers) {
        const layerRuns =
          existing.layerRunsByKey.get(layer.key) ??
          {
            key: layer.key,
            label: layer.label,
            operationsPerSample: layer.operationsPerSample,
            runs: [],
          };
        const runLayer = {
          runIndex: runIndex + 1,
          key: layer.key,
          label: layer.label,
          operationsPerSample: layer.operationsPerSample,
          median: layer.median,
          p95: layer.p95,
          min: layer.min,
          max: layer.max,
          ratioToRawSoa: layer.ratioToRawSoa,
          samples: Array.isArray(layer.samples) ? layer.samples : [],
        };
        layerRuns.runs.push(runLayer);
        existing.layerRunsByKey.set(layer.key, layerRuns);
        layers.push(runLayer);
      }

      existing.runs.push({
        runIndex: runIndex + 1,
        layers,
      });
      scenariosByKey.set(key, existing);
    }
  }

  const scenarios = Array.from(scenariosByKey.values()).map((scenario) => {
    const layers = Array.from(scenario.layerRunsByKey.values()).map((layer) => {
      const measurementSummary = summarizeMeasurements(layer.runs);
      const ratioSummary = summarizeSeries(layer.runs.map((run) => run.ratioToRawSoa));

      return {
        key: layer.key,
        label: layer.label,
        operationsPerSample: layer.operationsPerSample,
        runs: layer.runs,
        ...metricFromMeasurementSummary(measurementSummary),
        ratioToRawSoa: ratioSummary.medianOfMedians,
        ratioToRawSoaSummary: ratioSummary,
      };
    });
    const publicLayer = layers.find((layer) => layer.key === "public-transition") ?? layers[layers.length - 1];

    return {
      key: scenario.key,
      label: scenario.label,
      rowCount: scenario.rowCount,
      runs: scenario.runs,
      layers,
      summary: publicLayer.summary,
    };
  });

  return {
    benchmark: runs[0].benchmark,
    profile: runs[0].profile,
    runtime: runs[0].runtime,
    config: {
      rowCounts: runs[0].rowCounts,
      runs: runs.length,
    },
    scenarios,
  };
};

const aggregateTraceCoverageRuns = (coverageRuns) => {
  const coverage = traceMetricFromRuns(coverageRuns);
  const unattributed = traceMetricFromRuns(coverageRuns.map((run) => run.unattributed));

  return {
    key: coverageRuns[0].key,
    label: coverageRuns[0].label,
    parentKey: coverageRuns[0].parentKey,
    numeratorKeys: coverageRuns[0].numeratorKeys,
    ...coverage,
    unattributed,
  };
};

export const aggregateTraceRuns = (runs, gateResult) => {
  if (runs.length === 0) throw new Error("Cannot aggregate trace benchmark without runs.");

  const gateScenarios = mapScenarios(gateResult);
  const scenariosByKey = new Map();
  for (const [runIndex, run] of runs.entries()) {
    if (!Array.isArray(run.scenarios)) throw new Error("Invalid trace benchmark result: scenarios must be an array.");

    for (const scenario of run.scenarios) {
      assertScenarioResult(scenario, "trace");
      if (!Array.isArray(scenario.phases)) throw new Error("Invalid trace scenario: phases must be an array.");

      const key = gateScenarioKey(scenario);
      const existing =
        scenariosByKey.get(key) ??
        {
          key: scenario.key,
          label: scenario.label,
          rowCount: scenario.rowCount,
          kind: scenario.kind,
          iterations: scenario.iterations,
          runs: [],
          phaseRunsByKey: new Map(),
          coverageRunsByKey: new Map(),
        };

      for (const phase of scenario.phases) {
        const phaseRuns =
          existing.phaseRunsByKey.get(phase.key) ??
          {
            key: phase.key,
            label: phase.label,
            parentKey: phase.parentKey,
            runtimeKind: phase.runtimeKind,
            runs: [],
          };
        phaseRuns.runs.push({ runIndex: runIndex + 1, ...cloneTraceMetric(phase), ...phase });
        existing.phaseRunsByKey.set(phase.key, phaseRuns);
      }

      for (const coverage of scenario.coverage ?? []) {
        const coverageRuns =
          existing.coverageRunsByKey.get(coverage.key) ??
          {
            key: coverage.key,
            label: coverage.label,
            parentKey: coverage.parentKey,
            numeratorKeys: coverage.numeratorKeys,
            runs: [],
          };
        coverageRuns.runs.push({ runIndex: runIndex + 1, ...cloneTraceMetric(coverage), ...coverage });
        existing.coverageRunsByKey.set(coverage.key, coverageRuns);
      }

      existing.runs.push({
        runIndex: runIndex + 1,
        transitionCount: scenario.transitionCount,
      });
      scenariosByKey.set(key, existing);
    }
  }

  const scenarios = Array.from(scenariosByKey.values()).map((scenario) => {
    const phases = Array.from(scenario.phaseRunsByKey.values()).map((phase) => {
      const metric = traceMetricFromRuns(phase.runs);
      const percentOfTransition = traceShareFromRuns(phase.runs, "percentOfTransition");
      const percentOfParent = traceShareFromRuns(phase.runs, "percentOfParent");

      return {
        key: phase.key,
        label: phase.label,
        ...(phase.parentKey ? { parentKey: phase.parentKey } : {}),
        ...(phase.runtimeKind !== undefined ? { runtimeKind: phase.runtimeKind } : {}),
        ...metric,
        ...(percentOfTransition
          ? { percentOfTransition: percentOfTransition.value, percentOfTransitionSummary: percentOfTransition.summary }
          : {}),
        ...(percentOfParent
          ? { percentOfParent: percentOfParent.value, percentOfParentSummary: percentOfParent.summary }
          : {}),
      };
    });
    const coverage = Array.from(scenario.coverageRunsByKey.values()).map((entry) =>
      aggregateTraceCoverageRuns(entry.runs),
    );
    const total = phases.find((phase) => phase.key === "core.transition.total");
    const gateScenario = gateScenarios.get(gateScenarioKey(scenario));
    const gateEntityMedian = gateScenario?.entity?.median;
    const traceTotalToGateEntityMedian =
      total && typeof gateEntityMedian === "number" ? total.median / gateEntityMedian : undefined;

    return {
      key: scenario.key,
      label: scenario.label,
      rowCount: scenario.rowCount,
      kind: scenario.kind,
      iterations: scenario.iterations,
      runs: scenario.runs,
      transitionCount: scenario.runs.reduce((sum, run) => sum + run.transitionCount, 0),
      ...(total ? { total } : {}),
      ...(typeof gateEntityMedian === "number" ? { gateEntityMedian } : {}),
      ...(traceTotalToGateEntityMedian !== undefined ? { traceTotalToGateEntityMedian } : {}),
      phases,
      coverage,
    };
  });

  return {
    benchmark: runs[0].benchmark,
    profile: runs[0].profile,
    runtime: runs[0].runtime,
    config: {
      rowCounts: runs[0].rowCounts,
      runs: runs.length,
    },
    scenarios,
  };
};

const escapeTableCell = (value) => String(value).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
const formatMs = (value) => `${value.toFixed(3)}ms`;
const formatRatio = (value) => `${value.toFixed(2)}x`;
const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;
const formatChangePercent = (value) => (value === null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`);
const formatDelta = (value, unit) => `${value >= 0 ? "+" : ""}${value.toFixed(3)}${unit}`;
const shortSha = (sha) => (sha ? sha.slice(0, 12) : "unknown");

const topLevelCorePhaseKeys = new Set([
  "core.assertUserAction",
  "core.createDispatch",
  "core.prepareAction.total",
  "core.beforeReduce.total",
  "core.interceptors",
  "core.hooks.beforeReduce",
  "core.rootReducer",
  "core.markExternallyChangedBuckets",
  "core.hooks.afterReduce",
  "core.hooks.beforeCommit",
  "core.commit.total",
  "core.hooks.beforeSubscribers",
  "core.reactions.total",
  "core.subscribers",
  "core.hooks.beforeEffects",
  "core.effects.total",
  "core.hooks.afterEffects",
]);

const entitiesReducePhaseKeys = new Set([
  "entities.reduce.spawnLifecycle",
  "entities.reduce.spawnCleanup",
  "entities.reduce.collectPublicBatches",
  "entities.reduce.publicBatch.total",
  "entities.reduce.publicCleanup",
]);

const entitiesReactionPhaseKeys = new Set([
  "entities.reactions.captureScope",
  "entities.reactions.createDeps",
  "entities.reactions.user",
]);

const entitiesEffectPhaseKeys = new Set([
  "entities.effects.resolve",
  "entities.effects.invoke",
]);

const addTable = (lines, headers, rows) => {
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${row.map(escapeTableCell).join(" | ")} |`);
};

const traceRatioLabel = (scenario) =>
  scenario.traceTotalToGateEntityMedian === undefined ? "n/a" : formatRatio(scenario.traceTotalToGateEntityMedian);

const traceRatioStatus = (scenario) => {
  if (scenario.traceTotalToGateEntityMedian === undefined) return "n/a";
  return scenario.traceTotalToGateEntityMedian > traceOverheadWarningThreshold ? "warning" : "ok";
};

const traceShareLabel = (phase, shareLabel) => {
  if (shareLabel === "transition") {
    return phase.percentOfTransition === undefined ? "n/a" : formatPercent(phase.percentOfTransition);
  }
  return phase.percentOfParent === undefined ? "n/a" : formatPercent(phase.percentOfParent);
};

const tracePhaseRows = (trace, phaseFilter, shareLabel) =>
  trace.scenarios.flatMap((scenario) =>
    scenario.phases.filter(phaseFilter).map((phase) => [
      scenario.label,
      scenario.rowCount.toLocaleString("en-US"),
      phase.key,
      phase.parentKey ?? "",
      phase.runtimeKind ?? "",
      formatMs(phase.median),
      formatMs(phase.p95),
      traceShareLabel(phase, shareLabel),
      formatPercent(phase.relativeStdDev),
      String(phase.samples.length),
    ]),
  );

const collectStabilityWarnings = (record) => {
  const warnings = [];
  const gate = record.results.gate;
  if (gate) {
    for (const scenario of gate.scenarios) {
      if (scenario.summary.relativeStdDev > highVarianceThreshold) {
        warnings.push(
          `Gate ${scenario.label} / ${scenario.rowCount} rows has high entity median variance (${formatPercent(
            scenario.summary.relativeStdDev,
          )}).`,
        );
      }
      if (scenario.baseline.median < timerNoiseThresholdMs) {
        warnings.push(
          `Gate ${scenario.label} / ${scenario.rowCount} rows baseline median is below ${formatMs(
            timerNoiseThresholdMs,
          )}.`,
        );
      }
    }
  }

  const diagnostics = record.results.diagnostics;
  if (diagnostics) {
    for (const scenario of diagnostics.scenarios) {
      for (const layer of scenario.layers) {
        if (layer.summary.relativeStdDev > highVarianceThreshold) {
          warnings.push(
            `Legacy diagnostics ${scenario.label} / ${scenario.rowCount} rows / ${layer.label} has high median variance (${formatPercent(
              layer.summary.relativeStdDev,
            )}).`,
          );
        }
        if (layer.key === "raw-soa" && layer.median < timerNoiseThresholdMs) {
          warnings.push(
            `Legacy diagnostics ${scenario.label} / ${scenario.rowCount} rows raw SoA median is below ${formatMs(
              timerNoiseThresholdMs,
            )}.`,
          );
        }
      }
    }
  }

  const trace = record.results.trace;
  if (trace) {
    for (const scenario of trace.scenarios) {
      if (scenario.total?.relativeStdDev > highVarianceThreshold) {
        warnings.push(
          `Trace ${scenario.label} / ${scenario.rowCount} rows total median has high variance (${formatPercent(
            scenario.total.relativeStdDev,
          )}).`,
        );
      }
      if (scenario.traceTotalToGateEntityMedian > traceOverheadWarningThreshold) {
        warnings.push(
          `Trace ${scenario.label} / ${scenario.rowCount} rows traceTotal / gateEntityMedian is ${formatRatio(
            scenario.traceTotalToGateEntityMedian,
          )}.`,
        );
      }
    }
  }

  return warnings;
};

export const formatRecordMarkdown = (record) => {
  const lines = [];
  const title = record.label ? `# Entities benchmark record: ${record.label}` : "# Entities benchmark record";
  lines.push(title);
  lines.push("");
  addTable(lines, ["Field", "Value"], [
    ["Created at", record.createdAt],
    ["Git SHA", shortSha(record.environment.gitSha)],
    ["Git branch", record.environment.gitBranch ?? "unknown"],
    ["Git status", record.environment.gitDirty ? "dirty" : "clean"],
    ["Node", record.environment.node],
    ["OS", `${record.environment.platform}/${record.environment.arch}`],
    ["CPU", `${record.environment.cpuModel ?? "unknown"} (${record.environment.cpuCount ?? "unknown"} cores)`],
    ["Package manager", record.environment.packageManager ?? "unknown"],
    ["Runs", String(record.command.runs)],
    ["Include", record.command.include.join(", ")],
    ["Command argv", record.command.argv.length > 0 ? record.command.argv.join(" ") : "(none)"],
  ]);

  lines.push("");
  lines.push("## Gate benchmark");
  lines.push("");
  if (!record.results.gate) {
    lines.push("Gate benchmark was not included.");
  } else {
    addTable(
      lines,
      [
        "Scenario",
        "Rows",
        "Gate",
        "SoA median",
        "SoA p95",
        "entities median",
        "entities p95",
        "Ratio",
        "Budget",
        "Status",
        "RSD",
      ],
      record.results.gate.scenarios.map((scenario) => [
        scenario.label,
        scenario.rowCount.toLocaleString("en-US"),
        scenario.kind,
        formatMs(scenario.baseline.median),
        formatMs(scenario.baseline.p95),
        formatMs(scenario.entity.median),
        formatMs(scenario.entity.p95),
        formatRatio(scenario.ratio.median),
        formatRatio(scenario.budget),
        scenario.status,
        formatPercent(scenario.summary.relativeStdDev),
      ]),
    );
  }

  lines.push("");
  lines.push("## Legacy diagnostics benchmark");
  lines.push("");
  if (!record.results.diagnostics) {
    lines.push("Legacy diagnostics benchmark was not included.");
  } else {
    lines.push(
      "Legacy diagnostics is synthetic calibration data. It is not production `manager.transition` attribution for current optimization gates.",
    );
    lines.push("");
    addTable(
      lines,
      ["Scenario", "Rows", "Layer", "Median", "p95", "Min", "Max", "Ratio to raw SoA", "Ops/sample", "RSD"],
      record.results.diagnostics.scenarios.flatMap((scenario) =>
        scenario.layers.map((layer) => [
          scenario.label,
          scenario.rowCount.toLocaleString("en-US"),
          layer.label,
          formatMs(layer.median),
          formatMs(layer.p95),
          formatMs(layer.min),
          formatMs(layer.max),
          formatRatio(layer.ratioToRawSoa),
          String(layer.operationsPerSample),
          formatPercent(layer.summary.relativeStdDev),
        ]),
      ),
    );
  }

  lines.push("");
  lines.push("## Trace benchmark");
  lines.push("");
  if (!record.results.trace) {
    lines.push("Trace benchmark was not included.");
  } else {
    addTable(
      lines,
      [
        "Scenario",
        "Rows",
        "Total",
        "Total p95",
        "gateEntityMedian",
        "traceTotal / gateEntityMedian",
        "Status",
        "Transitions",
        "RSD",
      ],
      record.results.trace.scenarios.map((scenario) => [
        scenario.label,
        scenario.rowCount.toLocaleString("en-US"),
        scenario.total ? formatMs(scenario.total.median) : "n/a",
        scenario.total ? formatMs(scenario.total.p95) : "n/a",
        scenario.gateEntityMedian === undefined ? "n/a" : formatMs(scenario.gateEntityMedian),
        traceRatioLabel(scenario),
        traceRatioStatus(scenario),
        String(scenario.transitionCount),
        scenario.total ? formatPercent(scenario.total.relativeStdDev) : "n/a",
      ]),
    );

    lines.push("");
    lines.push("### Top-level core phases");
    lines.push("");
    addTable(
      lines,
      ["Scenario", "Rows", "Phase", "Parent", "Runtime", "Median", "p95", "Share", "RSD", "Samples"],
      tracePhaseRows(record.results.trace, (phase) => topLevelCorePhaseKeys.has(phase.key), "transition"),
    );

    lines.push("");
    lines.push("### Entities reduce phases");
    lines.push("");
    addTable(
      lines,
      ["Scenario", "Rows", "Phase", "Parent", "Runtime", "Median", "p95", "Share", "RSD", "Samples"],
      tracePhaseRows(record.results.trace, (phase) => entitiesReducePhaseKeys.has(phase.key), "parent"),
    );

    lines.push("");
    lines.push("### Entities reaction phases");
    lines.push("");
    addTable(
      lines,
      ["Scenario", "Rows", "Phase", "Parent", "Runtime", "Median", "p95", "Share", "RSD", "Samples"],
      tracePhaseRows(record.results.trace, (phase) => entitiesReactionPhaseKeys.has(phase.key), "parent"),
    );

    lines.push("");
    lines.push("### Entities effect phases");
    lines.push("");
    addTable(
      lines,
      ["Scenario", "Rows", "Phase", "Parent", "Runtime", "Median", "p95", "Share", "RSD", "Samples"],
      tracePhaseRows(record.results.trace, (phase) => entitiesEffectPhaseKeys.has(phase.key), "parent"),
    );

    lines.push("");
    lines.push("### Trace coverage");
    lines.push("");
    addTable(
      lines,
      ["Scenario", "Rows", "Scope", "Parent", "Coverage", "Unattributed", "Samples"],
      record.results.trace.scenarios.flatMap((scenario) =>
        scenario.coverage.map((coverage) => [
          scenario.label,
          scenario.rowCount.toLocaleString("en-US"),
          coverage.label,
          coverage.parentKey,
          formatPercent(coverage.median),
          formatMs(coverage.unattributed.median),
          String(coverage.samples.length),
        ]),
      ),
    );
  }

  lines.push("");
  lines.push("## Stability notes");
  lines.push("");
  lines.push(`- Runs per included benchmark: ${record.command.runs}.`);
  lines.push("- Browser benchmark is not part of this stable Node record.");
  const warnings = collectStabilityWarnings(record);
  if (warnings.length === 0) {
    lines.push("- No high-variance or timer-noise warnings.");
  } else {
    for (const warning of warnings) lines.push(`- ${warning}`);
  }

  return `${lines.join("\n")}\n`;
};

export const assertEntitiesBenchRecord = (record, sourceName = "record") => {
  if (!record || typeof record !== "object") throw new Error(`${sourceName} is not a JSON object.`);
  if (record.schemaVersion !== schemaVersion) {
    throw new Error(`${sourceName} uses unsupported schemaVersion ${record.schemaVersion}.`);
  }
  if (record.benchmark !== benchmarkName) {
    throw new Error(`${sourceName} is not an entities benchmark record.`);
  }
  if (!record.results || typeof record.results !== "object") throw new Error(`${sourceName} has no results object.`);
};

const mapScenarios = (result) => {
  const map = new Map();
  for (const scenario of result?.scenarios ?? []) map.set(gateScenarioKey(scenario), scenario);
  return map;
};

const compareValues = (beforeValue, afterValue) => {
  const delta = afterValue - beforeValue;
  const percent = beforeValue === 0 ? null : (delta / beforeValue) * 100;
  const direction = delta < 0 ? "faster" : delta > 0 ? "slower" : "same";
  const significant = percent !== null && Math.abs(percent) >= significantChangeThreshold;
  return { delta, percent, direction, significant };
};

const formatDirection = ({ direction, significant }) => {
  if (!significant) return direction;
  return `**${direction} >${significantChangeThreshold}%**`;
};

const compareMetricRow = ({ scenario, rowCount, metric, beforeValue, afterValue, unit }) => {
  const comparison = compareValues(beforeValue, afterValue);
  let formatter = formatRatio;
  let delta = formatDelta(comparison.delta, "x");
  if (unit === "ms") {
    formatter = formatMs;
    delta = formatDelta(comparison.delta, "ms");
  }
  if (unit === "percent") {
    formatter = formatPercent;
    delta = `${comparison.delta >= 0 ? "+" : ""}${(comparison.delta * 100).toFixed(1)}pp`;
  }
  return [
    scenario,
    rowCount.toLocaleString("en-US"),
    metric,
    formatter(beforeValue),
    formatter(afterValue),
    delta,
    formatChangePercent(comparison.percent),
    formatDirection(comparison),
  ];
};

const addMissingScenarioNotes = (lines, label, beforeMap, afterMap) => {
  const beforeOnly = [...beforeMap.keys()].filter((key) => !afterMap.has(key));
  const afterOnly = [...afterMap.keys()].filter((key) => !beforeMap.has(key));
  if (beforeOnly.length === 0 && afterOnly.length === 0) return;

  lines.push("");
  lines.push(`### ${label} coverage notes`);
  lines.push("");
  for (const key of beforeOnly) lines.push(`- Missing in after: ${key}.`);
  for (const key of afterOnly) lines.push(`- Missing in before: ${key}.`);
};

const phaseShare = (phase) => phase.percentOfTransition ?? phase.percentOfParent;
const phaseShareMetric = (phase) => (phase.percentOfTransition === undefined ? "parent share" : "transition share");

export const formatCompareMarkdown = (before, after) => {
  const lines = [
    `# Entities benchmark compare`,
    "",
    `Before: ${before.label ?? shortSha(before.environment.gitSha)} (${before.createdAt})`,
    `After: ${after.label ?? shortSha(after.environment.gitSha)} (${after.createdAt})`,
    "",
  ];

  if (before.results.gate && after.results.gate) {
    const beforeMap = mapScenarios(before.results.gate);
    const afterMap = mapScenarios(after.results.gate);
    const rows = [];

    for (const [key, beforeScenario] of beforeMap) {
      const afterScenario = afterMap.get(key);
      if (!afterScenario) continue;

      rows.push(
        compareMetricRow({
          scenario: beforeScenario.label,
          rowCount: beforeScenario.rowCount,
          metric: "entity median",
          beforeValue: beforeScenario.entity.median,
          afterValue: afterScenario.entity.median,
          unit: "ms",
        }),
      );
      rows.push(
        compareMetricRow({
          scenario: beforeScenario.label,
          rowCount: beforeScenario.rowCount,
          metric: "ratio",
          beforeValue: beforeScenario.ratio.median,
          afterValue: afterScenario.ratio.median,
          unit: "x",
        }),
      );
      rows.push(
        compareMetricRow({
          scenario: beforeScenario.label,
          rowCount: beforeScenario.rowCount,
          metric: "baseline median",
          beforeValue: beforeScenario.baseline.median,
          afterValue: afterScenario.baseline.median,
          unit: "ms",
        }),
      );
    }

    lines.push("## Gate benchmark");
    lines.push("");
    addTable(lines, ["Scenario", "Rows", "Metric", "Before", "After", "Delta", "Change", "Direction"], rows);
    addMissingScenarioNotes(lines, "Gate benchmark", beforeMap, afterMap);
    lines.push("");
  }

  if (before.results.diagnostics && after.results.diagnostics) {
    const beforeRows = new Map();
    const afterRows = new Map();
    for (const scenario of before.results.diagnostics.scenarios) {
      for (const layer of scenario.layers) beforeRows.set(layerKey(scenario, layer), { scenario, layer });
    }
    for (const scenario of after.results.diagnostics.scenarios) {
      for (const layer of scenario.layers) afterRows.set(layerKey(scenario, layer), { scenario, layer });
    }

    const rows = [];
    for (const [key, beforeEntry] of beforeRows) {
      const afterEntry = afterRows.get(key);
      if (!afterEntry) continue;

      rows.push(
        compareMetricRow({
          scenario: `${beforeEntry.scenario.label} / ${beforeEntry.layer.label}`,
          rowCount: beforeEntry.scenario.rowCount,
          metric: "median",
          beforeValue: beforeEntry.layer.median,
          afterValue: afterEntry.layer.median,
          unit: "ms",
        }),
      );
      rows.push(
        compareMetricRow({
          scenario: `${beforeEntry.scenario.label} / ${beforeEntry.layer.label}`,
          rowCount: beforeEntry.scenario.rowCount,
          metric: "ratioToRawSoa",
          beforeValue: beforeEntry.layer.ratioToRawSoa,
          afterValue: afterEntry.layer.ratioToRawSoa,
          unit: "x",
        }),
      );
    }

    lines.push("## Legacy diagnostics benchmark");
    lines.push("");
    addTable(lines, ["Scenario / layer", "Rows", "Metric", "Before", "After", "Delta", "Change", "Direction"], rows);
    addMissingScenarioNotes(lines, "Legacy diagnostics benchmark", beforeRows, afterRows);
    lines.push("");
  }

  if (before.results.trace && after.results.trace) {
    const beforeRows = new Map();
    const afterRows = new Map();
    for (const scenario of before.results.trace.scenarios) {
      for (const phase of scenario.phases) beforeRows.set(phaseRowKey(scenario, phase), { scenario, phase });
    }
    for (const scenario of after.results.trace.scenarios) {
      for (const phase of scenario.phases) afterRows.set(phaseRowKey(scenario, phase), { scenario, phase });
    }

    const rows = [];
    for (const [key, beforeEntry] of beforeRows) {
      const afterEntry = afterRows.get(key);
      if (!afterEntry) continue;

      rows.push(
        compareMetricRow({
          scenario: `${beforeEntry.scenario.label} / ${beforeEntry.phase.key}`,
          rowCount: beforeEntry.scenario.rowCount,
          metric: "median",
          beforeValue: beforeEntry.phase.median,
          afterValue: afterEntry.phase.median,
          unit: "ms",
        }),
      );

      const beforeShare = phaseShare(beforeEntry.phase);
      const afterShare = phaseShare(afterEntry.phase);
      if (beforeShare !== undefined && afterShare !== undefined) {
        rows.push(
          compareMetricRow({
            scenario: `${beforeEntry.scenario.label} / ${beforeEntry.phase.key}`,
            rowCount: beforeEntry.scenario.rowCount,
            metric: phaseShareMetric(beforeEntry.phase),
            beforeValue: beforeShare,
            afterValue: afterShare,
            unit: "percent",
          }),
        );
      }
    }

    lines.push("## Trace benchmark");
    lines.push("");
    addTable(lines, ["Scenario / phase", "Rows", "Metric", "Before", "After", "Delta", "Change", "Direction"], rows);
    addMissingScenarioNotes(lines, "Trace benchmark", beforeRows, afterRows);
    lines.push("");
  }

  if (!before.results.gate || !after.results.gate) {
    lines.push("## Gate benchmark");
    lines.push("");
    lines.push("Gate benchmark was not present in both records.");
    lines.push("");
  }

  if (!before.results.diagnostics || !after.results.diagnostics) {
    lines.push("## Legacy diagnostics benchmark");
    lines.push("");
    lines.push("Legacy diagnostics benchmark was not present in both records.");
    lines.push("");
  }

  if (!before.results.trace || !after.results.trace) {
    lines.push("## Trace benchmark");
    lines.push("");
    lines.push("Trace benchmark was not present in both records.");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
};
