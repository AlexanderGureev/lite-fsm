import { MACHINE_CANVAS_RENDER_POLICY } from "./machine-canvas-render-policy";
import type { MachineCanvasPoint, MachineCanvasSize } from "./machine-canvas-render-types";

export type MachineCanvasLabelSlot = {
  edgeId: string;
  points: readonly MachineCanvasPoint[];
  t: number;
  width: number;
  height: number;
};

export type MachineCanvasLabelObstacle = MachineCanvasPoint & MachineCanvasSize;

type LabelSlotWithPosition = MachineCanvasLabelSlot & MachineCanvasPoint;

export const clampMachineCanvasLabelT = (t: number): number =>
  Math.min(
    MACHINE_CANVAS_RENDER_POLICY.labelTMax,
    Math.max(MACHINE_CANVAS_RENDER_POLICY.labelTMin, t),
  );

export const machineCanvasPolylinePointAt = (
  points: readonly MachineCanvasPoint[],
  t: number,
): MachineCanvasPoint => {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  const segments = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    return {
      start: point,
      end: next,
      length: Math.hypot(next.x - point.x, next.y - point.y),
    };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = total * Math.max(0, Math.min(1, t));

  for (const segment of segments) {
    if (segment.length >= remaining) {
      const ratio = segment.length === 0 ? 0 : remaining / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }

    remaining -= segment.length;
  }

  return points[points.length - 1];
};

export const machineCanvasRoundedPolylinePath = (
  points: readonly MachineCanvasPoint[],
  radius = 10,
): string => {
  if (points.length < 2) return "";

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incomingLength = Math.hypot(current.x - previous.x, current.y - previous.y) || 1;
    const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y) || 1;
    const cornerRadius = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    const beforeCorner = {
      x: current.x - ((current.x - previous.x) / incomingLength) * cornerRadius,
      y: current.y - ((current.y - previous.y) / incomingLength) * cornerRadius,
    };
    const afterCorner = {
      x: current.x + ((next.x - current.x) / outgoingLength) * cornerRadius,
      y: current.y + ((next.y - current.y) / outgoingLength) * cornerRadius,
    };

    path += ` L ${beforeCorner.x} ${beforeCorner.y} Q ${current.x} ${current.y}, ${afterCorner.x} ${afterCorner.y}`;
  }

  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
};

export const estimateMachineCanvasLabelBox = (label: string): Pick<MachineCanvasLabelSlot, "width" | "height"> => ({
  width: Math.min(
    MACHINE_CANVAS_RENDER_POLICY.edgeLabelMaxWidth,
    label.length * MACHINE_CANVAS_RENDER_POLICY.edgeLabelCharWidth +
      MACHINE_CANVAS_RENDER_POLICY.edgeLabelPadding,
  ),
  height: MACHINE_CANVAS_RENDER_POLICY.edgeLabelHeight,
});

const positionedSlot = (slot: MachineCanvasLabelSlot, t: number): LabelSlotWithPosition => {
  const point = machineCanvasPolylinePointAt(slot.points, t);
  return { ...slot, t, x: point.x, y: point.y };
};

const labelSlotsOverlap = (left: LabelSlotWithPosition, right: LabelSlotWithPosition): boolean =>
  Math.abs(left.x - right.x) < (left.width + right.width) / 2 + 8 &&
  Math.abs(left.y - right.y) < (left.height + right.height) / 2 + 6;

const labelSlotOverlapsObstacle = (slot: LabelSlotWithPosition, obstacle: MachineCanvasLabelObstacle): boolean => {
  const obstacleCenterX = obstacle.x + obstacle.width / 2;
  const obstacleCenterY = obstacle.y + obstacle.height / 2;

  return (
    Math.abs(slot.x - obstacleCenterX) < (slot.width + obstacle.width) / 2 &&
    Math.abs(slot.y - obstacleCenterY) < (slot.height + obstacle.height) / 2
  );
};

const labelSlotHasCollision = (
  slot: LabelSlotWithPosition,
  positioned: readonly LabelSlotWithPosition[],
  slotIndex: number,
  obstacles: readonly MachineCanvasLabelObstacle[],
): boolean =>
  obstacles.some((obstacle) => labelSlotOverlapsObstacle(slot, obstacle)) ||
  positioned.some((candidate, index) => index < slotIndex && labelSlotsOverlap(slot, candidate));

export const resolveMachineCanvasLabelCollisions = (
  slots: readonly MachineCanvasLabelSlot[],
  obstacles: readonly MachineCanvasLabelObstacle[] = [],
): ReadonlyMap<string, number> => {
  const positioned = slots.map((slot) => positionedSlot(slot, clampMachineCanvasLabelT(slot.t)));

  for (let pass = 0; pass < MACHINE_CANVAS_RENDER_POLICY.labelCollisionPasses; pass += 1) {
    let moved = false;

    for (let index = 0; index < positioned.length; index += 1) {
      if (!labelSlotHasCollision(positioned[index], positioned, index, obstacles)) continue;

      const candidates = MACHINE_CANVAS_RENDER_POLICY.labelCollisionCandidateShifts
        .map((shift) => positionedSlot(positioned[index], clampMachineCanvasLabelT(positioned[index].t + shift)))
        .filter((candidate) => candidate.t !== positioned[index].t);
      const available = candidates.find((candidate) => !labelSlotHasCollision(candidate, positioned, index, obstacles));

      if (!available) continue;

      positioned[index] = available;
      moved = true;
    }

    if (!moved) break;
  }

  return new Map(positioned.map((slot) => [slot.edgeId, slot.t]));
};

export const machineCanvasSelfLoopPath = ({
  sourceX,
  sourceY,
  nodeSize,
  index,
}: {
  sourceX: number;
  sourceY: number;
  nodeSize: MachineCanvasSize;
  index: number;
}): { path: string; labelPoint: MachineCanvasPoint } => {
  const centerX = sourceX - nodeSize.width / 2;
  const nodeTopY = sourceY - nodeSize.height / 2;
  const opening =
    MACHINE_CANVAS_RENDER_POLICY.selfLoopBaseOpening +
    index * MACHINE_CANVAS_RENDER_POLICY.selfLoopStepOpening;
  const reach =
    MACHINE_CANVAS_RENDER_POLICY.selfLoopBaseReach +
    index * MACHINE_CANVAS_RENDER_POLICY.selfLoopStepReach;
  const leftX = centerX - opening / 2;
  const rightX = centerX + opening / 2;
  const peakY = nodeTopY - reach;

  return {
    path: `M ${leftX} ${nodeTopY} C ${leftX} ${peakY}, ${rightX} ${peakY}, ${rightX} ${nodeTopY}`,
    labelPoint: { x: centerX, y: peakY - 10 },
  };
};

export const machineCanvasDirectRoute = ({
  sourcePosition,
  sourceSize,
  targetPosition,
  targetSize,
}: {
  sourcePosition: MachineCanvasPoint;
  sourceSize: MachineCanvasSize;
  targetPosition: MachineCanvasPoint;
  targetSize: MachineCanvasSize;
}): readonly MachineCanvasPoint[] => [
  { x: sourcePosition.x + sourceSize.width, y: sourcePosition.y + sourceSize.height / 2 },
  { x: targetPosition.x, y: targetPosition.y + targetSize.height / 2 },
];
