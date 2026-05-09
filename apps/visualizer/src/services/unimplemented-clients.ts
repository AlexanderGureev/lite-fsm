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

export const createUnimplementedCompilerClient = (): GraphCompilerClient => ({
  async compile(input: CompileRequest): Promise<CompileResponse> {
    return {
      ok: false,
      sourceVersion: input.source.version,
      diagnostics: [
        createControlledDiagnostic(
          input.source.version,
          "source",
          "compiler-client-not-connected",
          "The visualizer compiler client is reserved for the source pipeline stage.",
        ),
      ],
    };
  },
});

export const createUnimplementedAnalyzerClient = (): GraphAnalyzerClient => ({
  async analyze(input: AnalyzeRequest): Promise<AnalyzeResponse> {
    return {
      ok: false,
      sourceVersion: input.sourceVersion,
      diagnostics: [
        createControlledDiagnostic(
          input.sourceVersion,
          "analyzer",
          "analyzer-client-not-connected",
          "The visualizer analyzer client is reserved for the source pipeline stage.",
        ),
      ],
    };
  },
});

export const createUnimplementedModelClient = (): GraphVisualizerModelClient => ({
  async build(input: BuildVisualizerModelRequest): Promise<BuildVisualizerModelResponse> {
    return {
      ok: false,
      sourceVersion: input.sourceVersion,
      diagnostics: [
        createControlledDiagnostic(
          input.sourceVersion,
          "view-model",
          "model-client-not-connected",
          "The visualizer model client is reserved for the source pipeline stage.",
        ),
      ],
    };
  },
});
