/* global globalThis */

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateGateRuns,
  aggregateTraceRuns,
  collectEnvironmentMetadata,
  formatRecordMarkdown,
  safeFilePart,
  safeTimestamp,
} from "./reporting.mjs";

// Benchmark fixtures import production dist runtime; set the mode before those imports.
process.env.NODE_ENV = "production";

const rootDir = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const defaultOutDir = ".bench/entities";
const defaultRuns = 3;
const allowedIncludes = ["gate", "trace"];

let benchmarkFixtures;

const loadBenchmarkFixtures = async () => {
  if (benchmarkFixtures) return benchmarkFixtures;

  const gate = await import("./composition-lite-fsm-entities.fixture.mjs");
  const trace = await import("./trace.fixture.mjs");

  benchmarkFixtures = { gate, trace };
  return benchmarkFixtures;
};

const usage = `Usage:
  pnpm run bench:entities:record -- [--label name] [--runs 1..20] [--out dir] [--include gate,trace]

Options:
  --label <name>          Human label stored in the report and used for label aliases.
  --runs <count>          Number of benchmark runs to aggregate. Defaults to ${defaultRuns}.
  --out <dir>             Report directory. Defaults to ${defaultOutDir}.
  --include <items>       Comma-separated subset: gate, trace. Defaults to gate,trace.
  --row-counts <items>    Internal smoke-test override, for example 1000 or 1000,5000.
`;

const parseInteger = (value, optionName) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== String(value)) {
    throw new Error(`${optionName} expects an integer value.`);
  }
  return parsed;
};

const parseInclude = (value) => {
  const requested = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (requested.length === 0) throw new Error("--include expects at least one benchmark name.");

  const unknown = requested.filter((item) => !allowedIncludes.includes(item));
  if (unknown.length > 0) throw new Error(`Unknown --include value: ${unknown.join(", ")}.`);

  return allowedIncludes.filter((item) => requested.includes(item));
};

const parseRowCounts = (value) => {
  const rowCounts = value
    .split(",")
    .map((item) => parseInteger(item.trim(), "--row-counts"))
    .filter((item) => item > 0);
  if (rowCounts.length === 0) throw new Error("--row-counts expects positive integers.");
  return rowCounts;
};

const parseArgs = (argv) => {
  const options = {
    include: allowedIncludes,
    out: defaultOutDir,
    runs: defaultRuns,
    rowCounts: undefined,
    label: undefined,
    argv: argv.filter((arg) => arg !== "--"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} expects a value.`);
      return argv[index];
    };

    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exitCode = 0;
      return undefined;
    }
    if (arg === "--") continue;
    if (arg === "--label") {
      options.label = nextValue();
      continue;
    }
    if (arg === "--runs") {
      options.runs = parseInteger(nextValue(), "--runs");
      continue;
    }
    if (arg === "--out") {
      options.out = nextValue();
      continue;
    }
    if (arg === "--include") {
      options.include = parseInclude(nextValue());
      continue;
    }
    if (arg === "--row-counts") {
      options.rowCounts = parseRowCounts(nextValue());
      continue;
    }

    throw new Error(`Unknown option: ${arg}.`);
  }

  if (options.runs < 1 || options.runs > 20) throw new Error("--runs must be in the 1..20 range.");
  return options;
};

const runPackageBuild = (packageName) => {
  console.error(`[entities bench record] build ${packageName}`);
  const result = spawnSync("pnpm", ["--filter", packageName, "run", "build"], {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${packageName} build failed with exit code ${result.status}.`);
};

const runBuilds = () => {
  runPackageBuild("@lite-fsm/core");
  runPackageBuild("@lite-fsm/entities");
};

const logGateScenarioEnd = (scenario) => {
  console.error(
    `[entities bench record] ${scenario.passed ? "pass" : "fail"} ${scenario.label} / ${scenario.rowCount.toLocaleString(
      "en-US",
    )} rows: median ${scenario.entity.median.toFixed(3)}ms, p95 ${scenario.entity.p95.toFixed(3)}ms, ratio ${scenario.ratio.toFixed(
      2,
    )}x`,
  );
};

const logTraceScenarioEnd = (scenario) => {
  const total = scenario.phases.find((phase) => phase.key === "core.transition.total");
  console.error(
    `[entities bench record] trace ${scenario.label} / ${scenario.rowCount.toLocaleString(
      "en-US",
    )} rows: total ${total ? total.median.toFixed(3) : "n/a"}ms, transitions ${scenario.transitionCount}`,
  );
};

const runGateBenchmarks = ({ runs, rowCounts, fixture }) => {
  const results = [];
  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    console.error(`[entities bench record] gate run ${runIndex + 1}/${runs}`);
    results.push(
      fixture.runEntitiesBenchmarkProfile({
        profile: "node",
        forceGc: typeof globalThis.gc === "function" ? globalThis.gc : undefined,
        rowCounts,
        onScenarioStart: (scenario, rowCount) => {
          console.error(`[entities bench record] gate ${scenario.label} / ${rowCount.toLocaleString("en-US")} rows`);
        },
        onScenarioEnd: logGateScenarioEnd,
      }),
    );
  }
  return results;
};

const runTraceBenchmarks = ({ runs, rowCounts, fixture }) => {
  const results = [];
  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    console.error(`[entities bench record] trace run ${runIndex + 1}/${runs}`);
    results.push(
      fixture.runEntitiesTraceBenchmark({
        profile: "node",
        rowCounts,
        onScenarioStart: (scenario, rowCount) => {
          console.error(`[entities bench record] trace ${scenario.label} / ${rowCount.toLocaleString("en-US")} rows`);
        },
        onScenarioEnd: logTraceScenarioEnd,
      }),
    );
  }
  return results;
};

const createRecord = async (options) => {
  const createdAt = new Date().toISOString();
  const results = {};
  const fixtures = await loadBenchmarkFixtures();

  if (options.include.includes("gate")) {
    results.gate = aggregateGateRuns(
      runGateBenchmarks({ runs: options.runs, rowCounts: options.rowCounts, fixture: fixtures.gate }),
    );
    results.gate.config.warmupIterations = fixtures.gate.warmupIterations;
    results.gate.config.measuredIterations = fixtures.gate.measuredIterations;
  }

  if (options.include.includes("trace")) {
    results.trace = aggregateTraceRuns(
      runTraceBenchmarks({ runs: options.runs, rowCounts: options.rowCounts, fixture: fixtures.trace }),
      results.gate,
    );
    results.trace.config.warmupIterations = fixtures.trace.warmupIterations;
    results.trace.config.measuredIterations = fixtures.trace.measuredIterations;
  }

  return {
    schemaVersion: 1,
    benchmark: "entities",
    ...(options.label ? { label: options.label } : {}),
    createdAt,
    environment: await collectEnvironmentMetadata({ cwd: rootDir }),
    command: {
      argv: options.argv,
      cwd: rootDir,
      runs: options.runs,
      include: options.include,
    },
    results,
  };
};

const resolveOutDir = (outDir) => (isAbsolute(outDir) ? outDir : resolve(rootDir, outDir));

const writeArtifacts = async (record, options) => {
  const outDir = resolveOutDir(options.out);
  const fileLabel = safeFilePart(options.label ?? "record");
  const baseName = `${safeTimestamp(record.createdAt)}-${fileLabel}`;
  const json = `${JSON.stringify(record, null, 2)}\n`;
  const markdown = formatRecordMarkdown(record);

  await mkdir(outDir, { recursive: true });

  const jsonPath = join(outDir, `${baseName}.json`);
  const markdownPath = join(outDir, `${baseName}.md`);
  const latestJsonPath = join(outDir, "latest.json");
  const latestMarkdownPath = join(outDir, "latest.md");
  await writeFile(jsonPath, json);
  await writeFile(markdownPath, markdown);
  await writeFile(latestJsonPath, json);
  await writeFile(latestMarkdownPath, markdown);

  const paths = {
    jsonPath,
    markdownPath,
    latestJsonPath,
    latestMarkdownPath,
    labelJsonPath: undefined,
    labelMarkdownPath: undefined,
  };

  if (options.label) {
    paths.labelJsonPath = join(outDir, `${fileLabel}.json`);
    paths.labelMarkdownPath = join(outDir, `${fileLabel}.md`);
    await writeFile(paths.labelJsonPath, json);
    await writeFile(paths.labelMarkdownPath, markdown);
  }

  return paths;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (!options) return;

  runBuilds();
  const record = await createRecord(options);
  const paths = await writeArtifacts(record, options);

  console.log(`JSON report: ${paths.jsonPath}`);
  console.log(`Markdown report: ${paths.markdownPath}`);
  console.log(`Latest JSON: ${paths.latestJsonPath}`);
  console.log(`Latest Markdown: ${paths.latestMarkdownPath}`);
  if (paths.labelJsonPath) console.log(`Label JSON: ${paths.labelJsonPath}`);
  if (paths.labelMarkdownPath) console.log(`Label Markdown: ${paths.labelMarkdownPath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
