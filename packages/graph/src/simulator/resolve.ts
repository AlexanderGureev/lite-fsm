import type { GraphTransition, LiteFsmGraphMachine } from "../types";
import {
  blockedReasonForTarget,
  isActorInitSnapshot,
  isTerminalSnapshot,
  isWildcardRef,
  stateRefMatches,
  type SimulatorStateIndex,
} from "./state";
import type { GraphAvailableTransition, GraphSimulationSnapshot } from "./types";

const isConfigTransition = (transition: GraphTransition): boolean => transition.layer === "config";

const isReducerTransition = (transition: GraphTransition): boolean => transition.layer === "reducer";

const sameAcceptanceSource = (reducer: GraphTransition, accepted: GraphTransition): boolean => {
  if (isWildcardRef(accepted.source)) return isWildcardRef(reducer.source);

  return accepted.source.kind === "state" && stateRefMatches(reducer.source, accepted.source.stateId);
};

const configTransitionsForState = (
  machine: LiteFsmGraphMachine,
  snapshot: GraphSimulationSnapshot,
): GraphTransition[] => {
  return machine.transitions.filter(
    (transition) => isConfigTransition(transition) && stateRefMatches(transition.source, snapshot.stateId),
  );
};

const wildcardConfigTransitions = (
  machine: LiteFsmGraphMachine,
  snapshot: GraphSimulationSnapshot,
): GraphTransition[] => {
  if (isTerminalSnapshot(snapshot) || isActorInitSnapshot(machine, snapshot)) return [];

  return machine.transitions.filter((transition) => isConfigTransition(transition) && isWildcardRef(transition.source));
};

const acceptedConfigTransitions = (
  machine: LiteFsmGraphMachine,
  snapshot: GraphSimulationSnapshot,
  event?: string,
): GraphTransition[] => {
  if (isTerminalSnapshot(snapshot)) return [];

  const stateSpecific = configTransitionsForState(machine, snapshot);
  const stateEvents = new Set(stateSpecific.map((transition) => transition.event.type));
  const stateAccepted = event
    ? stateSpecific.filter((transition) => transition.event.type === event)
    : stateSpecific;
  const wildcardAccepted = wildcardConfigTransitions(machine, snapshot).filter((transition) => {
    if (stateEvents.has(transition.event.type)) return false;

    return event === undefined || transition.event.type === event;
  });

  return [...stateAccepted, ...wildcardAccepted];
};

const reducerTransitionsForAcceptance = (
  machine: LiteFsmGraphMachine,
  accepted: GraphTransition,
): GraphTransition[] => {
  return machine.transitions.filter(
    (transition) =>
      isReducerTransition(transition) &&
      transition.event.type === accepted.event.type &&
      sameAcceptanceSource(transition, accepted),
  );
};

const availableFrom = (
  accepted: GraphTransition,
  effective: GraphTransition,
  index: SimulatorStateIndex,
): GraphAvailableTransition => {
  const blockedReason = blockedReasonForTarget(effective.target, index);

  return {
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
    blockedReason,
  };
};

export const resolveAvailableTransitions = (
  machine: LiteFsmGraphMachine,
  index: SimulatorStateIndex,
  snapshot: GraphSimulationSnapshot,
  event?: string,
): GraphAvailableTransition[] => {
  return acceptedConfigTransitions(machine, snapshot, event).flatMap((accepted) => {
    const reducerTransitions = reducerTransitionsForAcceptance(machine, accepted);
    const effectiveTransitions = reducerTransitions.length > 0 ? reducerTransitions : [accepted];

    return effectiveTransitions.map((effective) => availableFrom(accepted, effective, index));
  });
};
