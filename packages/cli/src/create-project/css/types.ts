import type { CliContext } from "../../cli/context.js";
import type { CreateProjectStepResult } from "../result.js";
import type { CreateProjectPackagePatchProvider, CreateProjectTemplate } from "../templates/types.js";

export type CreateProjectCss = "tailwind" | "none";

export type CreateProjectCssAdapterInput = {
  targetPath: string;
  template: CreateProjectTemplate;
};

export type CreateProjectCssAdapter = CreateProjectPackagePatchProvider & {
  key: CreateProjectCss;
  template: CreateProjectTemplate;
  apply(context: CliContext, input: CreateProjectCssAdapterInput): CreateProjectStepResult;
};
