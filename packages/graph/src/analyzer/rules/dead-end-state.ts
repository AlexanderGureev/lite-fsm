import type { GraphDiagnostic, LiteFsmGraphMachine } from "../../types";
import { analyzerDiagnostic, type GraphAnalysisRule } from "../context";
import { configTransitions, reachableStateIds } from "./shared";

const hasOutgoingConfigTransition = (machine: LiteFsmGraphMachine, stateId: string): boolean => {
  const transitions = configTransitions(machine);

  return transitions.some((transition) => {
    if (transition.source.kind === "wildcard") return true;

    return transition.source.kind === "state" && transition.source.stateId === stateId;
  });
};

export const deadEndStateRule: GraphAnalysisRule = {
  id: "dead-end-state",
  run(context) {
    const diagnostics: GraphDiagnostic[] = [];
    const severity = context.options.strict ? "warning" : "info";

    for (const machine of context.machines) {
      const reachable = reachableStateIds(machine);
      if (reachable.size === 0) continue;

      for (const state of machine.states) {
        if (state.kind !== "normal" || !reachable.has(state.id) || hasOutgoingConfigTransition(machine, state.id)) {
          continue;
        }

        diagnostics.push(
          analyzerDiagnostic(
            "LFG_ANALYZER_DEAD_END_STATE",
            severity,
            `State '${state.key}' has no outgoing config transitions.`,
            { machineId: machine.id, loc: state.loc },
          ),
        );
      }
    }

    return diagnostics;
  },
};
