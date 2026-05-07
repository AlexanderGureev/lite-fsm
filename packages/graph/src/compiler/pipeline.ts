import type { Node } from "ts-morph";
import type {
  GraphDiagnostic,
  GraphCondition,
  GraphEventRef,
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
import type { PartialEvaluator } from "./evaluator";

export type AstNodeRef = {
  node: Node;
};

export type CompilerContext = {
  source: SourceAdapter;
  catalog: SourceCatalog;
  evaluator: PartialEvaluator;
  diagnostics: DiagnosticSink;
};

export type CompilerPass<Input, Output> = {
  name: string;
  run(input: Input, context: CompilerContext): Output;
};

export type PatternRule<RuleContext, Result> = {
  name: string;
  match(node: AstNodeRef, context: RuleContext): boolean;
  read(node: AstNodeRef, context: RuleContext): Result;
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
  target?: GraphTargetSlice;
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

export type ReducerGraphSlice = {
  reducerCases: ReducerCaseSlice[];
  transitions: ReducerTransitionSlice[];
  diagnostics?: GraphDiagnostic[];
};

export type ReducerTargetSlice = {
  targetLabel: string | null;
  target?: GraphTargetSlice;
  loc?: SourceLocation;
};

export type ReducerCaseSlice = {
  event: GraphEventRef;
  guard?: GraphCondition;
  writesState: boolean;
  targets: ReducerTargetSlice[];
  confidence: "exact" | "partial" | "unknown";
  loc?: SourceLocation;
};

export type ReducerTransitionSlice = {
  sourceKey: string;
  event: GraphEventRef;
  targetLabel: string | null;
  target?: GraphTargetSlice;
  guard?: GraphCondition;
  reducerCaseIndex: number;
  confidence: GraphTransition["confidence"];
  loc?: SourceLocation;
};

export type EffectsGraphSlice = {
  emissions: [];
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

export type GraphTargetSlice = GraphTarget;
