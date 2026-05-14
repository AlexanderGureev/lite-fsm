import { relative, resolve } from "node:path";
import { compileLiteFsmGraphProject, type LiteFsmGraphProjectResult } from "@lite-fsm/graph";
import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic, hasBlockingCliDiagnostics } from "../cli/diagnostics.js";
import { createProjectHost } from "./create-project-host.js";
import { createProjectModuleResolver } from "./module-resolver.js";
import { createSourceCache, normalizeAbsolutePath, normalizePath } from "./source-cache.js";
import { resolveProjectTsconfig } from "./tsconfig.js";

export type ProjectGraphBuildOptions = {
  entry: string;
  tsconfig?: string;
};

export type ProjectGraphBuildResult = {
  project: {
    entryPath: string;
    absoluteEntryPath: string;
    projectRoot: string;
    tsconfigPath?: string;
  };
  graphResult?: LiteFsmGraphProjectResult;
  diagnostics: CliDiagnostic[];
  blocking: boolean;
};

const toDisplayPath = (path: string, cwd: string): string => {
  const relativePath = normalizePath(relative(cwd, path));

  return relativePath === "" || (!relativePath.startsWith("../") && relativePath !== "..")
    ? relativePath || "."
    : normalizePath(path);
};

export const buildProjectGraph = (context: CliContext, options: ProjectGraphBuildOptions): ProjectGraphBuildResult => {
  const absoluteEntryPath = normalizeAbsolutePath(resolve(context.cwd, options.entry));
  const tsconfig = resolveProjectTsconfig(context, {
    entryFileName: absoluteEntryPath,
    explicitTsconfigPath: options.tsconfig,
  });
  const project = {
    entryPath: toDisplayPath(absoluteEntryPath, normalizeAbsolutePath(context.cwd)),
    absoluteEntryPath,
    projectRoot: tsconfig.projectRoot,
    tsconfigPath: tsconfig.tsconfigPath ? toDisplayPath(tsconfig.tsconfigPath, normalizeAbsolutePath(context.cwd)) : undefined,
  };

  if (tsconfig.blocking) {
    return {
      project,
      diagnostics: tsconfig.diagnostics,
      blocking: true,
    };
  }

  try {
    const sourceCache = createSourceCache(context.fs);
    const resolver = createProjectModuleResolver({
      compilerOptions: tsconfig.compilerOptions,
      projectRoot: tsconfig.projectRoot,
      sourceCache,
    });
    const host = createProjectHost(sourceCache, resolver);
    const graphResult = compileLiteFsmGraphProject({
      entryFileName: absoluteEntryPath,
      projectRoot: tsconfig.projectRoot,
      host,
    });

    return {
      project,
      graphResult,
      diagnostics: tsconfig.diagnostics,
      blocking: hasBlockingCliDiagnostics(tsconfig.diagnostics),
    };
  /* v8 ignore start -- compileLiteFsmGraphProject normalizes host failures; this is a last-resort command boundary guard. */
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      project,
      diagnostics: [
        ...tsconfig.diagnostics,
        cliDiagnostic("LFC_GRAPH_PROJECT_FAILED", "error", `Project graph build failed unexpectedly: ${message}`),
      ],
      blocking: true,
    };
  }
  /* v8 ignore stop */
};
