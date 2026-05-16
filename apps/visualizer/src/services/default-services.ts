import { createNoopCodegenPlanner } from "../codegen";
import { createLocalSessionSourceClient } from "../source-access";
import { createNoopValidationRegistry } from "../validation";
import {
  createLocalAnalyzerClient,
  createLocalCompilerClient,
  createLocalVisualizerModelClient,
} from "./local-graph-clients";
import { createLocalSimulationService } from "./local-simulation-service";
import type { EffectRunnerServices } from "./types";

export const createDefaultEffectRunnerServices = (): EffectRunnerServices => ({
  compiler: createLocalCompilerClient(),
  analyzer: createLocalAnalyzerClient(),
  visualizerModel: createLocalVisualizerModelClient(),
  simulation: createLocalSimulationService(),
  validation: createNoopValidationRegistry(),
  codegen: createNoopCodegenPlanner(),
  sourceAccess: createLocalSessionSourceClient(),
});
