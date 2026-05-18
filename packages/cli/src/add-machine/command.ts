import type { Command } from "commander";
import type { CliContext } from "../cli/context.js";
import type { CommandResult } from "../cli/result.js";
import { createCommandResult } from "../cli/result.js";
import { formatDiagnostics } from "../output/format-diagnostics.js";
import { normalizeAddMachineOptions, type RawAddMachineOptions } from "./options.js";
import { runAddMachine } from "./run-add-machine.js";

type SetCommandResult = (result: CommandResult) => void;

const writeDiagnostics = (context: CliContext, diagnostics: Parameters<typeof formatDiagnostics>[0]): void => {
  const formatted = formatDiagnostics(diagnostics);
  if (formatted) context.stderr.write(formatted);
};

export const runAddMachineCommand = async (
  context: CliContext,
  rawOptions: RawAddMachineOptions,
): Promise<CommandResult> => {
  const normalized = normalizeAddMachineOptions(rawOptions);
  if (!normalized.ok) {
    writeDiagnostics(context, normalized.diagnostics);
    return createCommandResult(normalized.diagnostics);
  }

  const result = await runAddMachine(context, normalized.options);
  writeDiagnostics(context, result.diagnostics);

  return result;
};

export const registerAddMachineCommand = (
  program: Command,
  context: CliContext,
  setResult: SetCommandResult,
): void => {
  program
    .command("add-machine")
    .description("Add a domain machine to a lite-fsm generated store")
    .argument("[name]", "machine name in kebab-case, snake_case, or camelCase")
    .action(async (name: string | undefined) => {
      setResult(await runAddMachineCommand(context, { name }));
    });
};
