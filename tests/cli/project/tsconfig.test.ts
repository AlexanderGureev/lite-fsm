import { describe, expect, it } from "vitest";
import { resolveProjectTsconfig } from "../../../packages/cli/src/project/tsconfig";
import { createCliTestContext } from "../helpers/memory-fs";

describe("поиск tsconfig", () => {
  it("использует explicit tsconfig и парсит compiler options", () => {
    const context = createCliTestContext({
      "/project/base.json": JSON.stringify({
        compilerOptions: {
          strict: false,
        },
      }),
      "/project/tsconfig.json": JSON.stringify({
        extends: "./base.json",
        compilerOptions: {
          moduleResolution: "bundler",
          paths: {
            "@/*": ["./src/*"],
          },
        },
      }),
      "/project/src/store/index.ts": "",
    });

    const result = resolveProjectTsconfig(context, {
      entryFileName: "/project/src/store/index.ts",
      explicitTsconfigPath: "tsconfig.json",
    });

    expect(result.blocking).toBe(false);
    expect(result.projectRoot).toBe("/project");
    expect(result.tsconfigPath).toBe("/project/tsconfig.json");
    expect(result.compilerOptions.paths).toEqual({ "@/*": ["./src/*"] });
  });

  it("возвращает blocking diagnostics для missing explicit и invalid tsconfig", () => {
    const missingContext = createCliTestContext({
      "/project/src/store/index.ts": "",
    });
    const missing = resolveProjectTsconfig(missingContext, {
      entryFileName: "/project/src/store/index.ts",
      explicitTsconfigPath: "missing.json",
    });

    expect(missing.blocking).toBe(true);
    expect(missing.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_TSCONFIG_NOT_FOUND", severity: "error" }),
    ]);

    const invalidContext = createCliTestContext({
      "/project/tsconfig.json": "{",
      "/project/src/store/index.ts": "",
    });
    const invalid = resolveProjectTsconfig(invalidContext, {
      entryFileName: "/project/src/store/index.ts",
    });

    expect(invalid.blocking).toBe(true);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_TSCONFIG_INVALID", severity: "error", file: "/project/tsconfig.json" }),
    ]);

    const invalidOptionsContext = createCliTestContext({
      "/project/tsconfig.json": JSON.stringify({
        compilerOptions: {
          moduleResolution: "invalid",
        },
      }),
    });
    const invalidOptions = resolveProjectTsconfig(invalidOptionsContext, {
      entryFileName: "/project/src/store/index.ts",
    });

    expect(invalidOptions.blocking).toBe(true);
    expect(invalidOptions.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_TSCONFIG_INVALID", severity: "error", file: "/project/tsconfig.json" }),
    ]);

    const missingExtendsContext = createCliTestContext({
      "/project/tsconfig.json": JSON.stringify({
        extends: "./missing-base.json",
      }),
    });
    const missingExtends = resolveProjectTsconfig(missingExtendsContext, {
      entryFileName: "/project/src/store/index.ts",
    });

    expect(missingExtends.blocking).toBe(true);
    expect(missingExtends.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_TSCONFIG_INVALID", severity: "error", file: "/project/tsconfig.json" }),
    ]);
  });

  it("ищет nearest tsconfig и дает info fallback, если tsconfig не найден", () => {
    const nearestContext = createCliTestContext({
      "/project/tsconfig.json": "{}",
      "/project/src/store/index.ts": "",
    });
    const nearest = resolveProjectTsconfig(nearestContext, {
      entryFileName: "/project/src/store/index.ts",
    });

    expect(nearest.blocking).toBe(false);
    expect(nearest.tsconfigPath).toBe("/project/tsconfig.json");

    const fallbackContext = createCliTestContext({
      "/project/src/store/index.ts": "",
    });
    const fallback = resolveProjectTsconfig(fallbackContext, {
      entryFileName: "/project/src/store/index.ts",
    });

    expect(fallback.blocking).toBe(false);
    expect(fallback.projectRoot).toBe("/project");
    expect(fallback.tsconfigPath).toBeUndefined();
    expect(fallback.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_TSCONFIG_NOT_FOUND", severity: "info" }),
    ]);
  });
});
