import type { GraphSimulationSliceRef } from "./types";

export const refKey = (ref: GraphSimulationSliceRef): string => {
  if (ref.kind === "actor") return `actor:${ref.machineId}:${ref.actorId}`;

  return `${ref.kind}:${ref.machineId}`;
};

export const sliceRefEquals = (left: GraphSimulationSliceRef, right: GraphSimulationSliceRef): boolean =>
  refKey(left) === refKey(right);

export const createSliceId = (ref: GraphSimulationSliceRef): string => refKey(ref);
