import type { GraphDiagnostic } from "@lite-fsm/graph";
import type { GraphDiagnosticAnchor, GraphItemRef, GraphSourceAnchor } from "@lite-fsm/graph/view-model";

export type WorkbenchDiagnosticOrigin =
  | "compiler"
  | "analyzer"
  | "source"
  | "view-model"
  | "simulator"
  | "validation"
  | "eslint"
  | "codegen"
  | "host"
  | "layout";

export type WorkbenchDiagnosticNavigationTarget =
  | { kind: "source"; anchor: GraphSourceAnchor }
  | { kind: "graph"; ref: GraphItemRef }
  | { kind: "console" }
  | { kind: "none"; reason: "no-anchor" | "ambiguous-anchor" };

export type WorkbenchDiagnosticRef = {
  diagnosticId: string;
  sourceVersion: number;
  origin: WorkbenchDiagnosticOrigin;
  diagnostic: GraphDiagnostic;
  graphItemRef?: GraphItemRef;
  sourceAnchors: readonly GraphSourceAnchor[];
  primaryTarget: WorkbenchDiagnosticNavigationTarget;
};

export type WorkbenchDiagnosticInput = {
  diagnosticId: string;
  sourceVersion: number;
  origin: WorkbenchDiagnosticOrigin;
  code: string;
  severity: GraphDiagnostic["severity"];
  message: string;
  loc?: GraphDiagnostic["loc"];
  graphItemRef?: GraphItemRef;
  sourceAnchors?: readonly GraphSourceAnchor[];
  primaryTarget?: WorkbenchDiagnosticNavigationTarget;
};

export type NormalizeGraphDiagnosticsInput = {
  sourceVersion: number;
  diagnostics: readonly GraphDiagnosticAnchor[];
};
