import type { GraphDiagnostic, GraphTarget } from "../../types";
import { analyzerDiagnostic, type GraphAnalysisRule } from "../context";
import { isIncompleteUnknownTarget } from "./shared";

const reducerTargetNeedsDiagnostic = (target: GraphTarget): target is Extract<GraphTarget, { kind: "unknown" }> => {
  return target.kind === "unknown" && !isIncompleteUnknownTarget(target);
};

export const reducerConfigConsistencyRule: GraphAnalysisRule = {
  id: "reducer-config-consistency",
  run(context) {
    const diagnostics: GraphDiagnostic[] = [];

    for (const machine of context.machines) {
      const acceptedEvents = context.index.acceptedEventsByMachineId.get(machine.id) ?? new Set();

      for (const reducerCase of machine.reducerCases) {
        if (!reducerCase.writesState) continue;

        if (!acceptedEvents.has(reducerCase.event.type)) {
          diagnostics.push(
            analyzerDiagnostic(
              "LFG_ANALYZER_REDUCER_CONFIG_CONSISTENCY",
              "warning",
              `Reducer writes state for event '${reducerCase.event.type}', but config never accepts this event.`,
              { machineId: machine.id, loc: reducerCase.loc },
            ),
          );
        }

        for (const target of reducerCase.targets) {
          if (!reducerTargetNeedsDiagnostic(target)) continue;

          diagnostics.push(
            analyzerDiagnostic(
              "LFG_ANALYZER_REDUCER_CONFIG_CONSISTENCY",
              "warning",
              `Reducer case '${reducerCase.event.type}' writes unknown target '${target.label ?? "unknown"}'.`,
              { machineId: machine.id, loc: reducerCase.loc },
            ),
          );
        }
      }
    }

    return diagnostics;
  },
};
