import type { GraphDiagnostic } from "@lite-fsm/graph";
import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic, hasBlockingCliDiagnostics } from "../cli/diagnostics.js";
import type { CommandResult } from "../cli/result.js";
import { buildProjectGraph, type ProjectGraphBuildResult } from "../project/build-project-graph.js";
import type { ExportGraphOptions } from "./options.js";
import { createProjectGraphExportDocument, stringifyProjectGraphExportDocument } from "./export-document.js";
import { createProjectGraphSourceBundle } from "./source-bundle.js";
import { writeOutput } from "./write-output.js";

export type ExportGraphRunResult = CommandResult & {
  graphDiagnostics: GraphDiagnostic[];
};

const graphHasBlockingDiagnostics = (diagnostics: readonly GraphDiagnostic[]): boolean => {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
};

const hasExportedMachines = (graphResult: NonNullable<ReturnType<typeof buildProjectGraph>["graphResult"]>): boolean => {
  return graphResult.document.managers.some((manager) => manager.machineRefs.length > 0);
};

const result = (
  diagnostics: readonly CliDiagnostic[],
  graphDiagnostics: readonly GraphDiagnostic[] = [],
): ExportGraphRunResult => ({
  exitCode: hasBlockingCliDiagnostics(diagnostics) ? 1 : 0,
  diagnostics: [...diagnostics],
  graphDiagnostics: [...graphDiagnostics],
});

export const createExportGraphRunResult = (
  context: CliContext,
  options: ExportGraphOptions,
  buildResult: ProjectGraphBuildResult,
): ExportGraphRunResult => {
  const graphDiagnostics = buildResult.graphResult?.diagnostics ?? [];
  const diagnostics: CliDiagnostic[] = [...buildResult.diagnostics];

  if (buildResult.blocking) return result(diagnostics, graphDiagnostics);

  if (!buildResult.graphResult) {
    diagnostics.push(cliDiagnostic("LFC_GRAPH_PROJECT_FAILED", "error", "Project graph build did not return a graph result."));
    return result(diagnostics, graphDiagnostics);
  }

  if (graphHasBlockingDiagnostics(graphDiagnostics)) {
    diagnostics.push(cliDiagnostic("LFC_GRAPH_PROJECT_FAILED", "error", "Project graph compile finished with blocking diagnostics."));
    return result(diagnostics, graphDiagnostics);
  }

  if (!hasExportedMachines(buildResult.graphResult)) {
    diagnostics.push(cliDiagnostic("LFC_NO_MACHINES_EXPORTED", "error", "Project graph export has no manager machine refs."));
    return result(diagnostics, graphDiagnostics);
  }

  const sources = options.includeSource
    ? createProjectGraphSourceBundle(context, buildResult.project.projectRoot, buildResult.graphResult.files)
    : undefined;

  if (sources && !sources.ok) return result([...diagnostics, ...sources.diagnostics], graphDiagnostics);

  const document = createProjectGraphExportDocument({
    entryPath: buildResult.project.entryPath,
    tsconfigPath: buildResult.project.tsconfigPath,
    graphResult: buildResult.graphResult,
    diagnostics,
    ...(sources ? { sources: sources.sources } : {}),
  });
  const written = writeOutput(context, options.out, stringifyProjectGraphExportDocument(document));

  if (!written.ok) return result([...diagnostics, ...written.diagnostics], graphDiagnostics);

  return result(diagnostics, graphDiagnostics);
};

export const runExportGraph = (context: CliContext, options: ExportGraphOptions): ExportGraphRunResult => {
  const buildResult = buildProjectGraph(context, { entry: options.entry, tsconfig: options.tsconfig });

  return createExportGraphRunResult(context, options, buildResult);
};
