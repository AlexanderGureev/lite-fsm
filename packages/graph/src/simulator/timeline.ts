import type {
  GraphAvailableTransition,
  GraphSimulationPendingChoice,
  GraphSimulationTimeline,
  GraphSimulationTimelineStep,
  GraphSimulationEvent,
  GraphSimulationEventSource,
  GraphSimulationSnapshot,
  GraphSimulationRowRef,
} from "./types";

export const ROOT_STEP_ID = "step:0";

export const createRootTimeline = (): GraphSimulationTimeline => {
  const rootStep: GraphSimulationTimelineStep = {
    stepId: ROOT_STEP_ID,
    index: 0,
    source: { kind: "initial" },
    consumed: [],
    emissions: [],
    choices: [],
    contextPatches: [],
    rowRefs: [],
    diagnostics: [],
  };

  return {
    rootStepId: ROOT_STEP_ID,
    currentStepId: ROOT_STEP_ID,
    stepsById: { [ROOT_STEP_ID]: rootStep },
    childrenByStepId: { [ROOT_STEP_ID]: [] },
    linearStepIds: [ROOT_STEP_ID],
  };
};

export const nextTimelineStepRef = (snapshot: GraphSimulationSnapshot): { stepId: string; index: number } => {
  const index = snapshot.timeline.linearStepIds.length;

  return { stepId: `step:${index}`, index };
};

export const appendTimelineStep = (
  snapshot: GraphSimulationSnapshot,
  step: GraphSimulationTimelineStep,
): GraphSimulationTimeline => {
  const parentStepId = snapshot.timeline.currentStepId;
  const parentChildren = snapshot.timeline.childrenByStepId[parentStepId] as readonly string[];

  return {
    rootStepId: snapshot.timeline.rootStepId,
    currentStepId: step.stepId,
    stepsById: {
      ...snapshot.timeline.stepsById,
      [step.stepId]: step,
    },
    childrenByStepId: {
      ...snapshot.timeline.childrenByStepId,
      [parentStepId]: [...parentChildren, step.stepId],
      [step.stepId]: [],
    },
    linearStepIds: [...snapshot.timeline.linearStepIds, step.stepId],
  };
};

export const rowRefForTransition = (candidate: GraphAvailableTransition): GraphSimulationRowRef => ({
  kind: "transition",
  machineId: candidate.machineId,
  transitionId: candidate.transitionId,
  sliceId: candidate.sliceId,
});

export const pendingChoiceFromCandidates = (
  pendingChoiceId: string,
  event: GraphSimulationEvent,
  source: GraphSimulationEventSource,
  createdAtStepId: string,
  candidatesBySliceId: Record<string, readonly GraphAvailableTransition[]>,
): GraphSimulationPendingChoice => ({
  pendingChoiceId,
  event,
  source,
  candidatesBySliceId,
  createdAtStepId,
});
