import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic, hasBlockingCliDiagnostics } from "../cli/diagnostics.js";
import type { CommandResult } from "../cli/result.js";
import { getCreateProjectCssAdapter } from "./css/registry.js";
import type { CreateProjectCss } from "./css/types.js";
import { createNodeCreateProjectDependencies, type CreateProjectDependencies, type ExternalCommand } from "./dependencies.js";
import type { CreateProjectOptions } from "./options.js";
import { mergePackageJsonPatches, patchPackageJson } from "./package-json.js";
import { commandLine, createDevCommand, createExternalCommand, createInstallCommand } from "./package-manager.js";
import type { CreateProjectStepResult } from "./result.js";
import { applyLiteFsmStoreOverlay } from "./templates/shared-store.js";
import { getCreateProjectTemplate } from "./templates/registry.js";
import type { CreateProjectTemplate } from "./templates/types.js";
import { validateGeneratedProject } from "./validation.js";

export type RunCreateProjectDependencies = Partial<CreateProjectDependencies>;

const createRunResult = (diagnostics: readonly CliDiagnostic[]): CommandResult => ({
  exitCode: hasBlockingCliDiagnostics(diagnostics) ? 1 : 0,
  diagnostics: [...diagnostics],
});

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const failTargetParentMissing = (options: CreateProjectOptions): CommandResult => createRunResult([
  cliDiagnostic(
    "LFC_CREATE_TARGET_PARENT_MISSING",
    "error",
    `Create target parent directory does not exist: ${options.targetParentPath}`,
    { file: options.targetParentPath },
  ),
]);

const failTargetExists = (options: CreateProjectOptions): CommandResult => createRunResult([
  cliDiagnostic("LFC_CREATE_TARGET_EXISTS", "error", `Create target already exists: ${options.targetPath}`, {
    file: options.targetPath,
  }),
]);

const validateTargetDirectory = (context: CliContext, options: CreateProjectOptions): CommandResult | undefined => {
  if (!context.fs.directoryExists(options.targetParentPath)) return failTargetParentMissing(options);
  if (context.fs.directoryExists(options.targetPath) || context.fs.fileExists(options.targetPath)) return failTargetExists(options);

  return undefined;
};

const commandFailureCode = (stage: ExternalCommand["stage"]): "LFC_CREATE_SCAFFOLD_FAILED" | "LFC_CREATE_INSTALL_FAILED" => {
  return stage === "scaffold" ? "LFC_CREATE_SCAFFOLD_FAILED" : "LFC_CREATE_INSTALL_FAILED";
};

const externalCommandFailure = (
  externalCommand: ExternalCommand,
  details: { exitCode?: number; stderr?: string; error?: unknown },
): CommandResult => {
  const line = commandLine(externalCommand);
  const exit = details.exitCode === undefined ? "" : `, exit code: ${details.exitCode}`;
  const stderr = details.stderr ? `, stderr: ${details.stderr}` : "";
  const original = details.error === undefined ? "" : `, error: ${errorMessage(details.error)}`;

  return createRunResult([
    cliDiagnostic(
      commandFailureCode(externalCommand.stage),
      "error",
      `Create project ${externalCommand.stage} command failed: ${line} (cwd: ${externalCommand.cwd}, stage: ${externalCommand.stage}${exit}${stderr}${original}).`,
    ),
  ]);
};

const runExternalStep = async (
  dependencies: CreateProjectDependencies,
  externalCommand: ExternalCommand,
): Promise<CommandResult | undefined> => {
  try {
    const result = await dependencies.runCommand(externalCommand);
    if (result.exitCode !== 0) {
      return externalCommandFailure(externalCommand, {
        exitCode: result.exitCode,
        stderr: result.stderr,
      });
    }

    return undefined;
  } catch (error) {
    return externalCommandFailure(externalCommand, { error });
  }
};

const stepResult = (step: CreateProjectStepResult): CommandResult | undefined => {
  return step.ok ? undefined : createRunResult(step.diagnostics);
};

const packagePatchFor = (css: CreateProjectCss, template: CreateProjectTemplate) => {
  const cssAdapter = getCreateProjectCssAdapter(template, css);

  return mergePackageJsonPatches([
    {
      dependencies: {
        "@lite-fsm/core": "latest",
        "@lite-fsm/middleware": "latest",
        "@lite-fsm/react": "latest",
        immer: "latest",
      },
    },
    cssAdapter.packageJsonPatch ?? {},
  ]);
};

const printNextSteps = (context: CliContext, options: CreateProjectOptions): void => {
  context.stdout.write(`\nNext steps:\n  cd ${options.projectName}\n  ${createDevCommand(options.packageManager)}\n`);
};

const printInstallStart = (context: CliContext, installCommand: ExternalCommand): void => {
  context.stdout.write(`\nInstalling dependencies: ${commandLine(installCommand)}\n`);
};

export const runCreateProject = async (
  context: CliContext,
  options: CreateProjectOptions,
  dependencies: RunCreateProjectDependencies = {},
): Promise<CommandResult> => {
  const targetValidation = validateTargetDirectory(context, options);
  if (targetValidation) return targetValidation;

  const template = getCreateProjectTemplate(options.template);
  const cssAdapter = getCreateProjectCssAdapter(options.template, options.css);
  const resolvedDependencies: CreateProjectDependencies = {
    ...createNodeCreateProjectDependencies(context),
    ...dependencies,
  };
  const templateInput = {
    targetPath: options.targetPath,
    targetName: options.projectName,
    css: options.css,
    packageManager: options.packageManager,
  };
  const scaffoldCommand = createExternalCommand(template.createScaffoldCommand(templateInput), context.cwd, "scaffold");
  const scaffoldFailure = await runExternalStep(resolvedDependencies, scaffoldCommand);
  if (scaffoldFailure) return scaffoldFailure;

  const frameworkFailure = stepResult(template.apply(context, templateInput));
  if (frameworkFailure) return frameworkFailure;

  const cssFailure = stepResult(cssAdapter.apply(context, {
    targetPath: options.targetPath,
    template: options.template,
  }));
  if (cssFailure) return cssFailure;

  const storeFailure = stepResult(applyLiteFsmStoreOverlay(context, options.targetPath));
  if (storeFailure) return storeFailure;

  const packageFailure = stepResult(patchPackageJson(context, options.targetPath, packagePatchFor(options.css, options.template)));
  if (packageFailure) return packageFailure;

  if (options.install) {
    const installCommand = createExternalCommand(createInstallCommand(options.packageManager), options.targetPath, "install");
    printInstallStart(context, installCommand);
    const installFailure = await runExternalStep(resolvedDependencies, installCommand);
    if (installFailure) return installFailure;
  }

  const validation = validateGeneratedProject(context, options);
  if (!validation.ok) return createRunResult(validation.diagnostics);

  printNextSteps(context, options);

  return createRunResult([]);
};
