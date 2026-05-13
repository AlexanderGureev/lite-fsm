import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromGraph = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "@lite-fsm/graph/view-model", replacement: fromGraph("./src/view-model/index.ts") },
      { find: "@lite-fsm/graph/simulator", replacement: fromGraph("./src/simulator/index.ts") },
      { find: "@lite-fsm/graph", replacement: fromGraph("./src/index.ts") },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["../../tests/graph/machine-flow*.test.ts"],
    setupFiles: ["../../tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/view-model/machine-flow*.ts"],
      exclude: ["src/view-model/machine-flow-types.ts"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
