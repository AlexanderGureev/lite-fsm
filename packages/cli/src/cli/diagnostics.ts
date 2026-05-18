export type CliDiagnosticSeverity = "info" | "warning" | "error";

export type CliDiagnosticCode =
  | "LFC_INVALID_OPTIONS"
  | "LFC_TSCONFIG_NOT_FOUND"
  | "LFC_TSCONFIG_INVALID"
  | "LFC_GRAPH_PROJECT_FAILED"
  | "LFC_NO_MACHINES_EXPORTED"
  | "LFC_SOURCE_BUNDLE_FILE_UNREADABLE"
  | "LFC_VISUALIZER_STATIC_MISSING"
  | "LFC_VISUALIZER_PORT_UNAVAILABLE"
  | "LFC_VISUALIZER_SERVER_FAILED"
  | "LFC_VISUALIZER_OPEN_FAILED"
  | "LFC_CREATE_TARGET_EXISTS"
  | "LFC_CREATE_TARGET_PARENT_MISSING"
  | "LFC_CREATE_SCAFFOLD_FAILED"
  | "LFC_CREATE_INSTALL_FAILED"
  | "LFC_CREATE_PATCH_FAILED"
  | "LFC_CREATE_VALIDATION_FAILED"
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
