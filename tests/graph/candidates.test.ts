import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileLiteFsmGraph } from "@lite-fsm/graph";
import { createSourceCatalog } from "../../packages/graph/src/compiler/catalog";
import { discoverCandidates } from "../../packages/graph/src/compiler/candidates";
import { createSourceAdapter } from "../../packages/graph/src/compiler/source";

const fixturePath = fileURLToPath(new URL("../../xstate/graph-parser-fixtures.ts", import.meta.url));

const discover = (sourceText: string) => {
  const source = createSourceAdapter(sourceText, { filename: "input.ts" });
  const catalog = createSourceCatalog(source);

  return discoverCandidates(source, catalog);
};

describe("CandidateDiscovery", () => {
  it("находит все machine и manager candidates из fixture", () => {
    const fixtureSource = readFileSync(fixturePath, "utf8");
    const result = discover(fixtureSource);
    const inlineMachine = result.machines.find((candidate) => candidate.managerKeys.includes("inlineCreated"));

    expect(result.machines).toHaveLength(28);
    expect(result.managers).toHaveLength(3);
    expect(result.machines.map((candidate) => candidate.exportName)).toContain("renamedImportMachine");
    expect(result.machines.some((candidate) => candidate.exportName === "default" && candidate.isDefaultExport)).toBe(
      true,
    );
    expect(inlineMachine).toMatchObject({
      managerKeys: ["inlineCreated"],
    });
    expect(inlineMachine?.variableName).toBeUndefined();
    expect(result.managers.map((candidate) => candidate.exportName)).toEqual(["manager", "renamedManager", "inlineManager"]);
  });

  it("возвращает machines из compileLiteFsmGraph с config transitions для поддержанных configs", () => {
    const fixtureSource = readFileSync(fixturePath, "utf8");
    const result = compileLiteFsmGraph(fixtureSource, { filename: fixturePath });
    const directObjectMachine = result.document.machines.find((machine) => machine.id === "directObjectMachine");
    const unresolvedConfigMachine = result.document.machines.find((machine) => machine.id === "unresolvedConfigMachine");

    expect(result.document.machines).toHaveLength(28);
    expect(result.document.managers).toHaveLength(3);
    expect(directObjectMachine?.transitions.map((transition) => transition.event.type)).toEqual([
      "START",
      "PATCH",
      "FINISH",
    ]);
    expect(unresolvedConfigMachine?.transitions).toEqual([]);
  });

  it("распознает ambient createMachine только с shape guard", () => {
    const source = `
      const config = {};
      const initialState = "IDLE";
      const initialContext = {};
      const machine = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
      });

      createMachine(({ config: {}, initialState: "IDLE", initialContext: {} } as const));
      createMachine({ config, initialState, initialContext });
      createMachine();
      createMachine("not a machine");
      createMachine({ config() {}, initialState: "IDLE", initialContext: {} });
      createMachine({ [config]: {}, initialState: "IDLE", initialContext: {} });
    `;

    expect(discover(source).machines).toHaveLength(3);
  });

  it("не распознает lookalike import из другого module", () => {
    const source = `
      import { createMachine } from "other";
      export const machine = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
      });
    `;

    expect(discover(source).machines).toHaveLength(0);
  });

  it("не распознает alias chains без import provenance", () => {
    const source = `
      const makeMachine = createMachine;
      export const machine = makeMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
      });
    `;

    expect(discover(source).machines).toHaveLength(0);
  });

  it("распознает imported aliases, default export, renamed manager и inline manager keys", () => {
    const source = `
      import {
        createMachine as makeMachine,
        MachineManager as MakeManager,
      } from "@lite-fsm/core";

      const localMachine = makeMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      export default makeMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      export const manager = MakeManager({
        inlineIdentifier: makeMachine({ config: {}, initialState: "IDLE", initialContext: {} }),
        "inline-string": makeMachine({ config: {}, initialState: "IDLE", initialContext: {} }),
        1: makeMachine({ config: {}, initialState: "IDLE", initialContext: {} }),
        [dynamicKey]: makeMachine({ config: {}, initialState: "IDLE", initialContext: {} }),
        shorthand,
      });
    `;
    const result = discover(source);

    expect(result.managers).toEqual([
      expect.objectContaining({
        exportName: "manager",
        provenance: "import",
      }),
    ]);
    expect(result.machines.map((candidate) => candidate.managerKeys)).toEqual([
      [],
      [],
      ["inlineIdentifier"],
      ["inline-string"],
      ["1"],
      [],
    ]);
    expect(result.machines[0]).toMatchObject({ variableName: "localMachine", provenance: "import" });
    expect(result.machines[1]).toMatchObject({ exportName: "default", isDefaultExport: true });
  });

  it("игнорирует unsupported manager object entries и manager calls без object argument", () => {
    const source = `
      import { MachineManager } from "@lite-fsm/core";

      MachineManager();
      MachineManager({
        referenced,
        nonCall: referenced,
        helperCall: helper(),
        badAmbient: createMachine("bad"),
      });
    `;
    const result = discover(source);

    expect(result.managers).toHaveLength(2);
    expect(result.machines).toHaveLength(0);
  });

  it("не присваивает variableName вложенному createMachine в чужом initializer", () => {
    const source = `
      import { createMachine } from "@lite-fsm/core";

      const registered = register(createMachine({
        config: {},
        initialState: "IDLE",
        initialContext: {},
      }));
    `;

    expect(discover(source).machines).toEqual([
      expect.objectContaining({
        variableName: undefined,
        exportName: undefined,
      }),
    ]);
  });

  it("не присваивает variableName для destructuring assignment", () => {
    const source = `
      import { createMachine } from "@lite-fsm/core";

      const { machine } = createMachine({
        config: {},
        initialState: "IDLE",
        initialContext: {},
      });
    `;

    expect(discover(source).machines).toEqual([
      expect.objectContaining({
        variableName: undefined,
        exportName: undefined,
      }),
    ]);
  });

  it("type-only imports не блокируют ambient snippets, а local value bindings блокируют", () => {
    const source = `
      import type { createMachine } from "@lite-fsm/core";

      const ambientMachine = createMachine({
        config: {},
        initialState: "IDLE",
        initialContext: {},
      });

      function MachineManager() {}
      MachineManager({});
    `;
    const result = discover(source);

    expect(result.machines).toEqual([expect.objectContaining({ variableName: "ambientMachine", provenance: "ambient" })]);
    expect(result.managers).toEqual([]);
  });

  it("не распознает member calls как API calls", () => {
    const source = `
      import * as core from "@lite-fsm/core";

      core.createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      core.MachineManager({});
    `;

    expect(discover(source)).toEqual({ machines: [], managers: [] });
  });

  it("не распознает default/namespace imports и параметры как ambient API", () => {
    const source = `
      import createMachine from "other";
      import * as core from "other";

      createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      core.createMachine({ config: {}, initialState: "IDLE", initialContext: {} });

      function run(MachineManager) {
        MachineManager({});
      }
    `;

    expect(discover(source)).toEqual({ machines: [], managers: [] });
  });
});
