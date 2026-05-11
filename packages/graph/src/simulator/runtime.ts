import type { GraphDiagnostic, LiteFsmGraphDocument } from "../types";
import type {
  CreateGraphSimulatorOptions,
  GraphAvailableTransition,
  GraphAvailableTransitionsInput,
  GraphBranchSelectionPolicy,
  GraphChooseInput,
  GraphEvaluationPolicy,
  GraphSendFailureReason,
  GraphSendFromEmissionInput,
  GraphSendFromTransitionInput,
  GraphSendInput,
  GraphSendResult,
  GraphSimulationEvent,
  GraphSimulationSnapshot,
  GraphSimulator,
  GraphSimulatorResetInput,
  GraphSimulatorStartResult,
  GraphSuggestedEmission,
  GraphSuggestedEmissionsInput,
  GraphTransitionChoiceOverride,
} from "./types";
import type { DispatchInput, PendingChoiceRecord } from "./pipeline-types";
import { diagnosticForSendFailure } from "./diagnostics";
import { currentSuggestedEmissions, rowRefForEmission } from "./effects";
import { refKey } from "./ids";
import { cloneJsonValue, hasOwn, isPlainObject } from "./json";
import { runDispatchPipeline } from "./pipeline";
import { routingFromEvent } from "./routing";
import { buildInitialSnapshot } from "./scope";
import { DEFAULT_BRANCH_POLICY, pendingChoiceIsCurrent } from "./selection";
import { machineById, sliceByRef } from "./snapshot";
import { availableTransitionsForSnapshot, candidatesForSlice, transitionExists } from "./transitions";

const fail = (
  reason: GraphSendFailureReason,
  diagnostics: readonly GraphDiagnostic[],
  resultSnapshot?: GraphSimulationSnapshot,
): GraphSendResult => ({
  ok: false,
  reason,
  ...(resultSnapshot ? { snapshot: resultSnapshot } : {}),
  diagnostics,
});

export const createGraphSimulatorInternal = (
  document: LiteFsmGraphDocument,
  options: CreateGraphSimulatorOptions = {},
): GraphSimulator => {
  let snapshot: GraphSimulationSnapshot | undefined;
  let pendingChoice: PendingChoiceRecord | undefined;
  let pendingChoiceCounter = 0;

  const branchPolicy = (): GraphBranchSelectionPolicy => options.branchPolicy ?? DEFAULT_BRANCH_POLICY;
  const evaluationPolicy = (): GraphEvaluationPolicy | undefined => options.evaluationPolicy;
  const availableTransitions = (input?: GraphAvailableTransitionsInput): GraphAvailableTransition[] => {
    if (!snapshot) return [];

    return availableTransitionsForSnapshot(document, snapshot, input);
  };
  const suggestedEmissions = (input?: GraphSuggestedEmissionsInput): GraphSuggestedEmission[] =>
    currentSuggestedEmissions(snapshot, input);

  const dispatch = (input: DispatchInput): GraphSendResult => {
    if (!snapshot) {
      return fail("not-started", [diagnosticForSendFailure("not-started", "Graph simulator has not been started.")]);
    }

    const result = runDispatchPipeline({
      document,
      snapshot,
      branchPolicy: branchPolicy(),
      evaluationPolicy: evaluationPolicy(),
      dispatch: input,
      pendingChoiceId: `choice:${snapshot.timeline.currentStepId}:${pendingChoiceCounter}`,
    });

    if (result.kind === "success") {
      snapshot = result.result.snapshot;
      pendingChoice = undefined;
      return result.result;
    }
    if (result.kind === "pending-choice") {
      pendingChoiceCounter += 1;
      pendingChoice = result.pendingChoice;
      return result.result;
    }

    return result.result;
  };

  const start = (): GraphSimulatorStartResult => {
    if (snapshot) return { ok: true, snapshot };

    const result = buildInitialSnapshot(document, options);
    if (!result.ok) return result;

    snapshot = result.snapshot;
    pendingChoice = undefined;

    return { ok: true, snapshot };
  };

  const reset = (input?: GraphSimulatorResetInput): GraphSimulatorStartResult => {
    const result = buildInitialSnapshot(document, options, input);
    if (!result.ok) return result;

    snapshot = result.snapshot;
    pendingChoice = undefined;

    return { ok: true, snapshot };
  };

  const send = (input: GraphSendInput): GraphSendResult => {
    return dispatch({
      event: input.event,
      source: input.source ?? { kind: "external" },
      routing: isPlainObject(input.event) ? routingFromEvent(input.event) : { kind: "default" },
      choices: input.choices,
    });
  };

  const sendFromTransition = (input: GraphSendFromTransitionInput): GraphSendResult => {
    if (!snapshot) {
      return fail("not-started", [diagnosticForSendFailure("not-started", "Graph simulator has not been started.")]);
    }

    const originSlice = sliceByRef(snapshot, input.slice);
    if (!originSlice) {
      return fail("unknown-slice", [diagnosticForSendFailure("unknown-slice", "Unknown graph simulation slice.")], snapshot);
    }

    const machine = machineById(document, originSlice.machineId);
    if (!transitionExists(machine, input.transitionId)) {
      return fail(
        "unknown-transition",
        [diagnosticForSendFailure("unknown-transition", `Unknown graph transition '${input.transitionId}'.`, originSlice.machineId)],
        snapshot,
      );
    }

    const originCandidates = candidatesForSlice(document, originSlice);
    const exactOriginCandidate = originCandidates.find((candidate) => candidate.transitionId === input.transitionId);
    const acceptedOriginCandidates = exactOriginCandidate
      ? []
      : originCandidates.filter((candidate) => candidate.acceptedTransitionId === input.transitionId);
    const originCandidate = exactOriginCandidate ?? acceptedOriginCandidates[0];
    if (!originCandidate) {
      return fail(
        "event-not-accepted",
        [
          diagnosticForSendFailure(
            "event-not-accepted",
            `Transition '${input.transitionId}' is not available in the current slice state.`,
            originSlice.machineId,
          ),
        ],
        snapshot,
      );
    }

    const payload = hasOwn(input, "payload") ? cloneJsonValue(input.payload) : undefined;
    if (hasOwn(input, "payload") && payload === undefined) {
      return fail("invalid-payload", [diagnosticForSendFailure("invalid-payload", "Transition payload must be JSON-safe.")], snapshot);
    }

    const resolvedTransitionId =
      exactOriginCandidate || acceptedOriginCandidates.length === 1 ? originCandidate.transitionId : undefined;
    const choices: GraphTransitionChoiceOverride[] = [
      ...(input.choices ?? []),
      ...(resolvedTransitionId ? [{ slice: input.slice, transitionId: resolvedTransitionId }] : []),
    ];
    const event: GraphSimulationEvent = {
      type: originCandidate.event.type,
      ...(payload !== undefined ? { payload } : {}),
    };

    return dispatch({
      event,
      source: { kind: "manual-config", slice: input.slice, transitionId: input.transitionId },
      routing: routingFromEvent(event),
      choices,
      originSliceKey: refKey(input.slice),
    });
  };

  const sendFromEmission = (input: GraphSendFromEmissionInput): GraphSendResult => {
    if (!snapshot) {
      return fail("not-started", [diagnosticForSendFailure("not-started", "Graph simulator has not been started.")]);
    }

    const originSlice = sliceByRef(snapshot, input.slice);
    if (!originSlice) {
      return fail("unknown-slice", [diagnosticForSendFailure("unknown-slice", "Unknown graph simulation slice.")], snapshot);
    }

    const machine = machineById(document, originSlice.machineId);
    const emission = machine?.emissions.find((candidate) => candidate.id === input.emissionId);
    if (!emission) {
      return fail(
        "unknown-emission",
        [diagnosticForSendFailure("unknown-emission", `Unknown graph emission '${input.emissionId}'.`, originSlice.machineId)],
        snapshot,
      );
    }

    const suggested = suggestedEmissions({ slice: input.slice }).find((candidate) => candidate.emissionId === input.emissionId);
    if (!suggested || !suggested.canDispatch) {
      return fail(
        "event-not-accepted",
        [
          diagnosticForSendFailure(
            "event-not-accepted",
            `Emission '${input.emissionId}' is not suggested in the current simulation step.`,
            originSlice.machineId,
          ),
        ],
        snapshot,
      );
    }

    const payload = hasOwn(input, "payload") ? cloneJsonValue(input.payload) : undefined;
    if (hasOwn(input, "payload") && payload === undefined) {
      return fail("invalid-payload", [diagnosticForSendFailure("invalid-payload", "Emission payload must be JSON-safe.")], snapshot);
    }

    const event: GraphSimulationEvent = {
      type: suggested.event.type,
      ...(payload !== undefined ? { payload } : {}),
    };

    return dispatch({
      event,
      source: { kind: "manual-effect", slice: input.slice, emissionId: input.emissionId, routing: suggested.routing },
      routing: suggested.routing,
      choices: input.choices,
      sourceRowRefs: [rowRefForEmission(originSlice, emission)],
    });
  };

  const choose = (input: GraphChooseInput): GraphSendResult => {
    if (!snapshot) {
      return fail("not-started", [diagnosticForSendFailure("not-started", "Graph simulator has not been started.")]);
    }
    if (!pendingChoice || pendingChoice.pendingChoiceId !== input.pendingChoiceId) {
      return fail("stale-choice", [diagnosticForSendFailure("stale-choice", "Pending graph simulation choice is stale.")], snapshot);
    }
    if (!pendingChoiceIsCurrent(document, snapshot, pendingChoice)) {
      return fail("stale-choice", [diagnosticForSendFailure("stale-choice", "Pending graph simulation choice is stale.")], snapshot);
    }

    return dispatch({
      event: pendingChoice.event,
      source: pendingChoice.source,
      routing: pendingChoice.routing,
      choices: input.choices,
      sourceRowRefs: pendingChoice.sourceRowRefs,
      originSliceKey: pendingChoice.originSliceKey,
    });
  };

  return {
    start,
    reset,
    getSnapshot() {
      return snapshot;
    },
    getAvailableTransitions: availableTransitions,
    getSuggestedEmissions: suggestedEmissions,
    send,
    sendFromTransition,
    sendFromEmission,
    choose,
  };
};
