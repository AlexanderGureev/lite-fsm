import { createNoopCodegenPlanner } from "../codegen";
import { createNoopValidationRegistry } from "../validation";
import {
  createUnimplementedAnalyzerClient,
  createUnimplementedCompilerClient,
  createUnimplementedModelClient,
} from "./unimplemented-clients";
import type { EffectRunnerServices } from "./types";

export const createDefaultEffectRunnerServices = (): EffectRunnerServices => ({
  compiler: createUnimplementedCompilerClient(),
  analyzer: createUnimplementedAnalyzerClient(),
  visualizerModel: createUnimplementedModelClient(),
  validation: createNoopValidationRegistry(),
  codegen: createNoopCodegenPlanner(),
});
