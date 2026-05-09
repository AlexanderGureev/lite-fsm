import type { LiteFsmGraphDocument } from "@lite-fsm/graph";
import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import type { WorkbenchDiagnosticOrigin, WorkbenchDiagnosticRef } from "../diagnostics";

export type ValidationState = {
  status: "idle" | "running" | "ready" | "blocked";
  requestId?: string;
  providers: readonly string[];
  diagnostics: readonly WorkbenchDiagnosticRef[];
};

export type DiagnosticProviderInput = {
  sourceVersion: number;
  document?: LiteFsmGraphDocument;
  model?: GraphVisualizerModel;
};

export type DiagnosticProvider = {
  id: string;
  origin: WorkbenchDiagnosticOrigin;
  run(input: DiagnosticProviderInput): Promise<readonly WorkbenchDiagnosticRef[]>;
};

export type DiagnosticProviderRegistry = {
  providerIds: readonly string[];
  run(input: DiagnosticProviderInput): Promise<readonly WorkbenchDiagnosticRef[]>;
};
