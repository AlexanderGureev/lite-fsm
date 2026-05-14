import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import ELK from "elkjs";
import "@xyflow/react/dist/style.css";
import { AlertCircle } from "lucide-react";
import {
  MACHINE_CANVAS_RENDER_POLICY,
  machineCanvasBadgeTone,
  machineCanvasEdgeKindStyle,
  machineCanvasNodeRoleStyle,
  machineCanvasProducerCategoryStyle,
} from "../../canvas/machine-canvas-render-policy";
import type {
  MachineCanvasElkGraph,
  MachineCanvasLayoutEngine,
  MachineCanvasReadyFlow,
  MachineCanvasRenderedGraph,
  MachineCanvasRenderEdge,
  MachineCanvasRenderNode,
} from "../../canvas/machine-canvas-render-types";
import { VISUALIZER_TEST_IDS } from "@/test-ids";
import { cn } from "@/lib/utils";
import {
  createMachineCanvasLayoutKeyFactory,
  machineCanvasGraphDisplayBadges,
  machineCanvasGraphEdgePath,
  machineCanvasGraphEventLabelsForGroup,
  machineCanvasGraphRowLabel,
  machineCanvasGraphSemanticNodeRef,
  scheduleMachineCanvasFitView,
  startMachineCanvasGraphLayout,
  visibleMachineCanvasGraphLayoutState,
  type MachineCanvasGraphLayoutState,
} from "./machine-canvas-graph-view";

type MachineCanvasGraphProps = {
  flow: MachineCanvasReadyFlow;
  sourceVersion: number;
};

type MachineCanvasNodeData = {
  node: MachineCanvasRenderNode;
};

type MachineCanvasEdgeData = {
  edge: MachineCanvasRenderEdge;
};

type MachineCanvasFlowNode = Node<MachineCanvasNodeData, "machine-canvas-node">;
type MachineCanvasFlowEdge = Edge<MachineCanvasEdgeData, "machine-canvas-edge">;

type MachineCanvasPopoverRow = MachineCanvasRenderEdge["group"]["rows"][number];
type MachineCanvasPopoverProducer = MachineCanvasRenderEdge["group"]["producers"][number];
type MachineCanvasPopoverLayer = MachineCanvasPopoverRow["rowKind"] | "producer";

const createElkLayoutEngine = (): MachineCanvasLayoutEngine => {
  const elk = new ELK();

  return {
    layout: async (graph) => elk.layout(graph as unknown as Parameters<typeof elk.layout>[0]) as Promise<MachineCanvasElkGraph>,
  };
};

const MachineCanvasStateNode = ({ data }: NodeProps<MachineCanvasFlowNode>) => {
  const { node } = data;
  const roleStyle = machineCanvasNodeRoleStyle(node.role);
  const badges = machineCanvasGraphDisplayBadges(node);
  const stats = [
    { kind: "in", glyph: "←", label: "IN", value: node.stats.incoming, title: "incoming transitions" },
    { kind: "out", glyph: "→", label: "OUT", value: node.stats.outgoing, title: "outgoing transitions" },
    ...(node.stats.selfLoops > 0
      ? [{ kind: "loop", glyph: "↺", label: "LOOP", value: node.stats.selfLoops, title: "self loops" }]
      : []),
  ];

  return (
    <div
      className={cn("vf-machine-canvas-node", roleStyle.className)}
      style={{ width: node.size.width, height: node.size.height }}
      title={node.label}
      data-testid={VISUALIZER_TEST_IDS.canvas.stateNode}
      data-node-id={node.id}
      data-node-ref={machineCanvasGraphSemanticNodeRef(node)}
      data-node-role={node.role}
      data-node-label-kind={node.label === "*" ? "symbol" : "name"}
    >
      <Handle type="target" position={Position.Left} />
      <div className="vf-machine-canvas-node-main">
        <strong className="vf-machine-canvas-node-label">{node.label}</strong>
      </div>
      {badges.length > 0 ? (
        <span className="vf-machine-canvas-node-badges">
          {badges.map((badge) => (
            <span
              key={`${badge.kind}:${badge.label}`}
              className={cn("vf-machine-canvas-badge", `vf-machine-canvas-badge-${machineCanvasBadgeTone(badge.kind)}`)}
            >
              {badge.label}
            </span>
          ))}
        </span>
      ) : null}
      <div className="vf-machine-canvas-node-stats" aria-label={`${node.label} graph stats`}>
        {stats.map((stat) => (
          <span
            key={stat.kind}
            className={cn("vf-machine-canvas-stat", `vf-machine-canvas-stat-${stat.kind}`)}
            title={stat.title}
            aria-label={`${stat.title}: ${stat.value}`}
            data-stat-kind={stat.kind}
          >
            <span className="vf-machine-canvas-stat-glyph" aria-hidden="true">
              {stat.glyph}
            </span>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </span>
        ))}
      </div>
      {node.emissionGroups.length > 0 ? (
        <div className="vf-machine-canvas-emissions">
          {node.emissionGroups.map((group) => (
            <span
              key={group.groupId}
              className="vf-machine-canvas-emission-chip"
              title={machineCanvasGraphEventLabelsForGroup(group).join(", ")}
              data-testid={VISUALIZER_TEST_IDS.canvas.emissionChip}
              data-edge-group-id={group.groupId}
            >
              emits {group.count}
            </span>
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

const popoverLayerLabels: Record<MachineCanvasPopoverLayer, string> = {
  config: "cfg",
  reducer: "red",
  effect: "eff",
  diagnostic: "diag",
  unknown: "unknown",
  producer: "emit",
};

export const machineCanvasPopoverMeta = (row: MachineCanvasPopoverRow): string[] => {
  switch (row.rowKind) {
    case "config":
    case "reducer":
      return [
        ...(row.sourceStateKey === "*" ? ["via *"] : []),
        ...(row.guardLabel ? [row.guardLabel] : []),
        ...(row.confidence ? [row.confidence] : []),
      ];
    case "effect":
      return [
        ...(row.routingLabel ? [row.routingLabel] : []),
        ...(row.guardLabel ? [row.guardLabel] : []),
        ...(row.confidence ? [row.confidence] : []),
      ];
    case "diagnostic":
      return [row.severity];
    case "unknown":
      return [row.reason, row.confidence];
  }
};

export const machineCanvasPopoverProducerMeta = (producer: MachineCanvasPopoverProducer): string[] => [
  ...(producer.routingLabel ? [producer.routingLabel] : []),
  ...(producer.guardLabel ? [producer.guardLabel] : []),
  ...(producer.confidence ? [producer.confidence] : []),
];

const EdgePopoverLayerBadge = ({ layer }: { layer: MachineCanvasPopoverLayer }) => (
  <span className={cn("vf-machine-canvas-popover-layer", `vf-machine-canvas-popover-layer-${layer}`)}>
    {popoverLayerLabels[layer]}
  </span>
);

const EdgePopoverMetaPills = ({ values }: { values: readonly string[] }) =>
  values.length > 0 ? (
    <span className="vf-machine-canvas-popover-meta">
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </span>
  ) : null;

const EdgePopoverProducerRow = ({ producer }: { producer: MachineCanvasPopoverProducer }) => (
  <div className="vf-machine-canvas-popover-row" data-popover-row-kind="producer">
    <EdgePopoverLayerBadge layer="producer" />
    <strong className="vf-machine-canvas-popover-event">{producer.eventType}</strong>
    <span className="vf-machine-canvas-popover-path">
      {producer.machineTitle}.{producer.sourceStateKey}
    </span>
    <EdgePopoverMetaPills values={machineCanvasPopoverProducerMeta(producer)} />
  </div>
);

const EdgePopoverMetadataRow = ({ row }: { row: MachineCanvasPopoverRow }) => {
  switch (row.rowKind) {
    case "config":
    case "reducer":
      return (
        <div
          className="vf-machine-canvas-popover-row"
          data-popover-row-kind={row.rowKind}
          aria-label={machineCanvasGraphRowLabel(row)}
        >
          <EdgePopoverLayerBadge layer={row.rowKind} />
          <strong className="vf-machine-canvas-popover-event">{row.eventType}</strong>
          <span className="vf-machine-canvas-popover-arrow">→</span>
          <strong className="vf-machine-canvas-popover-state">{row.targetLabel}</strong>
          <EdgePopoverMetaPills values={machineCanvasPopoverMeta(row)} />
        </div>
      );
    case "effect":
      return (
        <div
          className="vf-machine-canvas-popover-row"
          data-popover-row-kind={row.rowKind}
          aria-label={machineCanvasGraphRowLabel(row)}
        >
          <EdgePopoverLayerBadge layer="effect" />
          <strong className="vf-machine-canvas-popover-event">{row.eventType}</strong>
          <EdgePopoverMetaPills values={machineCanvasPopoverMeta(row)} />
        </div>
      );
    case "diagnostic":
      return (
        <div
          className="vf-machine-canvas-popover-row"
          data-popover-row-kind={row.rowKind}
          aria-label={machineCanvasGraphRowLabel(row)}
        >
          <EdgePopoverLayerBadge layer="diagnostic" />
          <span className="vf-machine-canvas-popover-path">{row.label}</span>
          <EdgePopoverMetaPills values={machineCanvasPopoverMeta(row)} />
        </div>
      );
    case "unknown":
      return (
        <div
          className="vf-machine-canvas-popover-row"
          data-popover-row-kind={row.rowKind}
          aria-label={machineCanvasGraphRowLabel(row)}
        >
          <EdgePopoverLayerBadge layer="unknown" />
          <span className="vf-machine-canvas-popover-path">{row.reason}</span>
          <EdgePopoverMetaPills values={machineCanvasPopoverMeta(row)} />
        </div>
      );
  }
};

const EdgePopover = ({
  x,
  y,
  edge,
}: {
  x: number;
  y: number;
  edge: MachineCanvasRenderEdge;
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y, ready: false });
  const categoryStyle = machineCanvasProducerCategoryStyle(edge.producerCategory);
  const eventLabels = machineCanvasGraphEventLabelsForGroup(edge.group);

  useEffect(() => {
    const rect = popoverRef.current!.getBoundingClientRect();
    const margin = 12;
    const top = y - rect.height - 12 < margin ? y + 22 : y - rect.height - 12;
    const centeredLeft = x - rect.width / 2;
    const left = Math.min(
      window.innerWidth - rect.width - margin,
      Math.max(margin, centeredLeft),
    );

    setPosition({ left, top, ready: true });
  }, [x, y]);

  return createPortal(
    <div
      ref={popoverRef}
      className="vf-machine-canvas-popover"
      style={{ left: position.left, top: position.top, opacity: position.ready ? 1 : 0 }}
      data-testid={VISUALIZER_TEST_IDS.canvas.edgePopover}
      data-edge-group-id={edge.id}
    >
      <div className="vf-machine-canvas-popover-head">
        <span className={cn("vf-machine-canvas-popover-category", categoryStyle.className)}>
          {categoryStyle.label}
        </span>
        <div className="vf-machine-canvas-popover-route">
          <span>from</span>
          <strong>{edge.sourceLabel}</strong>
          <span>{edge.direction === "self" ? "loop" : "to"}</span>
          <strong>{edge.direction === "self" ? "self" : edge.targetLabel}</strong>
        </div>
      </div>
      <div className="vf-machine-canvas-popover-section" data-popover-section="events">
        <span className="vf-machine-canvas-popover-section-title">events</span>
        <div className="vf-machine-canvas-popover-event-list">
          {eventLabels.map((label) => (
            <span key={label} className={cn("vf-machine-canvas-popover-event-chip", categoryStyle.className)}>
              {label}
            </span>
          ))}
        </div>
      </div>
      {edge.group.producers.length > 0 ? (
        <div className="vf-machine-canvas-popover-section" data-popover-section="producers">
          <span className="vf-machine-canvas-popover-section-title">producers</span>
          {edge.group.producers.map((producer) => (
            <EdgePopoverProducerRow key={`${producer.machineId}:${producer.emissionId}`} producer={producer} />
          ))}
        </div>
      ) : null}
      <div className="vf-machine-canvas-popover-section" data-popover-section="rows">
        <span className="vf-machine-canvas-popover-section-title">rows</span>
        {edge.group.rows.map((row, index) => (
          <EdgePopoverMetadataRow key={`${row.rowId}:${index}`} row={row} />
        ))}
      </div>
    </div>,
    document.body,
  );
};

const MachineCanvasEdge = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  data,
  markerEnd,
}: EdgeProps<MachineCanvasFlowEdge>) => {
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null);
  const edge = data!.edge;
  const style = machineCanvasEdgeKindStyle(edge.kind);
  const { path, labelX, labelY } = machineCanvasGraphEdgePath({ edge, sourceX, sourceY });
  const openPopover = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setPopover({ x: rect.left + rect.width / 2, y: rect.top });
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: `var(${style.colorToken})`,
          strokeDasharray: style.strokeDasharray,
          strokeLinecap: style.strokeLinecap,
          strokeWidth: 1.7,
          fill: "none",
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            "vf-machine-canvas-edge-label",
            style.className,
            machineCanvasProducerCategoryStyle(edge.producerCategory).className,
          )}
          style={{
            maxWidth: MACHINE_CANVAS_RENDER_POLICY.edgeLabelMaxWidth,
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          data-testid={VISUALIZER_TEST_IDS.canvas.edgeLabel}
          data-edge-group-id={edge.id}
          data-edge-kind={edge.kind}
          data-producer-category={edge.producerCategory}
          data-edge-direction={edge.direction}
          data-source-node-id={source}
          data-target-node-id={target}
          onPointerEnter={(event) => openPopover(event.currentTarget)}
          onPointerLeave={() => setPopover(null)}
          onMouseEnter={(event) => openPopover(event.currentTarget)}
          onMouseLeave={() => setPopover(null)}
        >
          <span>{edge.label}</span>
          {edge.count > 1 ? <span className="vf-machine-canvas-edge-count">+{edge.count - 1}</span> : null}
        </div>
      </EdgeLabelRenderer>
      {popover ? <EdgePopover x={popover.x} y={popover.y} edge={edge} /> : null}
    </>
  );
};

const nodeTypes = {
  "machine-canvas-node": MachineCanvasStateNode,
};

const edgeTypes = {
  "machine-canvas-edge": MachineCanvasEdge,
};

const toReactFlowNodes = (graph: MachineCanvasRenderedGraph): MachineCanvasFlowNode[] =>
  graph.nodes.map((node) => ({
    id: node.id,
    type: "machine-canvas-node",
    position: node.position,
    data: { node },
    draggable: false,
    selectable: false,
    connectable: false,
  }));

const toReactFlowEdges = (graph: MachineCanvasRenderedGraph): MachineCanvasFlowEdge[] =>
  graph.edges.map((edge) => {
    const style = machineCanvasEdgeKindStyle(edge.kind);

    return {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: "machine-canvas-edge",
      data: { edge },
      selectable: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: `var(${style.colorToken})`,
      },
    };
  });

const MachineCanvasGraphStatus = ({
  message,
  tone,
}: {
  message: string;
  tone: "loading" | "error";
}) => (
  <div
    className="grid min-h-0 place-items-center bg-(--vf-bg-elevated) p-4"
    data-testid={VISUALIZER_TEST_IDS.canvas.graph}
    data-density="pending"
    data-visible-edge-count="0"
  >
    <div
      className="vf-machine-canvas-status"
      data-testid={VISUALIZER_TEST_IDS.canvas.layoutStatus}
      data-layout-status={tone}
    >
      <AlertCircle aria-hidden="true" className={cn("size-4", tone === "error" ? "text-(--vf-danger)" : "text-(--vf-accent)")} />
      <p>{message}</p>
    </div>
  </div>
);

const MachineCanvasReactFlow = ({ graph }: { graph: MachineCanvasRenderedGraph }) => {
  const nodes = useMemo(() => toReactFlowNodes(graph), [graph]);
  const edges = useMemo(() => toReactFlowEdges(graph), [graph]);
  const { fitView } = useReactFlow();

  useEffect(() => {
    return scheduleMachineCanvasFitView(fitView);
  }, [fitView, graph]);

  return (
    <div
      className="vf-machine-canvas"
      data-testid={VISUALIZER_TEST_IDS.canvas.graph}
      data-density={graph.density}
      data-visible-edge-count={graph.visibleEdgeCount}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: MACHINE_CANVAS_RENDER_POLICY.fitViewPadding }}
        minZoom={MACHINE_CANVAS_RENDER_POLICY.minZoom}
        maxZoom={MACHINE_CANVAS_RENDER_POLICY.maxZoom}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--vf-border-soft)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

const MachineCanvasGraphInner = ({ flow, sourceVersion }: MachineCanvasGraphProps) => {
  const engine = useMemo(() => createElkLayoutEngine(), []);
  const layoutKeyFor = useMemo(() => createMachineCanvasLayoutKeyFactory(), []);
  const layoutKey = layoutKeyFor(flow, sourceVersion);
  const [layoutState, setLayoutState] = useState<MachineCanvasGraphLayoutState>({ status: "loading", layoutKey });

  useEffect(
    () => startMachineCanvasGraphLayout({ flow, engine, layoutKey, onLayoutState: setLayoutState }),
    [engine, flow, layoutKey],
  );

  const visibleLayoutState = visibleMachineCanvasGraphLayoutState(layoutState, layoutKey);

  switch (visibleLayoutState.status) {
    case "ready":
      return <MachineCanvasReactFlow graph={visibleLayoutState.graph} />;
    case "layout-error":
      return <MachineCanvasGraphStatus message={visibleLayoutState.message} tone="error" />;
    case "loading":
      return <MachineCanvasGraphStatus message="Graph layout running" tone="loading" />;
  }
};

export const MachineCanvasGraph = (props: MachineCanvasGraphProps) => (
  <ReactFlowProvider>
    <MachineCanvasGraphInner {...props} />
  </ReactFlowProvider>
);

export default MachineCanvasGraph;
