import type {
  GraphCondition,
  GraphDiagnostic,
  GraphEventRef,
  GraphJsonObject,
  GraphJsonValue,
  GraphRouting,
  GraphStateRef,
  GraphTarget,
  GraphValueSummary,
  LiteFsmGraphDocument,
} from "../types";

export type GraphSimulationSliceRef =
  | { kind: "domain"; machineId: string }
  | { kind: "actorTemplate"; machineId: string }
  | { kind: "actor"; machineId: string; actorId: string };

export type GraphSimulationEvent = {
  type: string;
  payload?: GraphJsonValue;
  meta?: GraphSimulationEventMeta;
};

export type GraphSimulationEventMeta = {
  actorId?: string | readonly string[];
  groupId?: string | readonly string[];
  groupTag?: string | readonly string[];
  senderActorId?: string;
  senderGroupId?: string;
  senderGroupTag?: string;
};

export type CreateGraphSimulatorOptions = {
  scope?: GraphSimulationScope;
  actorMode?: GraphActorSimulationMode;
  effectMode?: GraphEffectSimulationMode;
  branchPolicy?: GraphBranchSelectionPolicy;
  evaluationPolicy?: GraphEvaluationPolicy;
  initialStateOverrides?: readonly GraphInitialStateOverride[];
  initialContextOverrides?: readonly GraphInitialContextOverride[];
};

export type GraphSimulationScope =
  | { kind: "document" }
  | { kind: "manager"; managerId: string }
  | { kind: "machines"; machineIds: readonly string[] };

export type GraphActorSimulationMode = "template-approximation";

export type GraphEffectSimulationMode = "manual";

export type GraphInitialStateOverride = {
  slice: GraphSimulationSliceRef;
  stateKey: string;
};

export type GraphInitialContextOverride = {
  slice: GraphSimulationSliceRef;
  context: GraphJsonObject;
};

export type GraphSimulationContext =
  | { kind: "json"; value: GraphJsonObject }
  | { kind: "summary"; summary: GraphValueSummary }
  | { kind: "unknown"; reason?: string };

export type GraphBranchSelectionPolicy =
  | { kind: "manual" }
  | { kind: "origin-explicit-default-others" }
  | { kind: "deterministic-first" };

export type GraphEvaluationPolicy = {
  evaluateTransition?: (input: GraphEvaluateTransitionInput) => GraphEvaluateTransitionResult;
  reduceContext?: (input: GraphReduceContextInput) => GraphReduceContextResult;
};

export type GraphResolvedTransitionCandidate = GraphAvailableTransition;

export type GraphEvaluateTransitionInput = {
  slice: GraphSimulationSlice;
  event: GraphSimulationEvent;
  candidates: readonly GraphResolvedTransitionCandidate[];
  context: GraphSimulationContext;
};

export type GraphEvaluateTransitionResult =
  | { kind: "unchanged"; candidates: readonly GraphResolvedTransitionCandidate[] }
  | { kind: "resolved"; candidate: GraphResolvedTransitionCandidate; reason?: string }
  | { kind: "blocked"; diagnostics: readonly GraphDiagnostic[] };

export type GraphReduceContextInput = {
  slice: GraphSimulationSlice;
  event: GraphSimulationEvent;
  transition: GraphResolvedTransitionCandidate;
  previousContext: GraphSimulationContext;
};

export type GraphReduceContextResult =
  | { kind: "unchanged"; context: GraphSimulationContext }
  | { kind: "changed"; context: GraphSimulationContext; patches?: readonly GraphContextPatch[] }
  | { kind: "blocked"; diagnostics: readonly GraphDiagnostic[] };

export type GraphContextPatch = {
  slice: GraphSimulationSliceRef;
  op: "replace" | "set" | "delete";
  path: readonly string[];
  value?: GraphJsonValue;
};

export type GraphSimulator = {
  start(): GraphSimulatorStartResult;
  reset(input?: GraphSimulatorResetInput): GraphSimulatorStartResult;
  getSnapshot(): GraphSimulationSnapshot | undefined;
  getAvailableTransitions(input?: GraphAvailableTransitionsInput): GraphAvailableTransition[];
  getSuggestedEmissions(input?: GraphSuggestedEmissionsInput): GraphSuggestedEmission[];
  send(input: GraphSendInput): GraphSendResult;
  sendFromTransition(input: GraphSendFromTransitionInput): GraphSendResult;
  sendFromEmission(input: GraphSendFromEmissionInput): GraphSendResult;
  choose(input: GraphChooseInput): GraphSendResult;
};

export type GraphSimulatorResetInput = {
  initialStateOverrides?: readonly GraphInitialStateOverride[];
  initialContextOverrides?: readonly GraphInitialContextOverride[];
};

export type GraphSimulationSnapshot = {
  documentVersion: LiteFsmGraphDocument["version"];
  machineIds: readonly string[];
  slices: Record<string, GraphSimulationSlice>;
  domainSlicesByMachineId: Record<string, string>;
  actorTemplateSlicesByMachineId: Record<string, string>;
  actorSliceIdsByMachineId: Record<string, readonly string[]>;
  timeline: GraphSimulationTimeline;
  diagnostics: readonly GraphDiagnostic[];
};

export type GraphSimulationSlice = {
  sliceId: string;
  ref: GraphSimulationSliceRef;
  machineId: string;
  kind: "domain" | "actorTemplate" | "actor";
  stateId: string;
  stateKey: string;
  context: GraphSimulationContext;
  actor?: GraphSimulationActorMeta;
  status: "active" | "terminal" | "disposed";
};

export type GraphSimulationActorMeta = {
  actorId: string;
  groupId: string;
  groupTag: string;
};

export type GraphSimulationTimeline = {
  rootStepId: string;
  currentStepId: string;
  stepsById: Record<string, GraphSimulationTimelineStep>;
  childrenByStepId: Record<string, readonly string[]>;
  linearStepIds: readonly string[];
};

export type GraphSimulationTimelineStep = {
  stepId: string;
  parentStepId?: string;
  index: number;
  event?: GraphSimulationEvent;
  source: GraphSimulationEventSource;
  consumed: readonly GraphSimulationConsumption[];
  emissions: readonly GraphStepSuggestedEmission[];
  choices: readonly GraphSimulationChoice[];
  contextPatches: readonly GraphContextPatch[];
  rowRefs: readonly GraphSimulationRowRef[];
  diagnostics: readonly GraphDiagnostic[];
};

export type GraphSimulationEventSource =
  | { kind: "initial" }
  | { kind: "external" }
  | { kind: "manual-config"; slice: GraphSimulationSliceRef; transitionId: string }
  | { kind: "manual-effect"; slice: GraphSimulationSliceRef; emissionId: string; routing: GraphRouting };

export type GraphSimulationConsumption = {
  slice: GraphSimulationSliceRef;
  machineId: string;
  sliceId: string;
  fromStateId: string;
  fromStateKey: string;
  toStateId?: string;
  toStateKey?: string;
  acceptedTransitionId: string;
  effectiveTransitionId: string;
  transitionId: string;
  reducerCaseId?: string;
  guard?: GraphCondition;
  target: GraphTarget;
  targetKind: GraphTarget["kind"];
  contextBefore: GraphSimulationContext;
  contextAfter: GraphSimulationContext;
  contextPatches: readonly GraphContextPatch[];
  selection: "explicit" | "evaluated" | "default" | "only-candidate";
  status: "committed" | "blocked";
  blockedReason?: GraphSimulationBlockedReason;
};

export type GraphSimulationBlockedReason =
  | "event-not-accepted"
  | "target-not-resolved"
  | "blocked-target"
  | "choice-required"
  | "evaluation-blocked"
  | "invalid-payload"
  | "invalid-context";

export type GraphSimulationRowRef =
  | { kind: "transition"; machineId: string; transitionId: string; sliceId: string }
  | { kind: "emission"; machineId: string; emissionId: string; sliceId: string };

export type GraphAvailableTransitionsInput = {
  slice?: GraphSimulationSliceRef;
  eventType?: string;
};

export type GraphAvailableTransition = {
  slice: GraphSimulationSliceRef;
  sliceId: string;
  machineId: string;
  transitionId: string;
  acceptedTransitionId: string;
  effectiveTransitionId: string;
  event: GraphEventRef;
  source: GraphStateRef;
  target: GraphTarget;
  layer: "config" | "reducer";
  guard?: GraphCondition;
  reducerCaseId?: string;
  canApply: boolean;
  blockedReason?: "target-not-resolved" | "blocked-target";
  confidence: "exact" | "partial" | "unknown";
};

export type GraphSuggestedEmissionsInput = {
  slice?: GraphSimulationSliceRef;
};

export type GraphSuggestedEmission = {
  slice: GraphSimulationSliceRef;
  sliceId: string;
  machineId: string;
  emissionId: string;
  event: GraphEventRef;
  routing: GraphRouting;
  guard?: GraphCondition;
  sourceStateId?: string;
  sourceStateKey: string | "*";
  canDispatch: boolean;
  blockedReason?: "not-current-state" | "terminal-slice" | "unknown-routing";
  confidence: "exact" | "partial" | "unknown";
};

export type GraphStepSuggestedEmission = GraphSuggestedEmission & {
  producedAfterStepId: string;
};

export type GraphSendInput = {
  event: GraphSimulationEvent;
  source?: Extract<GraphSimulationEventSource, { kind: "external" }>;
  choices?: readonly GraphTransitionChoiceOverride[];
};

export type GraphSendFromTransitionInput = {
  slice: GraphSimulationSliceRef;
  transitionId: string;
  payload?: GraphJsonValue;
  choices?: readonly GraphTransitionChoiceOverride[];
};

export type GraphSendFromEmissionInput = {
  slice: GraphSimulationSliceRef;
  emissionId: string;
  payload?: GraphJsonValue;
  choices?: readonly GraphTransitionChoiceOverride[];
};

export type GraphChooseInput = {
  pendingChoiceId: string;
  choices: readonly GraphTransitionChoiceOverride[];
};

export type GraphTransitionChoiceOverride = {
  slice: GraphSimulationSliceRef;
  transitionId: string;
};

export type GraphSimulatorStartResult =
  | { ok: true; snapshot: GraphSimulationSnapshot }
  | { ok: false; reason: GraphSimulatorStartFailureReason; diagnostics: readonly GraphDiagnostic[] };

export type GraphSimulatorStartFailureReason =
  | "empty-scope"
  | "unknown-machine"
  | "unknown-manager"
  | "unknown-start-state"
  | "invalid-initial-context"
  | "unsupported-mode";

export type GraphSendResult =
  | {
      ok: true;
      snapshot: GraphSimulationSnapshot;
      step: GraphSimulationTimelineStep;
    }
  | {
      ok: false;
      reason: GraphSendFailureReason;
      snapshot?: GraphSimulationSnapshot;
      pendingChoice?: GraphSimulationPendingChoice;
      diagnostics: readonly GraphDiagnostic[];
    };

export type GraphSendFailureReason =
  | "not-started"
  | "invalid-event"
  | "invalid-payload"
  | "invalid-context"
  | "unknown-slice"
  | "unknown-transition"
  | "unknown-emission"
  | "event-not-accepted"
  | "choice-required"
  | "stale-choice"
  | "target-not-resolved"
  | "blocked-target"
  | "evaluation-blocked";

export type GraphSimulationPendingChoice = {
  pendingChoiceId: string;
  event: GraphSimulationEvent;
  source: GraphSimulationEventSource;
  candidatesBySliceId: Record<string, readonly GraphAvailableTransition[]>;
  createdAtStepId: string;
};

export type GraphSimulationChoice = {
  slice: GraphSimulationSliceRef;
  sliceId: string;
  eventType: string;
  candidates: readonly GraphAvailableTransition[];
  selectedTransitionId?: string;
  resolvedBy: "manual" | "policy" | "evaluator";
};
