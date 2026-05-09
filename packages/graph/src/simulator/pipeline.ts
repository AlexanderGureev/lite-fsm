import type { GraphDiagnostic } from "../types";
import type {
  GraphContextPatch,
  GraphSendFailureReason,
  GraphSimulationConsumption,
  GraphSimulationSlice,
  GraphSimulationTimelineStep,
} from "./types";
import type { DispatchInput, DispatchPipelineInput, DispatchPipelineResult, DispatchPipelineState, SelectedTransition } from "./pipeline-types";
import { diagnosticForSendFailure } from "./diagnostics";
import { collectEmissionsForConsumption } from "./effects";
import { cloneContext, cloneEvent, validateContext, validateEvent } from "./json";
import { routeSlices } from "./routing";
import { applyContextPolicy, applyEvaluationPolicy, selectCandidate, transitionChoiceMap } from "./selection";
import { stateForTarget } from "./semantics";
import { freezeSnapshot, machineById, sliceByRef } from "./snapshot";
import { appendTimelineStep, nextTimelineStepRef, pendingChoiceFromCandidates, rowRefForTransition } from "./timeline";
import { candidatesForSlice } from "./transitions";

const failureResult = (
  reason: GraphSendFailureReason,
  diagnostics: readonly GraphDiagnostic[],
  snapshot: DispatchPipelineInput["snapshot"],
): DispatchPipelineResult => ({
  kind: "failure",
  result: {
    ok: false,
    reason,
    snapshot,
    diagnostics,
  },
});

const pendingChoiceResult = (
  input: DispatchPipelineInput,
  state: DispatchPipelineState,
): DispatchPipelineResult => {
  const publicPendingChoice = pendingChoiceFromCandidates(
    input.pendingChoiceId,
    state.event,
    input.dispatch.source,
    input.snapshot.timeline.currentStepId,
    state.pendingCandidatesBySliceId,
  );

  return {
    kind: "pending-choice",
    result: {
      ok: false,
      reason: "choice-required",
      snapshot: input.snapshot,
      pendingChoice: publicPendingChoice,
      diagnostics: state.diagnostics,
    },
    pendingChoice: {
      ...publicPendingChoice,
      routing: input.dispatch.routing,
      sourceRowRefs: input.dispatch.sourceRowRefs ?? [],
      originSliceKey: input.dispatch.originSliceKey,
    },
  };
};

const validateEventPhase = (input: DispatchPipelineInput): DispatchPipelineResult | { event: DispatchInput["event"] } => {
  const eventDiagnostic = validateEvent(input.dispatch.event);
  if (eventDiagnostic) {
    return failureResult(
      eventDiagnostic.code === "LFG_SIM_INVALID_PAYLOAD" ? "invalid-payload" : "invalid-event",
      [eventDiagnostic],
      input.snapshot,
    );
  }

  return { event: cloneEvent(input.dispatch.event) };
};

const createPipelineState = (input: DispatchPipelineInput, event: DispatchInput["event"]): DispatchPipelineState => {
  const sourceSlice =
    input.dispatch.source.kind === "manual-effect" ? sliceByRef(input.snapshot, input.dispatch.source.slice) : undefined;
  const nextStep = nextTimelineStepRef(input.snapshot);

  return {
    event,
    routedSlices: routeSlices(input.document, input.snapshot, input.dispatch.routing, sourceSlice),
    pendingCandidatesBySliceId: {},
    selections: [],
    choices: [],
    diagnostics: [],
    nextSlices: { ...input.snapshot.slices },
    consumed: [],
    contextPatches: [],
    rowRefs: [...(input.dispatch.sourceRowRefs ?? [])],
    stepId: nextStep.stepId,
    stepIndex: nextStep.index,
  };
};

const evaluateAndSelectPhase = (
  input: DispatchPipelineInput,
  state: DispatchPipelineState,
): DispatchPipelineResult | DispatchPipelineState => {
  const choiceMap = transitionChoiceMap(input.dispatch.choices);

  for (const routed of state.routedSlices) {
    const candidates = candidatesForSlice(input.document, routed.slice, state.event.type, routed.confidence);
    if (candidates.length === 0) continue;

    const evaluated = applyEvaluationPolicy(input.evaluationPolicy, routed.slice, state.event, candidates);
    if (evaluated.kind === "blocked") return failureResult("evaluation-blocked", evaluated.diagnostics, input.snapshot);

    const resolvedCandidate = evaluated.kind === "resolved" ? evaluated.candidate : undefined;
    const evaluatedCandidates = evaluated.kind === "unchanged" ? evaluated.candidates : candidates;
    const selection = selectCandidate({
      slice: routed.slice,
      event: state.event,
      candidates: evaluatedCandidates,
      evaluated: resolvedCandidate,
      evaluationResolved: evaluated.kind !== "unchanged",
      choices: choiceMap,
      branchPolicy: input.branchPolicy,
      originSliceKey: input.dispatch.originSliceKey,
    });

    if (!selection.ok) {
      state.diagnostics.push(...selection.diagnostics);
      if (selection.choice) state.choices.push(selection.choice);
      if (selection.reason === "choice-required" && selection.pendingCandidates) {
        state.pendingCandidatesBySliceId[routed.slice.sliceId] = selection.pendingCandidates;
        continue;
      }

      return failureResult(selection.reason, selection.diagnostics, input.snapshot);
    }

    state.choices.push(selection.choice);
    state.selections.push({
      slice: routed.slice,
      candidate: selection.candidate,
      choice: selection.choice,
      selection: selection.selection,
    });
  }

  if (Object.keys(state.pendingCandidatesBySliceId).length > 0) {
    return pendingChoiceResult(input, state);
  }

  return state;
};

const commitSelectionsPhase = (
  input: DispatchPipelineInput,
  state: DispatchPipelineState,
): DispatchPipelineResult => {
  for (const selection of state.selections) {
    const blocked = blockedCandidateResult(input, selection);
    if (blocked) return blocked;

    const machine = machineById(input.document, selection.slice.machineId);
    if (!machine) {
      return failureResult(
        "unknown-slice",
        [diagnosticForSendFailure("unknown-slice", `Unknown graph slice '${selection.slice.sliceId}'.`, selection.slice.machineId)],
        input.snapshot,
      );
    }

    const nextState = stateForTarget(machine, selection.slice, selection.candidate.target);
    if (typeof nextState === "string") {
      return failureResult(
        nextState,
        [
          diagnosticForSendFailure(
            nextState,
            `Transition '${selection.candidate.transitionId}' target cannot be resolved.`,
            selection.slice.machineId,
          ),
        ],
        input.snapshot,
      );
    }

    const reduced = applyContextPolicy(input.evaluationPolicy, selection.slice, state.event, selection.candidate);
    if (reduced.kind === "blocked") return failureResult("evaluation-blocked", reduced.diagnostics, input.snapshot);

    const contextAfter = cloneContext(reduced.context);
    const contextDiagnostic = validateContext(contextAfter);
    if (contextDiagnostic) return failureResult("invalid-context", [contextDiagnostic], input.snapshot);

    const patches = reduced.kind === "changed" ? [...(reduced.patches ?? [])] : [];
    const nextSlice: GraphSimulationSlice = {
      ...selection.slice,
      stateId: nextState.state.id,
      stateKey: nextState.state.key,
      context: contextAfter,
      status: nextState.status,
    };
    state.nextSlices[selection.slice.sliceId] = nextSlice;
    state.contextPatches.push(...patches);
    state.rowRefs.push(rowRefForTransition(selection.candidate));
    state.consumed.push(consumptionForSelection(selection, nextSlice, patches));
  }

  const nextSnapshotBase = { ...input.snapshot, slices: state.nextSlices };
  const emissions = state.consumed.flatMap((item) => {
    const slice = state.nextSlices[item.sliceId] as GraphSimulationSlice;
    return collectEmissionsForConsumption(input.document, slice, item.toStateId !== item.fromStateId, state.stepId);
  });
  const step: GraphSimulationTimelineStep = {
    stepId: state.stepId,
    parentStepId: input.snapshot.timeline.currentStepId,
    index: state.stepIndex,
    event: state.event,
    source: input.dispatch.source,
    consumed: state.consumed,
    emissions,
    choices: state.choices,
    contextPatches: state.contextPatches,
    rowRefs: state.rowRefs,
    diagnostics: [],
  };
  const nextSnapshot = freezeSnapshot({
    ...nextSnapshotBase,
    timeline: appendTimelineStep(input.snapshot, step),
  });

  return {
    kind: "success",
    result: {
      ok: true,
      snapshot: nextSnapshot,
      step: nextSnapshot.timeline.stepsById[state.stepId] as GraphSimulationTimelineStep,
    },
  };
};

const blockedCandidateResult = (
  input: DispatchPipelineInput,
  selection: SelectedTransition,
): DispatchPipelineResult | undefined => {
  if (selection.candidate.canApply) return undefined;

  const reason = selection.candidate.blockedReason === "blocked-target" ? "blocked-target" : "target-not-resolved";
  return failureResult(
    reason,
    [diagnosticForSendFailure(reason, `Transition '${selection.candidate.transitionId}' cannot be committed.`, selection.slice.machineId)],
    input.snapshot,
  );
};

const consumptionForSelection = (
  selection: SelectedTransition,
  nextSlice: GraphSimulationSlice,
  patches: readonly GraphContextPatch[],
): GraphSimulationConsumption => ({
  slice: selection.slice.ref,
  machineId: selection.slice.machineId,
  sliceId: selection.slice.sliceId,
  fromStateId: selection.slice.stateId,
  fromStateKey: selection.slice.stateKey,
  toStateId: nextSlice.stateId,
  toStateKey: nextSlice.stateKey,
  acceptedTransitionId: selection.candidate.acceptedTransitionId,
  effectiveTransitionId: selection.candidate.effectiveTransitionId,
  transitionId: selection.candidate.transitionId,
  reducerCaseId: selection.candidate.reducerCaseId,
  guard: selection.candidate.guard,
  target: selection.candidate.target,
  targetKind: selection.candidate.target.kind,
  contextBefore: cloneContext(selection.slice.context),
  contextAfter: nextSlice.context,
  contextPatches: patches,
  selection: selection.selection,
  status: "committed",
});

export const runDispatchPipeline = (input: DispatchPipelineInput): DispatchPipelineResult => {
  const validated = validateEventPhase(input);
  if ("kind" in validated) return validated;

  const state = createPipelineState(input, validated.event);
  const selected = evaluateAndSelectPhase(input, state);
  if ("kind" in selected) return selected;

  return commitSelectionsPhase(input, selected);
};
