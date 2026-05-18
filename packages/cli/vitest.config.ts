import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromCli = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const readPackageJson = (path: string): { version: string; devDependencies?: Record<string, string> } => {
  return JSON.parse(readFileSync(resolve(workspaceRoot, path), "utf8")) as { version: string; devDependencies?: Record<string, string> };
};
const rootPackage = readPackageJson("package.json");
const createProjectDependencies = {
  "@lite-fsm/core": `^${readPackageJson("packages/core/package.json").version}`,
  "@lite-fsm/middleware": `^${readPackageJson("packages/middleware/package.json").version}`,
  "@lite-fsm/react": `^${readPackageJson("packages/react/package.json").version}`,
  immer: rootPackage.devDependencies?.immer ?? "^11.1.0",
};

export default defineConfig({
  define: {
    __LITE_FSM_CREATE_PROJECT_DEPENDENCIES__: JSON.stringify(createProjectDependencies),
  },
  resolve: {
    alias: [
      { find: "@lite-fsm/graph", replacement: fromCli("../graph/src/index.ts") },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["../../tests/cli/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/add-machine/**/*.ts", "src/cli/**/*.ts", "src/create-project/**/*.ts", "src/export-graph/**/*.ts", "src/output/**/*.ts", "src/project/**/*.ts", "src/visualize/**/*.ts"],
      exclude: ["src/cli/node-fs.ts", "src/create-project/dependencies.ts", "src/create-project/release-dependencies.ts"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
