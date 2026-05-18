import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = fileURLToPath(new URL("..", import.meta.url));
const distRoot = resolve(cliRoot, "dist");
const bin = resolve(distRoot, "bin/lite-fsm.js");
const visualizer = resolve(distRoot, "visualizer/index.html");

const fail = (message) => {
  throw new Error(`CLI dist check failed: ${message}`);
};

const walk = (dir) => {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const file = resolve(dir, entry);
    if (statSync(file).isDirectory()) files.push(...walk(file));
    else files.push(file);
  }

  return files;
};

if (!existsSync(bin)) fail(`missing bin: ${bin}`);
if (!existsSync(visualizer)) fail(`missing visualizer artifact: ${visualizer}`);
if (!readFileSync(bin, "utf8").startsWith("#!/usr/bin/env node")) {
  fail(`bin is missing shebang: ${bin}`);
}

const mode = statSync(bin).mode;
if (process.platform !== "win32" && (mode & 0o111) === 0) {
  fail(`bin is not executable: ${bin}`);
}

const files = walk(distRoot);
const declaration = files.find((file) => file.endsWith(".d.ts") || file.endsWith(".d.cts"));
if (declaration) fail(`declaration file must not be published by CLI: ${declaration}`);
