import type { GraphState, GraphStateRef, GraphTarget, GraphTransition, LiteFsmGraphMachine } from "../types";
import type { RouteConfidence } from "./pipeline-types";
import type { GraphAvailableTransition, GraphSendFailureReason, GraphSimulationSlice } from "./types";

export const findStateByKey = (machine: LiteFsmGraphMachine, stateKey: string): GraphState | undefined =>
  machine.states.find((state) => state.key === stateKey);

export const findStateById = (machine: LiteFsmGraphMachine, stateId: string): GraphState | undefined =>
  machine.states.find((state) => state.id === stateId);

export const sourceMatchesSlice = (transition: GraphTransition, slice: GraphSimulationSlice): boolean => {
  if (transition.source.kind !== "state") return false;

  return transition.source.stateId === slice.stateId;
};

export const sourceRefEquals = (left: GraphStateRef, right: GraphStateRef): boolean => {
  if (left.kind === "state" && right.kind === "state") return left.stateId === right.stateId;

  return left.kind === right.kind;
};

export const transitionBlockedReason = (
  target: GraphTarget,
): GraphAvailableTransition["blockedReason"] | undefined => {
  if (target.kind === "dynamic" || target.kind === "unknown") return "target-not-resolved";
  if (target.kind === "blocked") return "blocked-target";

  return undefined;
};

export const combineTransitionConfidence = (
  confidence: GraphTransition["confidence"],
  routeConfidence: RouteConfidence,
): GraphAvailableTransition["confidence"] => {
  if (routeConfidence === "partial" && confidence === "exact") return "partial";

  return confidence;
};

export const configTransitionsForEvent = (
  machine: LiteFsmGraphMachine,
  slice: GraphSimulationSlice,
  eventType?: string,
): GraphTransition[] => {
  if (slice.status !== "active") return [];

  const configTransitions = machine.transitions.filter((transition) => transition.layer === "config");
  const stateTransitions = configTransitions.filter((transition) => {
    if (!sourceMatchesSlice(transition, slice)) return false;

    return eventType === undefined || transition.event.type === eventType;
  });
  const wildcardTransitions =
    slice.kind === "actorTemplate" && slice.stateKey === "__INIT"
      ? []
      : configTransitions.filter((transition) => {
          if (transition.source.kind !== "wildcard") return false;

          return eventType === undefined || transition.event.type === eventType;
        });

  if (eventType !== undefined) return stateTransitions.length > 0 ? stateTransitions : wildcardTransitions;

  const stateEvents = new Set(stateTransitions.map((transition) => transition.event.type));
  return [...stateTransitions, ...wildcardTransitions.filter((transition) => !stateEvents.has(transition.event.type))];
};

export const reducerTransitionsForAccepted = (
  machine: LiteFsmGraphMachine,
  accepted: GraphTransition,
): GraphTransition[] => {
  return machine.transitions.filter(
    (transition) =>
      transition.layer === "reducer" &&
      transition.event.type === accepted.event.type &&
      sourceRefEquals(transition.source, accepted.source),
  );
};

export const stateForTarget = (
  machine: LiteFsmGraphMachine,
  slice: GraphSimulationSlice,
  target: GraphTarget,
): { state: GraphState; status: GraphSimulationSlice["status"] } | GraphSendFailureReason => {
  if (target.kind === "self") {
    const state = findStateById(machine, slice.stateId);
    return state ? { state, status: slice.status } : "target-not-resolved";
  }
  if (target.kind === "state") {
    const state = findStateById(machine, target.stateId);
    if (!state) return "target-not-resolved";

    return { state, status: state.kind === "terminal" ? "terminal" : "active" };
  }
  if (target.kind === "terminal") {
    const state = findStateByKey(machine, target.terminal) ?? {
      id: `${machine.id}:state:${target.terminal}`,
      key: target.terminal,
      kind: "terminal" as const,
      isInitial: false,
      isPublicActorState: false,
    };

    return { state, status: "terminal" };
  }
  if (target.kind === "blocked") return "blocked-target";

  return "target-not-resolved";
};
