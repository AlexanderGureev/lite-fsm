import type { CliContext } from "../../cli/context.js";
import type { CreateProjectCss } from "../css/types.js";
import type { PackageJsonPatch } from "../package-json.js";
import type { CreateProjectPackageManager, PackageManagerCommand } from "../package-manager.js";
import type { CreateProjectStepResult } from "../result.js";

export type CreateProjectTemplate = "next" | "vite";

export type CreateProjectTemplateInput = {
  targetPath: string;
  targetName: string;
  css: CreateProjectCss;
  packageManager: CreateProjectPackageManager;
};

export type CreateProjectTemplateAdapter = {
  key: CreateProjectTemplate;
  createScaffoldCommand(input: CreateProjectTemplateInput): PackageManagerCommand;
  apply(context: CliContext, input: CreateProjectTemplateInput): CreateProjectStepResult;
};

export type CreateProjectPackagePatchProvider = {
  packageJsonPatch?: PackageJsonPatch;
};
