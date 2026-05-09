import type {
  GraphCondition,
  GraphDiagnostic,
  GraphEmission,
  GraphRouting,
  GraphSource,
  GraphState,
  GraphTarget,
  GraphTransition,
  LiteFsmGraphMachine,
  SourceLocation,
} from "../types";

export type BuildGraphVisualizerModelOptions = {
  analysisDiagnostics?: readonly GraphDiagnostic[];
  simulation?: GraphVisualizerSimulationOverlayInput;
};

export type GraphVisualizerModel = {
  version: "lite-fsm.visualizer/v1";
  source: GraphSource;
  machines: readonly GraphMachineSummary[];
  managers: readonly GraphManagerSummary[];
  topics: readonly GraphTopicSummary[];
  relations: GraphRelationIndex;
  diagnostics: readonly GraphDiagnosticAnchor[];
  rowMappings: GraphVisualizerRowMappingIndex;
  workbenchMachines: Record<string, GraphMachineWorkbenchModel>;
};

export type GraphItemRef =
  | { kind: "machine"; machineId: string }
  | { kind: "manager"; managerId: string }
  | { kind: "state"; machineId: string; stateId: string }
  | { kind: "transition"; machineId: string; transitionId: string }
  | { kind: "emission"; machineId: string; emissionId: string }
  | { kind: "reducerCase"; machineId: string; reducerCaseId: string }
  | { kind: "topic"; eventType: string }
  | { kind: "diagnostic"; diagnosticId: string };

export type GraphSourceAnchor = {
  kind:
    | "machine"
    | "manager"
    | "state"
    | "config-transition"
    | "reducer-branch"
    | "effect-emission"
    | "initial-state"
    | "initial-context"
    | "diagnostic";
  loc?: SourceLocation;
  editable: false;
};

export type GraphDiagnosticAnchor = {
  diagnosticId: string;
  origin: "compiler" | "analyzer";
  diagnostic: GraphDiagnostic;
  graphItemRef?: GraphItemRef;
  sourceAnchor?: GraphSourceAnchor;
};

export type GraphMachineSummary = {
  machineId: string;
  title: string;
  kind: LiteFsmGraphMachine["kind"];
  groupTag?: string;
  initialState?: string;
  managerKeys: readonly string[];
  counts: {
    states: number;
    consumedTopics: number;
    producedTopics: number;
    configTransitions: number;
    reducerBranches: number;
    effectEmissions: number;
    diagnostics: number;
  };
  consumedTopicTypes: readonly string[];
  producedTopicTypes: readonly string[];
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnosticIds: readonly string[];
};

export type GraphManagerSummary = {
  managerId: string;
  title: string;
  machineRefs: ReadonlyArray<{
    key: string;
    machineId: string;
    sourceAnchors: readonly GraphSourceAnchor[];
  }>;
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnosticIds: readonly string[];
};

export type GraphTopicSummary = {
  eventType: string;
  producerCount: number;
  consumerCount: number;
  routingKinds: readonly GraphRouting["kind"][];
  routingValues: readonly GraphTopicRoutingValue[];
  producers: readonly GraphTopicProducer[];
  consumers: readonly GraphTopicConsumer[];
  diagnosticIds: readonly string[];
};

export type GraphTopicRoutingValue = {
  kind: GraphRouting["kind"];
  label: string;
  value?: string;
  confidence: "exact" | "partial" | "unknown";
};

export type GraphTopicProducer = {
  machineId: string;
  emissionId: string;
  sourceStateKey: string | "*";
  routing: GraphRouting;
  guard?: GraphCondition;
  confidence: GraphEmission["confidence"];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphTopicConsumer = {
  machineId: string;
  sourceStateKey: string | "*";
  acceptedTransitionId: string;
  branches: readonly GraphTopicConsumerBranch[];
  confidence: GraphTransition["confidence"];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphTopicConsumerBranch = {
  transitionId: string;
  layer: GraphTransition["layer"];
  target: GraphTargetView;
  guard?: GraphCondition;
  reducerCaseId?: string;
  confidence: GraphTransition["confidence"];
};

export type GraphRelationIndex = {
  topicTypesByMachineId: Record<
    string,
    {
      consumed: readonly string[];
      produced: readonly string[];
    }
  >;
  machineIdsByTopicType: Record<
    string,
    {
      producers: readonly string[];
      consumers: readonly string[];
      related: readonly string[];
    }
  >;
};

export type GraphWorkbenchCollapsePolicy =
  | { kind: "none" }
  | { kind: "collapse-non-current-long-states"; rowThreshold: number };

export type BuildMachineWorkbenchModelOptions = {
  simulation?: GraphMachineSimulationOverlayInput;
  collapse?: GraphWorkbenchCollapsePolicy;
};

export type GraphMachineWorkbenchModel = {
  machineId: string;
  title: string;
  kind: LiteFsmGraphMachine["kind"];
  groupTag?: string;
  initialState?: string;
  currentStateId?: string;
  states: readonly GraphWorkbenchStateBlock[];
  globalBehavior: readonly GraphWorkbenchRow[];
  diagnostics: readonly GraphDiagnosticAnchor[];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphWorkbenchStateBlock = {
  stateId: string;
  stateKey: string;
  kind: GraphState["kind"];
  badges: readonly GraphWorkbenchBadge[];
  current: boolean;
  collapsed: boolean;
  rows: readonly GraphWorkbenchRow[];
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnosticIds: readonly string[];
};

export type GraphWorkbenchBadge = {
  kind:
    | "domain"
    | "actor-template"
    | "group-tag"
    | "initial"
    | "spawn"
    | "terminal"
    | "wildcard"
    | "config"
    | "reducer"
    | "effect"
    | "routing"
    | "diagnostic"
    | "confidence";
  label: string;
  severity?: GraphDiagnostic["severity"];
};

export type GraphWorkbenchRowSimulation = {
  available?: boolean;
  suggested?: boolean;
  recentlyFired?: boolean;
  inspected?: boolean;
};

export type GraphWorkbenchRow =
  | GraphConfigRow
  | GraphReducerRow
  | GraphEffectRow
  | GraphDiagnosticRow
  | GraphUnknownRow;

export type GraphConfigRow = {
  kind: "config";
  rowId: string;
  machineId: string;
  sourceStateId: string;
  eventType: string;
  acceptedTransitionId: string;
  transitionId: string;
  foldedReducerTransitionIds: readonly string[];
  target: GraphTargetView;
  guard?: GraphCondition;
  confidence: GraphTransition["confidence"];
  simulation?: GraphWorkbenchRowSimulation;
  capabilities: readonly GraphWorkbenchCapability[];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphReducerRow = {
  kind: "reducer";
  rowId: string;
  machineId: string;
  sourceStateId: string;
  eventType: string;
  acceptedTransitionId: string;
  transitionId: string;
  reducerCaseId?: string;
  target: GraphTargetView;
  guard?: GraphCondition;
  foldedIntoConfig: boolean;
  confidence: GraphTransition["confidence"];
  simulation?: GraphWorkbenchRowSimulation;
  capabilities: readonly GraphWorkbenchCapability[];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphEffectRow = {
  kind: "effect";
  rowId: string;
  machineId: string;
  sourceStateId?: string;
  sourceStateKey: string | "*";
  emissionId: string;
  eventType: string;
  routing: GraphRouting;
  guard?: GraphCondition;
  confidence: GraphEmission["confidence"];
  dispatchability?: "can-dispatch" | "not-current-state" | "terminal-slice" | "unknown-routing";
  simulation?: GraphWorkbenchRowSimulation;
  capabilities: readonly GraphWorkbenchCapability[];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphDiagnosticRow = {
  kind: "diagnostic";
  rowId: string;
  machineId?: string;
  diagnosticId: string;
  severity: GraphDiagnostic["severity"];
  message: string;
  capabilities: readonly GraphWorkbenchCapability[];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphUnknownRow = {
  kind: "unknown";
  rowId: string;
  machineId?: string;
  label: string;
  reason: string;
  confidence: "partial" | "unknown";
  capabilities: readonly GraphWorkbenchCapability[];
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type GraphTargetView = {
  kind: GraphTarget["kind"];
  label: string;
  stateId?: string;
  terminal?: "__RESOLVED" | "__REJECTED" | "__CANCELLED";
  blockedReason?: string;
};

export type GraphVisualizerSimulationRowRef =
  | { kind: "transition"; machineId: string; transitionId: string; sliceId?: string }
  | { kind: "emission"; machineId: string; emissionId: string; sliceId?: string };

export type GraphVisualizerSimulationOverlayInput = {
  currentStateIdsBySliceId?: Record<string, string>;
  availableTransitionIdsBySliceId?: Record<string, readonly string[]>;
  suggestedEmissionIdsBySliceId?: Record<string, readonly string[]>;
  currentStateIdsByMachineId?: Record<string, string>;
  availableTransitionIdsByMachineId?: Record<string, readonly string[]>;
  suggestedEmissionIdsByMachineId?: Record<string, readonly string[]>;
  firedRefs?: readonly GraphVisualizerSimulationRowRef[];
  inspectedRefs?: readonly GraphVisualizerSimulationRowRef[];
  recentlyFiredRowIds?: readonly string[];
  inspectedRowIds?: readonly string[];
};

export type GraphMachineSimulationOverlayInput = {
  sliceId?: string;
  currentStateId?: string;
  availableTransitionIds?: readonly string[];
  suggestedEmissionIds?: readonly string[];
  recentlyFiredRowIds?: readonly string[];
  inspectedRowIds?: readonly string[];
};

export type GraphWorkbenchCapability =
  | { kind: "inspect"; ref: GraphItemRef }
  | { kind: "select-source"; anchors: readonly GraphSourceAnchor[] }
  | { kind: "send-event"; machineId: string; eventType: string; transitionId?: string }
  | { kind: "follow-emission"; machineId: string; emissionId: string };

export type GraphVisualizerRowMappingDiagnostic = {
  code: "LFG_VIEW_MODEL_ROW_REF_NO_MATCH" | "LFG_VIEW_MODEL_ROW_REF_AMBIGUOUS";
  severity: "warning";
  ref: GraphVisualizerSimulationRowRef;
  rowIds: readonly string[];
  message: string;
};

export type GraphVisualizerRowMappingIndex = {
  transitionRowIdsByTransitionId: Record<string, readonly string[]>;
  emissionRowIdsByEmissionId: Record<string, readonly string[]>;
  transitionRowIdsByMachineAndTransitionId: Record<string, readonly string[]>;
  emissionRowIdsByMachineAndEmissionId: Record<string, readonly string[]>;
  diagnostics: readonly GraphVisualizerRowMappingDiagnostic[];
};
