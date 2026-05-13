import {
  machineCanvasPolylinePointAt,
  machineCanvasRoundedPolylinePath,
  machineCanvasSelfLoopPath,
} from "../../canvas/machine-canvas-geometry";
import { layoutMachineCanvas } from "../../canvas/layout-machine-canvas";
import { MACHINE_CANVAS_RENDER_POLICY } from "../../canvas/machine-canvas-render-policy";
import type {
  MachineCanvasLayoutEngine,
  MachineCanvasLayoutResult,
  MachineCanvasReadyFlow,
  MachineCanvasRenderEdge,
  MachineCanvasRenderNode,
} from "../../canvas/machine-canvas-render-types";

type MachineCanvasEdgeGroup = MachineCanvasRenderEdge["group"];
type MachineCanvasProducerRef = MachineCanvasEdgeGroup["producers"][number];
type MachineCanvasRowRef = MachineCanvasEdgeGroup["rows"][number];

export type MachineCanvasGraphEdgePath = {
  path: string;
  labelX: number;
  labelY: number;
};

export type MachineCanvasGraphFitView = (options: { padding: number; duration: number }) => void;

export type MachineCanvasGraphLayoutState =
  | ({ status: "loading" } & { layoutKey: string })
  | (MachineCanvasLayoutResult & { layoutKey: string });

export type MachineCanvasGraphLayoutCleanup = () => void;

export const createMachineCanvasLayoutKeyFactory = (): ((
  flow: MachineCanvasReadyFlow,
  sourceVersion: number,
) => string) => {
  const flowLayoutIds = new WeakMap<MachineCanvasReadyFlow, number>();
  let nextFlowLayoutId = 0;

  return (flow, sourceVersion) => {
    const currentId = flowLayoutIds.get(flow);
    const flowId = currentId ?? nextFlowLayoutId;

    if (currentId === undefined) {
      flowLayoutIds.set(flow, flowId);
      nextFlowLayoutId += 1;
    }

    return `${sourceVersion}:${flow.machine.machineId}:${flowId}`;
  };
};

export const startMachineCanvasGraphLayout = ({
  flow,
  engine,
  layoutKey,
  onLayoutState,
}: {
  flow: MachineCanvasReadyFlow;
  engine: MachineCanvasLayoutEngine;
  layoutKey: string;
  onLayoutState: (layoutState: MachineCanvasGraphLayoutState) => void;
}): MachineCanvasGraphLayoutCleanup => {
  let cancelled = false;

  void layoutMachineCanvas(flow, engine).then((result) => {
    if (cancelled) return;

    onLayoutState({ ...result, layoutKey });
  });

  return () => {
    cancelled = true;
  };
};

export const visibleMachineCanvasGraphLayoutState = (
  layoutState: MachineCanvasGraphLayoutState,
  layoutKey: string,
): MachineCanvasGraphLayoutState =>
  layoutState.layoutKey === layoutKey ? layoutState : { status: "loading", layoutKey };

export const machineCanvasGraphSemanticNodeRef = (node: MachineCanvasRenderNode): string => {
  if (node.flowNode.ref.kind === "state") return node.flowNode.ref.stateId;
  if (node.flowNode.ref.kind === "synthetic-target") return node.flowNode.ref.targetKind;

  return node.flowNode.ref.kind;
};

export const machineCanvasGraphDisplayBadges = (node: MachineCanvasRenderNode): MachineCanvasRenderNode["badges"] => {
  if (node.badges.length > 0) return node.badges;
  if (node.role === "wildcard") return [{ kind: "wildcard", label: "any state" }];
  if (node.role === "effect-source") return [{ kind: "effect-source", label: "effect source" }];
  if (node.role === "synthetic") return [{ kind: "unknown", label: "target" }];

  return [];
};

export const machineCanvasGraphEventLabelsForGroup = (group: MachineCanvasEdgeGroup): readonly string[] => {
  const labels = [
    ...group.rows.flatMap((row) => ("eventType" in row ? [row.eventType] : [])),
    ...group.producers.map((producer) => producer.eventType),
  ];

  return labels.length > 0 ? [...new Set(labels)] : [group.label];
};

export const machineCanvasGraphProducerLabel = (producer: MachineCanvasProducerRef): string => {
  const route = producer.routingLabel ? ` · ${producer.routingLabel}` : "";
  const guard = producer.guardLabel ? ` · ${producer.guardLabel}` : "";

  return `${producer.machineTitle}.${producer.sourceStateKey}${route}${guard}`;
};

export const machineCanvasGraphRowLabel = (row: MachineCanvasRowRef): string => {
  if ("eventType" in row) {
    const target = "targetLabel" in row ? ` → ${row.targetLabel}` : "";
    const source = "sourceStateKey" in row && row.sourceStateKey === "*" ? " · via *" : "";
    const routing = "routingLabel" in row && row.routingLabel ? ` · ${row.routingLabel}` : "";
    const guard = row.guardLabel ? ` · ${row.guardLabel}` : "";
    return `${row.rowKind}:${row.eventType}${target}${source}${routing}${guard}`;
  }

  return `${row.rowKind}:${row.label}`;
};

export const machineCanvasGraphEdgePath = ({
  edge,
  sourceX,
  sourceY,
}: {
  edge: MachineCanvasRenderEdge;
  sourceX: number;
  sourceY: number;
}): MachineCanvasGraphEdgePath => {
  if (edge.direction === "self") {
    const loop = machineCanvasSelfLoopPath({
      sourceX,
      sourceY,
      nodeSize: edge.nodeSize ?? { width: 160, height: 70 },
      index: edge.selfIndex ?? 0,
    });
    return { path: loop.path, labelX: loop.labelPoint.x, labelY: loop.labelPoint.y };
  }

  const route = edge.route!;
  const points = [route.start, ...route.bends, route.end];
  const labelPoint = machineCanvasPolylinePointAt(points, edge.labelT);
  return {
    path: machineCanvasRoundedPolylinePath(points, 10),
    labelX: labelPoint.x,
    labelY: labelPoint.y,
  };
};

export const scheduleMachineCanvasFitView = (fitView: MachineCanvasGraphFitView): (() => void) => {
  const firstFit = window.setTimeout(() => fitView({ padding: MACHINE_CANVAS_RENDER_POLICY.fitViewPadding, duration: 0 }), 50);
  const measuredFit = window.setTimeout(() => fitView({ padding: MACHINE_CANVAS_RENDER_POLICY.fitViewPadding, duration: 180 }), 280);

  return () => {
    window.clearTimeout(firstFit);
    window.clearTimeout(measuredFit);
  };
};
