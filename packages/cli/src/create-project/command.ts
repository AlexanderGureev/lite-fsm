import type { Command } from "commander";
import type { CliContext } from "../cli/context.js";
import type { CommandResult } from "../cli/result.js";
import { createCommandResult } from "../cli/result.js";
import { formatDiagnostics } from "../output/format-diagnostics.js";
import { normalizeCreateProjectOptions, type RawCreateProjectOptions } from "./options.js";
import { runCreateProject, type RunCreateProjectDependencies } from "./run-create-project.js";

type SetCommandResult = (result: CommandResult) => void;

const writeDiagnostics = (context: CliContext, diagnostics: Parameters<typeof formatDiagnostics>[0]): void => {
  const formatted = formatDiagnostics(diagnostics);
  if (formatted) context.stderr.write(formatted);
};

export const runCreateProjectCommand = async (
  context: CliContext,
  rawOptions: RawCreateProjectOptions,
  dependencies: RunCreateProjectDependencies = {},
): Promise<CommandResult> => {
  const normalized = normalizeCreateProjectOptions(context, rawOptions);
  if (!normalized.ok) {
    writeDiagnostics(context, normalized.diagnostics);
    return createCommandResult(normalized.diagnostics);
  }

  const result = await runCreateProject(context, normalized.options, dependencies);
  writeDiagnostics(context, result.diagnostics);

  return result;
};

export const registerCreateProjectCommand = (
  program: Command,
  context: CliContext,
  setResult: SetCommandResult,
  dependencies: RunCreateProjectDependencies = {},
): void => {
  program
    .command("create")
    .description("Create a starter React project wired to lite-fsm")
    .argument("[project-name]", "project directory to create")
    .requiredOption("--template <next|vite>", "framework template")
    .option("--css <tailwind|none>", "styling preset", "tailwind")
    .option("--package-manager <pnpm|npm|yarn|bun>", "package manager", "pnpm")
    .option("--install", "install dependencies after generation")
    .option("--no-install", "skip dependency install")
    .action(async (projectName: string | undefined, options: Omit<RawCreateProjectOptions, "projectName">) => {
      setResult(await runCreateProjectCommand(context, { ...options, projectName }, dependencies));
    });
};
