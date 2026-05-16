import type { GraphDiagnostic, LiteFsmGraphProjectResult } from "@lite-fsm/graph";
import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic, hasBlockingCliDiagnostics } from "../cli/diagnostics.js";
import type { CommandResult } from "../cli/result.js";
import { createProjectGraphExportDocument } from "../export-graph/export-document.js";
import { buildProjectGraph, type ProjectGraphBuildResult } from "../project/build-project-graph.js";
import { openBrowser } from "./open-browser.js";
import { createVisualizerSession, type VisualizerSession } from "./session.js";
import { startVisualizerServer, waitForSignalShutdown, type StartVisualizerServerResult, type VisualizerServer } from "./server.js";
import { verifyVisualizerStaticArtifact } from "./static-assets.js";
import type { VisualizeOptions } from "./types.js";

export type VisualizeRunResult = CommandResult & {
  graphDiagnostics: GraphDiagnostic[];
};

export type RunVisualizeDependencies = {
  buildGraph?: typeof buildProjectGraph;
  createSession?: (input: {
    projectRoot: string;
    graphResult: LiteFsmGraphProjectResult;
    diagnostics: readonly CliDiagnostic[];
    entryPath: string;
    tsconfigPath?: string;
  }) => VisualizerSession;
  startServer?: (input: {
    context: CliContext;
    port: number;
    session: VisualizerSession;
    staticRoot: string;
  }) => Promise<StartVisualizerServerResult>;
  openBrowser?: (url: string) => Promise<void>;
  waitForShutdown?: (server: VisualizerServer) => Promise<void>;
  staticRoot?: string;
  emitDiagnostics?: (diagnostics: readonly CliDiagnostic[], graphDiagnostics: readonly GraphDiagnostic[]) => void;
};

const createRunResult = (
  diagnostics: readonly CliDiagnostic[],
  graphDiagnostics: readonly GraphDiagnostic[] = [],
): VisualizeRunResult => ({
  exitCode: hasBlockingCliDiagnostics(diagnostics) ? 1 : 0,
  diagnostics: [...diagnostics],
  graphDiagnostics: [...graphDiagnostics],
});

const createSessionFromBuild = (
  project: ProjectGraphBuildResult["project"],
  graphResult: LiteFsmGraphProjectResult,
  diagnostics: readonly CliDiagnostic[],
): VisualizerSession => {
  const exportDocument = createProjectGraphExportDocument({
    entryPath: project.entryPath,
    tsconfigPath: project.tsconfigPath,
    graphResult,
    diagnostics,
  });

  return createVisualizerSession({
    projectRoot: project.projectRoot,
    exportDocument,
    graphResult,
  });
};

export const runVisualize = async (
  context: CliContext,
  options: VisualizeOptions,
  dependencies: RunVisualizeDependencies = {},
): Promise<VisualizeRunResult> => {
  const buildResult = (dependencies.buildGraph ?? buildProjectGraph)(context, {
    entry: options.entry,
    tsconfig: options.tsconfig,
  });
  const graphDiagnostics = buildResult.graphResult?.diagnostics ?? [];
  const diagnostics: CliDiagnostic[] = [...buildResult.diagnostics];
  const finish = (nextDiagnostics: readonly CliDiagnostic[]): VisualizeRunResult => {
    dependencies.emitDiagnostics?.(nextDiagnostics, graphDiagnostics);

    return createRunResult(nextDiagnostics, graphDiagnostics);
  };

  if (buildResult.blocking) return finish(diagnostics);
  if (!buildResult.graphResult) {
    return finish([
      ...diagnostics,
      cliDiagnostic("LFC_GRAPH_PROJECT_FAILED", "error", "Project graph build did not return a graph result."),
    ]);
  }

  const staticArtifact = verifyVisualizerStaticArtifact(context, dependencies.staticRoot);
  if (!staticArtifact.ok) return finish([...diagnostics, ...staticArtifact.diagnostics]);

  const session = dependencies.createSession
    ? dependencies.createSession({
        projectRoot: buildResult.project.projectRoot,
        graphResult: buildResult.graphResult,
        diagnostics,
        entryPath: buildResult.project.entryPath,
        tsconfigPath: buildResult.project.tsconfigPath,
      })
    : createSessionFromBuild(buildResult.project, buildResult.graphResult, diagnostics);
  /* v8 ignore next -- the default server binds a real local port; unit tests inject the lifecycle boundary. */
  const startServer = dependencies.startServer ?? startVisualizerServer;
  const started = await startServer({
    context,
    port: options.port,
    session,
    staticRoot: staticArtifact.staticRoot,
  });

  if (!started.ok) return finish([...diagnostics, ...started.diagnostics]);

  try {
    /* v8 ignore next -- the default browser opener spawns a platform command; unit tests inject the boundary. */
    const open = dependencies.openBrowser ?? openBrowser;
    if (!options.noOpen) await open(started.server.url);
  } catch (error) {
    await started.server.close();
    const message = error instanceof Error ? error.message : String(error);
    return finish([
      ...diagnostics,
      cliDiagnostic("LFC_VISUALIZER_OPEN_FAILED", "error", `Failed to open browser: ${message}`),
    ]);
  }

  dependencies.emitDiagnostics?.(diagnostics, graphDiagnostics);
  context.stdout.write(`${started.server.url}\n`);
  /* v8 ignore next -- the default signal wait depends on process signals; unit tests inject the boundary. */
  const waitForShutdown = dependencies.waitForShutdown ?? waitForSignalShutdown;
  await waitForShutdown(started.server);

  return createRunResult(diagnostics, graphDiagnostics);
};
