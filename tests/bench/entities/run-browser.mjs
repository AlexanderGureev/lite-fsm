import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { build } from "vite";

const rootDir = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const tempDir = join(rootDir, ".tmp", "entities-benchmark-browser");
const entryFile = join(tempDir, "entry.mjs");

const normalizeOutput = (output) => (Array.isArray(output) ? output : [output]);

await rm(tempDir, { force: true, recursive: true });
await mkdir(tempDir, { recursive: true });
await writeFile(
  entryFile,
  `
import { runEntitiesBenchmarkProfile } from "../../tests/bench/entities/composition-lite-fsm-entities.fixture.mjs";

globalThis.__liteFsmEntitiesBenchmark = Promise.resolve()
  .then(() => runEntitiesBenchmarkProfile({ profile: "browser" }))
  .catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
`,
);

const buildResult = await build({
  configFile: false,
  root: rootDir,
  mode: "production",
  logLevel: "warn",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    write: false,
    minify: true,
    target: "es2020",
    lib: {
      entry: entryFile,
      formats: ["iife"],
      name: "LiteFsmEntitiesBenchmark",
    },
    rollupOptions: {
      treeshake: true,
    },
  },
});

const chunk = normalizeOutput(buildResult)
  .flatMap((result) => result.output)
  .find((item) => item.type === "chunk");

if (!chunk) {
  throw new Error("Browser benchmark bundle was not emitted.");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(180_000);

try {
  await page.setContent("<!doctype html><body></body>");
  await page.evaluate((code) => {
    const script = document.createElement("script");
    script.textContent = code;
    document.body.append(script);
  }, chunk.code);
  const result = await page.evaluate(() => globalThis.__liteFsmEntitiesBenchmark);

  if (result?.error) {
    throw new Error(result.error);
  }

  const { formatBenchmarkReport } = await import("./composition-lite-fsm-entities.fixture.mjs");
  console.log(formatBenchmarkReport(result));

  if (!result.passed) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await rm(tempDir, { force: true, recursive: true });
}
