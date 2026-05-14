import type { Command } from "commander";
import type { CliContext } from "../cli/context.js";
import type { CommandResult } from "../cli/result.js";
import { createCommandResult } from "../cli/result.js";
import { formatDiagnostics } from "../output/format-diagnostics.js";
import { normalizeExportGraphOptions, type RawExportGraphOptions } from "./options.js";

type SetCommandResult = (result: CommandResult) => void;

const writeDiagnostics = (context: CliContext, diagnostics: Parameters<typeof formatDiagnostics>[0]): void => {
  const formatted = formatDiagnostics(diagnostics);
  if (formatted) context.stderr.write(formatted);
};

export const runExportGraphCommand = async (
  context: CliContext,
  rawOptions: RawExportGraphOptions,
): Promise<CommandResult> => {
  const normalized = normalizeExportGraphOptions(rawOptions);
  if (!normalized.ok) {
    writeDiagnostics(context, normalized.diagnostics);
    return createCommandResult(normalized.diagnostics);
  }

  const { runExportGraph } = await import("./run-export-graph.js");
  const result = runExportGraph(context, normalized.options);
  writeDiagnostics(context, [...result.diagnostics, ...result.graphDiagnostics]);

  return {
    exitCode: result.exitCode,
    diagnostics: result.diagnostics,
  };
};

export const registerExportGraphCommand = (
  program: Command,
  context: CliContext,
  setResult: SetCommandResult,
): void => {
  program
    .command("export-graph")
    .description("Export a lite-fsm project graph document as JSON")
    .option("--entry <path>", "entrypoint TypeScript file")
    .option("--out <path>", "output JSON file")
    .option("--tsconfig <path>", "explicit tsconfig for TypeScript module resolution")
    .option("--include-source", "embed project source text in JSON export")
    .action(async (options: RawExportGraphOptions) => {
      setResult(await runExportGraphCommand(context, options));
    });
};
