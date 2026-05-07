import { describe, expect, it } from "vitest";
import { compileLiteFsmGraph, type LiteFsmGraphDocument, type LiteFsmGraphMachine } from "@lite-fsm/graph";
import { fullAssemblerFilename, fullAssemblerSource } from "./fixtures/graph-sources";

const compileFullDocument = (): LiteFsmGraphDocument => {
  return compileLiteFsmGraph(fullAssemblerSource, { filename: fullAssemblerFilename }).document;
};

const getMachine = (document: LiteFsmGraphDocument, id: string): LiteFsmGraphMachine => {
  const machine = document.machines.find((candidate) => candidate.id === id);
  if (!machine) throw new Error(`Missing machine ${id}`);

  return machine;
};

const managerRefCounts = (document: LiteFsmGraphDocument): Array<[string, number]> => {
  return document.managers.map((manager) => [manager.id, manager.machineRefs.length]);
};

const diagnosticCodes = (document: LiteFsmGraphDocument): string[] => {
  return document.diagnostics.map((diagnostic) => diagnostic.code);
};

describe("GraphAssembler интеграция этапа 7", () => {
  it("сохраняет snapshot полного graph document", () => {
    expect(compileFullDocument()).toMatchSnapshot();
  });

  it("собирает полный fixture со всеми слоями и manager refs", () => {
    const document = compileFullDocument();
    const directObjectMachine = getMachine(document, "directObjectMachine");
    const switchReducerMachine = getMachine(document, "switchReducerMachine");
    const plainEffectsMachine = getMachine(document, "plainEffectsMachine");

    expect(document.machines).toHaveLength(28);
    expect(document.managers).toHaveLength(3);
    expect(managerRefCounts(document)).toEqual([
      ["manager", 23],
      ["renamedManager", 3],
      ["inlineManager", 2],
    ]);
    expect(directObjectMachine.transitions.map((transition) => [transition.layer, transition.event.type])).toEqual([
      ["config", "START"],
      ["config", "PATCH"],
      ["config", "FINISH"],
    ]);
    expect(switchReducerMachine.reducerCases.map((reducerCase) => reducerCase.event.type)).toEqual(["SUBMIT", "RESET"]);
    expect(switchReducerMachine.transitions.filter((transition) => transition.layer === "reducer")).toHaveLength(3);
    expect(plainEffectsMachine.emissions.map((emission) => emission.event.type)).toEqual(["RESOLVE", "REJECT"]);
    expect(diagnosticCodes(document)).toEqual([
      "LFG_UNRESOLVED_CONFIG",
      "LFG_DYNAMIC_TARGET",
      "LFG_EFFECT_TRANSITION_ESCAPED",
    ]);
  });

  it("проставляет machineId у machine diagnostics и не добавляет analyzer diagnostics", () => {
    const document = compileFullDocument();
    const machineIds = new Set(document.machines.map((machine) => machine.id));

    for (const machine of document.machines) {
      for (const diagnostic of machine.diagnostics) {
        expect(diagnostic.machineId).toBe(machine.id);
      }
    }

    for (const diagnostic of document.diagnostics) {
      if (diagnostic.machineId) expect(machineIds.has(diagnostic.machineId)).toBe(true);
    }

    expect(diagnosticCodes(document).some((code) => code.startsWith("LFG_ANALYZER_"))).toBe(false);
  });

  it("повторный запуск возвращает идентичный document и stable IDs", () => {
    const first = compileFullDocument();
    const second = compileFullDocument();

    expect(second).toEqual(first);
    expect(second.machines.map((machine) => machine.id)).toEqual(first.machines.map((machine) => machine.id));
    expect(second.machines.flatMap((machine) => machine.transitions.map((transition) => transition.id))).toEqual(
      first.machines.flatMap((machine) => machine.transitions.map((transition) => transition.id)),
    );
    expect(second.machines.flatMap((machine) => machine.reducerCases.map((reducerCase) => reducerCase.id))).toEqual(
      first.machines.flatMap((machine) => machine.reducerCases.map((reducerCase) => reducerCase.id)),
    );
    expect(second.machines.flatMap((machine) => machine.emissions.map((emission) => emission.id))).toEqual(
      first.machines.flatMap((machine) => machine.emissions.map((emission) => emission.id)),
    );
  });
});
