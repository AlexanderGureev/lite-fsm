import type { GraphDiagnostic } from "@lite-fsm/graph";
import type { CliDiagnostic } from "../cli/diagnostics.js";

type PrintableDiagnostic = CliDiagnostic | GraphDiagnostic;

const diagnosticFile = (diagnostic: PrintableDiagnostic): string | undefined => {
  if ("file" in diagnostic && diagnostic.file) return diagnostic.file;
  if (!diagnostic.loc || !("fileName" in diagnostic.loc)) return undefined;

  return diagnostic.loc.fileName;
};

const diagnosticLine = (diagnostic: PrintableDiagnostic): number | undefined => {
  if (!diagnostic.loc) return undefined;
  if ("line" in diagnostic.loc) return diagnostic.loc.line;

  return diagnostic.loc.start.line;
};

const diagnosticColumn = (diagnostic: PrintableDiagnostic): number | undefined => {
  if (!diagnostic.loc) return undefined;
  if ("line" in diagnostic.loc) return "column" in diagnostic.loc ? diagnostic.loc.column : undefined;

  return diagnostic.loc.start.column;
};

export const formatDiagnostic = (diagnostic: PrintableDiagnostic): string => {
  const file = diagnosticFile(diagnostic);
  const line = diagnosticLine(diagnostic);
  const column = diagnosticColumn(diagnostic);
  const location = file ? ` ${file}${line === undefined ? "" : `:${line}:${column /* v8 ignore next */ ?? 1}`}` : "";
  const hint = "hint" in diagnostic && diagnostic.hint ? `\n  hint: ${diagnostic.hint}` : "";

  return `${diagnostic.severity.toUpperCase()} ${diagnostic.code}${location}: ${diagnostic.message}${hint}`;
};

export const formatDiagnostics = (diagnostics: readonly PrintableDiagnostic[]): string => {
  if (diagnostics.length === 0) return "";

  return `${diagnostics.map(formatDiagnostic).join("\n")}\n`;
};
