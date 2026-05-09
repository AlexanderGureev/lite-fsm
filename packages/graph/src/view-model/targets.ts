import type { GraphTarget, LiteFsmGraphMachine } from "../types";
import type { GraphTargetView } from "./types";

export const targetView = (machine: LiteFsmGraphMachine, target: GraphTarget): GraphTargetView => {
  if (target.kind === "state") {
    const state = machine.states.find((candidate) => candidate.id === target.stateId);
    return { kind: "state", label: state?.key ?? target.stateId, stateId: target.stateId };
  }

  if (target.kind === "self") return { kind: "self", label: "self" };

  if (target.kind === "terminal") {
    return { kind: "terminal", label: target.terminal, terminal: target.terminal };
  }

  if (target.kind === "blocked") {
    return { kind: "blocked", label: target.reason, blockedReason: target.reason };
  }

  if (target.kind === "dynamic") return { kind: "dynamic", label: target.label ?? "dynamic" };

  return { kind: "unknown", label: target.label ?? "unknown" };
};
