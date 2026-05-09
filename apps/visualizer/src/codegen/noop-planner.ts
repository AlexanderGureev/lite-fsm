import { createWorkbenchDiagnostic } from "../diagnostics";
import type { CodegenPlanRequest, CodegenPlanResult, CodegenPlanner } from "./types";

export const createNoopCodegenPlanner = (): CodegenPlanner => ({
  async plan(input: CodegenPlanRequest): Promise<CodegenPlanResult> {
    const diagnostic = createWorkbenchDiagnostic({
      diagnosticId: `codegen:${input.sourceVersion}:${input.requestId}:not-implemented`,
      sourceVersion: input.sourceVersion,
      origin: "codegen",
      code: "codegen-not-implemented",
      severity: "warning",
      message: "Source editing is reserved for a later visualizer stage.",
    });

    return {
      plan: {
        sourceVersion: input.sourceVersion,
        sourceHash: input.sourceHash,
        edits: [],
        expectedGraphChange: { kind: "not-evaluated" },
        diagnostics: [diagnostic.diagnostic],
      },
      diagnostics: [diagnostic],
    };
  },
});
