import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const stripWildcard = (value: string) => value.replace(/\/\*$/, "");

type TsconfigPaths = {
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
};

const readAliases = () => {
  const config = JSON.parse(readFileSync(fromRoot("./tsconfig.paths.json"), "utf8")) as TsconfigPaths;
  const paths = config.compilerOptions?.paths ?? {};

  return Object.entries(paths)
    .map(([find, replacements]) => {
      const [replacement] = replacements;
      if (!replacement) throw new Error(`Missing tsconfig path replacement for ${find}`);

      return {
        find: stripWildcard(find),
        replacement: fromRoot(stripWildcard(replacement)),
      };
    })
    .sort((left, right) => right.find.length - left.find.length);
};

export default defineConfig({
  resolve: {
    alias: readAliases(),
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["packages/**/*.{ts,tsx}"],
      exclude: [
        "packages/**/dist/**",
        "packages/graph/**",
        "packages/**/tsup.config.ts",
        "packages/**/*.d.ts",
        "packages/**/src/index.ts",
        "packages/core/src/types.ts",
        "packages/core/src/interfaces.ts",
        "packages/react/src/types.ts",
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
