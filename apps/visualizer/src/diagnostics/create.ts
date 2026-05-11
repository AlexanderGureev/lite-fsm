import type {
  NormalizeGraphDiagnosticsInput,
  WorkbenchDiagnosticInput,
  WorkbenchDiagnosticNavigationTarget,
  WorkbenchDiagnosticRef,
} from "./types";

const primaryTargetFor = (
  graphItemRef: WorkbenchDiagnosticRef["graphItemRef"],
  sourceAnchors: WorkbenchDiagnosticRef["sourceAnchors"],
): WorkbenchDiagnosticNavigationTarget => {
  if (graphItemRef) return { kind: "graph", ref: graphItemRef };
  if (sourceAnchors.length === 1) return { kind: "source", anchor: sourceAnchors[0] };

  return {
    kind: "none",
    reason: sourceAnchors.length === 0 ? "no-anchor" : "ambiguous-anchor",
  };
};

export const createWorkbenchDiagnostic = ({
  diagnosticId,
  sourceVersion,
  origin,
  code,
  severity,
  message,
  loc,
  graphItemRef,
  sourceAnchors = [],
  primaryTarget,
}: WorkbenchDiagnosticInput): WorkbenchDiagnosticRef => ({
  diagnosticId,
  sourceVersion,
  origin,
  diagnostic: {
    code,
    severity,
    message,
    ...(loc ? { loc } : {}),
  },
  ...(graphItemRef ? { graphItemRef } : {}),
  sourceAnchors,
  primaryTarget: primaryTarget ?? primaryTargetFor(graphItemRef, sourceAnchors),
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
    sourceAnchors: [],
    primaryTarget: { kind: "console" },
  });

export const normalizeGraphDiagnostics = ({
  sourceVersion,
  diagnostics,
}: NormalizeGraphDiagnosticsInput): WorkbenchDiagnosticRef[] =>
  diagnostics.map((anchor) => {
    const sourceAnchors = anchor.sourceAnchor ? [anchor.sourceAnchor] : [];

    return createWorkbenchDiagnostic({
      diagnosticId: anchor.diagnosticId,
      sourceVersion,
      origin: anchor.origin,
      code: anchor.diagnostic.code,
      severity: anchor.diagnostic.severity,
      message: anchor.diagnostic.message,
      loc: anchor.diagnostic.loc,
      ...(anchor.graphItemRef ? { graphItemRef: anchor.graphItemRef } : {}),
      sourceAnchors,
    });
  });
