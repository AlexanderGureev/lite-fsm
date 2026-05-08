import type { GraphEmission, LiteFsmGraphMachine } from "../types";
import {
  isActorInitSnapshot,
  isTerminalSnapshot,
  stateRefMatches,
  type SimulatorStateIndex,
} from "./state";
import { resolveAvailableTransitions } from "./resolve";
import type { GraphSimulationSnapshot, GraphSuggestedEmission } from "./types";

const emissionMatchesState = (emission: GraphEmission, snapshot: GraphSimulationSnapshot): boolean =>
  emission.sourceState !== "*" &&
  emission.sourceState.kind === "state" &&
  stateRefMatches(emission.sourceState, snapshot.stateId);

const emissionMatchesWildcard = (emission: GraphEmission): boolean =>
  emission.sourceState === "*" || emission.sourceState.kind === "wildcard";

const followBlockReason = (
  machine: LiteFsmGraphMachine,
  index: SimulatorStateIndex,
  snapshot: GraphSimulationSnapshot,
  emission: GraphEmission,
): GraphSuggestedEmission["blockedReason"] | undefined => {
  if (emission.routing.kind !== "default") return "non-local-routing";
  if (resolveAvailableTransitions(machine, index, snapshot, emission.event.type).length === 0) {
    return "event-not-accepted";
  }

  return undefined;
};

const toSuggestedEmission = (
  machine: LiteFsmGraphMachine,
  index: SimulatorStateIndex,
  snapshot: GraphSimulationSnapshot,
  emission: GraphEmission,
): GraphSuggestedEmission => {
  const blockedReason = followBlockReason(machine, index, snapshot, emission);

  return {
    emissionId: emission.id,
    event: emission.event,
    routing: emission.routing,
    guard: emission.guard,
    canFollowLocally: blockedReason === undefined,
    blockedReason,
  };
};

export const getSuggestedEmissionsForSnapshot = (
  machine: LiteFsmGraphMachine,
  index: SimulatorStateIndex,
  snapshot: GraphSimulationSnapshot,
): GraphSuggestedEmission[] => {
  const lastStep = snapshot.history[snapshot.history.length - 1];
  if (!lastStep || isTerminalSnapshot(snapshot)) return [];

  const stateSpecific = machine.emissions.filter((emission) => emissionMatchesState(emission, snapshot));
  if (lastStep.from !== snapshot.stateKey && stateSpecific.length > 0) {
    return stateSpecific.map((emission) => toSuggestedEmission(machine, index, snapshot, emission));
  }

  if (isActorInitSnapshot(machine, snapshot)) return [];

  return machine.emissions
    .filter(emissionMatchesWildcard)
    .map((emission) => toSuggestedEmission(machine, index, snapshot, emission));
};
