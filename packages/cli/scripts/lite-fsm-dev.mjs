#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jitiBinName = process.platform === "win32" ? "jiti.cmd" : "jiti";
const jitiBin = resolve(cliRoot, "node_modules", ".bin", jitiBinName);
const entrypoint = resolve(cliRoot, "src", "bin", "lite-fsm.ts");

if (!existsSync(jitiBin)) {
  console.error(`lite-fsm dev runner requires jiti at ${jitiBin}. Run pnpm install in the workspace first.`);
  process.exit(1);
}

const result = spawnSync(jitiBin, [entrypoint, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Failed to start lite-fsm dev runner: ${result.error.message}`);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exit(result.status ?? 1);
}
