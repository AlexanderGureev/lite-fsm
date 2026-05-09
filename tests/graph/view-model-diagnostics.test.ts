import { describe, expect, it } from "vitest";
import {
  type GraphDiagnostic,
  type GraphState,
  type GraphTransition,
  type LiteFsmGraphDocument,
  type LiteFsmGraphMachine,
  type SourceLocation,
} from "@lite-fsm/graph";
import { buildGraphVisualizerModel } from "@lite-fsm/graph/view-model";

const loc = (offset: number): SourceLocation => ({
  start: { line: 1, column: offset + 1, offset },
  end: { line: 1, column: offset + 2, offset: offset + 1 },
});

const stateId = (machineId: string, key: string): string => `${machineId}:state:${key}`;

const state = (machineId: string, key: string, offset: number): GraphState => ({
  id: stateId(machineId, key),
  key,
  kind: "normal",
  isInitial: key === "idle",
  isPublicActorState: true,
  loc: loc(offset),
});

const transition = (machineId: string, source: string, event: string, offset: number): GraphTransition => ({
  id: `${machineId}:transition:config:${source}:${event}:0`,
  machineId,
  source: { kind: "state", stateId: stateId(machineId, source) },
  event: { type: event, source: "config" },
  target: { kind: "unknown", label: "MISSING" },
  layer: "config",
  order: 0,
  confidence: "unknown",
  loc: loc(offset),
});

const diagnostic = (input: {
  code: string;
  message: string;
  machineId?: string;
  offset?: number;
  severity?: GraphDiagnostic["severity"];
}): GraphDiagnostic => ({
  code: input.code,
  severity: input.severity ?? "warning",
  message: input.message,
  machineId: input.machineId,
  loc: input.offset === undefined ? undefined : loc(input.offset),
});

const diagnosticDocument = (): LiteFsmGraphDocument => {
  const flow: LiteFsmGraphMachine = {
    id: "flow",
    index: 0,
    variableName: "flow",
    managerKeys: [],
    kind: "domain",
    initialState: "idle",
    states: [state("flow", "idle", 10), state("flow", "done", 11)],
    transitions: [transition("flow", "idle", "GO", 20)],
    emissions: [],
    reducerCases: [],
    diagnostics: [],
    loc: loc(1),
  };

  return {
    version: "lite-fsm.graph/v1",
    source: { language: "ts", filename: "diagnostics.ts" },
    machines: [flow],
    managers: [{ id: "manager", variableName: "manager", machineRefs: [], loc: loc(30) }],
    diagnostics: [
      diagnostic({ code: "LFG_MACHINE", message: "machine level", machineId: "flow", offset: 1 }),
      diagnostic({ code: "LFG_STATE", message: "state level", machineId: "flow", offset: 10 }),
      diagnostic({ code: "LFG_TRANSITION", message: "transition level", machineId: "flow", offset: 20 }),
      diagnostic({ code: "LFG_NO_LOC", message: "machine fallback without loc", machineId: "flow" }),
      diagnostic({ code: "LFG_DOCUMENT", message: "document level without loc" }),
    ],
  };
};

describe("@lite-fsm/graph/view-model diagnostics", () => {
  it("нормализует compiler/analyzer diagnostics и source anchors", () => {
    const model = buildGraphVisualizerModel(diagnosticDocument(), {
      analysisDiagnostics: [
        diagnostic({
          code: "LFG_ANALYZER_UNKNOWN_TARGET",
          message: "unknown target",
          machineId: "flow",
          offset: 20,
          severity: "error",
        }),
      ],
    });

    expect(
      model.diagnostics.map((item) => ({
        origin: item.origin,
        code: item.diagnostic.code,
        graphItemRef: item.graphItemRef,
        hasSourceAnchor: Boolean(item.sourceAnchor),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "code": "LFG_MACHINE",
          "graphItemRef": {
            "kind": "machine",
            "machineId": "flow",
          },
          "hasSourceAnchor": true,
          "origin": "compiler",
        },
        {
          "code": "LFG_STATE",
          "graphItemRef": {
            "kind": "state",
            "machineId": "flow",
            "stateId": "flow:state:idle",
          },
          "hasSourceAnchor": true,
          "origin": "compiler",
        },
        {
          "code": "LFG_TRANSITION",
          "graphItemRef": {
            "kind": "transition",
            "machineId": "flow",
            "transitionId": "flow:transition:config:idle:GO:0",
          },
          "hasSourceAnchor": true,
          "origin": "compiler",
        },
        {
          "code": "LFG_NO_LOC",
          "graphItemRef": {
            "kind": "machine",
            "machineId": "flow",
          },
          "hasSourceAnchor": false,
          "origin": "compiler",
        },
        {
          "code": "LFG_DOCUMENT",
          "graphItemRef": undefined,
          "hasSourceAnchor": false,
          "origin": "compiler",
        },
        {
          "code": "LFG_ANALYZER_UNKNOWN_TARGET",
          "graphItemRef": {
            "kind": "transition",
            "machineId": "flow",
            "transitionId": "flow:transition:config:idle:GO:0",
          },
          "hasSourceAnchor": true,
          "origin": "analyzer",
        },
      ]
    `);
    expect(model.machines[0]?.diagnosticIds).toHaveLength(5);
    expect(model.topics.find((topic) => topic.eventType === "GO")?.diagnosticIds).toHaveLength(2);
    expect(
      model.workbenchMachines.flow?.states.map((stateBlock) => ({
        stateKey: stateBlock.stateKey,
        diagnosticIds: stateBlock.diagnosticIds.length,
        diagnosticRows: stateBlock.rows.filter((row) => row.kind === "diagnostic").length,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "diagnosticIds": 3,
          "diagnosticRows": 3,
          "stateKey": "idle",
        },
        {
          "diagnosticIds": 0,
          "diagnosticRows": 0,
          "stateKey": "done",
        },
      ]
    `);
    expect(model.workbenchMachines.flow?.globalBehavior.filter((row) => row.kind === "diagnostic")).toHaveLength(2);
  });
});
