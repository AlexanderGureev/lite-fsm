import type {
  MachineFlowBadge,
  MachineFlowEdgeGroup,
  MachineFlowEdgeKind,
  MachineFlowNode,
} from "@lite-fsm/graph/view-model";
import type { MachineCanvasDensity, MachineCanvasSize } from "./machine-canvas-render-types";

export const MACHINE_CANVAS_RENDER_POLICY = {
  nodeMinWidth: 160,
  nodeMaxWidth: 320,
  nodeNameCharWidth: 7.4,
  nodeHorizontalPadding: 28,
  nodeMarkerGap: 6,
  nodeMarkerWidth: 56,
  baseNodeHeight: 70,
  extraHeightPerSideDegreeOverflow: 18,
  edgeLabelMaxWidth: 170,
  edgeLabelCharWidth: 6.4,
  edgeLabelPadding: 14,
  edgeLabelHeight: 18,
  labelCollisionPasses: 4,
  labelCollisionCandidateShifts: [0.12, -0.12, 0.22, -0.22, 0.32, -0.32],
  labelTMin: 0.1,
  labelTMax: 0.9,
  selfLoopBaseOpening: 16,
  selfLoopBaseReach: 28,
  selfLoopStepOpening: 14,
  selfLoopStepReach: 22,
  fitViewPadding: 0.2,
  minZoom: 0.3,
  maxZoom: 1.6,
  normalDensityMaxStates: 12,
  normalDensityMaxEdges: 40,
  denseDensityMaxStates: 30,
  denseDensityMaxEdges: 120,
} as const;

export const MACHINE_CANVAS_ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.spacing.nodeNode": "80",
  "elk.spacing.edgeEdge": "28",
  "elk.spacing.edgeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "200",
  "elk.layered.spacing.edgeNodeBetweenLayers": "50",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "28",
  "elk.layered.thoroughness": "10",
};

export type MachineCanvasNodeRoleStyle = {
  className: string;
  label: string;
};

export type MachineCanvasEdgeKindStyle = {
  className: string;
  label: string;
  description: string;
  colorToken: string;
  strokeDasharray?: string;
  strokeLinecap?: "round";
};

export type MachineCanvasProducerCategoryStyle = {
  className: string;
  label: string;
  description: string;
};

export type MachineCanvasBadgeTone =
  | "accent"
  | "actor"
  | "diagnostic"
  | "effect"
  | "muted"
  | "routing"
  | "warning";

const nodeRoleStyles: Record<MachineFlowNode["role"], MachineCanvasNodeRoleStyle> = {
  normal: { className: "vf-machine-canvas-node-normal", label: "state" },
  initial: { className: "vf-machine-canvas-node-initial", label: "initial" },
  current: { className: "vf-machine-canvas-node-current", label: "current" },
  terminal: { className: "vf-machine-canvas-node-terminal", label: "terminal" },
  spawn: { className: "vf-machine-canvas-node-spawn", label: "spawn" },
  wildcard: { className: "vf-machine-canvas-node-wildcard", label: "any state" },
  "effect-source": { className: "vf-machine-canvas-node-effect-source", label: "effect source" },
  synthetic: { className: "vf-machine-canvas-node-synthetic", label: "synthetic target" },
};

const edgeKindStyles: Record<MachineFlowEdgeKind, MachineCanvasEdgeKindStyle> = {
  "accepted-transition": {
    className: "vf-machine-canvas-edge-accepted",
    label: "accepted",
    description: "External or accepted transition",
    colorToken: "--vf-config",
  },
  "self-emitted-transition": {
    className: "vf-machine-canvas-edge-self-emitted",
    label: "self-emitted",
    description: "Effect-driven local lifecycle transition",
    colorToken: "--vf-effect",
    strokeDasharray: "6 4",
  },
  "from-other-transition": {
    className: "vf-machine-canvas-edge-from-other",
    label: "from other",
    description: "Transition produced by another machine",
    colorToken: "--vf-routing",
    strokeDasharray: "1 3.5",
    strokeLinecap: "round",
  },
  "emission-only": {
    className: "vf-machine-canvas-edge-emission-only",
    label: "emission only",
    description: "Effect emission without local state transition",
    colorToken: "--vf-effect",
    strokeDasharray: "2 4",
  },
};

const producerCategoryStyles: Record<MachineFlowEdgeGroup["producerCategory"], MachineCanvasProducerCategoryStyle> = {
  external: {
    className: "vf-machine-canvas-category-external",
    label: "external",
    description: "No local producer is known",
  },
  "self-emitted": {
    className: "vf-machine-canvas-category-self-emitted",
    label: "self-emitted",
    description: "Produced by this machine",
  },
  "from-other": {
    className: "vf-machine-canvas-category-from-other",
    label: "from other",
    description: "Produced by another machine",
  },
};

const badgeTones: Record<MachineFlowBadge["kind"], MachineCanvasBadgeTone> = {
  initial: "accent",
  current: "accent",
  terminal: "muted",
  spawn: "actor",
  wildcard: "muted",
  "effect-source": "effect",
  "group-tag": "routing",
  persistence: "warning",
  "context-scoped": "muted",
  diagnostic: "diagnostic",
  unknown: "muted",
};

export const machineCanvasNodeRoleStyle = (role: MachineFlowNode["role"]): MachineCanvasNodeRoleStyle =>
  nodeRoleStyles[role];

export const machineCanvasEdgeKindStyle = (kind: MachineFlowEdgeKind): MachineCanvasEdgeKindStyle =>
  edgeKindStyles[kind];

export const machineCanvasProducerCategoryStyle = (
  category: MachineFlowEdgeGroup["producerCategory"],
): MachineCanvasProducerCategoryStyle => producerCategoryStyles[category];

export const machineCanvasBadgeTone = (kind: MachineFlowBadge["kind"]): MachineCanvasBadgeTone => badgeTones[kind];

export const formatMachineCanvasEdgeLabel = (group: Pick<MachineFlowEdgeGroup, "label" | "count">): string =>
  group.count > 1 ? `${group.label} +${group.count - 1}` : group.label;

export const machineCanvasDensityFor = (stateCount: number, visibleEdgeCount: number): MachineCanvasDensity => {
  if (
    stateCount <= MACHINE_CANVAS_RENDER_POLICY.normalDensityMaxStates &&
    visibleEdgeCount <= MACHINE_CANVAS_RENDER_POLICY.normalDensityMaxEdges
  ) {
    return "normal";
  }

  if (
    stateCount <= MACHINE_CANVAS_RENDER_POLICY.denseDensityMaxStates &&
    visibleEdgeCount <= MACHINE_CANVAS_RENDER_POLICY.denseDensityMaxEdges
  ) {
    return "dense";
  }

  return "very-dense";
};

export const machineCanvasNodeSizeFor = (node: MachineFlowNode): MachineCanvasSize => {
  const markerWidth = node.badges.length > 0
    ? MACHINE_CANVAS_RENDER_POLICY.nodeMarkerGap + MACHINE_CANVAS_RENDER_POLICY.nodeMarkerWidth
    : 0;
  const desiredWidth = Math.ceil(
    node.label.length * MACHINE_CANVAS_RENDER_POLICY.nodeNameCharWidth +
      MACHINE_CANVAS_RENDER_POLICY.nodeHorizontalPadding +
      markerWidth,
  );
  const maxSideDegree = Math.max(node.stats.incoming, node.stats.outgoing);

  return {
    width: Math.min(
      MACHINE_CANVAS_RENDER_POLICY.nodeMaxWidth,
      Math.max(MACHINE_CANVAS_RENDER_POLICY.nodeMinWidth, desiredWidth),
    ),
    height:
      MACHINE_CANVAS_RENDER_POLICY.baseNodeHeight +
      Math.max(0, maxSideDegree - 2) * MACHINE_CANVAS_RENDER_POLICY.extraHeightPerSideDegreeOverflow,
  };
};

export const machineCanvasLegendItems = (): readonly MachineCanvasEdgeKindStyle[] => [
  machineCanvasEdgeKindStyle("accepted-transition"),
  machineCanvasEdgeKindStyle("self-emitted-transition"),
  machineCanvasEdgeKindStyle("from-other-transition"),
  machineCanvasEdgeKindStyle("emission-only"),
];
