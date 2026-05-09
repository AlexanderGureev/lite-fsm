import { describe, expect, it } from "vitest";
import {
  type GraphEmission,
  type GraphState,
  type GraphTransition,
  type LiteFsmGraphDocument,
  type LiteFsmGraphMachine,
} from "@lite-fsm/graph";
import { buildGraphVisualizerModel } from "@lite-fsm/graph/view-model";

const stateId = (machineId: string, key: string): string => `${machineId}:state:${key}`;

const state = (machineId: string, key: string): GraphState => ({
  id: stateId(machineId, key),
  key,
  kind: "normal",
  isInitial: key === "idle",
  isPublicActorState: true,
});

const configTransition = (event: string, source = "idle", target = "ready", id?: string): GraphTransition => ({
  id: id ?? `flow:transition:config:${source}:${event}:0`,
  machineId: "flow",
  source: { kind: "state", stateId: stateId("flow", source) },
  event: { type: event, source: "config" },
  target: { kind: "state", stateId: stateId("flow", target) },
  layer: "config",
  order: 0,
  confidence: "exact",
});

const reducerTransition = (event: string, target = "ready", order = 0): GraphTransition => ({
  id: `flow:transition:reducer:idle:${event}:${order}`,
  machineId: "flow",
  source: { kind: "state", stateId: stateId("flow", "idle") },
  event: { type: event, source: "reducer" },
  target: { kind: "state", stateId: stateId("flow", target) },
  layer: "reducer",
  order,
  confidence: "exact",
});

const effectEmission = (source = "ready"): GraphEmission => ({
  id: `flow:emission:${source}:DONE`,
  machineId: "flow",
  sourceState: { kind: "state", stateId: stateId("flow", source) },
  event: { type: "DONE", source: "effect" },
  routing: { kind: "default" },
  origin: "effect",
  confidence: "exact",
});

const simulationDocument = (transitions?: GraphTransition[]): LiteFsmGraphDocument => {
  const flow: LiteFsmGraphMachine = {
    id: "flow",
    index: 0,
    variableName: "flow",
    managerKeys: [],
    kind: "domain",
    initialState: "idle",
    states: [state("flow", "idle"), state("flow", "ready"), state("flow", "done")],
    transitions:
      transitions ?? [
        configTransition("GO"),
        reducerTransition("GO"),
        reducerTransition("GO", "done", 1),
        configTransition("RESET", "ready", "idle"),
      ],
    emissions: [effectEmission()],
    reducerCases: [],
    diagnostics: [],
  };

  return {
    version: "lite-fsm.graph/v1",
    source: { language: "ts" },
    machines: [flow],
    managers: [],
    diagnostics: [],
  };
};

const simulationRows = (document: LiteFsmGraphDocument) => {
  const model = buildGraphVisualizerModel(document, {
    simulation: {
      currentStateIdsBySliceId: {
        "domain:flow": stateId("flow", "idle"),
        "actor:flow:a": stateId("flow", "ready"),
      },
      availableTransitionIdsBySliceId: {
        "domain:flow": ["flow:transition:reducer:idle:GO:1"],
      },
      suggestedEmissionIdsBySliceId: {
        "domain:flow": ["flow:emission:ready:DONE"],
      },
      availableTransitionIdsByMachineId: {
        flow: ["flow:transition:config:ready:RESET:0"],
      },
      suggestedEmissionIdsByMachineId: {
        flow: ["flow:emission:ready:DONE"],
      },
      firedRefs: [{ kind: "transition", machineId: "flow", transitionId: "flow:transition:reducer:idle:GO:0", sliceId: "domain:flow" }],
      inspectedRefs: [{ kind: "emission", machineId: "flow", emissionId: "flow:emission:ready:DONE", sliceId: "domain:flow" }],
      recentlyFiredRowIds: ["reducer:flow:transition:reducer:idle:GO:1"],
      inspectedRowIds: ["config:flow:transition:config:ready:RESET:0"],
    },
  });
  const workbench = model.workbenchMachines.flow;
  if (!workbench) throw new Error("Missing workbench");

  return {
    currentStateId: workbench.currentStateId,
    states: workbench.states.map((stateBlock) => ({
      stateKey: stateBlock.stateKey,
      current: stateBlock.current,
      rows: stateBlock.rows.map((row) => ({
        kind: row.kind,
        rowId: row.rowId,
        simulation: "simulation" in row ? row.simulation : undefined,
        dispatchability: row.kind === "effect" ? row.dispatchability : undefined,
      })),
    })),
    mappings: {
      folded: model.rowMappings.transitionRowIdsByMachineAndTransitionId["flow:flow:transition:reducer:idle:GO:0"],
      expanded: model.rowMappings.transitionRowIdsByMachineAndTransitionId["flow:flow:transition:reducer:idle:GO:1"],
      effect: model.rowMappings.emissionRowIdsByMachineAndEmissionId["flow:flow:emission:ready:DONE"],
      diagnostics: model.rowMappings.diagnostics,
    },
  };
};

describe("@lite-fsm/graph/view-model simulation overlay", () => {
  it("проставляет slice-level overlay flags и canonical row mapping", () => {
    expect(simulationRows(simulationDocument())).toMatchInlineSnapshot(`
      {
        "currentStateId": undefined,
        "mappings": {
          "diagnostics": [],
          "effect": [
            "effect:flow:emission:ready:DONE",
          ],
          "expanded": [
            "reducer:flow:transition:reducer:idle:GO:1",
          ],
          "folded": [
            "config:flow:transition:config:idle:GO:0",
          ],
        },
        "states": [
          {
            "current": true,
            "rows": [
              {
                "dispatchability": undefined,
                "kind": "config",
                "rowId": "config:flow:transition:config:idle:GO:0",
                "simulation": {
                  "recentlyFired": true,
                },
              },
              {
                "dispatchability": undefined,
                "kind": "reducer",
                "rowId": "reducer:flow:transition:reducer:idle:GO:1",
                "simulation": {
                  "available": true,
                  "recentlyFired": true,
                },
              },
            ],
            "stateKey": "idle",
          },
          {
            "current": true,
            "rows": [
              {
                "dispatchability": undefined,
                "kind": "config",
                "rowId": "config:flow:transition:config:ready:RESET:0",
                "simulation": {
                  "inspected": true,
                },
              },
              {
                "dispatchability": "can-dispatch",
                "kind": "effect",
                "rowId": "effect:flow:emission:ready:DONE",
                "simulation": {
                  "inspected": true,
                  "suggested": true,
                },
              },
            ],
            "stateKey": "ready",
          },
          {
            "current": false,
            "rows": [],
            "stateKey": "done",
          },
        ],
      }
    `);
  });

  it("показывает no-match и ambiguous mapping diagnostics", () => {
    const duplicateId = "flow:transition:config:duplicate";
    const document = simulationDocument([
      configTransition("A", "idle", "ready", duplicateId),
      configTransition("B", "ready", "done", duplicateId),
    ]);
    const model = buildGraphVisualizerModel(document, {
      simulation: {
        firedRefs: [
          { kind: "transition", machineId: "flow", transitionId: duplicateId },
          { kind: "transition", machineId: "flow", transitionId: "missing-transition" },
          { kind: "emission", machineId: "flow", emissionId: "missing" },
        ],
      },
    });

    expect(model.rowMappings.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.rowIds])).toEqual([
      [
        "LFG_VIEW_MODEL_ROW_REF_AMBIGUOUS",
        ["config:flow:transition:config:duplicate", "config:flow:transition:config:duplicate"],
      ],
      ["LFG_VIEW_MODEL_ROW_REF_NO_MATCH", []],
      ["LFG_VIEW_MODEL_ROW_REF_NO_MATCH", []],
    ]);
  });
});
