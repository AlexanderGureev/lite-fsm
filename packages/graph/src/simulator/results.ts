import type { GraphDiagnostic, GraphState, LiteFsmGraphMachine } from "../types";
import { cloneSnapshot } from "./state";
import type {
  GraphAvailableTransition,
  GraphFollowEmissionResult,
  GraphSendResult,
  GraphSimulationSnapshot,
  GraphSimulatorStartResult,
  GraphSuggestedEmission,
} from "./types";

const simDiagnostic = (machine: LiteFsmGraphMachine, code: string, message: string): GraphDiagnostic => ({
  code,
  severity: "warning",
  message,
  machineId: machine.id,
});

export const startFailure = (
  machine: LiteFsmGraphMachine,
  reason: Exclude<GraphSimulatorStartResult, { ok: true }>["reason"],
  candidates: GraphState[],
  message: string,
): GraphSimulatorStartResult => ({
  ok: false,
  reason,
  candidates,
  diagnostics: [simDiagnostic(machine, `LFG_SIM_${reason.toUpperCase().replace(/-/g, "_")}`, message)],
});

export const notStartedResult = (
  machine: LiteFsmGraphMachine,
): { ok: false; reason: "not-started"; diagnostics: GraphDiagnostic[] } => ({
  ok: false,
  reason: "not-started",
  diagnostics: [simDiagnostic(machine, "LFG_SIM_NOT_STARTED", "Graph simulator has not been started.")],
});

export const transitionFailure = (
  machine: LiteFsmGraphMachine,
  snapshot: GraphSimulationSnapshot,
  reason: Exclude<GraphSendResult, { ok: true }>["reason"],
  code: string,
  message: string,
  candidates?: GraphAvailableTransition[],
): GraphSendResult => ({
  ok: false,
  reason,
  snapshot: cloneSnapshot(snapshot),
  candidates,
  diagnostics: [simDiagnostic(machine, code, message)],
});

export const followFailure = (
  machine: LiteFsmGraphMachine,
  snapshot: GraphSimulationSnapshot,
  reason: Exclude<GraphFollowEmissionResult, { ok: true }>["reason"],
  code: string,
  message: string,
  input: {
    emission?: GraphSuggestedEmission;
    candidates?: GraphAvailableTransition[];
  } = {},
): GraphFollowEmissionResult => ({
  ok: false,
  reason,
  snapshot: cloneSnapshot(snapshot),
  emission: input.emission,
  candidates: input.candidates,
  diagnostics: [simDiagnostic(machine, code, message)],
});

export const blockedCode = (reason: "target-not-resolved" | "blocked-target"): string =>
  reason === "blocked-target" ? "LFG_SIM_BLOCKED_TARGET" : "LFG_SIM_TARGET_NOT_RESOLVED";
