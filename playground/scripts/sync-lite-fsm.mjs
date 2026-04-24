import { cp, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const repoRoot = path.resolve(projectRoot, "..");
const target = path.join(projectRoot, "node_modules/lite-fsm");

await rm(target, { recursive: true, force: true });
await mkdir(path.join(target, "dist"), { recursive: true });
await cp(path.join(repoRoot, "dist"), path.join(target, "dist"), { recursive: true });
await cp(path.join(repoRoot, "package.json"), path.join(target, "package.json"));

console.log("[lite-fsm] synced dist + package.json into node_modules/lite-fsm");
