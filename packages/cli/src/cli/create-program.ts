import { Command, CommanderError } from "commander";
import type { CliContext } from "./context.js";
import { cliDiagnostic } from "./diagnostics.js";
import type { CommandResult } from "./result.js";
import { createCommandResult } from "./result.js";
import { registerCreateProjectCommand } from "../create-project/command.js";
import type { RunCreateProjectDependencies } from "../create-project/run-create-project.js";
import { registerExportGraphCommand } from "../export-graph/command.js";
import { formatDiagnostics } from "../output/format-diagnostics.js";
import { registerVisualizeCommand } from "../visualize/command.js";

export type CliProgram = {
  parse(argv: readonly string[]): Promise<CommandResult>;
};

export type CliProgramDependencies = {
  createProject?: RunCreateProjectDependencies;
};

const invalidOptionsResult = (context: CliContext, message: string): CommandResult => {
  const diagnostic = cliDiagnostic("LFC_INVALID_OPTIONS", "error", message);
  context.stderr.write(formatDiagnostics([diagnostic]));

  return createCommandResult([diagnostic]);
};

const isHelpDisplayed = (error: unknown): boolean => {
  return error instanceof CommanderError && error.code === "commander.helpDisplayed";
};

const isCommanderError = (error: unknown): error is CommanderError => {
  return error instanceof CommanderError;
};

export const createProgram = (context: CliContext, dependencies: CliProgramDependencies = {}): CliProgram => {
  let commandResult: CommandResult = { exitCode: 0, diagnostics: [] };
  const program = new Command();

  program
    .name("lite-fsm")
    .description("lite-fsm command line tools")
    .exitOverride()
    .configureOutput({
      writeOut: (value) => context.stdout.write(value),
      /* v8 ignore next -- commander calls this only for its own formatted stderr, which CLI suppresses in favor of CliDiagnostic output. */
      writeErr: () => undefined,
      outputError: () => undefined,
    });

  registerExportGraphCommand(program, context, (result) => {
    commandResult = result;
  });
  registerCreateProjectCommand(program, context, (result) => {
    commandResult = result;
  }, dependencies.createProject);
  registerVisualizeCommand(program, context, (result) => {
    commandResult = result;
  });

  return {
    async parse(argv) {
      commandResult = { exitCode: 0, diagnostics: [] };

      try {
        await program.parseAsync([...argv], { from: "node" });
      } catch (error) {
        if (isHelpDisplayed(error)) return { exitCode: 0, diagnostics: [] };

        /* v8 ignore next -- commander parse errors are CommanderError; this fallback keeps the boundary total for unexpected throws. */
        return invalidOptionsResult(context, isCommanderError(error) ? error.message : String(error));
      }

      return commandResult;
    },
  };
};
