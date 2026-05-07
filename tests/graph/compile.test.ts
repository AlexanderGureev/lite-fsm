import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileLiteFsmGraph, type GraphDiagnostic } from "@lite-fsm/graph";
import { assembleGraphDocument } from "../../packages/graph/src/compiler/assembler";
import { createSourceCatalog } from "../../packages/graph/src/compiler/catalog";
import { discoverCandidates } from "../../packages/graph/src/compiler/candidates";
import { createSourceAdapter } from "../../packages/graph/src/compiler/source";

const fixturePath = fileURLToPath(new URL("../../xstate/graph-parser-fixtures.ts", import.meta.url));

describe("compileLiteFsmGraph", () => {
  it("возвращает пустой валидный document для пустой строки", () => {
    const result = compileLiteFsmGraph("");

    expect(result.document).toMatchObject({
      version: "lite-fsm.graph/v1",
      source: {
        language: "unknown",
      },
      machines: [],
      managers: [],
      diagnostics: [],
    });
    expect(result.diagnostics).toBe(result.document.diagnostics);
    expect(result.document.source.hash).toBe("811c9dc5");
  });

  it("читает основной fixture как строку", () => {
    const fixtureSource = readFileSync(fixturePath, "utf8");

    expect(fixtureSource).toContain("directObjectMachine");
    expect(fixtureSource).toContain("escapedTransitionMachine");
  });

  it("не падает на синтаксически неполном source и возвращает diagnostics", () => {
    const result = compileLiteFsmGraph("export const machine = createMachine({", { filename: "broken.ts" });

    expect(result.document.source.filename).toBe("broken.ts");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "LFG_SOURCE_PARSE_ERROR")).toBe(true);
  });

  it("возвращает compiler diagnostic вместо runtime throw при некорректном source value", () => {
    const result = compileLiteFsmGraph(null as unknown as string, { filename: "bad.ts" });

    expect(result.document).toMatchObject({
      source: {
        filename: "bad.ts",
        language: "ts",
      },
      machines: [],
      managers: [],
    });
    expect(result.document.source.hash).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_COMPILER_ERROR",
        severity: "error",
        message: "compileLiteFsmGraph source must be a string.",
      }),
    ]);
  });

  it("возвращает compiler diagnostic без options при некорректном source value", () => {
    const result = compileLiteFsmGraph(undefined as unknown as string);

    expect(result.document.source).toMatchObject({
      language: "unknown",
    });
    expect(result.diagnostics[0]).toMatchObject({
      code: "LFG_COMPILER_ERROR",
      message: "compileLiteFsmGraph source must be a string.",
    });
  });

  it("сохраняет source hash в compiler diagnostic при runtime ошибке options", () => {
    const maxMachines = {
      [Symbol.toPrimitive]() {
        throw "broken maxMachines";
      },
    } as unknown as number;

    const result = compileLiteFsmGraph("const value = 1;", { maxMachines });

    expect(result.document.source.hash).toBe("85037cf6");
    expect(result.diagnostics[0]).toMatchObject({
      code: "LFG_COMPILER_ERROR",
      message: "broken maxMachines",
    });
  });

  it("уважает filename/language/maxMachines и сохраняет diagnostics mirror", () => {
    const source = `
      import { createMachine } from "@lite-fsm/core";
      export const first = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      export const second = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
    `;
    const result = compileLiteFsmGraph(source, {
      filename: "snippet.ts",
      language: "tsx",
      parser: "static",
      maxMachines: 1,
    });

    expect(result.document.source).toMatchObject({
      filename: "snippet.ts",
      language: "tsx",
    });
    expect(result.document.machines.map((machine) => machine.id)).toEqual(["first"]);
    expect(result.document.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_MAX_MACHINES_REACHED",
        severity: "warning",
      }),
    ]);
    expect(result.diagnostics).toBe(result.document.diagnostics);
  });
});

describe("GraphAssembler", () => {
  it("собирает hand-written config-only slice со stable IDs", () => {
    const source = createSourceAdapter(
      `
        import { createMachine } from "@lite-fsm/core";
        export const flow = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      `,
      { filename: "flow.ts" },
    );
    const catalog = createSourceCatalog(source);
    const candidates = discoverCandidates(source, catalog);
    const candidate = candidates.machines[0];
    const diagnostic: GraphDiagnostic = {
      code: "LFG_TEST_DIAGNOSTIC",
      severity: "info",
      message: "Synthetic diagnostic",
    };

    const document = assembleGraphDocument({
      source: { filename: "flow.ts", language: "ts", hash: "test" },
      machineSlices: [
        {
          candidate,
          managerKeys: [],
          diagnostics: [diagnostic],
          config: {
            initialState: "IDLE",
            states: [{ key: "IDLE" }, { key: "READY" }],
            transitions: [
              {
                sourceKey: "IDLE",
                event: { type: "START", source: "config" },
                targetLabel: "READY",
              },
            ],
          },
        },
      ],
    });

    expect(document.machines).toHaveLength(1);
    expect(document.machines[0]?.id).toBe("flow");
    expect(document.machines[0]?.states.map((state) => state.id)).toEqual(["flow:state:IDLE", "flow:state:READY"]);
    expect(document.machines[0]?.transitions[0]).toMatchObject({
      id: "flow:transition:config:IDLE:START:READY:0",
      machineId: "flow",
      source: { kind: "state", stateId: "flow:state:IDLE" },
      target: { kind: "state", stateId: "flow:state:READY" },
    });
    expect(document.diagnostics).toEqual([diagnostic]);
  });
});
