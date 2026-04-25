import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "lite-fsm/middleware/immer": fileURLToPath(new URL("./src/middleware/immer.ts", import.meta.url)),
      "lite-fsm/react": fileURLToPath(new URL("./src/react/index.ts", import.meta.url)),
      "lite-fsm": fileURLToPath(new URL("./src/core/index.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "playground/**",
        "src/**/*.d.ts",
        "src/middleware.ts",
        "src/middleware/index.ts",
        "src/react/index.ts",
        "src/core/types.ts",
        "src/core/interfaces.ts",
        "src/react/types.ts",
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
