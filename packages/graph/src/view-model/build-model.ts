import type { LiteFsmGraphDocument, LiteFsmGraphMachine } from "../types";
import { buildDiagnosticAnchors, buildMachineDiagnosticAnchors, indexDiagnostics } from "./diagnostics";
import { createGraphVisualizerIndexes } from "./indexes";
import { applyGraphSimulationOverlay, applyMachineSimulationOverlay, buildRowMappingIndex } from "./simulation";
import { buildManagerSummaries, buildMachineSummaries } from "./summaries";
import { buildRelationIndex, buildTopicSummaries } from "./topics";
import type {
  BuildGraphVisualizerModelOptions,
  BuildMachineWorkbenchModelOptions,
  GraphMachineWorkbenchModel,
  GraphVisualizerModel,
} from "./types";
import { applyWorkbenchCollapse, buildMachineWorkbenchModelFromDiagnostics } from "./workbench";

export const buildGraphVisualizerModel = (
  document: LiteFsmGraphDocument,
  options: BuildGraphVisualizerModelOptions = {},
): GraphVisualizerModel => {
  const indexes = createGraphVisualizerIndexes(document);
  const diagnostics = buildDiagnosticAnchors(document, options.analysisDiagnostics, indexes);
  const diagnosticIndex = indexDiagnostics(document, diagnostics, indexes);
  const machines = buildMachineSummaries(document, diagnosticIndex);
  const managers = buildManagerSummaries(document, diagnosticIndex);
  const topics = buildTopicSummaries(document, diagnosticIndex);
  const semanticWorkbenches: Record<string, GraphMachineWorkbenchModel> = {};
  for (const machine of document.machines) {
    semanticWorkbenches[machine.id] = buildMachineWorkbenchModelFromDiagnostics(machine, diagnostics);
  }
  const semanticRowMappings = buildRowMappingIndex(semanticWorkbenches, options.simulation);
  const workbenchMachines = applyGraphSimulationOverlay(semanticWorkbenches, options.simulation, semanticRowMappings);
  const rowMappings = buildRowMappingIndex(workbenchMachines, options.simulation);

  return {
    version: "lite-fsm.visualizer/v1",
    source: document.source,
    machines,
    managers,
    topics,
    relations: buildRelationIndex(document, topics),
    diagnostics,
    rowMappings,
    workbenchMachines,
  };
};

export const buildMachineWorkbenchModel = (
  machine: LiteFsmGraphMachine,
  options: BuildMachineWorkbenchModelOptions = {},
): GraphMachineWorkbenchModel => {
  const diagnostics = buildMachineDiagnosticAnchors(machine);
  const model = buildMachineWorkbenchModelFromDiagnostics(machine, diagnostics);

  return applyWorkbenchCollapse(applyMachineSimulationOverlay(model, options.simulation), options.collapse);
};
