import type { GraphEmission, LiteFsmGraphDocument, LiteFsmGraphMachine } from "../types";
import type {
  GraphSimulationRowRef,
  GraphSimulationSlice,
  GraphSimulationSliceRef,
  GraphSimulationSnapshot,
  GraphStepSuggestedEmission,
  GraphSuggestedEmission,
  GraphSuggestedEmissionsInput,
} from "./types";
import { sliceRefEquals } from "./ids";
import { normalizeRoutingTargetValues } from "./routing";
import { findStateById } from "./semantics";
import { machineById } from "./snapshot";

export const rowRefForEmission = (
  slice: GraphSimulationSlice,
  emission: GraphEmission,
): GraphSimulationRowRef => ({
  kind: "emission",
  machineId: slice.machineId,
  emissionId: emission.id,
  sliceId: slice.sliceId,
});

const emissionSourceKey = (machine: LiteFsmGraphMachine, emission: GraphEmission): string | "*" => {
  if (emission.sourceState === "*") return "*";
  /* v8 ignore next -- stage 9 only collects exact state refs and '*' effect emissions. */
  if (emission.sourceState.kind !== "state") return "*";

  return findStateById(machine, emission.sourceState.stateId)?.key ?? "*";
};

const emissionCanDispatch = (
  document: LiteFsmGraphDocument,
  emission: GraphEmission,
  sourceSlice: GraphSimulationSlice,
): Pick<GraphSuggestedEmission, "canDispatch" | "blockedReason"> => {
  if (sourceSlice.status !== "active") return { canDispatch: false, blockedReason: "terminal-slice" };
  if (emission.routing.kind === "unknown") return { canDispatch: false, blockedReason: "unknown-routing" };
  if (emission.routing.kind === "actor" || emission.routing.kind === "group" || emission.routing.kind === "tag") {
    const sourceMachine = machineById(document, sourceSlice.machineId);
    if (!normalizeRoutingTargetValues(emission.routing.target, sourceSlice, sourceMachine)) {
      return { canDispatch: false, blockedReason: "unknown-routing" };
    }
  }

  return { canDispatch: true };
};

const suggestedEmissionFromIr = (
  document: LiteFsmGraphDocument,
  slice: GraphSimulationSlice,
  machine: LiteFsmGraphMachine,
  emission: GraphEmission,
): GraphSuggestedEmission => {
  const sourceStateKey = emissionSourceKey(machine, emission);
  const dispatch = emissionCanDispatch(document, emission, slice);

  return {
    slice: slice.ref,
    sliceId: slice.sliceId,
    machineId: slice.machineId,
    emissionId: emission.id,
    event: emission.event,
    routing: emission.routing,
    guard: emission.guard,
    ...(emission.sourceState !== "*" && emission.sourceState.kind === "state"
      ? { sourceStateId: emission.sourceState.stateId }
      : {}),
    sourceStateKey,
    canDispatch: dispatch.canDispatch,
    ...(dispatch.blockedReason ? { blockedReason: dispatch.blockedReason } : {}),
    confidence: emission.confidence,
  };
};

export const collectEmissionsForConsumption = (
  document: LiteFsmGraphDocument,
  slice: GraphSimulationSlice,
  enteredState: boolean,
  stepId: string,
): GraphStepSuggestedEmission[] => {
  const machine = machineById(document, slice.machineId);
  if (!machine) return [];

  const emissions: GraphEmission[] = [];
  if (enteredState) {
    emissions.push(
      ...machine.emissions.filter(
        (emission) => emission.sourceState !== "*" && emission.sourceState.kind === "state" && emission.sourceState.stateId === slice.stateId,
      ),
    );
  }
  emissions.push(...machine.emissions.filter((emission) => emission.sourceState === "*"));

  return emissions.map((emission) => ({
    ...suggestedEmissionFromIr(document, slice, machine, emission),
    producedAfterStepId: stepId,
  }));
};

export const currentSuggestedEmissions = (
  snapshot: GraphSimulationSnapshot | undefined,
  input?: GraphSuggestedEmissionsInput,
): GraphSuggestedEmission[] => {
  if (!snapshot) return [];

  const step = snapshot.timeline.stepsById[snapshot.timeline.currentStepId];
  const emissions = step.emissions;
  if (!input?.slice) return emissions.map((emission) => ({ ...emission }));

  const inputSlice: GraphSimulationSliceRef = input.slice;
  return emissions.filter((emission) => sliceRefEquals(emission.slice, inputSlice)).map((emission) => ({ ...emission }));
};
