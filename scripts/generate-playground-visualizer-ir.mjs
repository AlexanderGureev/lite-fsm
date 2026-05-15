import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const repoRoot = resolve(import.meta.dirname, "..");
const manifestPath = resolve(repoRoot, "apps/playground/lib/examples-manifest.ts");
const outputDir = resolve(repoRoot, "apps/playground/public/visualizer-ir/examples");

const manifestModule = ts.transpileModule(readFileSync(manifestPath, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const manifestUrl = `data:text/javascript;base64,${Buffer.from(manifestModule.outputText).toString("base64")}`;
const { examples } = await import(manifestUrl);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

for (const example of examples) {
  const entry = `apps/playground/app/examples/${example.id}/store/index.ts`;
  const out = `apps/playground/public/visualizer-ir/examples/${example.id}.json`;

  console.log(`Generating visualizer IR: ${example.id}`);
  execFileSync(
    process.execPath,
    [
      "packages/cli/dist/bin/lite-fsm.js",
      "export-graph",
      "--entry",
      entry,
      "--out",
      out,
      "--tsconfig",
      "apps/playground/tsconfig.json",
      "--include-source",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
}
