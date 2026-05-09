import type { GraphDiagnostic, GraphRouting, LiteFsmGraphDocument } from "../types";
import type {
  GraphAvailableTransition,
  GraphBranchSelectionPolicy,
  GraphContextPatch,
  GraphEvaluationPolicy,
  GraphSendResult,
  GraphSimulationChoice,
  GraphSimulationConsumption,
  GraphSimulationEvent,
  GraphSimulationEventSource,
  GraphSimulationPendingChoice,
  GraphSimulationRowRef,
  GraphSimulationSlice,
  GraphSimulationSnapshot,
  GraphTransitionChoiceOverride,
} from "./types";

export type RouteConfidence = "exact" | "partial";

export type RoutedSlice = {
  slice: GraphSimulationSlice;
  confidence: RouteConfidence;
};

export type DispatchInput = {
  event: GraphSimulationEvent;
  source: GraphSimulationEventSource;
  routing: GraphRouting;
  choices?: readonly GraphTransitionChoiceOverride[];
  originSliceKey?: string;
  sourceRowRefs?: readonly GraphSimulationRowRef[];
};

export type PendingChoiceRecord = GraphSimulationPendingChoice & {
  routing: GraphRouting;
  sourceRowRefs: readonly GraphSimulationRowRef[];
  originSliceKey?: string;
};

export type SelectedTransition = {
  slice: GraphSimulationSlice;
  candidate: GraphAvailableTransition;
  choice: GraphSimulationChoice;
  selection: GraphSimulationConsumption["selection"];
};

export type DispatchPipelineInput = {
  document: LiteFsmGraphDocument;
  snapshot: GraphSimulationSnapshot;
  branchPolicy: GraphBranchSelectionPolicy;
  evaluationPolicy?: GraphEvaluationPolicy;
  dispatch: DispatchInput;
  pendingChoiceId: string;
};

export type DispatchPipelineState = {
  event: GraphSimulationEvent;
  routedSlices: RoutedSlice[];
  pendingCandidatesBySliceId: Record<string, readonly GraphAvailableTransition[]>;
  selections: SelectedTransition[];
  choices: GraphSimulationChoice[];
  diagnostics: GraphDiagnostic[];
  nextSlices: Record<string, GraphSimulationSlice>;
  consumed: GraphSimulationConsumption[];
  contextPatches: GraphContextPatch[];
  rowRefs: GraphSimulationRowRef[];
  stepId: string;
  stepIndex: number;
};

export type DispatchPipelineResult =
  | { kind: "success"; result: Extract<GraphSendResult, { ok: true }> }
  | { kind: "failure"; result: Extract<GraphSendResult, { ok: false }> }
  | {
      kind: "pending-choice";
      result: Extract<GraphSendResult, { ok: false }>;
      pendingChoice: PendingChoiceRecord;
    };
