import type { WorkbenchDiagnosticInput, WorkbenchDiagnosticRef } from "./types";

export const createWorkbenchDiagnostic = ({
  diagnosticId,
  sourceVersion,
  origin,
  code,
  severity,
  message,
}: WorkbenchDiagnosticInput): WorkbenchDiagnosticRef => ({
  diagnosticId,
  sourceVersion,
  origin,
  diagnostic: { code, severity, message },
  sourceAnchors: [],
  primaryTarget: { kind: "console" },
});

export const createControlledDiagnostic = (
  sourceVersion: number,
  origin: WorkbenchDiagnosticInput["origin"],
  code: string,
  message: string,
): WorkbenchDiagnosticRef =>
  createWorkbenchDiagnostic({
    diagnosticId: `${origin}:${sourceVersion}:${code}`,
    sourceVersion,
    origin,
    code,
    severity: "warning",
    message,
  });
