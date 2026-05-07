import type { CompileLiteFsmGraphOptions, GraphDiagnostic, GraphSource, LiteFsmGraphResult } from "./types";
import { assembleGraphDocument } from "./compiler/assembler";
import { createSourceCatalog, type SourceCatalog } from "./compiler/catalog";
import { discoverCandidates, type MachineCandidate } from "./compiler/candidates";
import { compileConfigGraph } from "./compiler/config";
import { createDiagnosticSink, normalizeDiagnostics } from "./compiler/diagnostics";
import { createPartialEvaluator } from "./compiler/evaluator";
import type { PartialEvaluator } from "./compiler/evaluator/types";
import { compileEffectsGraph } from "./compiler/effects";
import { createStableHash } from "./compiler/ids";
import { linkManagers } from "./compiler/manager";
import type { CompilerContext, MachineGraphSlice } from "./compiler/pipeline";
import { compileReducerGraph } from "./compiler/reducer";
import { createSourceAdapter, inferGraphLanguage, type SourceAdapter } from "./compiler/source";

const createGraphSource = (source: unknown, options: CompileLiteFsmGraphOptions | undefined): GraphSource => ({
  filename: options?.filename,
  language: inferGraphLanguage(options?.filename, options?.language),
  hash: typeof source === "string" ? createStableHash(source) : undefined,
});

const createCompilerFailure = (
  source: unknown,
  options: CompileLiteFsmGraphOptions | undefined,
  error: unknown,
): LiteFsmGraphResult => {
  const diagnostic: GraphDiagnostic = {
    code: "LFG_COMPILER_ERROR",
    severity: "error",
    message: error instanceof Error ? error.message : String(error),
  };
  const diagnostics = normalizeDiagnostics([diagnostic]);
  const document = assembleGraphDocument({
    source: createGraphSource(source, options),
    diagnostics,
  });

  return { document, diagnostics: document.diagnostics };
};

const createCompilerContext = (
  source: SourceAdapter,
  catalog: SourceCatalog,
  evaluator: PartialEvaluator,
): CompilerContext => ({
  source,
  catalog,
  evaluator,
  diagnostics: createDiagnosticSink(),
});

const compileMachineSlices = (
  candidates: readonly MachineCandidate[],
  context: CompilerContext,
): MachineGraphSlice[] => {
  return candidates.map((candidate) => {
    const config = compileConfigGraph(candidate, context);

    return {
      candidate,
      config,
      reducer: compileReducerGraph(candidate, config, context),
      effects: compileEffectsGraph(candidate, config, context),
      managerKeys: candidate.managerKeys,
      diagnostics: [],
    };
  });
};

export const compileLiteFsmGraph = (
  source: string,
  options: CompileLiteFsmGraphOptions = {},
): LiteFsmGraphResult => {
  try {
    if (typeof source !== "string") {
      throw new TypeError("compileLiteFsmGraph source must be a string.");
    }

    const sourceAdapter = createSourceAdapter(source, options);
    const catalog = createSourceCatalog(sourceAdapter);
    const evaluator = createPartialEvaluator(sourceAdapter, catalog);
    const candidates = discoverCandidates(sourceAdapter, catalog);
    const maxMachines = options.maxMachines ?? Number.POSITIVE_INFINITY;
    const machineCandidates = candidates.machines.slice(0, maxMachines);
    const context = createCompilerContext(sourceAdapter, catalog, evaluator);
    const managerLinks = linkManagers(candidates.managers, machineCandidates, context);
    const machineSlices = compileMachineSlices(machineCandidates, context);
    const maxMachineDiagnostic: GraphDiagnostic[] =
      candidates.machines.length > maxMachines
        ? [
            {
              code: "LFG_MAX_MACHINES_REACHED",
              severity: "warning",
              message: `Only the first ${maxMachines} machine candidates were included.`,
            },
          ]
        : [];
    const document = assembleGraphDocument({
      source: {
        filename: options.filename,
        language: sourceAdapter.language,
        hash: createStableHash(source),
      },
      machineSlices,
      managerLinks,
      diagnostics: [...sourceAdapter.diagnostics, ...maxMachineDiagnostic],
    });

    return {
      document,
      diagnostics: document.diagnostics,
    };
  } catch (error) {
    return createCompilerFailure(source, options, error);
  }
};
