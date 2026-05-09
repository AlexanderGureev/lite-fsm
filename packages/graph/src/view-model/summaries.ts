import type { LiteFsmGraphDocument } from "../types";
import type { DiagnosticIndex } from "./diagnostics";
import { idsForMachine } from "./diagnostics";
import { machineTitle } from "./indexes";
import { managerAnchors, machineAnchors, sourceAnchors } from "./source-anchors";
import { sortedUniqueStrings } from "./sort";
import type { GraphMachineSummary, GraphManagerSummary } from "./types";

export const buildMachineSummaries = (
  document: LiteFsmGraphDocument,
  diagnostics: DiagnosticIndex,
): GraphMachineSummary[] => {
  return document.machines.map((machine) => {
    const consumedTopicTypes = sortedUniqueStrings(
      machine.transitions.filter((transition) => transition.layer === "config").map((transition) => transition.event.type),
    );
    const producedTopicTypes = sortedUniqueStrings(machine.emissions.map((emission) => emission.event.type));
    const diagnosticIds = idsForMachine(diagnostics, machine.id);

    return {
      machineId: machine.id,
      title: machineTitle(machine),
      kind: machine.kind,
      groupTag: machine.groupTag,
      initialState: machine.initialState,
      managerKeys: machine.managerKeys,
      counts: {
        states: machine.states.length,
        consumedTopics: consumedTopicTypes.length,
        producedTopics: producedTopicTypes.length,
        configTransitions: machine.transitions.filter((transition) => transition.layer === "config").length,
        reducerBranches: machine.transitions.filter((transition) => transition.layer === "reducer").length,
        effectEmissions: machine.emissions.length,
        diagnostics: diagnosticIds.length,
      },
      consumedTopicTypes,
      producedTopicTypes,
      sourceAnchors: machineAnchors(machine),
      diagnosticIds,
    };
  });
};

export const buildManagerSummaries = (
  document: LiteFsmGraphDocument,
  diagnostics: DiagnosticIndex,
): GraphManagerSummary[] => {
  return document.managers.map((manager) => ({
    managerId: manager.id,
    title: manager.variableName ?? manager.id,
    machineRefs: manager.machineRefs.map((machineRef) => ({
      key: machineRef.key,
      machineId: machineRef.machineId,
      sourceAnchors: sourceAnchors("manager", machineRef.loc),
    })),
    sourceAnchors: managerAnchors(manager),
    diagnosticIds: diagnostics.idsByManagerId.get(manager.id) ?? [],
  }));
};
