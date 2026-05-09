import type { GraphDiagnostic, SourceLocation } from "@lite-fsm/graph";
import type { WorkbenchDiagnosticRef } from "../diagnostics";

export type SourceEditIntent =
  | { kind: "add-machine"; template: "domain" | "actorTemplate"; machineIdHint?: string }
  | { kind: "add-state"; machineId: string; stateKey: string }
  | { kind: "add-transition"; machineId: string; sourceStateId: string; eventType: string; targetStateKey: string }
  | { kind: "change-transition-target"; machineId: string; transitionId: string; targetStateKey: string }
  | { kind: "add-effect-emission"; machineId: string; sourceStateId: string; eventType: string }
  | { kind: "rename-state"; machineId: string; stateId: string; nextKey: string };

export type TextEdit = {
  range: SourceLocation;
  expectedText?: string;
  replacement: string;
};

export type GraphChangeExpectation = {
  kind: "not-evaluated";
};

export type CodegenDiagnostic = GraphDiagnostic;

export type SourcePatchPlan = {
  sourceVersion: number;
  sourceHash: string;
  edits: readonly TextEdit[];
  expectedGraphChange: GraphChangeExpectation;
  diagnostics: readonly CodegenDiagnostic[];
};

export type CodegenState = {
  status: "idle" | "not-implemented" | "previewing" | "blocked";
  requestId?: string;
  lastIntent?: SourceEditIntent;
  diagnostics: readonly WorkbenchDiagnosticRef[];
};

export type CodegenPlanRequest = {
  requestId: string;
  sourceVersion: number;
  sourceHash: string;
  intent: SourceEditIntent;
};

export type CodegenPlanResult = {
  plan: SourcePatchPlan;
  diagnostics: readonly WorkbenchDiagnosticRef[];
};

export type CodegenPlanner = {
  plan(input: CodegenPlanRequest): Promise<CodegenPlanResult>;
};
