import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const result = spawnSync("node_modules/.bin/lite-fsm", ["--help"], {
  encoding: "utf8",
});

assert.equal(result.status, 0, result.stderr);
assert.match(result.stdout, /lite-fsm command line tools/);
assert.match(result.stdout, /export-graph/);
assert.match(result.stdout, /visualize/);

assert.equal(existsSync("packages/cli/dist/visualizer/index.html"), true, "CLI package must include visualizer artifact");

const fixtureRoot = resolve(".tmp/smoke-visualize");
rmSync(fixtureRoot, { recursive: true, force: true });
mkdirSync(fixtureRoot, { recursive: true });
writeFileSync(
  resolve(fixtureRoot, "tsconfig.json"),
  JSON.stringify({ compilerOptions: { moduleResolution: "bundler" } }),
);
writeFileSync(
  resolve(fixtureRoot, "store.ts"),
  `
    import { MachineManager, createMachine } from "@lite-fsm/core";
    const machine = createMachine({
      config: { idle: { START: "ready" }, ready: {} },
      initialState: "idle",
      initialContext: {},
    });
    export const manager = MachineManager({ machine });
  `,
);

const port = 43_030;
const child = spawn(
  "node_modules/.bin/lite-fsm",
  [
    "visualize",
    "--entry",
    ".tmp/smoke-visualize/store.ts",
    "--tsconfig",
    ".tmp/smoke-visualize/tsconfig.json",
    "--port",
    String(port),
    "--no-open",
  ],
  { encoding: "utf8" },
);

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const waitForUrl = async () => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10_000) {
    const [line] = stdout.trim().split("\n").filter(Boolean);
    if (line) return line;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }

  throw new Error(`visualize did not print URL.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
};

try {
  const url = new URL(await waitForUrl());
  const token = url.searchParams.get("session");
  assert.equal(url.origin, `http://127.0.0.1:${port}`);
  assert.ok(token);

  const session = await fetch(`http://127.0.0.1:${port}/api/session?token=${encodeURIComponent(token)}`);
  if (session.status !== 200) {
    throw new Error(await session.text());
  }
  const sessionBody = await session.json();
  assert.equal(sessionBody.ok, true);
  assert.equal(sessionBody.exportDocument.version, "lite-fsm.project-graph-export/v1");

  const [file] = sessionBody.exportDocument.files;
  assert.ok(file?.fileName);
  const source = await fetch(
    `http://127.0.0.1:${port}/api/source?token=${encodeURIComponent(token)}&fileName=${encodeURIComponent(file.fileName)}`,
  );
  if (source.status !== 200) {
    throw new Error(await source.text());
  }
  const sourceBody = await source.json();
  assert.equal(sourceBody.ok, true);
  assert.equal(sourceBody.hash, file.hash);
  assert.match(sourceBody.text, /MachineManager/);
} finally {
  const exitPromise = child.exitCode === null ? new Promise((resolveExit) => child.once("exit", resolveExit)) : Promise.resolve();
  child.kill("SIGTERM");
  await exitPromise;
  rmSync(fixtureRoot, { recursive: true, force: true });
}

if (child.exitCode !== 0) {
  throw new Error(`visualize exited with ${child.exitCode}.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
}

assert.match(readFileSync("packages/cli/dist/visualizer/index.html", "utf8"), /<html|<div|<script/i);
