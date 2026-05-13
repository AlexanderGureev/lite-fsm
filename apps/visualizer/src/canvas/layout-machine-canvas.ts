import type { MachineFlowEdgeGroup } from "@lite-fsm/graph/view-model";
import {
  estimateMachineCanvasLabelBox,
  machineCanvasDirectRoute,
  resolveMachineCanvasLabelCollisions,
} from "./machine-canvas-geometry";
import {
  formatMachineCanvasEdgeLabel,
  MACHINE_CANVAS_ELK_OPTIONS,
  machineCanvasDensityFor,
  machineCanvasNodeSizeFor,
} from "./machine-canvas-render-policy";
import type {
  MachineCanvasElkGraph,
  MachineCanvasLayoutEngine,
  MachineCanvasLayoutResult,
  MachineCanvasReadyFlow,
  MachineCanvasRenderedGraph,
  MachineCanvasRenderDraft,
  MachineCanvasRenderEdge,
  MachineCanvasRenderNode,
  MachineCanvasRoute,
} from "./machine-canvas-render-types";

const initialPosition = { x: 0, y: 0 } as const;
type VisibleTransitionGroup = MachineFlowEdgeGroup & { targetNodeId: string };

const hasVisibleTransitionTarget = (group: MachineFlowEdgeGroup): group is VisibleTransitionGroup =>
  group.kind !== "emission-only" && typeof group.targetNodeId === "string";

export const buildMachineCanvasRenderDraft = (flow: MachineCanvasReadyFlow): MachineCanvasRenderDraft => {
  const emissionGroups = flow.edgeGroups.filter((group) => group.kind === "emission-only" || !group.targetNodeId);
  const emissionsBySource = new Map<string, MachineFlowEdgeGroup[]>();

  for (const group of emissionGroups) {
    emissionsBySource.set(group.sourceNodeId, [...(emissionsBySource.get(group.sourceNodeId) ?? []), group]);
  }

  const nodes = flow.nodes.map(
    (node): MachineCanvasRenderNode => ({
      id: node.nodeId,
      flowNode: node,
      label: node.label,
      role: node.role,
      badges: node.badges,
      stats: node.stats,
      size: machineCanvasNodeSizeFor(node),
      position: initialPosition,
      emissionGroups: emissionsBySource.get(node.nodeId) ?? [],
    }),
  );
  const labelsByNodeId = new Map(nodes.map((node) => [node.id, node.label]));
  const transitionGroups = flow.edgeGroups.filter(hasVisibleTransitionTarget);
  const siblingGroups = new Map<string, MachineFlowEdgeGroup[]>();

  for (const group of transitionGroups) {
    const key = siblingGroupKey(group.sourceNodeId, group.targetNodeId);
    siblingGroups.set(key, [...(siblingGroups.get(key) ?? []), group]);
  }

  const edges = transitionGroups.map((group): MachineCanvasRenderEdge => {
    const labelT = labelTForSibling(group, siblingGroups.get(siblingGroupKey(group.sourceNodeId, group.targetNodeId))!);

    return {
      id: group.groupId,
      group,
      sourceNodeId: group.sourceNodeId,
      targetNodeId: group.targetNodeId,
      sourceLabel: labelsByNodeId.get(group.sourceNodeId) ?? group.sourceNodeId,
      targetLabel: labelsByNodeId.get(group.targetNodeId) ?? group.targetNodeId,
      direction: group.direction,
      kind: group.kind,
      producerCategory: group.producerCategory,
      label: group.label,
      labelText: formatMachineCanvasEdgeLabel(group),
      count: group.count,
      labelT,
    };
  });

  return {
    nodes,
    edges,
    emissionOnlyGroups: emissionGroups,
    density: machineCanvasDensityFor(flow.nodes.length, edges.length),
    visibleEdgeCount: edges.length,
  };
};

const siblingGroupKey = (sourceNodeId: string, targetNodeId: string): string =>
  `${sourceNodeId}\u0000${targetNodeId}`;

const labelTForSibling = (group: MachineFlowEdgeGroup, siblings: readonly MachineFlowEdgeGroup[]): number => {
  if (siblings.length === 1) return 0.5;

  const index = siblings.indexOf(group);
  return 0.32 + (index / (siblings.length - 1)) * 0.36;
};

export const createMachineCanvasElkGraph = (draft: MachineCanvasRenderDraft): MachineCanvasElkGraph => ({
  id: "machine-canvas",
  layoutOptions: MACHINE_CANVAS_ELK_OPTIONS,
  children: draft.nodes.map((node) => ({
    id: node.id,
    width: node.size.width,
    height: node.size.height,
  })),
  edges: draft.edges
    .filter((edge) => edge.direction !== "self")
    .map((edge) => ({
      id: edge.id,
      sources: [edge.sourceNodeId],
      targets: [edge.targetNodeId],
    })),
});

export const applyMachineCanvasElkLayout = (
  draft: MachineCanvasRenderDraft,
  elkGraph: MachineCanvasElkGraph,
): MachineCanvasRenderedGraph => {
  const positionsByNodeId = new Map(
    elkGraph.children.map((node) => [node.id, { x: node.x ?? initialPosition.x, y: node.y ?? initialPosition.y }]),
  );
  const routesByEdgeId = new Map(
    elkGraph.edges.flatMap((edge) => {
      const section = edge.sections?.[0];
      return section ? [[edge.id, { start: section.startPoint, bends: section.bendPoints ?? [], end: section.endPoint } as MachineCanvasRoute]] : [];
    }),
  );
  const nodes = draft.nodes.map((node) => ({
    ...node,
    position: positionsByNodeId.get(node.id) ?? node.position,
  }));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const selfEdgesByNodeId = new Map<string, MachineCanvasRenderEdge[]>();

  for (const edge of draft.edges) {
    if (edge.direction !== "self") continue;

    selfEdgesByNodeId.set(edge.sourceNodeId, [...(selfEdgesByNodeId.get(edge.sourceNodeId) ?? []), edge]);
  }

  const edgesWithRoutes = draft.edges.map((edge) => {
    if (edge.direction === "self") {
      const siblings = selfEdgesByNodeId.get(edge.sourceNodeId)!;
      return {
        ...edge,
        selfIndex: siblings.indexOf(edge),
        selfTotal: siblings.length,
        nodeSize: nodesById.get(edge.sourceNodeId)!.size,
      };
    }

    return {
      ...edge,
      route: routesByEdgeId.get(edge.id) ?? fallbackRouteForEdge(edge, nodesById),
    };
  });
  const labelTByEdgeId = resolveMachineCanvasLabelCollisions(
    edgesWithRoutes.flatMap((edge) => {
      if (edge.direction === "self" || !edge.route) return [];

      const box = estimateMachineCanvasLabelBox(edge.labelText);
      return [
        {
          edgeId: edge.id,
          points: [edge.route.start, ...edge.route.bends, edge.route.end],
          t: edge.labelT,
          width: box.width,
          height: box.height,
        },
      ];
    }),
  );

  return {
    nodes,
    edges: edgesWithRoutes.map((edge) => ({
      ...edge,
      labelT: labelTByEdgeId.get(edge.id) ?? edge.labelT,
    })),
    density: draft.density,
    visibleEdgeCount: draft.visibleEdgeCount,
  };
};

const fallbackRouteForEdge = (
  edge: MachineCanvasRenderEdge,
  nodesById: ReadonlyMap<string, MachineCanvasRenderNode>,
): MachineCanvasRoute => {
  const sourceNode = nodesById.get(edge.sourceNodeId);
  const targetNode = nodesById.get(edge.targetNodeId);

  if (!sourceNode || !targetNode) {
    return { start: initialPosition, bends: [], end: initialPosition };
  }

  const points = machineCanvasDirectRoute({
    sourcePosition: sourceNode.position,
    sourceSize: sourceNode.size,
    targetPosition: targetNode.position,
    targetSize: targetNode.size,
  });

  return { start: points[0], bends: [], end: points[1] };
};

export const layoutMachineCanvas = async (
  flow: MachineCanvasReadyFlow,
  engine: MachineCanvasLayoutEngine,
): Promise<MachineCanvasLayoutResult> => {
  try {
    const draft = buildMachineCanvasRenderDraft(flow);
    const elkGraph = await engine.layout(createMachineCanvasElkGraph(draft));

    return {
      status: "ready",
      graph: applyMachineCanvasElkLayout(draft, elkGraph),
    };
  } catch (error) {
    return {
      status: "layout-error",
      message: error instanceof Error ? error.message : "Machine canvas layout failed.",
    };
  }
};
