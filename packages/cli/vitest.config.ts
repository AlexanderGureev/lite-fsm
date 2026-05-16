import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromCli = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
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
      include: ["src/cli/**/*.ts", "src/export-graph/**/*.ts", "src/output/**/*.ts", "src/project/**/*.ts", "src/visualize/**/*.ts"],
      exclude: ["src/cli/node-fs.ts"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
