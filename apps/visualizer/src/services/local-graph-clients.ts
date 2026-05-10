import { analyzeLiteFsmGraph, compileLiteFsmGraph } from "@lite-fsm/graph";
import { buildGraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { createControlledDiagnostic } from "../diagnostics";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  BuildVisualizerModelRequest,
  BuildVisualizerModelResponse,
  CompileRequest,
  CompileResponse,
  GraphAnalyzerClient,
  GraphCompilerClient,
  GraphVisualizerModelClient,
} from "./types";

export type LocalGraphClientDependencies = {
  compile?: typeof compileLiteFsmGraph;
  analyze?: typeof analyzeLiteFsmGraph;
  buildModel?: typeof buildGraphVisualizerModel;
};

const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown visualizer graph service failure.";

export const createLocalCompilerClient = (
  dependencies: LocalGraphClientDependencies = {},
): GraphCompilerClient => ({
  async compile(input: CompileRequest): Promise<CompileResponse> {
    try {
      const result = (dependencies.compile ?? compileLiteFsmGraph)(input.source.source, {
        filename: input.source.filename,
        language: input.source.language,
      });

      return {
        ok: true,
        sourceVersion: input.sourceVersion,
        document: result.document,
        diagnostics: result.diagnostics,
      };
    } catch (error) {
      return {
        ok: false,
        sourceVersion: input.sourceVersion,
        diagnostics: [
          createControlledDiagnostic(
            input.sourceVersion,
            "host",
            "compiler-client-failed",
            failureMessage(error),
          ),
        ],
      };
    }
  },
});

export const createLocalAnalyzerClient = (
  dependencies: LocalGraphClientDependencies = {},
): GraphAnalyzerClient => ({
  async analyze(input: AnalyzeRequest): Promise<AnalyzeResponse> {
    try {
      const result = (dependencies.analyze ?? analyzeLiteFsmGraph)(input.document);

      return {
        ok: true,
        sourceVersion: input.sourceVersion,
        diagnostics: result.diagnostics,
      };
    } catch (error) {
      return {
        ok: false,
        sourceVersion: input.sourceVersion,
        diagnostics: [
          createControlledDiagnostic(
            input.sourceVersion,
            "host",
            "analyzer-client-failed",
            failureMessage(error),
          ),
        ],
      };
    }
  },
});

export const createLocalVisualizerModelClient = (
  dependencies: LocalGraphClientDependencies = {},
): GraphVisualizerModelClient => ({
  async build(input: BuildVisualizerModelRequest): Promise<BuildVisualizerModelResponse> {
    try {
      return {
        ok: true,
        sourceVersion: input.sourceVersion,
        model: (dependencies.buildModel ?? buildGraphVisualizerModel)(input.document, {
          analysisDiagnostics: input.analysisDiagnostics,
          simulation: input.simulation,
        }),
      };
    } catch (error) {
      return {
        ok: false,
        sourceVersion: input.sourceVersion,
        diagnostics: [
          createControlledDiagnostic(
            input.sourceVersion,
            "host",
            "model-client-failed",
            failureMessage(error),
          ),
        ],
      };
    }
  },
});
