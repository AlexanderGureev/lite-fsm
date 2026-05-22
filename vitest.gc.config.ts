// Отдельный конфиг для тестов, требующих node --expose-gc.
// Используется через `pnpm run test:gc` (он передаёт NODE_OPTIONS=--expose-gc).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const stripWildcard = (value: string) => value.replace(/\/\*$/, "");

type TsconfigPaths = { compilerOptions?: { paths?: Record<string, string[]> } };

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
  resolve: { alias: readAliases() },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/memoryLeak.weakref.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
