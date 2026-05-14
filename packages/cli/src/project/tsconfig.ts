import { dirname, resolve } from "node:path";
import ts from "typescript";
import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic } from "../cli/diagnostics.js";
import { normalizeAbsolutePath, normalizePath } from "./source-cache.js";

export type ProjectTsconfig = {
  tsconfigPath?: string;
  projectRoot: string;
  compilerOptions: ts.CompilerOptions;
  diagnostics: CliDiagnostic[];
  blocking: boolean;
};

export type ResolveProjectTsconfigOptions = {
  entryFileName: string;
  explicitTsconfigPath?: string;
};

const defaultCompilerOptions = (): ts.CompilerOptions => ({
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
});

const parentDirectory = (path: string): string => normalizeAbsolutePath(dirname(path));

const findNearestTsconfig = (context: CliContext, entryFileName: string): string | undefined => {
  let directory = parentDirectory(entryFileName);

  while (true) {
    const candidate = normalizeAbsolutePath(resolve(directory, "tsconfig.json"));
    if (context.fs.fileExists(candidate)) return candidate;

    const parent = parentDirectory(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
};

const diagnosticMessageText = (messageText: string | ts.DiagnosticMessageChain): string => {
  return ts.flattenDiagnosticMessageText(messageText, "\n");
};

const diagnosticLocation = (diagnostic: ts.Diagnostic): CliDiagnostic["loc"] | undefined => {
  if (!diagnostic.file || diagnostic.start === undefined) return undefined;

  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

  return { line: position.line + 1, column: position.character + 1 };
};

const invalidTsconfigDiagnostic = (diagnostic: ts.Diagnostic, fallbackFile: string): CliDiagnostic => {
  return cliDiagnostic("LFC_TSCONFIG_INVALID", "error", diagnosticMessageText(diagnostic.messageText), {
    file: diagnostic.file ? normalizePath(diagnostic.file.fileName) : fallbackFile,
    loc: diagnosticLocation(diagnostic),
  });
};

const isResolverIrrelevantDiagnostic = (diagnostic: ts.Diagnostic): boolean => {
  return diagnostic.code === 18003;
};

const parseTsconfig = (context: CliContext, tsconfigPath: string): ProjectTsconfig => {
  const normalizedTsconfigPath = normalizeAbsolutePath(tsconfigPath);
  const configFile = ts.readConfigFile(normalizedTsconfigPath, (path) => context.fs.readFile(normalizeAbsolutePath(path)));

  if (configFile.error) {
    return {
      tsconfigPath: normalizedTsconfigPath,
      projectRoot: normalizeAbsolutePath(dirname(normalizedTsconfigPath)),
      compilerOptions: defaultCompilerOptions(),
      diagnostics: [invalidTsconfigDiagnostic(configFile.error, normalizedTsconfigPath)],
      blocking: true,
    };
  }

  const projectRoot = normalizeAbsolutePath(dirname(normalizedTsconfigPath));
  const diagnostics: CliDiagnostic[] = [];
  const parseHost: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: true,
    fileExists(path) {
      return context.fs.fileExists(normalizeAbsolutePath(path));
    },
    readFile(path) {
      const normalized = normalizeAbsolutePath(path);
      return context.fs.fileExists(normalized) ? context.fs.readFile(normalized) : undefined;
    },
    readDirectory() {
      return [];
    },
  };
  const parsed = ts.parseJsonConfigFileContent(configFile.config, parseHost, projectRoot, undefined, normalizedTsconfigPath);
  const parseDiagnostics = parsed.errors
    .filter((diagnostic) => !isResolverIrrelevantDiagnostic(diagnostic))
    .map((diagnostic) => invalidTsconfigDiagnostic(diagnostic, normalizedTsconfigPath));
  const allDiagnostics = [...diagnostics, ...parseDiagnostics];

  return {
    tsconfigPath: normalizedTsconfigPath,
    projectRoot,
    compilerOptions: {
      ...defaultCompilerOptions(),
      ...parsed.options,
      configFilePath: normalizedTsconfigPath,
    },
    diagnostics: allDiagnostics,
    blocking: allDiagnostics.length > 0,
  };
};

export const resolveProjectTsconfig = (
  context: CliContext,
  options: ResolveProjectTsconfigOptions,
): ProjectTsconfig => {
  if (options.explicitTsconfigPath) {
    const explicitPath = normalizeAbsolutePath(resolve(context.cwd, options.explicitTsconfigPath));
    if (!context.fs.fileExists(explicitPath)) {
      return {
        tsconfigPath: explicitPath,
        projectRoot: normalizeAbsolutePath(dirname(explicitPath)),
        compilerOptions: defaultCompilerOptions(),
        diagnostics: [
          cliDiagnostic("LFC_TSCONFIG_NOT_FOUND", "error", `Explicit tsconfig was not found: ${normalizePath(explicitPath)}`, {
            file: normalizePath(explicitPath),
          }),
        ],
        blocking: true,
      };
    }

    return parseTsconfig(context, explicitPath);
  }

  const nearest = findNearestTsconfig(context, options.entryFileName);
  if (nearest) return parseTsconfig(context, nearest);

  return {
    projectRoot: normalizeAbsolutePath(context.cwd),
    compilerOptions: defaultCompilerOptions(),
    diagnostics: [
      cliDiagnostic(
        "LFC_TSCONFIG_NOT_FOUND",
        "info",
        "Nearest tsconfig.json was not found. Falling back to default TypeScript module resolution.",
      ),
    ],
    blocking: false,
  };
};
