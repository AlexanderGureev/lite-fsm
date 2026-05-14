import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import ts from "typescript";
import { createProjectModuleResolver } from "../../../packages/cli/src/project/module-resolver";
import { createSourceCache } from "../../../packages/cli/src/project/source-cache";
import type { CliFileSystem } from "../../../packages/cli/src/cli/context";
import { createMemoryFileSystem } from "../helpers/memory-fs";

const compilerOptions = (root: string): ts.CompilerOptions => ({
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  baseUrl: root,
  configFilePath: `${root}/tsconfig.json`,
  paths: {
    "@/*": ["./*"],
  },
});

describe("резолвер модулей", () => {
  it("возвращает core, external, resolved, not-found и unsupported-extension outcomes", () => {
    const root = "/project";
    const fromFileName = `${root}/store/index.ts`;
    const fs = createMemoryFileSystem({
      [fromFileName]: "",
      [`${root}/store/machine.ts`]: "",
      [`${root}/store/dir/index.ts`]: "",
      [`${root}/aliased.ts`]: "",
      "/outside/machine.ts": "",
    });
    const resolver = createProjectModuleResolver({
      compilerOptions: compilerOptions(root),
      projectRoot: root,
      sourceCache: createSourceCache(fs),
    });

    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "@lite-fsm/core" })).toEqual({
      kind: "core",
      moduleSpecifier: "@lite-fsm/core",
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "lite-fsm" })).toEqual({
      kind: "core",
      moduleSpecifier: "lite-fsm",
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "lite-fsm/middleware" })).toEqual({
      kind: "external",
      moduleSpecifier: "lite-fsm/middleware",
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "./machine" })).toEqual({
      kind: "resolved",
      fileName: `${root}/store/machine.ts`,
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "./dir" })).toEqual({
      kind: "resolved",
      fileName: `${root}/store/dir/index.ts`,
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "@/aliased" })).toEqual({
      kind: "resolved",
      fileName: `${root}/aliased.ts`,
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "@/missing" })).toEqual({
      kind: "not-found",
      moduleSpecifier: "@/missing",
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "@player/store" })).toEqual({
      kind: "external",
      moduleSpecifier: "@player/store",
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "./data.json" })).toEqual({
      kind: "unsupported-extension",
      moduleSpecifier: "./data.json",
      extension: ".json",
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "../../outside/machine" })).toEqual({
      kind: "external",
      moduleSpecifier: "../../outside/machine",
    });
  });

  it("поддерживает baseUrl candidates и оставляет bare packages external", () => {
    const root = "/project";
    const fromFileName = `${root}/store/index.ts`;
    const fs = createMemoryFileSystem({
      [fromFileName]: "",
      [`${root}/store/local.ts`]: "",
      [`${root}/local.ts`]: "",
    });
    const resolver = createProjectModuleResolver({
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        baseUrl: root,
      },
      projectRoot: root,
      sourceCache: createSourceCache(fs),
    });

    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "store/local" })).toEqual({
      kind: "resolved",
      fileName: `${root}/store/local.ts`,
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "store/missing" })).toEqual({
      kind: "not-found",
      moduleSpecifier: "store/missing",
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "local/missing" })).toEqual({
      kind: "not-found",
      moduleSpecifier: "local/missing",
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "local" })).toEqual({
      kind: "resolved",
      fileName: `${root}/local.ts`,
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "missing" })).toEqual({
      kind: "external",
      moduleSpecifier: "missing",
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "react" })).toEqual({
      kind: "external",
      moduleSpecifier: "react",
    });
    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "react/jsx-runtime" })).toEqual({
      kind: "external",
      moduleSpecifier: "react/jsx-runtime",
    });
  });

  it("оставляет non-relative specifier external без paths и baseUrl", () => {
    const root = "/project";
    const fromFileName = `${root}/store/index.ts`;
    const resolver = createProjectModuleResolver({
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      projectRoot: root,
      sourceCache: createSourceCache(createMemoryFileSystem({ [fromFileName]: "" })),
    });

    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "store/local" })).toEqual({
      kind: "external",
      moduleSpecifier: "store/local",
    });
  });

  it("использует rootDirs для relative TypeScript resolution", () => {
    const root = "/project";
    const fromFileName = `${root}/src/store/index.ts`;
    const fs = createMemoryFileSystem({
      [fromFileName]: "",
      [`${root}/generated/shared/machine.ts`]: "",
    });
    const resolver = createProjectModuleResolver({
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        rootDirs: [`${root}/src`, `${root}/generated`],
      },
      projectRoot: root,
      sourceCache: createSourceCache(fs),
    });

    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "../shared/machine" })).toEqual({
      kind: "resolved",
      fileName: `${root}/generated/shared/machine.ts`,
    });
  });

  it("переиспользует existence cache TypeScript host между resolver calls", () => {
    const root = "/project";
    const fromFileName = `${root}/store/index.ts`;
    const fs = createMemoryFileSystem({
      [fromFileName]: "",
      [`${root}/store/machine.ts`]: "",
    });
    const resolver = createProjectModuleResolver({
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      projectRoot: root,
      sourceCache: createSourceCache(fs),
    });

    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "./machine" })).toEqual({
      kind: "resolved",
      fileName: `${root}/store/machine.ts`,
    });
    const countsAfterFirstResolve = new Map(fs.fileExistsCounts);

    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "./machine" })).toEqual({
      kind: "resolved",
      fileName: `${root}/store/machine.ts`,
    });
    expect(fs.fileExistsCounts).toEqual(countsAfterFirstResolve);
  });

  it("диагностирует resolved unsupported extensions", () => {
    const root = "/project";
    const fromFileName = `${root}/store/index.ts`;
    const fs = createMemoryFileSystem({
      [fromFileName]: "",
      [`${root}/store/component.tsx`]: "",
    });
    const resolver = createProjectModuleResolver({
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
      },
      projectRoot: root,
      sourceCache: createSourceCache(fs),
    });

    expect(resolver.resolveModule({ fromFileName, moduleSpecifier: "./component" })).toEqual({
      kind: "unsupported-extension",
      moduleSpecifier: "./component",
      extension: ".tsx",
    });
  });

  it("не traverses modules resolved из node_modules", () => {
    const root = process.cwd();
    const fs: CliFileSystem = {
      readFile(path) {
        return readFileSync(path, "utf8");
      },
      writeFile() {
        throw new Error("not used");
      },
      mkdir() {
        throw new Error("not used");
      },
      rename() {
        throw new Error("not used");
      },
      unlink() {
        throw new Error("not used");
      },
      fileExists(path) {
        return existsSync(path) && statSync(path).isFile();
      },
      directoryExists(path) {
        return existsSync(path) && statSync(path).isDirectory();
      },
      realpath(path) {
        return path;
      },
    };
    const resolver = createProjectModuleResolver({
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        baseUrl: root,
      },
      projectRoot: root,
      sourceCache: createSourceCache(fs),
    });

    expect(resolver.resolveModule({ fromFileName: `${root}/src/index.ts`, moduleSpecifier: "react/jsx-runtime" })).toEqual({
      kind: "external",
      moduleSpecifier: "react/jsx-runtime",
    });
  });
});
