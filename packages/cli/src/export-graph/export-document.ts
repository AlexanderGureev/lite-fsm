import type { LiteFsmGraphDocument, LiteFsmGraphProjectFile, LiteFsmGraphProjectResult } from "@lite-fsm/graph";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { stringifyStableJson } from "../output/stable-json.js";

export const PROJECT_GRAPH_EXPORT_VERSION = "lite-fsm.project-graph-export/v1";
export const CLI_PACKAGE_NAME = "@lite-fsm/cli";
export const CLI_PACKAGE_VERSION = "0.1.0";

export type LiteFsmProjectGraphExportDocument = {
  version: typeof PROJECT_GRAPH_EXPORT_VERSION;
  createdBy: {
    package: typeof CLI_PACKAGE_NAME;
    version: string;
  };
  entry: {
    path: string;
    tsconfigPath?: string;
  };
  graph: LiteFsmGraphDocument;
  files: readonly LiteFsmGraphProjectFile[];
  diagnostics: readonly CliDiagnostic[];
  sources?: LiteFsmProjectGraphSourceBundle;
};

export type LiteFsmProjectGraphSourceFile = {
  fileName: string;
  language: "ts";
  hash: string;
  text: string;
};

export type LiteFsmProjectGraphSourceBundle = {
  files: readonly LiteFsmProjectGraphSourceFile[];
};

export type CreateProjectGraphExportDocumentOptions = {
  entryPath: string;
  tsconfigPath?: string;
  graphResult: LiteFsmGraphProjectResult;
  diagnostics: readonly CliDiagnostic[];
  sources?: LiteFsmProjectGraphSourceBundle;
};

export const createProjectGraphExportDocument = ({
  entryPath,
  tsconfigPath,
  graphResult,
  diagnostics,
  sources,
}: CreateProjectGraphExportDocumentOptions): LiteFsmProjectGraphExportDocument => ({
  version: PROJECT_GRAPH_EXPORT_VERSION,
  createdBy: {
    package: CLI_PACKAGE_NAME,
    version: CLI_PACKAGE_VERSION,
  },
  entry: {
    path: entryPath,
    ...(tsconfigPath ? { tsconfigPath } : {}),
  },
  graph: graphResult.document,
  files: graphResult.files,
  diagnostics,
  ...(sources ? { sources } : {}),
});

export const stringifyProjectGraphExportDocument = (document: LiteFsmProjectGraphExportDocument): string => {
  return stringifyStableJson(document);
};
