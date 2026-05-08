import type { GraphDiagnostic } from "../../types";
import { analyzerDiagnostic, type GraphAnalysisRule } from "../context";
import { reachableStateIds } from "./shared";

export const unreachableStateRule: GraphAnalysisRule = {
  id: "unreachable-state",
  run(context) {
    const diagnostics: GraphDiagnostic[] = [];

    for (const machine of context.machines) {
      const reachable = reachableStateIds(machine);
      if (reachable.size === 0) continue;

      for (const state of machine.states) {
        if (state.kind !== "normal" || reachable.has(state.id)) continue;

        diagnostics.push(
          analyzerDiagnostic(
            "LFG_ANALYZER_UNREACHABLE_STATE",
            "warning",
            `State '${state.key}' is not reachable from initialState '${machine.initialState}'.`,
            { machineId: machine.id, loc: state.loc },
          ),
        );
      }
    }

    return diagnostics;
  },
};
