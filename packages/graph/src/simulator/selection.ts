import type { GraphDiagnostic, LiteFsmGraphDocument } from "../types";
import type {
  GraphAvailableTransition,
  GraphBranchSelectionPolicy,
  GraphEvaluateTransitionResult,
  GraphEvaluationPolicy,
  GraphReduceContextResult,
  GraphResolvedTransitionCandidate,
  GraphSimulationChoice,
  GraphSimulationConsumption,
  GraphSimulationEvent,
  GraphSimulationSlice,
  GraphSimulationSnapshot,
  GraphTransitionChoiceOverride,
} from "./types";
import type { PendingChoiceRecord } from "./pipeline-types";
import { diagnosticForSendFailure } from "./diagnostics";
import { refKey } from "./ids";
import { routeSlices } from "./routing";
import { sliceByRef } from "./snapshot";
import { candidatesForSlice } from "./transitions";

export const DEFAULT_BRANCH_POLICY: GraphBranchSelectionPolicy = { kind: "origin-explicit-default-others" };

export type SelectionResult =
  | {
      ok: true;
      candidate: GraphResolvedTransitionCandidate;
      choice: GraphSimulationChoice;
      selection: GraphSimulationConsumption["selection"];
    }
  | {
      ok: false;
      reason: "choice-required" | "unknown-transition" | "evaluation-blocked";
      diagnostics: GraphDiagnostic[];
      pendingCandidates?: readonly GraphAvailableTransition[];
      choice?: GraphSimulationChoice;
    };

export const transitionChoiceMap = (
  choices: readonly GraphTransitionChoiceOverride[] | undefined,
): Map<string, string> => new Map((choices ?? []).map((choice) => [refKey(choice.slice), choice.transitionId]));

export const applyEvaluationPolicy = (
  policy: GraphEvaluationPolicy | undefined,
  slice: GraphSimulationSlice,
  event: GraphSimulationEvent,
  candidates: readonly GraphAvailableTransition[],
): GraphEvaluateTransitionResult => {
  return (
    policy?.evaluateTransition?.({
      slice,
      event,
      candidates,
      context: slice.context,
    }) ?? { kind: "unchanged", candidates }
  );
};

export const applyContextPolicy = (
  policy: GraphEvaluationPolicy | undefined,
  slice: GraphSimulationSlice,
  event: GraphSimulationEvent,
  transition: GraphResolvedTransitionCandidate,
): GraphReduceContextResult => {
  return (
    policy?.reduceContext?.({
      slice,
      event,
      transition,
      previousContext: slice.context,
    }) ?? { kind: "unchanged", context: slice.context }
  );
};

export const selectCandidate = (input: {
  slice: GraphSimulationSlice;
  event: GraphSimulationEvent;
  candidates: readonly GraphAvailableTransition[];
  evaluated?: GraphAvailableTransition;
  evaluationResolved: boolean;
  choices: ReadonlyMap<string, string>;
  branchPolicy: GraphBranchSelectionPolicy;
  originSliceKey?: string;
}): SelectionResult => {
  const choiceBase = {
    slice: input.slice.ref,
    sliceId: input.slice.sliceId,
    eventType: input.event.type,
    candidates: input.candidates,
  };

  if (input.evaluated) {
    return {
      ok: true,
      candidate: input.evaluated,
      selection: "evaluated",
      choice: {
        ...choiceBase,
        selectedTransitionId: input.evaluated.transitionId,
        resolvedBy: "evaluator",
      },
    };
  }

  const explicitTransitionId = input.choices.get(refKey(input.slice.ref));
  if (explicitTransitionId) {
    const candidate = input.candidates.find((item) => item.transitionId === explicitTransitionId);
    if (!candidate) {
      return {
        ok: false,
        reason: "unknown-transition",
        diagnostics: [
          diagnosticForSendFailure(
            "unknown-transition",
            `Transition '${explicitTransitionId}' is not available for slice '${input.slice.sliceId}'.`,
            input.slice.machineId,
          ),
        ],
      };
    }

    return {
      ok: true,
      candidate,
      selection: "explicit",
      choice: {
        ...choiceBase,
        selectedTransitionId: candidate.transitionId,
        resolvedBy: "manual",
      },
    };
  }

  if (input.candidates.length === 1) {
    const candidate = input.candidates[0] as GraphAvailableTransition;

    return {
      ok: true,
      candidate,
      selection: "only-candidate",
      choice: {
        ...choiceBase,
        selectedTransitionId: candidate.transitionId,
        resolvedBy: "policy",
      },
    };
  }

  if (
    input.branchPolicy.kind === "manual" ||
    (input.branchPolicy.kind === "origin-explicit-default-others" && input.originSliceKey === refKey(input.slice.ref))
  ) {
    return {
      ok: false,
      reason: "choice-required",
      diagnostics: [
        diagnosticForSendFailure(
          "choice-required",
          `Multiple transitions accept '${input.event.type}' for slice '${input.slice.sliceId}'.`,
          input.slice.machineId,
        ),
      ],
      pendingCandidates: input.candidates,
      choice: { ...choiceBase, resolvedBy: "manual" },
    };
  }

  const candidate = input.candidates[0] as GraphAvailableTransition;

  return {
    ok: true,
    candidate,
    selection: "default",
    choice: {
      ...choiceBase,
      selectedTransitionId: candidate.transitionId,
      resolvedBy: "policy",
    },
  };
};

const candidateIdsBySlice = (candidatesBySliceId: Record<string, readonly GraphAvailableTransition[]>): Record<string, string[]> => {
  return Object.fromEntries(
    Object.entries(candidatesBySliceId).map(([sliceId, candidates]) => [sliceId, candidates.map((candidate) => candidate.transitionId)]),
  );
};

export const sameCandidateShape = (
  left: Record<string, readonly GraphAvailableTransition[]>,
  right: Record<string, readonly GraphAvailableTransition[]>,
): boolean => JSON.stringify(candidateIdsBySlice(left)) === JSON.stringify(candidateIdsBySlice(right));

export const pendingChoiceIsCurrent = (
  document: LiteFsmGraphDocument,
  snapshot: GraphSimulationSnapshot,
  pendingChoice: PendingChoiceRecord,
): boolean => {
  /* v8 ignore next -- public stage 9 API cannot move the cursor while preserving a pending choice. */
  if (pendingChoice.createdAtStepId !== snapshot.timeline.currentStepId) return false;

  const currentCandidatesBySliceId: Record<string, readonly GraphAvailableTransition[]> = {};
  const pendingSourceSlice =
    pendingChoice.source.kind === "manual-effect" ? sliceByRef(snapshot, pendingChoice.source.slice) : undefined;
  for (const routed of routeSlices(document, snapshot, pendingChoice.routing, pendingSourceSlice)) {
    const candidates = candidatesForSlice(document, routed.slice, pendingChoice.event.type, routed.confidence);
    if (pendingChoice.candidatesBySliceId[routed.slice.sliceId]) currentCandidatesBySliceId[routed.slice.sliceId] = candidates;
  }

  return sameCandidateShape(pendingChoice.candidatesBySliceId, currentCandidatesBySliceId);
};
