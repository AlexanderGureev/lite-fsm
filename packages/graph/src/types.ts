export type GraphLanguage = "ts" | "tsx" | "js" | "jsx" | "unknown";

export type SourceLocation = {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
};

export type GraphSource = {
  filename?: string;
  language: GraphLanguage;
  hash?: string;
};

export type LiteFsmGraphDocument = {
  version: "lite-fsm.graph/v1";
  source: GraphSource;
  machines: LiteFsmGraphMachine[];
  managers: LiteFsmGraphManager[];
  diagnostics: GraphDiagnostic[];
};

export type LiteFsmGraphResult = {
  document: LiteFsmGraphDocument;
  diagnostics: GraphDiagnostic[];
};

export type GraphJsonValue =
  | null
  | boolean
  | number
  | string
  | GraphJsonValue[]
  | { [key: string]: GraphJsonValue };

export type GraphJsonObject = { [key: string]: GraphJsonValue };

export type GraphAnalysisRuleId =
  | "unknown-target"
  | "unreachable-state"
  | "dead-end-state"
  | "actor-template-shape"
  | "reducer-config-consistency"
  | "effect-event-acceptance"
  | "wildcard-shadowing";

export type GraphAnalysisScope =
  | { kind: "document" }
  | { kind: "machine"; machineId: string }
  | { kind: "manager"; managerId: string };

export type AnalyzeLiteFsmGraphOptions = {
  rules?: GraphAnalysisRuleId[];
  strict?: boolean;
  scope?: GraphAnalysisScope;
};

export type GraphAnalysisResult = {
  diagnostics: GraphDiagnostic[];
};

export type LiteFsmGraphManager = {
  id: string;
  variableName?: string;
  machineRefs: Array<{
    key: string;
    machineId: string;
    loc?: SourceLocation;
  }>;
  loc?: SourceLocation;
};

export type LiteFsmGraphMachine = {
  id: string;
  index: number;
  variableName?: string;
  exportName?: string;
  managerKeys: string[];
  kind: "domain" | "actorTemplate" | "unknown";
  initialState?: string;
  initialContextSummary?: GraphValueSummary;
  initialContextJson?: GraphJsonObject;
  groupTag?: string;
  persistence?: "runtime" | "snapshot" | "unknown";
  states: GraphState[];
  transitions: GraphTransition[];
  emissions: GraphEmission[];
  reducerCases: GraphReducerCase[];
  diagnostics: GraphDiagnostic[];
  loc?: SourceLocation;
};

export type GraphState = {
  id: string;
  key: string;
  kind: "normal" | "wildcard" | "init" | "terminal" | "unknown";
  isInitial: boolean;
  isPublicActorState: boolean;
  loc?: SourceLocation;
};

export type GraphTransition = {
  id: string;
  machineId: string;
  source: GraphStateRef;
  event: GraphEventRef;
  target: GraphTarget;
  layer: "config" | "reducer";
  order: number;
  guard?: GraphCondition;
  reducerCaseId?: string;
  confidence: "exact" | "partial" | "unknown";
  loc?: SourceLocation;
};

export type GraphEmission = {
  id: string;
  machineId: string;
  sourceState: GraphStateRef | "*";
  event: GraphEventRef;
  routing: GraphRouting;
  origin: "effect" | "unknown";
  guard?: GraphCondition;
  confidence: "exact" | "partial" | "unknown";
  loc?: SourceLocation;
};

export type GraphReducerCase = {
  id: string;
  event: GraphEventRef;
  guard?: GraphCondition;
  writesState: boolean;
  targets: GraphTarget[];
  confidence: "exact" | "partial" | "unknown";
  loc?: SourceLocation;
};

export type GraphStateRef =
  | { kind: "state"; stateId: string }
  | { kind: "wildcard" }
  | { kind: "unknown"; label?: string };

export type GraphEventRef = {
  type: string;
  source?: "config" | "reducer" | "effect" | "typeUnion" | "unknown";
};

export type GraphTarget =
  | { kind: "state"; stateId: string }
  | { kind: "self" }
  | { kind: "terminal"; terminal: "__RESOLVED" | "__REJECTED" | "__CANCELLED" }
  | { kind: "dynamic"; label?: string }
  | { kind: "blocked"; reason: string }
  | { kind: "unknown"; label?: string };

export type GraphRouting =
  | { kind: "default" }
  | { kind: "unscoped" }
  | { kind: "actor"; target: GraphRoutingTarget }
  | { kind: "group"; target: GraphRoutingTarget }
  | { kind: "tag"; target: GraphRoutingTarget }
  | { kind: "unknown"; label?: string };

export type GraphRoutingTarget =
  | { kind: "literal"; value: string }
  | { kind: "array"; items: GraphRoutingTarget[] }
  | { kind: "selfField"; field: "actorId" | "groupId" | "groupTag" }
  | { kind: "dynamic"; label?: string };

export type GraphCondition = {
  text: string;
  kind: "if" | "else-if" | "else" | "switch-case" | "ternary" | "unknown";
  loc?: SourceLocation;
};

export type GraphDiagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  machineId?: string;
  loc?: SourceLocation;
};

export type GraphValueSummary = {
  kind: "empty" | "literal" | "object" | "array" | "external" | "dynamic" | "unknown";
  text?: string;
};

export type MachineSelector =
  | { index: number }
  | { id: string }
  | { variableName: string }
  | { exportName: string }
  | { managerKey: string }
  | { managerId: string; managerKey: string };

export type SelectMachineGraphResult =
  | { ok: true; machine: LiteFsmGraphMachine; diagnostics: GraphDiagnostic[] }
  | { ok: false; candidates: LiteFsmGraphMachine[]; diagnostics: GraphDiagnostic[] };

export type CompileLiteFsmGraphOptions = {
  filename?: string;
  language?: Exclude<GraphLanguage, "unknown">;
  parser?: "static";
  maxMachines?: number;
};
