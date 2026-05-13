import type {
  MachineFlowEdgeGroup,
  MachineFlowMachine,
  MachineFlowNode,
  MachineFlowProducerRef,
  MachineFlowRowRef,
} from "@lite-fsm/graph/view-model";
import { describe, expect, it, vi } from "vitest";
import type {
  MachineCanvasElkGraph,
  MachineCanvasLayoutEngine,
  MachineCanvasReadyFlow,
  MachineCanvasRenderEdge,
  MachineCanvasRenderNode,
} from "../../canvas/machine-canvas-render-types";
import {
  createMachineCanvasLayoutKeyFactory,
  machineCanvasGraphDisplayBadges,
  machineCanvasGraphEdgePath,
  machineCanvasGraphEventLabelsForGroup,
  machineCanvasGraphProducerLabel,
  machineCanvasGraphRowLabel,
  machineCanvasGraphSemanticNodeRef,
  scheduleMachineCanvasFitView,
  startMachineCanvasGraphLayout,
  type MachineCanvasGraphLayoutState,
  visibleMachineCanvasGraphLayoutState,
} from "./machine-canvas-graph-view";

const machine = (machineId = "player"): MachineFlowMachine => ({
  machineId,
  title: machineId,
  kind: "domain",
  sourceAnchors: [],
  badges: [],
  counters: { states: 0, transitions: 0, reducerBranches: 0, emissions: 0, diagnostics: 0 },
});

const flow = (machineId = "player"): MachineCanvasReadyFlow => ({
  status: "ready",
  machine: machine(machineId),
  nodes: [],
  edgeGroups: [],
});

const flowNode = (input: Partial<MachineFlowNode> = {}): MachineFlowNode => ({
  nodeId: input.nodeId ?? "node",
  ref: input.ref ?? { kind: "state", stateId: "state-id" },
  label: input.label ?? "node",
  role: input.role ?? "normal",
  badges: input.badges ?? [],
  sourceAnchors: [],
  diagnosticIds: [],
  stats: input.stats ?? { incoming: 0, outgoing: 0, selfLoops: 0, emissions: 0 },
});

const renderNode = (input: Partial<MachineCanvasRenderNode> = {}): MachineCanvasRenderNode => ({
  id: input.id ?? "node",
  flowNode: input.flowNode ?? flowNode(),
  label: input.label ?? "node",
  role: input.role ?? input.flowNode?.role ?? "normal",
  badges: input.badges ?? input.flowNode?.badges ?? [],
  stats: input.stats ?? { incoming: 0, outgoing: 0, selfLoops: 0, emissions: 0 },
  size: input.size ?? { width: 160, height: 70 },
  position: input.position ?? { x: 0, y: 0 },
  emissionGroups: input.emissionGroups ?? [],
});

const configRow = (eventType = "START"): MachineFlowRowRef => ({
  machineId: "player",
  rowId: `row:${eventType}`,
  rowKind: "config",
  eventType,
  targetLabel: "loading",
  guardLabel: "guard",
  sourceAnchors: [],
});

const effectRow = (eventType = "DONE"): MachineFlowRowRef => ({
  machineId: "player",
  rowId: `row:${eventType}:effect`,
  rowKind: "effect",
  eventType,
  sourceAnchors: [],
});

const diagnosticRow: MachineFlowRowRef = {
  rowId: "row:diagnostic",
  rowKind: "diagnostic",
  label: "bad branch",
  severity: "warning",
  sourceAnchors: [],
};

const producer = (input: Partial<MachineFlowProducerRef> = {}): MachineFlowProducerRef => ({
  machineId: input.machineId ?? "player",
  machineTitle: input.machineTitle ?? "player",
  emissionId: input.emissionId ?? "emit",
  eventType: input.eventType ?? "DONE",
  sourceStateKey: input.sourceStateKey ?? "loading",
  sourceAnchors: [],
  ...(input.routingLabel ? { routingLabel: input.routingLabel } : {}),
  ...(input.guardLabel ? { guardLabel: input.guardLabel } : {}),
  ...(input.confidence ? { confidence: input.confidence } : {}),
});

const edgeGroup = (input: Partial<MachineFlowEdgeGroup> = {}): MachineFlowEdgeGroup => ({
  groupId: input.groupId ?? "edge",
  sourceNodeId: input.sourceNodeId ?? "source",
  targetNodeId: input.targetNodeId ?? "target",
  direction: input.direction ?? "normal",
  kind: input.kind ?? "accepted-transition",
  layer: input.layer ?? "config",
  producerCategory: input.producerCategory ?? "external",
  label: input.label ?? "START",
  count: input.count ?? 1,
  rows: input.rows ?? [configRow()],
  producers: input.producers ?? [],
  sourceAnchors: [],
  diagnostics: [],
});

const renderEdge = (input: Partial<MachineCanvasRenderEdge> = {}): MachineCanvasRenderEdge => ({
  id: input.id ?? "edge",
  group: input.group ?? edgeGroup(),
  sourceNodeId: input.sourceNodeId ?? "source",
  targetNodeId: input.targetNodeId ?? "target",
  sourceLabel: input.sourceLabel ?? "source",
  targetLabel: input.targetLabel ?? "target",
  direction: input.direction ?? "normal",
  kind: input.kind ?? "accepted-transition",
  producerCategory: input.producerCategory ?? "external",
  label: input.label ?? "START",
  labelText: input.labelText ?? "START",
  count: input.count ?? 1,
  labelT: input.labelT ?? 0.5,
  ...(input.route ? { route: input.route } : {}),
  ...(input.selfIndex !== undefined ? { selfIndex: input.selfIndex } : {}),
  ...(input.selfTotal !== undefined ? { selfTotal: input.selfTotal } : {}),
  ...(input.nodeSize ? { nodeSize: input.nodeSize } : {}),
});

const emptyElkGraph = (): MachineCanvasElkGraph => ({
  id: "machine-canvas",
  layoutOptions: {},
  children: [],
  edges: [],
});

const readyLayoutState = (layoutKey: string): MachineCanvasGraphLayoutState => ({
  status: "ready",
  layoutKey,
  graph: {
    nodes: [],
    edges: [],
    density: "normal",
    visibleEdgeCount: 0,
  },
});

describe("machine canvas graph view helpers", () => {
  it("создает stable layout keys для новых и повторных flow refs", () => {
    const keyFor = createMachineCanvasLayoutKeyFactory();
    const firstFlow = flow("player");
    const secondFlow = flow("player");

    expect(keyFor(firstFlow, 1)).toBe("1:player:0");
    expect(keyFor(firstFlow, 2)).toBe("2:player:0");
    expect(keyFor(secondFlow, 1)).toBe("1:player:1");
  });

  it("выбирает visible layout state только для актуального layout key", () => {
    const state = readyLayoutState("current");

    expect(visibleMachineCanvasGraphLayoutState(state, "current")).toBe(state);
    expect(visibleMachineCanvasGraphLayoutState(state, "next")).toEqual({ status: "loading", layoutKey: "next" });
  });

  it("применяет completed layout state до cleanup", async () => {
    const engine: MachineCanvasLayoutEngine = {
      layout: vi.fn(async (graph) => graph),
    };
    const onLayoutState = vi.fn();

    startMachineCanvasGraphLayout({
      flow: flow(),
      engine,
      layoutKey: "layout:ready",
      onLayoutState,
    });

    await vi.waitFor(() => expect(onLayoutState).toHaveBeenCalledTimes(1));
    expect(onLayoutState).toHaveBeenCalledWith({
      status: "ready",
      layoutKey: "layout:ready",
      graph: {
        nodes: [],
        edges: [],
        density: "normal",
        visibleEdgeCount: 0,
      },
    });
  });

  it("игнорирует completed layout state после cleanup", async () => {
    let resolveLayout: ((graph: MachineCanvasElkGraph) => void) | undefined;
    const layoutPromise = new Promise<MachineCanvasElkGraph>((resolve) => {
      resolveLayout = resolve;
    });
    const engine: MachineCanvasLayoutEngine = {
      layout: vi.fn(() => layoutPromise),
    };
    const onLayoutState = vi.fn();
    const cleanup = startMachineCanvasGraphLayout({
      flow: flow(),
      engine,
      layoutKey: "layout:cancelled",
      onLayoutState,
    });

    cleanup();
    resolveLayout?.(emptyElkGraph());
    await layoutPromise;
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });

    expect(onLayoutState).not.toHaveBeenCalled();
  });

  it("мапит semantic refs и fallback badges для всех node ролей", () => {
    expect(machineCanvasGraphSemanticNodeRef(renderNode({ flowNode: flowNode({ ref: { kind: "state", stateId: "state-id" } }) }))).toBe(
      "state-id",
    );
    expect(
      machineCanvasGraphSemanticNodeRef(
        renderNode({ flowNode: flowNode({ ref: { kind: "synthetic-target", targetKind: "blocked" } }) }),
      ),
    ).toBe("blocked");
    expect(machineCanvasGraphSemanticNodeRef(renderNode({ flowNode: flowNode({ ref: { kind: "wildcard-effect" } }) }))).toBe(
      "wildcard-effect",
    );

    expect(machineCanvasGraphDisplayBadges(renderNode({ badges: [{ kind: "current", label: "current" }] }))).toEqual([
      { kind: "current", label: "current" },
    ]);
    expect(machineCanvasGraphDisplayBadges(renderNode({ role: "wildcard", badges: [] }))).toEqual([
      { kind: "wildcard", label: "any state" },
    ]);
    expect(machineCanvasGraphDisplayBadges(renderNode({ role: "effect-source", badges: [] }))).toEqual([
      { kind: "effect-source", label: "effect source" },
    ]);
    expect(machineCanvasGraphDisplayBadges(renderNode({ role: "synthetic", badges: [] }))).toEqual([
      { kind: "unknown", label: "target" },
    ]);
    expect(machineCanvasGraphDisplayBadges(renderNode({ role: "normal", badges: [] }))).toEqual([]);
  });

  it("форматирует event, producer и row metadata без fake fields", () => {
    expect(
      machineCanvasGraphEventLabelsForGroup(
        edgeGroup({
          label: "FALLBACK",
          rows: [configRow("START"), effectRow("DONE"), diagnosticRow],
          producers: [producer({ eventType: "DONE" }), producer({ eventType: "OTHER" })],
        }),
      ),
    ).toEqual(["START", "DONE", "OTHER"]);
    expect(machineCanvasGraphEventLabelsForGroup(edgeGroup({ label: "FALLBACK", rows: [], producers: [] }))).toEqual([
      "FALLBACK",
    ]);
    expect(machineCanvasGraphProducerLabel(producer({ routingLabel: "default", guardLabel: "ok" }))).toBe(
      "player.loading · default · ok",
    );
    expect(machineCanvasGraphProducerLabel(producer())).toBe("player.loading");
    expect(machineCanvasGraphRowLabel(configRow("START"))).toBe("config:START → loading · guard");
    expect(machineCanvasGraphRowLabel(effectRow("DONE"))).toBe("effect:DONE");
    expect(machineCanvasGraphRowLabel(diagnosticRow)).toBe("diagnostic:bad branch");
  });

	  it("строит edge paths для normal и self edges", () => {
	    expect(
	      machineCanvasGraphEdgePath({
	        edge: renderEdge({
          route: {
            start: { x: 0, y: 0 },
            bends: [{ x: 40, y: 0 }],
            end: { x: 40, y: 40 },
          },
        }),
        sourceX: 100,
        sourceY: 100,
      }),
    ).toEqual({
      path: "M 0 0 L 30 0 Q 40 0, 40 10 L 40 40",
      labelX: 40,
      labelY: 0,
    });
    expect(
      machineCanvasGraphEdgePath({
        edge: renderEdge({ direction: "self", nodeSize: { width: 160, height: 70 }, selfIndex: 1 }),
        sourceX: 260,
        sourceY: 135,
      }),
    ).toEqual({
      path: "M 165 100 C 165 50, 195 50, 195 100",
	        labelX: 180,
	        labelY: 40,
	      });
	    expect(
	      machineCanvasGraphEdgePath({
	        edge: renderEdge({ direction: "self" }),
	        sourceX: 260,
	        sourceY: 135,
	      }),
	    ).toEqual({
	      path: "M 172 100 C 172 72, 188 72, 188 100",
	      labelX: 180,
	      labelY: 62,
	    });
	  });

  it("планирует fit view и очищает оба timer-а", () => {
    vi.useFakeTimers();
    const fitView = vi.fn();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const cleanup = scheduleMachineCanvasFitView(fitView);

    vi.advanceTimersByTime(50);
    expect(fitView).toHaveBeenCalledWith({ padding: 0.2, duration: 0 });
    vi.advanceTimersByTime(230);
    expect(fitView).toHaveBeenCalledWith({ padding: 0.2, duration: 180 });

    cleanup();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);

    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });
});
