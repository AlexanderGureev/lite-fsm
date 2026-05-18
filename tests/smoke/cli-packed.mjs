import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const workspaceRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), "lite-fsm-cli-packed-"));
const packRoot = join(tempRoot, "pack");
const consumerRoot = join(tempRoot, "consumer");
const fakeBinRoot = join(tempRoot, "bin");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    ...options,
  });

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  return result;
};

const packedManifest = (tarball) => {
  const result = run("tar", ["-xOf", tarball, "package/package.json"]);
  return JSON.parse(result.stdout);
};

const assertNoWorkspaceSpecifiers = (value, path = "package.json") => {
  if (typeof value === "string") {
    assert.equal(value.startsWith("workspace:"), false, `${path} contains workspace protocol: ${value}`);
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    assertNoWorkspaceSpecifiers(child, `${path}.${key}`);
  }
};

const findTarball = (name) => {
  const files = run("find", [packRoot, "-maxdepth", "1", "-name", `${name}-*.tgz`, "-print"]).stdout.trim().split("\n").filter(Boolean);
  assert.equal(files.length, 1, `Expected exactly one tarball for ${name}, got ${files.join(", ")}`);
  return files[0];
};

const packageVersion = (relativePath) => {
  return JSON.parse(readFileSync(resolve(workspaceRoot, relativePath), "utf8")).version;
};

const rootPackage = JSON.parse(readFileSync(resolve(workspaceRoot, "package.json"), "utf8"));

const fakeNpm = `#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const args = process.argv.slice(2);
if (args[0] !== "create" || args[1] !== "vite@latest" || !args[2]) {
  console.error("Unexpected fake npm command:", args.join(" "));
  process.exit(1);
}

const target = resolve(process.cwd(), args[2]);
mkdirSync(join(target, "src"), { recursive: true });
writeFileSync(join(target, "package.json"), JSON.stringify({ scripts: { dev: "vite" }, dependencies: { react: "latest" } }, null, 2));
writeFileSync(join(target, "vite.config.ts"), \`import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
\`);
writeFileSync(join(target, "tsconfig.json"), JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }] }, null, 2));
writeFileSync(join(target, "tsconfig.app.json"), JSON.stringify({ compilerOptions: { jsx: "react-jsx" } }, null, 2));
writeFileSync(join(target, "src/main.tsx"), \`import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
\`);
writeFileSync(join(target, "src/index.css"), "body { margin: 0; }\\n");
`;

try {
  mkdirSync(packRoot, { recursive: true });
  mkdirSync(consumerRoot, { recursive: true });
  mkdirSync(fakeBinRoot, { recursive: true });
  writeFileSync(join(fakeBinRoot, "npm"), fakeNpm);
  chmodSync(join(fakeBinRoot, "npm"), 0o755);

  run("pnpm", ["--filter", "@lite-fsm/graph", "pack", "--pack-destination", packRoot]);
  run("pnpm", ["--filter", "@lite-fsm/cli", "pack", "--pack-destination", packRoot]);

  const cliTarball = findTarball("lite-fsm-cli");
  const graphTarball = findTarball("lite-fsm-graph");
  const manifest = packedManifest(cliTarball);

  assertNoWorkspaceSpecifiers(manifest);
  assert.equal(manifest.dependencies["@lite-fsm/graph"], packageVersion("packages/graph/package.json"));
  assert.equal(manifest.dependencies.typescript, "^6.0.3");
  assert.equal(manifest.dependencies.commander, undefined);
  assert.equal(manifest.devDependencies.commander, "^14.0.3");

  writeFileSync(join(consumerRoot, "package.json"), JSON.stringify({
    name: "lite-fsm-cli-packed-smoke",
    private: true,
    dependencies: {
      "@lite-fsm/cli": `file:${cliTarball}`,
      "@lite-fsm/graph": `file:${graphTarball}`,
    },
    pnpm: {
      overrides: {
        "@lite-fsm/graph": `file:${graphTarball}`,
        "ts-morph": `link:${resolve(workspaceRoot, "packages/graph/node_modules/ts-morph")}`,
        typescript: `link:${resolve(workspaceRoot, "node_modules/typescript")}`,
      },
    },
  }, null, 2));
  run("pnpm", ["install", "--offline", "--ignore-scripts"], { cwd: consumerRoot });

  const help = run("pnpm", ["exec", "lite-fsm", "--help"], { cwd: consumerRoot });
  assert.match(help.stdout, /lite-fsm command line tools/);

  const env = {
    ...process.env,
    PATH: `${fakeBinRoot}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
  };
  run("pnpm", ["exec", "lite-fsm", "create", "demo", "--template", "vite", "--css", "none", "--no-install"], {
    cwd: consumerRoot,
    env,
  });

  const generatedPackage = JSON.parse(readFileSync(join(consumerRoot, "demo/package.json"), "utf8"));
  assert.equal(generatedPackage.dependencies["@lite-fsm/core"], `^${packageVersion("packages/core/package.json")}`);
  assert.equal(generatedPackage.dependencies["@lite-fsm/react"], `^${packageVersion("packages/react/package.json")}`);
  assert.equal(generatedPackage.dependencies["@lite-fsm/middleware"], `^${packageVersion("packages/middleware/package.json")}`);
  assert.equal(generatedPackage.dependencies.immer, rootPackage.devDependencies.immer);
  assert.equal(generatedPackage.devDependencies, undefined);
  assert.match(readFileSync(join(consumerRoot, "demo/src/main.tsx"), "utf8"), /FSMContextProvider/);
  assert.match(readFileSync(join(consumerRoot, "demo/src/store/index.ts"), "utf8"), /MachineManager/);
  assert.match(readFileSync(join(consumerRoot, "demo/src/App.tsx"), "utf8"), /DO_INIT/);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
