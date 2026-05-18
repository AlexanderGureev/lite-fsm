import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

type PackageJson = {
  version: string;
  devDependencies?: Record<string, string>;
};

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const readPackageJson = (path: string): PackageJson => {
  return JSON.parse(readFileSync(resolve(workspaceRoot, path), "utf8")) as PackageJson;
};
const rootPackage = readPackageJson("package.json");
const createProjectDependencies = {
  "@lite-fsm/core": `^${readPackageJson("packages/core/package.json").version}`,
  "@lite-fsm/middleware": `^${readPackageJson("packages/middleware/package.json").version}`,
  "@lite-fsm/react": `^${readPackageJson("packages/react/package.json").version}`,
  immer: rootPackage.devDependencies?.immer ?? "^11.1.0",
};

export default defineConfig({
  clean: true,
  entry: {
    "bin/lite-fsm": "src/bin/lite-fsm.ts",
  },
  external: ["@lite-fsm/graph", "typescript"],
  format: ["esm"],
  outDir: "dist",
  bundle: true,
  banner: {
    js: 'import { createRequire as __liteFsmCreateRequire } from "node:module"; const require = __liteFsmCreateRequire(import.meta.url);',
  },
  sourcemap: false,
  splitting: false,
  minify: false,
  platform: "node",
  target: "node20",
  define: {
    __LITE_FSM_CREATE_PROJECT_DEPENDENCIES__: JSON.stringify(createProjectDependencies),
  },
  tsconfig: "./tsconfig.json",
});
