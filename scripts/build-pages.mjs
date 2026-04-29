import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const docsDir = resolve(repoRoot, "docs");
const playgroundDir = resolve(repoRoot, "playground");
const docsOut = resolve(docsDir, "out");
const playgroundOut = resolve(playgroundDir, "out");
const playgroundInDocs = resolve(docsOut, "playground");

const skipInstall = process.argv.includes("--skip-install");

const run = (cmd, opts = {}) => {
  const cwd = opts.cwd ?? repoRoot;
  console.log(`\n$ (${cwd.replace(repoRoot, ".")}) ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts, cwd });
};

if (!skipInstall) run("npm ci");
run("npm run build");

if (!skipInstall) run("npm ci", { cwd: docsDir });
run("npx next build", { cwd: docsDir, env: { ...process.env, NODE_ENV: "production" } });
run("npx pagefind --site .next/server/app --output-path out/_pagefind", { cwd: docsDir });

writeFileSync(resolve(docsOut, "_pagefind-config.json"), '{ "baseUrl": "/lite-fsm" }\n');
writeFileSync(
  resolve(docsOut, "_pagefind/pagefind-entry.js"),
  `window.PagefindConfig = {\n  baseUrl: "/lite-fsm",\n  bundlePath: "/lite-fsm/_pagefind/"\n};\n`,
);

if (!skipInstall) run("npm ci", { cwd: playgroundDir });
run("npx next build", { cwd: playgroundDir, env: { ...process.env, NODE_ENV: "production" } });

rmSync(playgroundInDocs, { recursive: true, force: true });
mkdirSync(playgroundInDocs, { recursive: true });
cpSync(playgroundOut, playgroundInDocs, { recursive: true });
writeFileSync(resolve(docsOut, ".nojekyll"), "");

console.log(`\nPages build complete: ${docsOut.replace(repoRoot, ".")}`);
