import type { GraphDiagnostic } from "../types";
import type { GraphSendFailureReason, GraphSimulatorStartFailureReason } from "./types";

const diagnostic = (code: string, message: string, machineId?: string): GraphDiagnostic => ({
  code,
  severity: "warning",
  message,
  machineId,
});

const diagnosticSuffix = (reason: string): string => reason.split("-").join("_").toUpperCase();

export const diagnosticForStartFailure = (
  reason: GraphSimulatorStartFailureReason,
  message: string,
  machineId?: string,
): GraphDiagnostic => {
  const code = reason === "invalid-initial-context" ? "LFG_SIM_INVALID_CONTEXT" : `LFG_SIM_${diagnosticSuffix(reason)}`;

  return diagnostic(code, message, machineId);
};

export const diagnosticForSendFailure = (
  reason: GraphSendFailureReason,
  message: string,
  machineId?: string,
): GraphDiagnostic => diagnostic(`LFG_SIM_${diagnosticSuffix(reason)}`, message, machineId);
