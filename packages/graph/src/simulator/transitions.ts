import type { GraphTransition, LiteFsmGraphDocument, LiteFsmGraphMachine } from "../types";
import type {
  GraphAvailableTransition,
  GraphAvailableTransitionsInput,
  GraphSimulationSlice,
  GraphSimulationSnapshot,
} from "./types";
import type { RouteConfidence } from "./pipeline-types";
import { machineById, orderedSlices, sliceByRef } from "./snapshot";
import {
  combineTransitionConfidence,
  configTransitionsForEvent,
  reducerTransitionsForAccepted,
  transitionBlockedReason,
} from "./semantics";

const candidateFromTransition = (
  slice: GraphSimulationSlice,
  accepted: GraphTransition,
  effective: GraphTransition,
  routeConfidence: RouteConfidence = "exact",
): GraphAvailableTransition => {
  const blockedReason = transitionBlockedReason(effective.target);

  return {
    slice: slice.ref,
    sliceId: slice.sliceId,
    machineId: slice.machineId,
    transitionId: effective.id,
    acceptedTransitionId: accepted.id,
    effectiveTransitionId: effective.id,
    event: effective.event,
    source: effective.source,
    target: effective.target,
    layer: effective.layer,
    guard: effective.guard,
    reducerCaseId: effective.reducerCaseId,
    canApply: blockedReason === undefined,
    ...(blockedReason ? { blockedReason } : {}),
    confidence: combineTransitionConfidence(effective.confidence, routeConfidence),
  };
};

export const candidatesForSlice = (
  document: LiteFsmGraphDocument,
  slice: GraphSimulationSlice,
  eventType?: string,
  routeConfidence: RouteConfidence = "exact",
): GraphAvailableTransition[] => {
  const machine = machineById(document, slice.machineId);
  if (!machine) return [];

  return configTransitionsForEvent(machine, slice, eventType).flatMap((accepted) => {
    const reducerTransitions = reducerTransitionsForAccepted(machine, accepted);
    if (reducerTransitions.length === 0) return [candidateFromTransition(slice, accepted, accepted, routeConfidence)];

    return reducerTransitions.map((effective) => candidateFromTransition(slice, accepted, effective, routeConfidence));
  });
};

export const availableTransitionsForSnapshot = (
  document: LiteFsmGraphDocument,
  snapshot: GraphSimulationSnapshot,
  input?: GraphAvailableTransitionsInput,
): GraphAvailableTransition[] => {
  const slices = input?.slice ? [sliceByRef(snapshot, input.slice)].filter(Boolean) : orderedSlices(snapshot);

  return (slices as GraphSimulationSlice[]).flatMap((slice) => candidatesForSlice(document, slice, input?.eventType));
};

export const transitionExists = (
  machine: LiteFsmGraphMachine | undefined,
  transitionId: string,
): boolean => machine?.transitions.some((transition) => transition.id === transitionId) ?? false;
