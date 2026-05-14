import { describe, expect, it } from "vitest";
import { createSourceCache, normalizeAbsolutePath, normalizePath } from "../../../packages/cli/src/project/source-cache";
import { createMemoryFileSystem } from "../helpers/memory-fs";

describe("source cache для CLI", () => {
  it("кэширует чтение source files и проверки существования", () => {
    const fs = createMemoryFileSystem({
      "/project/src/a.ts": "export const a = 1;",
      "/project/src/data.json": "{}",
    });
    const cache = createSourceCache(fs);
    const sourcePath = "/project/src/a.ts";
    const jsonPath = "/project/src/data.json";

    expect(normalizePath("C:\\repo\\a.ts")).toBe("C:/repo/a.ts");
    expect(normalizeAbsolutePath("/project/src/../src/a.ts")).toBe("/project/src/a.ts");
    expect(cache.readSource(sourcePath)).toBe("export const a = 1;");
    expect(cache.readSource(sourcePath)).toBe("export const a = 1;");
    expect(cache.readSource("/project/src/missing.ts")).toBeUndefined();
    expect(cache.readSource(jsonPath)).toBeUndefined();
    expect(cache.sourceHash(sourcePath)).toHaveLength(64);
    expect(cache.sourceHash("/project/src/missing.ts")).toBeUndefined();

    expect(fs.readCounts.get("/project/src/a.ts")).toBe(1);
    expect(fs.readCounts.has(jsonPath)).toBe(false);

    expect(cache.fileExists(sourcePath)).toBe(true);
    expect(cache.fileExists(sourcePath)).toBe(true);
    expect(cache.directoryExists("/project/src")).toBe(true);
    expect(cache.directoryExists("/project/src")).toBe(true);
    expect(cache.realpath(sourcePath)).toBe(sourcePath);
    expect(fs.fileExistsCounts.get(sourcePath)).toBe(1);
    expect(fs.directoryExistsCounts.get("/project/src")).toBe(1);
  });

  it("возвращает normalized key, если filesystem не поддерживает realpath", () => {
    const fs = createMemoryFileSystem({
      "/project/src/a.ts": "export const a = 1;",
    });
    const { realpath: _realpath, ...fsWithoutRealpath } = fs;
    const cache = createSourceCache(fsWithoutRealpath);

    expect(cache.realpath("/project/src/../src/a.ts")).toBe("/project/src/a.ts");
  });
});
