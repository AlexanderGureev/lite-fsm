import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const source = resolve(workspaceRoot, "apps/visualizer/dist");
const target = resolve(cliRoot, "dist/visualizer");

if (!existsSync(source)) {
  throw new Error(`Missing visualizer build artifact: ${source}`);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
