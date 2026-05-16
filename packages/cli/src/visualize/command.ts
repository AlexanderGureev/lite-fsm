import type { Command } from "commander";
import type { CliContext } from "../cli/context.js";
import type { CommandResult } from "../cli/result.js";
import { createCommandResult } from "../cli/result.js";
import { formatDiagnostics } from "../output/format-diagnostics.js";
import { normalizeVisualizeOptions, type RawVisualizeOptions } from "./options.js";
import type { RunVisualizeDependencies } from "./run-visualize.js";

type SetCommandResult = (result: CommandResult) => void;

const writeDiagnostics = (context: CliContext, diagnostics: Parameters<typeof formatDiagnostics>[0]): void => {
  const formatted = formatDiagnostics(diagnostics);
  if (formatted) context.stderr.write(formatted);
};

export const runVisualizeCommand = async (
  context: CliContext,
  rawOptions: RawVisualizeOptions,
  dependencies: RunVisualizeDependencies = {},
): Promise<CommandResult> => {
  const normalized = normalizeVisualizeOptions(rawOptions);
  if (!normalized.ok) {
    writeDiagnostics(context, normalized.diagnostics);
    return createCommandResult(normalized.diagnostics);
  }

  const { runVisualize } = await import("./run-visualize.js");
  const result = await runVisualize(context, normalized.options, {
    ...dependencies,
    emitDiagnostics(diagnostics, graphDiagnostics) {
      dependencies.emitDiagnostics?.(diagnostics, graphDiagnostics);
      writeDiagnostics(context, [...diagnostics, ...graphDiagnostics]);
    },
  });

  return {
    exitCode: result.exitCode,
    diagnostics: result.diagnostics,
  };
};

export const registerVisualizeCommand = (
  program: Command,
  context: CliContext,
  setResult: SetCommandResult,
): void => {
  program
    .command("visualize")
    .description("Start a local visualizer for a lite-fsm project graph")
    .option("--entry <path>", "entrypoint TypeScript file")
    .option("--tsconfig <path>", "explicit tsconfig for TypeScript module resolution")
    .option("--port <number>", "local visualizer port")
    .option("--no-open", "print the visualizer URL without opening a browser")
    .action(async (options: RawVisualizeOptions) => {
      setResult(await runVisualizeCommand(context, options));
    });
};
