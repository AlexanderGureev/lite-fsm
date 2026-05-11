import type {
  GraphAvailableTransition,
  GraphSimulationSnapshot,
  GraphSimulationTimelineStep,
  GraphSuggestedEmission,
} from "@lite-fsm/graph/simulator";
import type {
  GraphVisualizerSimulationOverlayInput,
  GraphVisualizerSimulationRowRef,
} from "@lite-fsm/graph/view-model";

export type SimulationOverlayFacts = {
  snapshot?: GraphSimulationSnapshot;
  availableTransitions: readonly GraphAvailableTransition[];
  suggestedEmissions: readonly GraphSuggestedEmission[];
  inspectedStepId?: string;
};

const appendRecordValue = (
  record: Record<string, readonly string[]>,
  key: string,
  value: string,
): void => {
  record[key] = [...(record[key] ?? []), value];
};

const uniqueRecordValues = (record: Record<string, readonly string[]>): Record<string, readonly string[]> =>
  Object.fromEntries(Object.entries(record).map(([key, values]) => [key, [...new Set(values)]]));

const timelineStep = (
  snapshot: GraphSimulationSnapshot,
  stepId: string | undefined,
): GraphSimulationTimelineStep | undefined => (stepId ? snapshot.timeline.stepsById[stepId] : undefined);

const rowRef = (ref: GraphSimulationTimelineStep["rowRefs"][number]): GraphVisualizerSimulationRowRef =>
  ref.kind === "transition"
    ? { kind: "transition", machineId: ref.machineId, transitionId: ref.transitionId, sliceId: ref.sliceId }
    : { kind: "emission", machineId: ref.machineId, emissionId: ref.emissionId, sliceId: ref.sliceId };

const rowRefs = (step: GraphSimulationTimelineStep | undefined): readonly GraphVisualizerSimulationRowRef[] =>
  step?.rowRefs.map(rowRef) ?? [];

export const buildSimulationOverlayInput = ({
  snapshot,
  availableTransitions,
  suggestedEmissions,
  inspectedStepId,
}: SimulationOverlayFacts): GraphVisualizerSimulationOverlayInput | undefined => {
  if (!snapshot) return undefined;

  const currentStateIdsBySliceId: Record<string, string> = {};
  const currentStateIdsByMachineId: Record<string, string> = {};

  for (const slice of Object.values(snapshot.slices)) {
    currentStateIdsBySliceId[slice.sliceId] = slice.stateId;
    currentStateIdsByMachineId[slice.machineId] = slice.stateId;
  }

  const availableTransitionIdsBySliceId: Record<string, readonly string[]> = {};
  const availableTransitionIdsByMachineId: Record<string, readonly string[]> = {};
  for (const transition of availableTransitions) {
    appendRecordValue(availableTransitionIdsBySliceId, transition.sliceId, transition.transitionId);
    appendRecordValue(availableTransitionIdsByMachineId, transition.machineId, transition.transitionId);
  }

  const suggestedEmissionIdsBySliceId: Record<string, readonly string[]> = {};
  const suggestedEmissionIdsByMachineId: Record<string, readonly string[]> = {};
  for (const emission of suggestedEmissions) {
    appendRecordValue(suggestedEmissionIdsBySliceId, emission.sliceId, emission.emissionId);
    appendRecordValue(suggestedEmissionIdsByMachineId, emission.machineId, emission.emissionId);
  }

  return {
    currentStateIdsBySliceId,
    currentStateIdsByMachineId,
    availableTransitionIdsBySliceId: uniqueRecordValues(availableTransitionIdsBySliceId),
    availableTransitionIdsByMachineId: uniqueRecordValues(availableTransitionIdsByMachineId),
    suggestedEmissionIdsBySliceId: uniqueRecordValues(suggestedEmissionIdsBySliceId),
    suggestedEmissionIdsByMachineId: uniqueRecordValues(suggestedEmissionIdsByMachineId),
    firedRefs: rowRefs(timelineStep(snapshot, snapshot.timeline.currentStepId)),
    inspectedRefs: rowRefs(timelineStep(snapshot, inspectedStepId)),
  };
};

export const withInspectedStep = (
  overlay: GraphVisualizerSimulationOverlayInput | undefined,
  snapshot: GraphSimulationSnapshot | undefined,
  inspectedStepId: string | undefined,
): GraphVisualizerSimulationOverlayInput | undefined => {
  if (!overlay || !snapshot) return overlay;

  return {
    ...overlay,
    inspectedRefs: rowRefs(timelineStep(snapshot, inspectedStepId)),
  };
};
