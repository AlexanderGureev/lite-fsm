import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const appRoot = dirname(srcRoot);

const walk = (directory: string): readonly string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return walk(path);

    return [path];
  });

const relativePath = (path: string): string => relative(appRoot, path);

const productionSourceFiles = (): readonly string[] =>
  walk(srcRoot).filter((path) => {
    const normalized = relativePath(path);

    return /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path) && !normalized.startsWith("src/test/");
  });

const testFiles = (): readonly string[] =>
  [...walk(srcRoot), ...walk(join(appRoot, "tests"))].filter((path) => /\.(test|spec)\.(ts|tsx)$/.test(path));

const read = (path: string): string => readFileSync(path, "utf8");

describe("12f static audit boundaries visualizer", () => {
  it("держит graph runtime imports вне React feature/app/ui components", () => {
    const componentFiles = productionSourceFiles().filter((path) => {
      const normalized = relativePath(path);

      return (
        normalized.endsWith(".tsx") &&
        (normalized.startsWith("src/app/") ||
          normalized.startsWith("src/features/") ||
          normalized.startsWith("src/ui/"))
      );
    });

    expect(
      componentFiles
        .filter((path) => /from\s+["']@lite-fsm\/graph(?:\/[^"']*)?["']/.test(read(path)))
        .map(relativePath),
    ).toEqual([]);
  });

  it("оставляет React слой на centralized selectors/dispatch без ad hoc equality", () => {
    const reactFiles = productionSourceFiles().filter((path) => {
      const normalized = relativePath(path);

      return (
        normalized.endsWith(".tsx") &&
        !normalized.endsWith("src/app/use-workbench-selector.ts") &&
        (normalized.startsWith("src/app/") || normalized.startsWith("src/features/"))
      );
    });
    const adHocEqualityPattern = /shallowEqualObject|deepEqual|JSON\.stringify|useSyncExternalStore/;

    expect(reactFiles.filter((path) => adHocEqualityPattern.test(read(path))).map(relativePath)).toEqual([]);
  });

  it("не содержит skip/todo/only в visualizer tests", () => {
    const modifierPattern = /\b(?:describe|it|test)\.(?:skip|todo|only)\s*\(/;

    expect(
      testFiles()
        .filter((path) => modifierPattern.test(read(path)))
        .map(relativePath),
    ).toEqual([]);
  });
});
