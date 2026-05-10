import { createNoopCodegenPlanner } from "../codegen";
import { createNoopValidationRegistry } from "../validation";
import {
  createLocalAnalyzerClient,
  createLocalCompilerClient,
  createLocalVisualizerModelClient,
} from "./local-graph-clients";
import type { EffectRunnerServices } from "./types";

export const createDefaultEffectRunnerServices = (): EffectRunnerServices => ({
  compiler: createLocalCompilerClient(),
  analyzer: createLocalAnalyzerClient(),
  visualizerModel: createLocalVisualizerModelClient(),
  validation: createNoopValidationRegistry(),
  codegen: createNoopCodegenPlanner(),
});
