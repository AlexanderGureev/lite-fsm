import type {
  GraphCondition,
  GraphDiagnostic,
  GraphEventRef,
  GraphRouting,
  GraphState,
  GraphTarget,
  GraphTransition,
  GraphValueSummary,
  SourceLocation,
} from "../types";
import type { MachineCandidate } from "./candidates";
import type { SourceAdapter } from "./source";
import type { SourceCatalog } from "./catalog";
import type { DiagnosticSink } from "./diagnostics";
import type { PartialEvaluator } from "./evaluator/types";

export type CompilerContext = {
  source: SourceAdapter;
  catalog: SourceCatalog;
  evaluator: PartialEvaluator;
  diagnostics: DiagnosticSink;
};

export type ConfigStateSlice = {
  key: string;
  kind?: GraphState["kind"];
  isInitial?: boolean;
  isPublicActorState?: boolean;
  loc?: SourceLocation;
};

export type ConfigTransitionSlice = {
  sourceKey: string;
  event: GraphEventRef;
  targetLabel: string | null;
  target?: GraphTarget;
  layer?: GraphTransition["layer"];
  order?: number;
  confidence?: GraphTransition["confidence"];
  loc?: SourceLocation;
};

export type ConfigGraphSlice = {
  states: ConfigStateSlice[];
  transitions: ConfigTransitionSlice[];
  initialState?: string;
  initialContextSummary?: GraphValueSummary;
  groupTag?: string;
  persistence?: "runtime" | "snapshot" | "unknown";
  kind?: "domain" | "actorTemplate" | "unknown";
  diagnostics?: GraphDiagnostic[];
};

export type ReducerTargetSlice = {
  targetLabel: string | null;
  target?: GraphTarget;
  loc?: SourceLocation;
};

export type ReducerCaseSlice = {
  event: GraphEventRef;
  guard?: GraphCondition;
  writesState: boolean;
  targets: ReducerTargetSlice[];
  confidence: GraphTransition["confidence"];
  loc?: SourceLocation;
};

export type ReducerTransitionSlice = {
  sourceKey: string;
  event: GraphEventRef;
  targetLabel: string | null;
  target?: GraphTarget;
  guard?: GraphCondition;
  reducerCaseIndex: number;
  confidence: GraphTransition["confidence"];
  loc?: SourceLocation;
};

export type ReducerGraphSlice = {
  reducerCases: ReducerCaseSlice[];
  transitions: ReducerTransitionSlice[];
  diagnostics?: GraphDiagnostic[];
};

export type EffectEmissionSlice = {
  sourceKey: string;
  event: GraphEventRef;
  routing: GraphRouting;
  origin: "effect" | "unknown";
  guard?: GraphCondition;
  confidence: GraphTransition["confidence"];
  loc?: SourceLocation;
};

export type EffectsGraphSlice = {
  emissions: EffectEmissionSlice[];
  diagnostics?: GraphDiagnostic[];
};

export type MachineGraphSlice = {
  candidate: MachineCandidate;
  config?: ConfigGraphSlice;
  reducer?: ReducerGraphSlice;
  effects?: EffectsGraphSlice;
  managerKeys: string[];
  diagnostics: GraphDiagnostic[];
};
