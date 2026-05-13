import type {
  MachineFlowBadge,
  MachineFlowEdgeGroup,
  MachineFlowEdgeKind,
  MachineFlowModel,
  MachineFlowNode,
} from "@lite-fsm/graph/view-model";

export type MachineCanvasReadyFlow = Extract<MachineFlowModel, { status: "ready" }>;

export type MachineCanvasDensity = "normal" | "dense" | "very-dense";

export type MachineCanvasPoint = {
  x: number;
  y: number;
};

export type MachineCanvasSize = {
  width: number;
  height: number;
};

export type MachineCanvasRoute = {
  start: MachineCanvasPoint;
  bends: readonly MachineCanvasPoint[];
  end: MachineCanvasPoint;
};

export type MachineCanvasRenderNode = {
  id: string;
  flowNode: MachineFlowNode;
  label: string;
  role: MachineFlowNode["role"];
  badges: readonly MachineFlowBadge[];
  stats: MachineFlowNode["stats"];
  size: MachineCanvasSize;
  position: MachineCanvasPoint;
  emissionGroups: readonly MachineFlowEdgeGroup[];
};

export type MachineCanvasRenderEdge = {
  id: string;
  group: MachineFlowEdgeGroup;
  sourceNodeId: string;
  targetNodeId: string;
  sourceLabel: string;
  targetLabel: string;
  direction: MachineFlowEdgeGroup["direction"];
  kind: MachineFlowEdgeKind;
  producerCategory: MachineFlowEdgeGroup["producerCategory"];
  label: string;
  labelText: string;
  count: number;
  labelT: number;
  route?: MachineCanvasRoute;
  selfIndex?: number;
  selfTotal?: number;
  nodeSize?: MachineCanvasSize;
};

export type MachineCanvasRenderDraft = {
  nodes: readonly MachineCanvasRenderNode[];
  edges: readonly MachineCanvasRenderEdge[];
  emissionOnlyGroups: readonly MachineFlowEdgeGroup[];
  density: MachineCanvasDensity;
  visibleEdgeCount: number;
};

export type MachineCanvasRenderedGraph = {
  nodes: readonly MachineCanvasRenderNode[];
  edges: readonly MachineCanvasRenderEdge[];
  density: MachineCanvasDensity;
  visibleEdgeCount: number;
};

export type MachineCanvasLayoutResult =
  | {
      status: "ready";
      graph: MachineCanvasRenderedGraph;
    }
  | {
      status: "layout-error";
      message: string;
    };

export type MachineCanvasElkSection = {
  startPoint: MachineCanvasPoint;
  bendPoints?: readonly MachineCanvasPoint[];
  endPoint: MachineCanvasPoint;
};

export type MachineCanvasElkNode = {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
};

export type MachineCanvasElkEdge = {
  id: string;
  sources: readonly string[];
  targets: readonly string[];
  sections?: readonly MachineCanvasElkSection[];
};

export type MachineCanvasElkGraph = {
  id: string;
  layoutOptions: Record<string, string>;
  children: readonly MachineCanvasElkNode[];
  edges: readonly MachineCanvasElkEdge[];
};

export type MachineCanvasLayoutEngine = {
  layout: (graph: MachineCanvasElkGraph) => Promise<MachineCanvasElkGraph>;
};
