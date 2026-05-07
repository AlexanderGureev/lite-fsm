import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileLiteFsmGraph, type LiteFsmGraphDocument, type LiteFsmGraphManager } from "@lite-fsm/graph";
import { assembleGraphDocument } from "../../packages/graph/src/compiler/assembler";
import { createSourceCatalog } from "../../packages/graph/src/compiler/catalog";
import { discoverCandidates, type MachineCandidate } from "../../packages/graph/src/compiler/candidates";
import { createSourceAdapter } from "../../packages/graph/src/compiler/source";

const fixturePath = fileURLToPath(new URL("../../xstate/graph-parser-fixtures.ts", import.meta.url));

const compileFixture = () => compileLiteFsmGraph(readFileSync(fixturePath, "utf8"), { filename: fixturePath });

const getManager = (document: LiteFsmGraphDocument, id: string): LiteFsmGraphManager => {
  const manager = document.managers.find((candidate) => candidate.id === id);
  if (!manager) throw new Error(`Missing manager ${id}`);

  return manager;
};

const machineIdByKey = (manager: LiteFsmGraphManager): ReadonlyMap<string, string> => {
  return new Map(manager.machineRefs.map((ref) => [ref.key, ref.machineId]));
};

const machineManagerKeys = (document: LiteFsmGraphDocument, id: string): string[] => {
  const machine = document.machines.find((candidate) => candidate.id === id);
  if (!machine) throw new Error(`Missing machine ${id}`);

  return machine.managerKeys;
};

const diagnosticCodes = (document: LiteFsmGraphDocument): string[] => {
  return document.diagnostics.map((diagnostic) => diagnostic.code);
};

const candidatesFrom = (sourceText: string) => {
  const source = createSourceAdapter(sourceText, { filename: "manager-assembly.ts" });
  const catalog = createSourceCatalog(source);

  return discoverCandidates(source, catalog);
};

describe("ManagerLinker по fixture", () => {
  it("связывает manager, renamedManager и inlineManager с machineRefs", () => {
    const result = compileFixture();
    const manager = getManager(result.document, "manager");
    const renamedManager = getManager(result.document, "renamedManager");
    const inlineManager = getManager(result.document, "inlineManager");
    const managerRefs = machineIdByKey(manager);
    const renamedRefs = machineIdByKey(renamedManager);
    const inlineRefs = machineIdByKey(inlineManager);

    expect(manager.machineRefs).toHaveLength(23);
    expect(renamedManager.machineRefs).toHaveLength(3);
    expect(inlineManager.machineRefs).toHaveLength(2);
    expect(managerRefs.get("directObjectMachine")).toBe("directObjectMachine");
    expect(managerRefs.get("actorTemplate")).toBe("actorTemplate");
    expect(renamedRefs.get("renamedImportMachine")).toBe("renamedImportMachine");
    expect(inlineRefs.get("inlineCreated")).toBe("inlineCreated");
    expect(inlineRefs.get("referenced")).toBe("directObjectMachine");
    expect(machineManagerKeys(result.document, "directObjectMachine")).toEqual(["directObjectMachine", "referenced"]);
    expect(machineManagerKeys(result.document, "actorTemplate")).toEqual(["actorTemplate"]);
    expect(machineManagerKeys(result.document, "inlineCreated")).toEqual(["inlineCreated"]);
    expect(result.document.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("LFG_UNRESOLVED_MANAGER_ENTRY");
  });
});

describe("ManagerLinker manager maps", () => {
  it("раскрывает local const map, spread, computed key, shorthand и inline calls", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine, MachineManager } from "@lite-fsm/core";

        export const first = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
        const second = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
        const computedKey = "computedSecond";
        const baseMachines = { first };
        const managerMachines = {
          ...baseMachines,
          [computedKey]: second,
          inline: (createMachine({ config: {}, initialState: "IDLE", initialContext: {} }) as const),
        };

        export const manager = MachineManager(managerMachines, {});
      `,
      { filename: "manager-map.ts" },
    );
    const manager = getManager(result.document, "manager");

    expect(machineIdByKey(manager)).toEqual(
      new Map([
        ["first", "first"],
        ["computedSecond", "second"],
        ["inline", "inline"],
      ]),
    );
    expect(machineManagerKeys(result.document, "first")).toEqual(["first"]);
    expect(machineManagerKeys(result.document, "second")).toEqual(["computedSecond"]);
    expect(machineManagerKeys(result.document, "inline")).toEqual(["inline"]);
  });

  it("сохраняет string/numeric keys, wrapped identifiers, duplicate refs и manager id suffixes", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine, MachineManager } from "@lite-fsm/core";

        const first = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
        const second = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
        const computed = "computed";
        const managerMachines = ({
          "string-key": (((first) as const) satisfies unknown),
          1: second,
          [computed]: first,
          duplicate: first,
          duplicate: first,
        } as const);

        export const manager = MachineManager(managerMachines, {});
        export const manager = MachineManager({ second }, {});
      `,
      { filename: "manager-wrapped-map.ts" },
    );

    expect(result.document.managers.map((manager) => manager.id)).toEqual(["manager", "manager:1"]);
    expect(result.document.managers[0]?.machineRefs.map((ref) => [ref.key, ref.machineId])).toEqual([
      ["string-key", "first"],
      ["1", "second"],
      ["computed", "first"],
      ["duplicate", "first"],
      ["duplicate", "first"],
    ]);
    expect(result.document.managers[1]?.machineRefs.map((ref) => [ref.key, ref.machineId])).toEqual([
      ["second", "second"],
    ]);
    expect(machineManagerKeys(result.document, "first")).toEqual(["string-key", "computed", "duplicate"]);
    expect(machineManagerKeys(result.document, "second")).toEqual(["1", "second"]);
    expect(diagnosticCodes(result.document)).toEqual([]);
  });

  it("не использует managerKey как machine id, когда ключ неоднозначен или у машины есть variableName", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine, MachineManager } from "@lite-fsm/core";

        const named = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });

        MachineManager({
          uniqueNamedKey: named,
          same: createMachine({ config: {}, initialState: "IDLE", initialContext: {} }),
          same: createMachine({ config: {}, initialState: "IDLE", initialContext: {} }),
          uniqueInlineKey: createMachine({ config: {}, initialState: "IDLE", initialContext: {} }),
        }, {});
      `,
      { filename: "manager-id-priority.ts" },
    );

    expect(result.document.machines.map((machine) => [machine.id, machine.managerKeys])).toEqual([
      ["named", ["uniqueNamedKey"]],
      ["machine:1", ["same"]],
      ["machine:2", ["same"]],
      ["uniqueInlineKey", ["uniqueInlineKey"]],
    ]);
  });

  it("возвращает diagnostics для неподдержанных manager maps и entries", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine, MachineManager } from "@lite-fsm/core";

        const first = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
        const alias = first;
        const badMap = {
          method() {},
          alias,
          helper: createMachineFactory(),
          nested: { value: first },
        };

        MachineManager();
        MachineManager(externalMachines);
        MachineManager(getMachines());
        MachineManager("bad");
        MachineManager({ ...externalMap });
        MachineManager(badMap);
      `,
      { filename: "bad-manager-map.ts" },
    );

    expect(result.document.managers).toHaveLength(6);
    expect(result.document.managers.flatMap((manager) => manager.machineRefs)).toEqual([]);
    expect(diagnosticCodes(result.document)).toEqual(
      expect.arrayContaining([
        "LFG_UNSUPPORTED_MANAGER_MAP",
        "LFG_UNRESOLVED_MANAGER_MAP",
        "LFG_DYNAMIC_MANAGER_MAP",
        "LFG_UNSUPPORTED_OBJECT_SPREAD",
        "LFG_UNSUPPORTED_MANAGER_ENTRY",
        "LFG_UNRESOLVED_MANAGER_ENTRY",
      ]),
    );
  });

  it("останавливает manager map на dynamic computed key и не линкует частичный object", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine, MachineManager } from "@lite-fsm/core";

        const first = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
        const dynamicKey = getKey();

        MachineManager({
          first,
          [dynamicKey]: first,
        }, {});
      `,
      { filename: "dynamic-manager-key.ts" },
    );

    expect(result.document.managers[0]?.machineRefs).toEqual([]);
    expect(diagnosticCodes(result.document)).toContain("LFG_UNSUPPORTED_DYNAMIC_KEY");
  });

  it("не создает refs на машины, исключенные через maxMachines", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine, MachineManager } from "@lite-fsm/core";

        const first = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
        const second = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });

        export const manager = MachineManager({ first, second }, {});
      `,
      { filename: "max-machines.ts", maxMachines: 1 },
    );
    const manager = getManager(result.document, "manager");

    expect(result.document.machines.map((machine) => machine.id)).toEqual(["first"]);
    expect(manager.machineRefs).toEqual([
      expect.objectContaining({
        key: "first",
        machineId: "first",
      }),
    ]);
    expect(diagnosticCodes(result.document)).toEqual(
      expect.arrayContaining(["LFG_MAX_MACHINES_REACHED", "LFG_UNRESOLVED_MANAGER_ENTRY"]),
    );
  });

  it("assembler отбрасывает refs без назначенного machineId", () => {
    const result = candidatesFrom(`
      import { createMachine, MachineManager } from "@lite-fsm/core";

      const first = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      const second = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      const manager = MachineManager({}, {});
    `);
    const [first, second] = result.machines as [MachineCandidate, MachineCandidate];
    const [manager] = result.managers;
    if (!manager) throw new Error("Expected manager candidate");

    const document = assembleGraphDocument({
      source: { filename: "manager-assembly.ts", language: "ts" },
      machineSlices: [
        {
          candidate: first,
          managerKeys: ["first"],
          diagnostics: [],
        },
      ],
      managerLinks: [
        {
          manager,
          refs: [
            { key: "first", machineCandidate: first },
            { key: "second", machineCandidate: second },
          ],
          diagnostics: [],
        },
      ],
    });

    expect(document.managers[0]?.machineRefs).toEqual([
      {
        key: "first",
        machineId: "first",
      },
    ]);
  });
});
