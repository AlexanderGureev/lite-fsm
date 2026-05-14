import type { CliDiagnostic } from "./diagnostics.js";
import { hasBlockingCliDiagnostics } from "./diagnostics.js";

export type CommandResult = {
  exitCode: 0 | 1;
  diagnostics: CliDiagnostic[];
};

export const createCommandResult = (diagnostics: readonly CliDiagnostic[]): CommandResult => ({
  exitCode: hasBlockingCliDiagnostics(diagnostics) ? 1 : 0,
  diagnostics: [...diagnostics],
});
