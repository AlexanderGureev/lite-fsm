import type {
  MachineFlowEdgeGroup,
  MachineFlowMachine,
  MachineFlowModel,
  MachineFlowNode,
  MachineFlowRowRef,
} from "@lite-fsm/graph/view-model";
import { describe, expect, it, vi } from "vitest";
import {
  applyMachineCanvasElkLayout,
  buildMachineCanvasRenderDraft,
  createMachineCanvasElkGraph,
  layoutMachineCanvas,
} from "./layout-machine-canvas";
import type { MachineCanvasElkGraph, MachineCanvasReadyFlow } from "./machine-canvas-render-types";

const emptyMachine: MachineFlowMachine = {
  machineId: "player",
  title: "player",
  kind: "domain",
  initialState: "idle",
  sourceAnchors: [],
  badges: [],
  counters: { states: 4, transitions: 3, reducerBranches: 0, emissions: 1, diagnostics: 0 },
};

const node = (input: Partial<MachineFlowNode> & Pick<MachineFlowNode, "nodeId" | "label">): MachineFlowNode => ({
  nodeId: input.nodeId,
  ref: input.ref ?? { kind: "state", stateId: input.nodeId },
  label: input.label,
  role: input.role ?? "normal",
  badges: input.badges ?? [],
  sourceAnchors: [],
  diagnosticIds: [],
  stats: input.stats ?? { incoming: 0, outgoing: 0, selfLoops: 0, emissions: 0 },
});

const row = (eventType: string, targetLabel = "target"): MachineFlowRowRef => ({
  machineId: "player",
  rowId: `row:${eventType}`,
  rowKind: "config",
  sourceStateKey: "idle",
  eventType,
  targetLabel,
  sourceAnchors: [],
});

const edge = (input: Partial<MachineFlowEdgeGroup> & Pick<MachineFlowEdgeGroup, "groupId" | "sourceNodeId">): MachineFlowEdgeGroup => ({
  groupId: input.groupId,
  sourceNodeId: input.sourceNodeId,
  targetNodeId: input.targetNodeId,
  direction: input.direction ?? "normal",
  kind: input.kind ?? "accepted-transition",
  layer: input.layer ?? "config",
  producerCategory: input.producerCategory ?? "external",
  label: input.label ?? "START",
  count: input.count ?? 1,
  rows: input.rows ?? [row(input.label ?? "START", input.targetNodeId ?? "target")],
  producers: input.producers ?? [],
  sourceAnchors: [],
  diagnostics: [],
});

const flowFixture = (): MachineCanvasReadyFlow => ({
  status: "ready",
  machine: emptyMachine,
  nodes: [
    node({ nodeId: "idle", label: "idle", role: "initial", stats: { incoming: 1, outgoing: 3, selfLoops: 1, emissions: 0 } }),
    node({ nodeId: "loading", label: "loading", role: "effect-source", stats: { incoming: 2, outgoing: 1, selfLoops: 0, emissions: 1 } }),
    node({ nodeId: "done", label: "done", role: "terminal", stats: { incoming: 2, outgoing: 0, selfLoops: 0, emissions: 0 } }),
    node({ nodeId: "any", label: "*", role: "wildcard", ref: { kind: "wildcard-state" } }),
  ],
  edgeGroups: [
    edge({ groupId: "edge:start", sourceNodeId: "idle", targetNodeId: "loading", label: "START" }),
    edge({ groupId: "edge:retry", sourceNodeId: "idle", targetNodeId: "loading", label: "RETRY", count: 2 }),
    edge({ groupId: "edge:self", sourceNodeId: "idle", targetNodeId: "idle", direction: "self", label: "TICK" }),
    edge({ groupId: "edge:emit", sourceNodeId: "loading", kind: "emission-only", label: "DONE", count: 1, targetNodeId: undefined }),
    edge({ groupId: "edge:ghost", sourceNodeId: "ghost", targetNodeId: "missing", label: "MISS" }),
  ],
});

const positionedGraph = (draftGraph: MachineCanvasElkGraph): MachineCanvasElkGraph => ({
  ...draftGraph,
  children: draftGraph.children.map((child, index) => ({
    ...child,
    x: index * 240,
    y: index * 80,
  })),
  edges: draftGraph.edges.map((layoutEdge) =>
    layoutEdge.id === "edge:start"
      ? {
          ...layoutEdge,
          sections: [
            {
              startPoint: { x: 160, y: 35 },
              bendPoints: [{ x: 220, y: 35 }],
              endPoint: { x: 240, y: 115 },
            },
          ],
        }
      : layoutEdge.id === "edge:retry"
        ? {
            ...layoutEdge,
            sections: [
              {
                startPoint: { x: 160, y: 44 },
                endPoint: { x: 240, y: 115 },
              },
            ],
          }
      : layoutEdge,
  ),
});

describe("раскладка для machine canvas", () => {
  it("строит render draft, sibling label t и emission chips без transition edge", () => {
    const draft = buildMachineCanvasRenderDraft(flowFixture());

    expect(draft.nodes).toHaveLength(4);
    expect(draft.nodes.find((draftNode) => draftNode.id === "loading")?.emissionGroups.map((group) => group.groupId)).toEqual([
      "edge:emit",
    ]);
    expect(draft.emissionOnlyGroups.map((group) => group.groupId)).toEqual(["edge:emit"]);
    expect(draft.edges.map((draftEdge) => draftEdge.id)).toEqual(["edge:start", "edge:retry", "edge:self", "edge:ghost"]);
    expect(draft.edges.map((draftEdge) => Number(draftEdge.labelT.toFixed(2)))).toEqual([0.32, 0.68, 0.5, 0.5]);
    expect(draft.edges[1].labelText).toBe("RETRY +1");
    expect(draft.edges[3].sourceLabel).toBe("ghost");
    expect(draft.edges[3].targetLabel).toBe("missing");
    expect(draft.visibleEdgeCount).toBe(4);
    expect(draft.density).toBe("normal");
  });

  it("создает ELK graph только для non-self transition edges", () => {
    const elkGraph = createMachineCanvasElkGraph(buildMachineCanvasRenderDraft(flowFixture()));

    expect(elkGraph.layoutOptions["elk.algorithm"]).toBe("layered");
    expect(elkGraph.children.map((child) => child.id)).toEqual(["idle", "loading", "done", "any"]);
    expect(elkGraph.edges.map((layoutEdge) => layoutEdge.id)).toEqual(["edge:start", "edge:retry", "edge:ghost"]);
  });

  it("применяет ELK positions, routes, self-loop metadata и fallback route", () => {
    const draft = buildMachineCanvasRenderDraft(flowFixture());
    const graph = applyMachineCanvasElkLayout(draft, positionedGraph(createMachineCanvasElkGraph(draft)));

    expect(graph.nodes[1].position).toEqual({ x: 240, y: 80 });
    expect(graph.edges.find((layoutEdge) => layoutEdge.id === "edge:start")?.route).toEqual({
      start: { x: 160, y: 35 },
      bends: [{ x: 220, y: 35 }],
      end: { x: 240, y: 115 },
    });
    expect(graph.edges.find((layoutEdge) => layoutEdge.id === "edge:self")).toMatchObject({
      selfIndex: 0,
      selfTotal: 1,
      nodeSize: { width: 160, height: 88 },
    });
    expect(graph.edges.find((layoutEdge) => layoutEdge.id === "edge:retry")?.route).toEqual({
      start: { x: 160, y: 44 },
      bends: [],
      end: { x: 240, y: 115 },
    });
    expect(graph.edges.find((layoutEdge) => layoutEdge.id === "edge:ghost")?.route).toEqual({
      start: { x: 0, y: 0 },
      bends: [],
      end: { x: 0, y: 0 },
    });

    const graphWithMissingPositions = applyMachineCanvasElkLayout(draft, {
      ...createMachineCanvasElkGraph(draft),
      children: createMachineCanvasElkGraph(draft).children.map((child) => ({ ...child, x: undefined, y: undefined })),
      edges: [],
    });
    expect(graphWithMissingPositions.nodes[0].position).toEqual({ x: 0, y: 0 });

    const graphWithMissingChild = applyMachineCanvasElkLayout(draft, {
      ...createMachineCanvasElkGraph(draft),
      children: createMachineCanvasElkGraph(draft).children.slice(1),
      edges: [],
    });
    expect(graphWithMissingChild.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("возвращает success и controlled layout failure", async () => {
    const flow = flowFixture();
    const successEngine = {
      layout: vi.fn(async (graph: MachineCanvasElkGraph) => positionedGraph(graph)),
    };
    const success = await layoutMachineCanvas(flow, successEngine);

    expect(success.status).toBe("ready");
    expect(successEngine.layout).toHaveBeenCalledOnce();

    const failed = await layoutMachineCanvas(flow, {
      layout: async () => {
        throw new Error("elk failed");
      },
    });
    const unknownFailure = await layoutMachineCanvas(flow, {
      layout: async () => {
        throw "elk failed";
      },
    });

    expect(failed).toEqual({ status: "layout-error", message: "elk failed" });
    expect(unknownFailure).toEqual({ status: "layout-error", message: "Machine canvas layout failed." });
  });

  it("сохраняет MachineFlow ready shape без изменения public graph model", () => {
    const model: MachineFlowModel = flowFixture();

    expect(model.status).toBe("ready");
    if (model.status !== "ready") return;

    expect(buildMachineCanvasRenderDraft(model).nodes[0].flowNode.nodeId).toBe("idle");
  });
});
