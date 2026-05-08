import type {
  AnalyzeLiteFsmGraphOptions,
  GraphAnalysisResult,
  GraphDiagnostic,
  LiteFsmGraphDocument,
  LiteFsmGraphMachine,
} from "./types";
import { normalizeDiagnostics } from "./compiler/diagnostics";
import { analyzerDiagnostic, type GraphAnalysisContext } from "./analyzer/context";
import { createGraphAnalysisIndex } from "./analyzer/indexes";
import { analysisRules } from "./analyzer/rules";

type ResolvedScope = {
  machines: LiteFsmGraphMachine[];
  machineIds: Set<string>;
  kind: GraphAnalysisContext["scopeKind"];
  diagnostics: GraphDiagnostic[];
};

const resolveScope = (
  document: LiteFsmGraphDocument,
  options: AnalyzeLiteFsmGraphOptions,
): ResolvedScope => {
  const scope = options.scope ?? { kind: "document" };
  if (scope.kind === "document") {
    return {
      machines: document.machines,
      machineIds: new Set(document.machines.map((machine) => machine.id)),
      kind: "document",
      diagnostics: [],
    };
  }

  if (scope.kind === "machine") {
    const machine = document.machines.find((candidate) => candidate.id === scope.machineId);
    if (!machine) {
      return {
        machines: [],
        machineIds: new Set(),
        kind: "machine",
        diagnostics: [
          analyzerDiagnostic(
            "LFG_ANALYZER_SCOPE_NOT_FOUND",
            "warning",
            `No machine matches analyzer scope '${scope.machineId}'.`,
          ),
        ],
      };
    }

    return {
      machines: [machine],
      machineIds: new Set([machine.id]),
      kind: "machine",
      diagnostics: [],
    };
  }

  const manager = document.managers.find((candidate) => candidate.id === scope.managerId);
  if (!manager) {
    return {
      machines: [],
      machineIds: new Set(),
      kind: "manager",
      diagnostics: [
        analyzerDiagnostic(
          "LFG_ANALYZER_SCOPE_NOT_FOUND",
          "warning",
          `No manager matches analyzer scope '${scope.managerId}'.`,
        ),
      ],
    };
  }

  const machineIds = new Set(manager.machineRefs.map((ref) => ref.machineId));
  return {
    machines: document.machines.filter((machine) => machineIds.has(machine.id)),
    machineIds,
    kind: "manager",
    diagnostics: [],
  };
};

export const analyzeLiteFsmGraph = (
  document: LiteFsmGraphDocument,
  options: AnalyzeLiteFsmGraphOptions = {},
): GraphAnalysisResult => {
  const scope = resolveScope(document, options);
  const index = createGraphAnalysisIndex(document, scope.machineIds);
  const enabledRules = new Set(options.rules ?? analysisRules.map((rule) => rule.id));
  const context: GraphAnalysisContext = {
    document,
    options,
    index,
    machines: scope.machines,
    scopeKind: scope.kind,
  };
  const diagnostics = [
    ...scope.diagnostics,
    ...analysisRules
      .filter((rule) => enabledRules.has(rule.id))
      .flatMap((rule) => rule.run(context)),
  ];

  return {
    diagnostics: normalizeDiagnostics(diagnostics),
  };
};
