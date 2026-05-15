import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const docsDir = resolve(repoRoot, "apps/docs");
const playgroundDir = resolve(repoRoot, "apps/playground");
const visualizerDir = resolve(repoRoot, "apps/visualizer");
const docsOut = resolve(docsDir, "out");
const playgroundOut = resolve(playgroundDir, "out");
const visualizerOut = resolve(visualizerDir, "dist");
const playgroundInDocs = resolve(docsOut, "playground");
const visualizerInDocs = resolve(docsOut, "visualizer");

const skipInstall = process.argv.includes("--skip-install");

const run = (cmd, opts = {}) => {
  const cwd = opts.cwd ?? repoRoot;
  console.log(`\n$ (${cwd.replace(repoRoot, ".")}) ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts, cwd });
};

if (!skipInstall) run("pnpm install --frozen-lockfile");
run("pnpm run build:packages");
run("node scripts/generate-playground-visualizer-ir.mjs");

run("pnpm --dir apps/docs exec next build", { env: { ...process.env, NODE_ENV: "production" } });
run("pnpm --dir apps/docs exec pagefind --site .next/server/app --output-path out/_pagefind");

writeFileSync(resolve(docsOut, "_pagefind-config.json"), '{ "baseUrl": "/lite-fsm" }\n');
writeFileSync(
  resolve(docsOut, "_pagefind/pagefind-entry.js"),
  `window.PagefindConfig = {\n  baseUrl: "/lite-fsm",\n  bundlePath: "/lite-fsm/_pagefind/"\n};\n`,
);

run("pnpm --dir apps/playground exec next build", { env: { ...process.env, NODE_ENV: "production" } });
run("pnpm --dir apps/visualizer exec vite build", { env: { ...process.env, NODE_ENV: "production" } });

rmSync(playgroundInDocs, { recursive: true, force: true });
mkdirSync(playgroundInDocs, { recursive: true });
cpSync(playgroundOut, playgroundInDocs, { recursive: true });
rmSync(visualizerInDocs, { recursive: true, force: true });
mkdirSync(visualizerInDocs, { recursive: true });
cpSync(visualizerOut, visualizerInDocs, { recursive: true });
writeFileSync(resolve(docsOut, ".nojekyll"), "");

console.log(`\nPages build complete: ${docsOut.replace(repoRoot, ".")}`);
