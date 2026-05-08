import type { GraphTarget, LiteFsmGraphMachine } from "../types";
import type { SimulatorStateIndex } from "./state";
import type { GraphAvailableTransition, GraphSimulationSnapshot, GraphSimulatorOptions } from "./types";

export type SimulationRuntime = {
  machine: LiteFsmGraphMachine;
  index: SimulatorStateIndex;
  options: GraphSimulatorOptions;
};

export type SimulationEvaluation =
  | {
      ok: true;
      nextState: {
        stateId: string;
        stateKey: string;
      };
    }
  | {
      ok: false;
      reason: "target-not-resolved" | "blocked-target";
    };

export const evaluateTarget = (
  machine: LiteFsmGraphMachine,
  index: SimulatorStateIndex,
  snapshot: GraphSimulationSnapshot,
  target: GraphTarget,
): SimulationEvaluation => {
  if (target.kind === "self") {
    return { ok: true, nextState: { stateId: snapshot.stateId, stateKey: snapshot.stateKey } };
  }

  if (target.kind === "state") {
    const targetState = index.stateById.get(target.stateId);
    if (!targetState) return { ok: false, reason: "target-not-resolved" };

    return { ok: true, nextState: { stateId: targetState.id, stateKey: targetState.key } };
  }

  if (target.kind === "terminal") {
    const terminalState = index.stateByKey.get(target.terminal);

    return {
      ok: true,
      nextState: {
        stateId: terminalState?.id ?? `${machine.id}:state:${target.terminal}`,
        stateKey: target.terminal,
      },
    };
  }

  if (target.kind === "blocked") return { ok: false, reason: "blocked-target" };

  return { ok: false, reason: "target-not-resolved" };
};

export const evaluateCandidate = (
  runtime: SimulationRuntime,
  snapshot: GraphSimulationSnapshot,
  transition: GraphAvailableTransition,
): SimulationEvaluation => evaluateTarget(runtime.machine, runtime.index, snapshot, transition.target);
