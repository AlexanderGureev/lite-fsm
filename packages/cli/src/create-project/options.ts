import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic } from "../cli/diagnostics.js";
import { normalizeAbsolutePath, normalizePath } from "../project/source-cache.js";
import type { CreateProjectCss } from "./css/types.js";
import type { CreateProjectPackageManager } from "./package-manager.js";
import type { CreateProjectTemplate } from "./templates/types.js";

export type CreateProjectOptions = {
  projectName: string;
  targetPath: string;
  targetParentPath: string;
  template: CreateProjectTemplate;
  css: CreateProjectCss;
  packageManager: CreateProjectPackageManager;
  install: boolean;
};

export type RawCreateProjectOptions = {
  projectName?: unknown;
  template?: unknown;
  css?: unknown;
  packageManager?: unknown;
  install?: unknown;
  agentsMd?: unknown;
};

export type NormalizeCreateProjectOptionsResult =
  | { ok: true; options: CreateProjectOptions }
  | { ok: false; diagnostics: CliDiagnostic[] };

const templates = new Set<CreateProjectTemplate>(["next", "vite"]);
const cssPresets = new Set<CreateProjectCss>(["tailwind", "none"]);
const packageManagers = new Set<CreateProjectPackageManager>(["pnpm", "npm", "yarn", "bun"]);

const stringOption = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

const isCreateProjectTemplate = (value: string): value is CreateProjectTemplate => templates.has(value as CreateProjectTemplate);

const isCreateProjectCss = (value: string): value is CreateProjectCss => cssPresets.has(value as CreateProjectCss);

const isCreateProjectPackageManager = (value: string): value is CreateProjectPackageManager => {
  return packageManagers.has(value as CreateProjectPackageManager);
};

const projectNameSegments = (projectName: string): string[] => projectName.split(/[\\/]+/).filter(Boolean);

const normalizeProjectName = (
  context: CliContext,
  value: unknown,
  diagnostics: CliDiagnostic[],
): Pick<CreateProjectOptions, "projectName" | "targetPath" | "targetParentPath"> | undefined => {
  const projectName = stringOption(value);

  if (!projectName) {
    diagnostics.push(cliDiagnostic("LFC_INVALID_OPTIONS", "error", "Project name is required."));
    return undefined;
  }

  const segments = projectNameSegments(projectName);
  if (
    projectName === "." ||
    projectName === ".." ||
    isAbsolute(projectName) ||
    segments.length === 0 ||
    segments.some((segment) => segment === "..")
  ) {
    diagnostics.push(
      cliDiagnostic("LFC_INVALID_OPTIONS", "error", `Invalid project name '${projectName}'.`, {
        hint: "Pass a relative path inside the current working directory without '..' segments.",
      }),
    );
    return undefined;
  }

  const targetPath = normalizeAbsolutePath(resolve(context.cwd, projectName));
  const normalizedProjectName = normalizePath(relative(context.cwd, targetPath));

  return {
    projectName: normalizedProjectName,
    targetPath,
    targetParentPath: normalizeAbsolutePath(dirname(targetPath)),
  };
};

const normalizeTemplate = (value: unknown, diagnostics: CliDiagnostic[]): CreateProjectTemplate | undefined => {
  const template = stringOption(value);
  if (!template) {
    diagnostics.push(cliDiagnostic("LFC_INVALID_OPTIONS", "error", "Option --template is required."));
    return undefined;
  }

  if (!isCreateProjectTemplate(template)) {
    diagnostics.push(cliDiagnostic("LFC_INVALID_OPTIONS", "error", `Unknown template '${template}'.`));
    return undefined;
  }

  return template;
};

const normalizeCss = (value: unknown, diagnostics: CliDiagnostic[]): CreateProjectCss => {
  const css = stringOption(value) ?? "tailwind";
  if (!isCreateProjectCss(css)) {
    diagnostics.push(cliDiagnostic("LFC_INVALID_OPTIONS", "error", `Unknown css preset '${css}'.`));
    return "tailwind";
  }

  return css;
};

const normalizePackageManager = (value: unknown, diagnostics: CliDiagnostic[]): CreateProjectPackageManager => {
  const packageManager = stringOption(value) ?? "pnpm";
  if (!isCreateProjectPackageManager(packageManager)) {
    diagnostics.push(cliDiagnostic("LFC_INVALID_OPTIONS", "error", `Unknown package manager '${packageManager}'.`));
    return "pnpm";
  }

  return packageManager;
};

export const normalizeCreateProjectOptions = (
  context: CliContext,
  rawOptions: RawCreateProjectOptions,
): NormalizeCreateProjectOptionsResult => {
  const diagnostics: CliDiagnostic[] = [];
  const target = normalizeProjectName(context, rawOptions.projectName, diagnostics);
  const template = normalizeTemplate(rawOptions.template, diagnostics);
  const css = normalizeCss(rawOptions.css, diagnostics);
  const packageManager = normalizePackageManager(rawOptions.packageManager, diagnostics);
  const install = rawOptions.install !== false;

  if (rawOptions.agentsMd !== undefined) {
    diagnostics.push(cliDiagnostic("LFC_INVALID_OPTIONS", "error", "Option --agents-md is not supported."));
  }

  if (diagnostics.length > 0 || !target || !template) return { ok: false, diagnostics };

  return {
    ok: true,
    options: {
      ...target,
      template,
      css,
      packageManager,
      install,
    },
  };
};
