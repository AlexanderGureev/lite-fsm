import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  MachineFlowEdgeGroup,
  MachineFlowMachine,
  MachineFlowNode,
  MachineFlowProducerRef,
  MachineFlowRowRef,
} from "@lite-fsm/graph/view-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VISUALIZER_TEST_IDS } from "../../test-ids";
import type { MachineCanvasElkGraph, MachineCanvasReadyFlow } from "../../canvas/machine-canvas-render-types";
import { MachineCanvasGraph } from "./MachineCanvasGraph";

type ReactFlowMockNode = {
  id: string;
  type?: string;
  data: unknown;
};

type ReactFlowMockEdge = {
  id: string;
  type?: string;
  source: string;
  target: string;
  data?: unknown;
  markerEnd?: unknown;
};

type ReactFlowMockProps = {
  nodes: readonly ReactFlowMockNode[];
  edges: readonly ReactFlowMockEdge[];
  nodesDraggable?: boolean;
  nodesConnectable?: boolean;
  elementsSelectable?: boolean;
  fitView?: boolean;
  minZoom?: number;
  maxZoom?: number;
  nodeTypes: Record<string, (props: { data: unknown }) => ReactNode>;
  edgeTypes: Record<
    string,
    (props: {
      id: string;
      source: string;
      target: string;
      sourceX: number;
      sourceY: number;
      targetX: number;
      targetY: number;
      data?: unknown;
      markerEnd?: unknown;
    }) => ReactNode
  >;
  children?: ReactNode;
};

const elkMock = vi.hoisted(() => ({
  layout: vi.fn<(graph: MachineCanvasElkGraph) => Promise<MachineCanvasElkGraph>>(),
}));
const reactFlowMock = vi.hoisted(() => ({
  fitView: vi.fn(),
}));

vi.mock("elkjs", () => ({
  default: vi.fn(function ElkMock() {
    return { layout: elkMock.layout };
  }),
}));

vi.mock("@xyflow/react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    BackgroundVariant: { Dots: "dots" },
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Left: "left", Right: "right" },
    ReactFlowProvider: ({ children }: { children?: ReactNode }) =>
      React.createElement("div", { "data-react-flow-provider": "true" }, children),
    ReactFlow: ({
      nodes,
      edges,
      nodesDraggable,
      nodesConnectable,
      elementsSelectable,
      fitView,
      minZoom,
      maxZoom,
      nodeTypes,
      edgeTypes,
      children,
    }: ReactFlowMockProps) =>
      React.createElement(
        "div",
        {
          className: "react-flow",
          "data-nodes-draggable": String(nodesDraggable),
          "data-nodes-connectable": String(nodesConnectable),
          "data-elements-selectable": String(elementsSelectable),
          "data-fit-view": String(fitView),
          "data-min-zoom": String(minZoom),
          "data-max-zoom": String(maxZoom),
        },
        nodes.map((node) => {
          const NodeComponent = nodeTypes[node.type ?? ""];
          return React.createElement("div", { key: node.id }, NodeComponent({ data: node.data }));
        }),
        edges.map((edge, index) => {
          const EdgeComponent = edgeTypes[edge.type ?? ""];
          return React.createElement(
            "div",
            { key: edge.id },
            EdgeComponent({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              sourceX: 260,
              sourceY: 135 + index * 40,
              targetX: 520,
              targetY: 135 + index * 40,
              data: edge.data,
              markerEnd: edge.markerEnd,
            }),
          );
        }),
        children,
      ),
    Background: () => React.createElement("div", { "data-testid": "react-flow-background" }),
    Controls: ({ showInteractive }: { showInteractive?: boolean }) =>
      React.createElement(
        "div",
        { className: "react-flow__controls", "data-show-interactive": String(showInteractive) },
        React.createElement("button", { type: "button", "aria-label": "zoom in", className: "react-flow__controls-button" }),
        React.createElement("button", { type: "button", "aria-label": "zoom out", className: "react-flow__controls-button" }),
      ),
    BaseEdge: ({ path }: { path: string }) => React.createElement("svg", null, React.createElement("path", { "data-edge-path": path })),
    EdgeLabelRenderer: ({ children }: { children?: ReactNode }) => React.createElement(React.Fragment, null, children),
    Handle: ({ type, position }: { type: string; position: string }) =>
      React.createElement("span", { "data-handle-type": type, "data-handle-position": position }),
    useReactFlow: () => ({ fitView: reactFlowMock.fitView }),
  };
});

const ids = VISUALIZER_TEST_IDS;

const machine: MachineFlowMachine = {
  machineId: "player",
  title: "player",
  kind: "domain",
  initialState: "idle",
  currentStateKey: "playing",
  sourceAnchors: [],
  badges: [],
  counters: { states: 4, transitions: 4, reducerBranches: 0, emissions: 1, diagnostics: 0 },
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

const producer: MachineFlowProducerRef = {
  machineId: "player",
  machineTitle: "player",
  emissionId: "emit:done",
  eventType: "DONE",
  sourceStateKey: "loading",
  routingLabel: "default",
  guardLabel: "ok",
  confidence: "exact",
  sourceAnchors: [],
};

const transitionRow = (eventType: string, targetLabel: string): MachineFlowRowRef => ({
  machineId: "player",
  rowId: `row:${eventType}`,
  rowKind: "config",
  eventType,
  targetLabel,
  guardLabel: "guard",
  sourceAnchors: [],
});

const effectRow: MachineFlowRowRef = {
  machineId: "player",
  rowId: "row:DONE:effect",
  rowKind: "effect",
  eventType: "DONE",
  routingLabel: "default",
  guardLabel: "ok",
  sourceAnchors: [],
};

const diagnosticRow: MachineFlowRowRef = {
  rowId: "row:diagnostic",
  rowKind: "diagnostic",
  label: "escaped transition",
  severity: "warning",
  sourceAnchors: [],
};

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
  rows: input.rows ?? [transitionRow(input.label ?? "START", input.targetNodeId ?? "target")],
  producers: input.producers ?? [],
  sourceAnchors: [],
  diagnostics: [],
});

const flowFixture = (): MachineCanvasReadyFlow => ({
  status: "ready",
  machine,
  nodes: [
    node({
      nodeId: "idle",
      label: "idle",
      role: "initial",
      badges: [{ kind: "initial", label: "initial" }],
      stats: { incoming: 1, outgoing: 2, selfLoops: 1, emissions: 0 },
    }),
    node({
      nodeId: "loading",
      label: "loading_state_with_a_really_really_really_long_name",
      role: "effect-source",
      badges: [{ kind: "effect-source", label: "effect source" }],
      stats: { incoming: 1, outgoing: 1, selfLoops: 0, emissions: 1 },
    }),
    node({
      nodeId: "done",
      label: "done",
      role: "current",
      badges: [{ kind: "current", label: "current" }],
      stats: { incoming: 1, outgoing: 0, selfLoops: 0, emissions: 0 },
    }),
    node({
      nodeId: "wildcard",
      label: "*",
      role: "wildcard",
      ref: { kind: "wildcard-state" },
      badges: [{ kind: "wildcard", label: "*" }],
      stats: { incoming: 0, outgoing: 1, selfLoops: 0, emissions: 0 },
    }),
  ],
  edgeGroups: [
    edge({ groupId: "edge:start", sourceNodeId: "idle", targetNodeId: "loading", label: "START" }),
    edge({
      groupId: "edge:done",
      sourceNodeId: "loading",
      targetNodeId: "done",
      kind: "self-emitted-transition",
      producerCategory: "self-emitted",
      label: "DONE",
      rows: [transitionRow("DONE", "done"), effectRow],
      producers: [producer],
    }),
    edge({
      groupId: "edge:loop",
      sourceNodeId: "idle",
      targetNodeId: "idle",
      direction: "self",
      kind: "from-other-transition",
      producerCategory: "from-other",
      label: "TICK",
      count: 2,
      producers: [{ ...producer, machineId: "clock", machineTitle: "clock", emissionId: "emit:tick", eventType: "TICK" }],
    }),
    edge({ groupId: "edge:any", sourceNodeId: "wildcard", targetNodeId: "done", label: "ANY" }),
    edge({
      groupId: "edge:emit-only",
      sourceNodeId: "loading",
      kind: "emission-only",
      targetNodeId: undefined,
      label: "LOG",
      rows: [effectRow],
      count: 1,
    }),
  ],
});

const layoutGraph = (graph: MachineCanvasElkGraph): MachineCanvasElkGraph => ({
  ...graph,
  children: graph.children.map((child, index) => ({ ...child, x: index * 240, y: index * 80 })),
  edges: graph.edges.map((layoutEdge, index) => ({
    ...layoutEdge,
    sections: [
      {
        startPoint: { x: index * 100 + 160, y: 40 },
        bendPoints: [{ x: index * 100 + 200, y: 40 }],
        endPoint: { x: index * 100 + 240, y: 90 },
      },
    ],
  })),
});

describe("MachineCanvasGraph", () => {
  beforeEach(() => {
    reactFlowMock.fitView.mockClear();
    elkMock.layout.mockImplementation(async (graph) => layoutGraph(graph));
  });

  it("рендерит graph nodes, labels, self loops, wildcard и emission chips", async () => {
    render(<MachineCanvasGraph flow={flowFixture()} sourceVersion={1} />);

    await waitFor(() => expect(screen.getByTestId(ids.canvas.graph).getAttribute("data-density")).toBe("normal"));
    const graph = screen.getByTestId(ids.canvas.graph);

    expect(graph.getAttribute("data-density")).toBe("normal");
    expect(graph.getAttribute("data-visible-edge-count")).toBe("4");
    expect(screen.getAllByTestId(ids.canvas.stateNode).map((element) => element.getAttribute("data-node-role"))).toEqual([
      "initial",
      "effect-source",
      "current",
      "wildcard",
    ]);
    expect(screen.getByTitle("loading_state_with_a_really_really_really_long_name").style.width).toBe("320px");
    expect(screen.getByTestId(ids.canvas.emissionChip).textContent).toBe("emits 1");
    expect(screen.getAllByTestId(ids.canvas.edgeLabel).map((element) => element.textContent)).toEqual([
      "START",
      "DONE",
      "TICK+1",
      "ANY",
    ]);
    expect(screen.getAllByTestId(ids.canvas.edgeLabel).map((element) => element.getAttribute("data-edge-direction"))).toEqual([
      "normal",
      "normal",
      "self",
      "normal",
    ]);
    expect(screen.getAllByTestId(ids.canvas.edgeLabel)[0]?.style.maxWidth).toBe("170px");
    expect(screen.queryByText("LOG")).toBeNull();
    expect(screen.getByTestId("react-flow-background")).toBeTruthy();
    const reactFlow = document.querySelector(".react-flow");
    expect(reactFlow?.getAttribute("data-nodes-draggable")).toBe("false");
    expect(reactFlow?.getAttribute("data-nodes-connectable")).toBe("false");
    expect(reactFlow?.getAttribute("data-elements-selectable")).toBe("false");
    expect(reactFlow?.getAttribute("data-fit-view")).toBe("true");
    expect(reactFlow?.getAttribute("data-min-zoom")).toBe("0.3");
    expect(reactFlow?.getAttribute("data-max-zoom")).toBe("1.6");
    expect(document.querySelector(".react-flow__controls")?.getAttribute("data-show-interactive")).toBe("false");
    expect(document.querySelectorAll(".react-flow__controls-button")).toHaveLength(2);
  });

  it("рендерит fallback badges, semantic refs и popover без producer/guard metadata", async () => {
    const flow = flowFixture();
    const edgeCaseFlow: MachineCanvasReadyFlow = {
      ...flow,
      nodes: [
        node({
          nodeId: "plain",
          label: "plain",
          role: "normal",
          badges: [],
          stats: { incoming: 0, outgoing: 1, selfLoops: 0, emissions: 0 },
        }),
        node({
          nodeId: "effect",
          label: "*",
          role: "effect-source",
          ref: { kind: "wildcard-effect" },
          badges: [],
          stats: { incoming: 0, outgoing: 1, selfLoops: 0, emissions: 1 },
        }),
        node({
          nodeId: "synthetic",
          label: "dynamic",
          role: "synthetic",
          ref: { kind: "synthetic-target", targetKind: "dynamic" },
          badges: [],
          stats: { incoming: 1, outgoing: 0, selfLoops: 0, emissions: 0 },
        }),
      ],
      edgeGroups: [
        edge({
          groupId: "edge:fallback-labels",
          sourceNodeId: "plain",
          targetNodeId: "synthetic",
          label: "DYNAMIC",
          rows: [
            {
              machineId: "player",
              rowId: "row:effect-no-meta",
              rowKind: "effect",
              eventType: "DYNAMIC",
              sourceAnchors: [],
            },
            diagnosticRow,
          ],
        }),
        edge({
          groupId: "edge:emit-title-fallback",
          sourceNodeId: "effect",
          kind: "emission-only",
          targetNodeId: undefined,
          label: "LOG_ONLY",
          rows: [],
          producers: [],
          count: 3,
        }),
      ],
    };

    render(<MachineCanvasGraph flow={edgeCaseFlow} sourceVersion={3} />);

    await waitFor(() => expect(screen.getByTestId(ids.canvas.graph).getAttribute("data-density")).toBe("normal"));
    expect(screen.getByText("effect source")).toBeTruthy();
    expect(screen.getByText("target")).toBeTruthy();
    expect(screen.getByTestId(ids.canvas.emissionChip).getAttribute("title")).toBe("LOG_ONLY");
    expect(screen.getByTestId(ids.canvas.emissionChip).textContent).toBe("emits 3");
    expect(screen.getByText("dynamic").closest(`[data-testid="${ids.canvas.stateNode}"]`)?.getAttribute("data-node-ref")).toBe("dynamic");

    const label = screen.getByTestId(ids.canvas.edgeLabel);
    fireEvent.mouseEnter(label);

    const popover = await screen.findByTestId(ids.canvas.edgePopover);
    expect(popover.textContent).toContain("external");
    expect(popover.textContent).toContain("DYNAMIC");
    expect(popover.textContent).toContain("effect:DYNAMIC");
    expect(popover.textContent).toContain("diagnostic:escaped transition");
    expect(popover.textContent).not.toContain(" · ");
  });

  it("строит hover popover только из edge group metadata", async () => {
    render(<MachineCanvasGraph flow={flowFixture()} sourceVersion={1} />);

    const doneLabel = (await screen.findAllByTestId(ids.canvas.edgeLabel)).find((element) => element.textContent === "DONE");
    if (!doneLabel) throw new Error("DONE edge label was not rendered.");

    fireEvent.mouseEnter(doneLabel);

    const popover = await screen.findByTestId(ids.canvas.edgePopover);
    expect(popover.textContent).toContain("self-emitted");
    expect(popover.textContent).toContain("loading");
    expect(popover.textContent).toContain("done");
    expect(popover.textContent).toContain("DONE");
    expect(popover.textContent).toContain("player.loading · default · ok");
    expect(popover.textContent).toContain("effect:DONE · default · ok");

    fireEvent.mouseLeave(doneLabel);
    expect(screen.queryByTestId(ids.canvas.edgePopover)).toBeNull();
  });

  it("позиционирует self popover снизу и справа в пределах viewport", async () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const originalInnerWidth = window.innerWidth;

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 260 });
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList.contains("vf-machine-canvas-popover")) {
        return { x: 0, y: 0, width: 280, height: 60, top: 0, left: 0, right: 280, bottom: 60, toJSON: () => ({}) };
      }

      return { x: 240, y: 8, width: 30, height: 18, top: 8, left: 240, right: 270, bottom: 26, toJSON: () => ({}) };
    };

    try {
      render(<MachineCanvasGraph flow={flowFixture()} sourceVersion={4} />);

      const selfLabel = (await screen.findAllByTestId(ids.canvas.edgeLabel)).find((element) => element.textContent === "TICK+1");
      if (!selfLabel) throw new Error("TICK self label was not rendered.");

      fireEvent.mouseEnter(selfLabel);

      const popover = await screen.findByTestId(ids.canvas.edgePopover);
      await waitFor(() => expect(popover.style.opacity).toBe("1"));
      expect(popover.textContent).toContain("loop");
      expect(popover.textContent).toContain("self");
      expect(popover.style.top).toBe("30px");
      expect(popover.style.left).toBe("-32px");
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    }
  });

  it("показывает controlled layout failure", async () => {
    elkMock.layout.mockRejectedValueOnce(new Error("layout failed"));

    render(<MachineCanvasGraph flow={flowFixture()} sourceVersion={2} />);

    expect(await screen.findByText("layout failed")).toBeTruthy();
    expect(screen.getByTestId(ids.canvas.layoutStatus).getAttribute("data-layout-status")).toBe("error");
  });

  it("показывает loading для stale layout и игнорирует completed response после unmount", async () => {
    let resolveLayout: ((graph: MachineCanvasElkGraph) => void) | undefined;
    const deferredLayout = new Promise<MachineCanvasElkGraph>((resolve) => {
      resolveLayout = resolve;
    });
    const initialFlow = flowFixture();
    const nextFlow = {
      ...flowFixture(),
      machine: { ...machine, machineId: "next" },
    };
    elkMock.layout.mockImplementationOnce(async () => layoutGraph(await deferredLayout));
    elkMock.layout.mockImplementationOnce(async (graph) => layoutGraph(graph));

    const { rerender, unmount } = render(<MachineCanvasGraph flow={initialFlow} sourceVersion={5} />);
    rerender(<MachineCanvasGraph flow={nextFlow} sourceVersion={5} />);

    expect(screen.getByTestId(ids.canvas.layoutStatus).getAttribute("data-layout-status")).toBe("loading");
    await waitFor(() => expect(screen.getByTestId(ids.canvas.graph).getAttribute("data-density")).toBe("normal"));

    unmount();
    resolveLayout?.(layoutGraph(createEmptyElkGraph()));
    await deferredLayout;
    await Promise.resolve();
    await Promise.resolve();
  });

  it("повторно использует layout key для того же flow и очищает fit timers", async () => {
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const flow = flowFixture();
    const { rerender, unmount } = render(<MachineCanvasGraph flow={flow} sourceVersion={6} />);

    await waitFor(() => expect(screen.getByTestId(ids.canvas.graph).getAttribute("data-density")).toBe("normal"));
    rerender(<MachineCanvasGraph flow={flow} sourceVersion={7} />);
    await waitFor(() => expect(screen.getByTestId(ids.canvas.graph).getAttribute("data-density")).toBe("normal"));

    expect(screen.getByTestId(ids.canvas.graph).getAttribute("data-density")).toBe("normal");

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});

const createEmptyElkGraph = (): MachineCanvasElkGraph => ({
  id: "machine-canvas",
  layoutOptions: {},
  children: [],
  edges: [],
});
