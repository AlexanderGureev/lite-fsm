import type { GraphDiagnostic, LiteFsmGraphDocument, LiteFsmGraphMachine, MachineSelector, SelectMachineGraphResult } from "./types";

const selectionDiagnostic = (
  code: "LFG_MACHINE_NOT_FOUND" | "LFG_MANAGER_NOT_FOUND" | "LFG_AMBIGUOUS_MACHINE_SELECTOR",
  message: string,
): GraphDiagnostic => ({
  code,
  severity: "warning",
  message,
});

const uniqueByDocumentOrder = (
  document: LiteFsmGraphDocument,
  machineIds: ReadonlySet<string>,
): LiteFsmGraphMachine[] => {
  return document.machines.filter((machine) => machineIds.has(machine.id));
};

const selectorLabel = (selector: MachineSelector | undefined): string => {
  if (!selector) return "first machine";
  if ("index" in selector) return `index '${selector.index}'`;
  if ("id" in selector) return `id '${selector.id}'`;
  if ("variableName" in selector) return `variableName '${selector.variableName}'`;
  if ("exportName" in selector) return `exportName '${selector.exportName}'`;
  if ("managerId" in selector) return `manager '${selector.managerId}' key '${selector.managerKey}'`;

  return `managerKey '${selector.managerKey}'`;
};

const findMatches = (
  document: LiteFsmGraphDocument,
  selector: MachineSelector | undefined,
): LiteFsmGraphMachine[] | GraphDiagnostic => {
  if (!selector) return document.machines.slice(0, 1);
  if ("index" in selector) return document.machines.filter((machine) => machine.index === selector.index);
  if ("id" in selector) return document.machines.filter((machine) => machine.id === selector.id);
  if ("variableName" in selector) {
    return document.machines.filter((machine) => machine.variableName === selector.variableName);
  }
  if ("exportName" in selector) return document.machines.filter((machine) => machine.exportName === selector.exportName);
  if ("managerId" in selector) {
    const manager = document.managers.find((candidate) => candidate.id === selector.managerId);
    if (!manager) {
      return selectionDiagnostic(
        "LFG_MANAGER_NOT_FOUND",
        `No manager matches selector ${selectorLabel(selector)}.`,
      );
    }

    const machineIds = new Set(
      manager.machineRefs.filter((ref) => ref.key === selector.managerKey).map((ref) => ref.machineId),
    );

    return uniqueByDocumentOrder(document, machineIds);
  }

  return document.machines.filter((machine) => machine.managerKeys.includes(selector.managerKey));
};

export const selectMachineGraph = (
  document: LiteFsmGraphDocument,
  selector?: MachineSelector,
): SelectMachineGraphResult => {
  const matches = findMatches(document, selector);
  if (!Array.isArray(matches)) {
    return {
      ok: false,
      candidates: [],
      diagnostics: [matches],
    };
  }

  if (matches.length === 1) {
    return {
      ok: true,
      machine: matches[0] as LiteFsmGraphMachine,
      diagnostics: [],
    };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      candidates: matches,
      diagnostics: [
        selectionDiagnostic(
          "LFG_AMBIGUOUS_MACHINE_SELECTOR",
          `Machine selector ${selectorLabel(selector)} matched ${matches.length} machines.`,
        ),
      ],
    };
  }

  return {
    ok: false,
    candidates: [],
    diagnostics: [
      selectionDiagnostic(
        "LFG_MACHINE_NOT_FOUND",
        `No machine matches selector ${selectorLabel(selector)}.`,
      ),
    ],
  };
};
