import { describe, expect, it } from "vitest";
import { compileLiteFsmGraph, selectMachineGraph, type LiteFsmGraphDocument } from "@lite-fsm/graph";

const compileSelectionDocument = (): LiteFsmGraphDocument => {
  return compileLiteFsmGraph(
    `
      import { createMachine, MachineManager } from "@lite-fsm/core";

      export const first = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      const second = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });

      export const manager = MachineManager({ shared: first, unique: first }, {});
      export const secondManager = MachineManager({ shared: second }, {});
    `,
    { filename: "select.ts" },
  ).document;
};

const selectedId = (result: ReturnType<typeof selectMachineGraph>): string => {
  if (!result.ok) throw new Error("Expected selected machine");

  return result.machine.id;
};

describe("selectMachineGraph", () => {
  it("выбирает default, index, id, variableName, exportName и manager selectors", () => {
    const document = compileSelectionDocument();

    expect(selectedId(selectMachineGraph(document))).toBe("first");
    expect(selectedId(selectMachineGraph(document, { index: 1 }))).toBe("second");
    expect(selectedId(selectMachineGraph(document, { id: "first" }))).toBe("first");
    expect(selectedId(selectMachineGraph(document, { variableName: "second" }))).toBe("second");
    expect(selectedId(selectMachineGraph(document, { exportName: "first" }))).toBe("first");
    expect(selectedId(selectMachineGraph(document, { managerKey: "unique" }))).toBe("first");
    expect(selectedId(selectMachineGraph(document, { managerId: "manager", managerKey: "shared" }))).toBe("first");
    expect(selectedId(selectMachineGraph(document, { managerId: "secondManager", managerKey: "shared" }))).toBe(
      "second",
    );
  });

  it("возвращает candidates для неоднозначного managerKey", () => {
    const document = compileSelectionDocument();
    const result = selectMachineGraph(document, { managerKey: "shared" });

    expect(result).toMatchObject({
      ok: false,
      candidates: [{ id: "first" }, { id: "second" }],
      diagnostics: [
        {
          code: "LFG_AMBIGUOUS_MACHINE_SELECTOR",
          severity: "warning",
        },
      ],
    });
  });

  it("возвращает candidates для неоднозначных variableName, exportName и scoped manager refs", () => {
    const document: LiteFsmGraphDocument = {
      version: "lite-fsm.graph/v1",
      source: { language: "ts" },
      machines: [
        {
          id: "first",
          index: 0,
          variableName: "sharedVariable",
          exportName: "sharedExport",
          managerKeys: ["shared"],
          kind: "unknown",
          states: [],
          transitions: [],
          emissions: [],
          reducerCases: [],
          diagnostics: [],
        },
        {
          id: "second",
          index: 1,
          variableName: "sharedVariable",
          exportName: "sharedExport",
          managerKeys: ["shared"],
          kind: "unknown",
          states: [],
          transitions: [],
          emissions: [],
          reducerCases: [],
          diagnostics: [],
        },
      ],
      managers: [
        {
          id: "manager",
          machineRefs: [
            { key: "sameMachineTwice", machineId: "first" },
            { key: "sameMachineTwice", machineId: "first" },
            { key: "shared", machineId: "first" },
            { key: "shared", machineId: "second" },
          ],
        },
      ],
      diagnostics: [],
    };
    const byVariableName = selectMachineGraph(document, { variableName: "sharedVariable" });
    const byExportName = selectMachineGraph(document, { exportName: "sharedExport" });
    const byScopedManager = selectMachineGraph(document, { managerId: "manager", managerKey: "shared" });
    const duplicateSameMachine = selectMachineGraph(document, {
      managerId: "manager",
      managerKey: "sameMachineTwice",
    });

    expect(byVariableName).toMatchObject({
      ok: false,
      candidates: [{ id: "first" }, { id: "second" }],
      diagnostics: [
        {
          code: "LFG_AMBIGUOUS_MACHINE_SELECTOR",
          message: "Machine selector variableName 'sharedVariable' matched 2 machines.",
        },
      ],
    });
    expect(byExportName).toMatchObject({
      ok: false,
      candidates: [{ id: "first" }, { id: "second" }],
      diagnostics: [
        {
          code: "LFG_AMBIGUOUS_MACHINE_SELECTOR",
          message: "Machine selector exportName 'sharedExport' matched 2 machines.",
        },
      ],
    });
    expect(byScopedManager).toMatchObject({
      ok: false,
      candidates: [{ id: "first" }, { id: "second" }],
      diagnostics: [
        {
          code: "LFG_AMBIGUOUS_MACHINE_SELECTOR",
          message: "Machine selector manager 'manager' key 'shared' matched 2 machines.",
        },
      ],
    });
    expect(duplicateSameMachine).toMatchObject({
      ok: true,
      machine: { id: "first" },
      diagnostics: [],
    });
  });

  it("возвращает diagnostics для отсутствующей машины или manager-а", () => {
    const document = compileSelectionDocument();
    const byIndex = selectMachineGraph(document, { index: 99 });
    const byId = selectMachineGraph(document, { id: "missing" });
    const byVariableName = selectMachineGraph(document, { variableName: "missing" });
    const byExportName = selectMachineGraph(document, { exportName: "missing" });
    const byManagerKey = selectMachineGraph(document, { managerId: "manager", managerKey: "missing" });
    const byManager = selectMachineGraph(document, { managerId: "missingManager", managerKey: "shared" });
    const empty = selectMachineGraph({
      version: "lite-fsm.graph/v1",
      source: { language: "unknown" },
      machines: [],
      managers: [],
      diagnostics: [],
    });

    expect(byIndex).toMatchObject({
      ok: false,
      candidates: [],
      diagnostics: [
        {
          code: "LFG_MACHINE_NOT_FOUND",
          message: "No machine matches selector index '99'.",
        },
      ],
    });
    expect(byId).toMatchObject({
      ok: false,
      candidates: [],
      diagnostics: [
        {
          code: "LFG_MACHINE_NOT_FOUND",
          message: "No machine matches selector id 'missing'.",
        },
      ],
    });
    expect(byVariableName).toMatchObject({
      ok: false,
      candidates: [],
      diagnostics: [
        {
          code: "LFG_MACHINE_NOT_FOUND",
          message: "No machine matches selector variableName 'missing'.",
        },
      ],
    });
    expect(byExportName).toMatchObject({
      ok: false,
      candidates: [],
      diagnostics: [
        {
          code: "LFG_MACHINE_NOT_FOUND",
          message: "No machine matches selector exportName 'missing'.",
        },
      ],
    });
    expect(byManagerKey).toMatchObject({
      ok: false,
      candidates: [],
      diagnostics: [
        {
          code: "LFG_MACHINE_NOT_FOUND",
          message: "No machine matches selector manager 'manager' key 'missing'.",
        },
      ],
    });
    expect(byManager).toMatchObject({
      ok: false,
      candidates: [],
      diagnostics: [
        {
          code: "LFG_MANAGER_NOT_FOUND",
          message: "No manager matches selector manager 'missingManager' key 'shared'.",
        },
      ],
    });
    expect(empty).toMatchObject({
      ok: false,
      candidates: [],
      diagnostics: [
        {
          code: "LFG_MACHINE_NOT_FOUND",
          message: "No machine matches selector first machine.",
        },
      ],
    });
  });
});
