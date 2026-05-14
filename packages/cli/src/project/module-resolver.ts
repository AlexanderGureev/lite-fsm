import { extname, isAbsolute, relative, resolve } from "node:path";
import ts from "typescript";
import type { LiteFsmGraphProjectModuleResolution } from "@lite-fsm/graph";
import type { SourceCache } from "./source-cache.js";
import { normalizeAbsolutePath, normalizePath } from "./source-cache.js";

export type ProjectModuleResolver = {
  resolveModule(input: {
    fromFileName: string;
    moduleSpecifier: string;
  }): LiteFsmGraphProjectModuleResolution;
};

export type ProjectModuleResolverOptions = {
  compilerOptions: ts.CompilerOptions;
  projectRoot: string;
  sourceCache: SourceCache;
};

const SUPPORTED_EXTENSION = ".ts";

const isRelativeSpecifier = (moduleSpecifier: string): boolean => {
  return moduleSpecifier.startsWith("./") || moduleSpecifier.startsWith("../");
};

const isCoreSpecifier = (moduleSpecifier: string): boolean => {
  return moduleSpecifier === "@lite-fsm/core" || moduleSpecifier === "lite-fsm";
};

const explicitExtension = (moduleSpecifier: string): string | undefined => {
  const segments = moduleSpecifier.split("/");
  /* v8 ignore next -- String#split always returns at least one segment. */
  const lastSegment = segments[segments.length - 1] ?? moduleSpecifier;
  const extension = extname(lastSegment);

  return extension === "" ? undefined : extension;
};

const isInsideRoot = (fileName: string, projectRoot: string): boolean => {
  const relativePath = normalizePath(relative(projectRoot, fileName));

  return relativePath === "" || (!relativePath.startsWith("../") && relativePath !== ".." && !isAbsolute(relativePath));
};

const pathPatternToRegExp = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");

  return new RegExp(`^${escaped}$`);
};

const matchesPaths = (moduleSpecifier: string, paths: ts.MapLike<string[]> | undefined): boolean => {
  if (!paths) return false;

  return Object.keys(paths).some((pattern) => pathPatternToRegExp(pattern).test(moduleSpecifier));
};

const isBaseUrlCandidate = (moduleSpecifier: string, baseUrl: string | undefined): baseUrl is string => {
  return Boolean(baseUrl) && !moduleSpecifier.startsWith("@") && !moduleSpecifier.startsWith("lite-fsm/");
};

const firstSpecifierSegment = (moduleSpecifier: string): string => {
  const separatorIndex = moduleSpecifier.indexOf("/");

  return separatorIndex === -1 ? moduleSpecifier : moduleSpecifier.slice(0, separatorIndex);
};

const hasBaseUrlProjectPrefix = (
  moduleSpecifier: string,
  baseUrl: string,
  sourceCache: SourceCache,
): boolean => {
  const candidate = normalizeAbsolutePath(resolve(baseUrl, firstSpecifierSegment(moduleSpecifier)));

  return sourceCache.fileExists(`${candidate}.ts`) || sourceCache.directoryExists(candidate);
};

const resolutionHost = (sourceCache: SourceCache): ts.ModuleResolutionHost => ({
  fileExists(path) {
    return sourceCache.fileExists(path);
  },
  /* v8 ignore next 3 -- TypeScript only asks readFile for package metadata/declaration strategies outside the CLI source traversal path. */
  readFile(path) {
    return sourceCache.readSource(path);
  },
  directoryExists(path) {
    return sourceCache.directoryExists(path);
  },
  /* v8 ignore next 3 -- realpath is supplied for TypeScript host completeness; current supported resolver paths do not require it. */
  realpath(path) {
    return sourceCache.realpath(path);
  },
  getCurrentDirectory() {
    return "/";
  },
});

const resolutionFromFileName = (
  moduleSpecifier: string,
  fileName: string,
  projectRoot: string,
): LiteFsmGraphProjectModuleResolution => {
  const extension = extname(fileName);
  if (extension !== SUPPORTED_EXTENSION) {
    return {
      kind: "unsupported-extension",
      moduleSpecifier,
      /* v8 ignore next -- unsupported resolved modules always have an extension in supported TypeScript resolution. */
      extension: extension || "unknown",
    };
  }
  if (!isInsideRoot(fileName, projectRoot)) return { kind: "external", moduleSpecifier };

  return { kind: "resolved", fileName };
};

export const createProjectModuleResolver = ({
  compilerOptions,
  projectRoot,
  sourceCache,
}: ProjectModuleResolverOptions): ProjectModuleResolver => {
  const normalizedProjectRoot = normalizeAbsolutePath(projectRoot);
  const host = resolutionHost(sourceCache);

  return {
    resolveModule({ fromFileName, moduleSpecifier }) {
      if (isCoreSpecifier(moduleSpecifier)) return { kind: "core", moduleSpecifier };
      if (moduleSpecifier.startsWith("lite-fsm/")) return { kind: "external", moduleSpecifier };

      const extension = explicitExtension(moduleSpecifier);
      if (extension && extension !== SUPPORTED_EXTENSION) {
        return { kind: "unsupported-extension", moduleSpecifier, extension };
      }

      const relativeSpecifier = isRelativeSpecifier(moduleSpecifier);
      const pathsCandidate = matchesPaths(moduleSpecifier, compilerOptions.paths);
      const baseUrl = compilerOptions.baseUrl;
      const baseUrlCandidate = isBaseUrlCandidate(moduleSpecifier, baseUrl);
      const projectLocalCandidate = relativeSpecifier || pathsCandidate || baseUrlCandidate;
      if (!projectLocalCandidate) return { kind: "external", moduleSpecifier };

      const resolvedModule = ts.resolveModuleName(
        moduleSpecifier,
        normalizeAbsolutePath(fromFileName),
        compilerOptions,
        host,
      ).resolvedModule;

      if (!resolvedModule) {
        const unresolvedProjectLocal = relativeSpecifier
          || pathsCandidate
          || (baseUrlCandidate && hasBaseUrlProjectPrefix(moduleSpecifier, baseUrl, sourceCache));

        return unresolvedProjectLocal ? { kind: "not-found", moduleSpecifier } : { kind: "external", moduleSpecifier };
      }
      if (resolvedModule.isExternalLibraryImport) return { kind: "external", moduleSpecifier };

      const resolvedFileName = normalizeAbsolutePath(resolve(resolvedModule.resolvedFileName));

      return resolutionFromFileName(moduleSpecifier, resolvedFileName, normalizedProjectRoot);
    },
  };
};
