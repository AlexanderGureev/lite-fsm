import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const docsOut = resolve(repoRoot, "apps/docs/out");
const previewRoot = resolve(repoRoot, ".preview");
const previewBase = resolve(previewRoot, "lite-fsm");
const port = process.env.PREVIEW_PORT ?? "4321";

if (!existsSync(docsOut)) {
  console.error(`No build found at ${docsOut.replace(repoRoot, ".")}. Run "pnpm run pages:build" first.`);
  process.exit(1);
}

rmSync(previewRoot, { recursive: true, force: true });
mkdirSync(previewBase, { recursive: true });
cpSync(docsOut, previewBase, { recursive: true });

console.log(`\nPreview URLs:`);
console.log(`  Docs:        http://localhost:${port}/lite-fsm/`);
console.log(`  Playground:  http://localhost:${port}/lite-fsm/playground/`);
console.log(`\nServing ${previewRoot.replace(repoRoot, ".")} (Ctrl+C to stop)\n`);

const child = spawn(
  "npx",
  ["--yes", "serve", previewRoot, "--listen", port, "--no-clipboard", "--no-port-switching"],
  { stdio: "inherit" },
);

const stop = () => child.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
