import type { CompileLiteFsmGraphOptions, GraphDiagnostic, GraphSource, LiteFsmGraphResult } from "./types";
import { assembleGraphDocument } from "./compiler/assembler";
import { createSourceCatalog } from "./compiler/catalog";
import { discoverCandidates } from "./compiler/candidates";
import { normalizeDiagnostics } from "./compiler/diagnostics";
import { createStableHash } from "./compiler/ids";
import { createSourceAdapter, inferGraphLanguage } from "./compiler/source";

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
    const candidates = discoverCandidates(sourceAdapter, catalog);
    const maxMachines = options.maxMachines ?? Number.POSITIVE_INFINITY;
    const machineCandidates = candidates.machines.slice(0, maxMachines);
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
      candidates: machineCandidates,
      managers: candidates.managers,
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
