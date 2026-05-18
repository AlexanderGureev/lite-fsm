import { join } from "node:path";
import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic } from "../cli/diagnostics.js";
import type { CreateProjectOptions } from "./options.js";
import type { CreateProjectStepResult } from "./result.js";
import { projectFilePath } from "./write-files.js";

const readFile = (context: CliContext, targetPath: string, relativePath: string): string | undefined => {
  const file = projectFilePath(targetPath, relativePath);
  return context.fs.fileExists(file) ? context.fs.readFile(file) : undefined;
};

const readJsonObject = (context: CliContext, targetPath: string, relativePath: string): Record<string, unknown> | undefined => {
  const source = readFile(context, targetPath, relativePath);
  if (source === undefined) return undefined;

  try {
    const parsed = JSON.parse(source) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
};

const readObjectProperty = (source: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined => {
  const value = source?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
};

const hasTypeScriptAlias = (context: CliContext, targetPath: string, relativePaths: readonly string[]): boolean => {
  for (const relativePath of relativePaths) {
    const compilerOptions = readObjectProperty(readJsonObject(context, targetPath, relativePath), "compilerOptions");
    const paths = readObjectProperty(compilerOptions, "paths");
    const alias = paths?.["@/*"];

    if (Array.isArray(alias) && alias.includes("./src/*")) return true;
  }

  return false;
};

const cssImportRelativePath = (mainSource: string): string | undefined => {
  const match = mainSource.match(/import\s+["']([^"']+\.css)["'];?/);
  if (!match?.[1] || !match[1].startsWith("./")) return undefined;

  return join("src", match[1].slice(2));
};

const requireFile = (
  context: CliContext,
  targetPath: string,
  relativePath: string,
  diagnostics: CliDiagnostic[],
): void => {
  const file = projectFilePath(targetPath, relativePath);
  if (context.fs.fileExists(file)) return;

  diagnostics.push(cliDiagnostic("LFC_CREATE_VALIDATION_FAILED", "error", `Generated project is missing ${relativePath}.`, { file }));
};

const validateNextProject = (
  context: CliContext,
  targetPath: string,
  diagnostics: CliDiagnostic[],
): void => {
  requireFile(context, targetPath, "src/app/providers.tsx", diagnostics);

  if (!hasTypeScriptAlias(context, targetPath, ["tsconfig.json"])) {
    diagnostics.push(cliDiagnostic("LFC_CREATE_VALIDATION_FAILED", "error", "Generated Next project is missing @/* TypeScript alias."));
  }
};

const validateViteTailwind = (
  context: CliContext,
  targetPath: string,
  viteConfig: string,
  mainSource: string,
  diagnostics: CliDiagnostic[],
): void => {
  const cssRelativePath = cssImportRelativePath(mainSource);
  const cssPath = cssRelativePath ? projectFilePath(targetPath, cssRelativePath) : undefined;
  const cssSource = cssPath && context.fs.fileExists(cssPath) ? context.fs.readFile(cssPath) : "";

  if (!viteConfig.includes("@tailwindcss/vite") || !viteConfig.includes("tailwindcss()")) {
    diagnostics.push(cliDiagnostic("LFC_CREATE_VALIDATION_FAILED", "error", "Generated Vite project is missing @tailwindcss/vite plugin."));
  }

  if (!cssSource.includes('@import "tailwindcss";')) {
    diagnostics.push(cliDiagnostic("LFC_CREATE_VALIDATION_FAILED", "error", "Generated Vite project is missing Tailwind CSS import."));
  }

  if (!mainSource.match(/import\s+["'][^"']+\.css["'];?/)) {
    diagnostics.push(cliDiagnostic("LFC_CREATE_VALIDATION_FAILED", "error", "Generated Vite project is missing CSS entry import."));
  }
};

const validateViteProject = (
  context: CliContext,
  options: CreateProjectOptions,
  diagnostics: CliDiagnostic[],
): void => {
  requireFile(context, options.targetPath, "src/main.tsx", diagnostics);

  const viteConfig = readFile(context, options.targetPath, "vite.config.ts") ?? "";
  const mainSource = readFile(context, options.targetPath, "src/main.tsx") ?? "";

  if (!viteConfig.includes('"@"') || !viteConfig.includes("./src")) {
    diagnostics.push(cliDiagnostic("LFC_CREATE_VALIDATION_FAILED", "error", "Generated Vite project is missing @ alias."));
  }

  if (!hasTypeScriptAlias(context, options.targetPath, ["tsconfig.app.json", "tsconfig.json"])) {
    diagnostics.push(cliDiagnostic("LFC_CREATE_VALIDATION_FAILED", "error", "Generated Vite project is missing @/* TypeScript alias."));
  }

  if (!mainSource.includes("FSMContextProvider") || !mainSource.includes("machineManager={manager}")) {
    diagnostics.push(cliDiagnostic("LFC_CREATE_VALIDATION_FAILED", "error", "Generated Vite project is missing FSM provider wiring."));
  }

  if (options.css === "tailwind") validateViteTailwind(context, options.targetPath, viteConfig, mainSource, diagnostics);
};

export const validateGeneratedProject = (
  context: CliContext,
  options: CreateProjectOptions,
): CreateProjectStepResult => {
  const diagnostics: CliDiagnostic[] = [];

  requireFile(context, options.targetPath, "package.json", diagnostics);
  requireFile(context, options.targetPath, "src/store/index.ts", diagnostics);
  requireFile(context, options.targetPath, "src/store/machines/app.ts", diagnostics);

  if (options.template === "next") validateNextProject(context, options.targetPath, diagnostics);
  else validateViteProject(context, options, diagnostics);

  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true };
};
