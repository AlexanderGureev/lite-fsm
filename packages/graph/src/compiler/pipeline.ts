import type { Node } from "ts-morph";
import type {
  GraphDiagnostic,
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

export type AstNodeRef = {
  node: Node;
};

export type CompilerContext = {
  source: SourceAdapter;
  catalog: SourceCatalog;
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
  reducerCases: [];
  transitions: [];
  diagnostics?: GraphDiagnostic[];
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
