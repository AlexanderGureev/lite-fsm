import { createDiagnosticSink } from "./diagnostics";
import type { PartialEvaluator } from "./evaluator/types";
import { compileConfigGraph } from "./config";
import { compileEffectsGraph } from "./effects";
import type { MachineCandidate } from "./candidates";
import type { SourceCatalog } from "./catalog";
import type { SourceAdapter } from "./source";
import type { CompilerContext, MachineGraphSlice } from "./pipeline";
import { compileReducerGraph } from "./reducer";

export const createCompilerContext = (
  source: SourceAdapter,
  catalog: SourceCatalog,
  evaluator: PartialEvaluator,
): CompilerContext => ({
  source,
  catalog,
  evaluator,
  diagnostics: createDiagnosticSink(),
});

export const compileMachineSlice = (
  candidate: MachineCandidate,
  context: CompilerContext,
): MachineGraphSlice => {
  const config = compileConfigGraph(candidate, context);

  return {
    candidate,
    config,
    reducer: compileReducerGraph(candidate, config, context),
    effects: compileEffectsGraph(candidate, config, context),
    managerKeys: candidate.managerKeys,
    diagnostics: [],
  };
};
