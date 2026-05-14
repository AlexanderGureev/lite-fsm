export type CliDiagnosticSeverity = "info" | "warning" | "error";

export type CliDiagnosticCode =
  | "LFC_INVALID_OPTIONS"
  | "LFC_TSCONFIG_NOT_FOUND"
  | "LFC_TSCONFIG_INVALID"
  | "LFC_GRAPH_PROJECT_FAILED"
  | "LFC_NO_MACHINES_EXPORTED"
  | "LFC_SOURCE_BUNDLE_FILE_UNREADABLE"
  | "LFC_WRITE_FAILED";

export type CliDiagnostic = {
  code: CliDiagnosticCode;
  severity: CliDiagnosticSeverity;
  message: string;
  file?: string;
  loc?: {
    line: number;
    column: number;
  };
  hint?: string;
};

export const cliDiagnostic = (
  code: CliDiagnosticCode,
  severity: CliDiagnosticSeverity,
  message: string,
  details: Omit<CliDiagnostic, "code" | "severity" | "message"> = {},
): CliDiagnostic => ({
  code,
  severity,
  message,
  ...details,
});

export const hasBlockingCliDiagnostics = (diagnostics: readonly CliDiagnostic[]): boolean => {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
};
