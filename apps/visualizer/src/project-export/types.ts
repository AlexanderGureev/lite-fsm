import type { LiteFsmGraphDocument, LiteFsmGraphProjectFile } from "@lite-fsm/graph";

export const PROJECT_GRAPH_EXPORT_VERSION = "lite-fsm.project-graph-export/v1";
export const PROJECT_GRAPH_EXPORT_PACKAGE = "@lite-fsm/cli";

export type CliDiagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  file?: string;
  loc?: {
    line: number;
    column: number;
  };
  hint?: string;
};

export type LiteFsmProjectGraphExportDocument = {
  version: typeof PROJECT_GRAPH_EXPORT_VERSION;
  createdBy: {
    package: typeof PROJECT_GRAPH_EXPORT_PACKAGE;
    version: string;
  };
  entry: {
    path: string;
    tsconfigPath?: string;
  };
  graph: LiteFsmGraphDocument;
  files: readonly LiteFsmGraphProjectFile[];
  diagnostics: readonly CliDiagnostic[];
};

export type ProjectGraphExportParseIssue = {
  code: "invalid-json" | "invalid-document" | "invalid-version";
  message: string;
  path?: string;
};

export type ProjectGraphExportParseResult =
  | { ok: true; document: LiteFsmProjectGraphExportDocument }
  | { ok: false; issue: ProjectGraphExportParseIssue };
