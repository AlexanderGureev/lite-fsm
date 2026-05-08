import type {
  AnalyzeLiteFsmGraphOptions,
  GraphAnalysisRuleId,
  GraphDiagnostic,
  LiteFsmGraphDocument,
  LiteFsmGraphMachine,
} from "../types";
import type { GraphAnalysisIndex } from "./indexes";

export type GraphAnalysisContext = {
  document: LiteFsmGraphDocument;
  options: AnalyzeLiteFsmGraphOptions;
  index: GraphAnalysisIndex;
  machines: LiteFsmGraphMachine[];
  scopeKind: "document" | "machine" | "manager";
};

export type GraphAnalysisRule = {
  id: GraphAnalysisRuleId;
  run(context: GraphAnalysisContext): GraphDiagnostic[];
};

export const analyzerDiagnostic = (
  code: string,
  severity: GraphDiagnostic["severity"],
  message: string,
  input: { machineId?: string; loc?: GraphDiagnostic["loc"] } = {},
): GraphDiagnostic => ({
  code,
  severity,
  message,
  machineId: input.machineId,
  loc: input.loc,
});
