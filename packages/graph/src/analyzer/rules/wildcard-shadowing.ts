import type { GraphDiagnostic } from "../../types";
import { analyzerDiagnostic, type GraphAnalysisRule } from "../context";
import { configTransitions } from "./shared";

export const wildcardShadowingRule: GraphAnalysisRule = {
  id: "wildcard-shadowing",
  run(context) {
    const diagnostics: GraphDiagnostic[] = [];

    for (const machine of context.machines) {
      const statesById = context.index.statesByMachineId.get(machine.id);
      const wildcardEvents = new Set(
        configTransitions(machine)
          .filter((transition) => transition.source.kind === "wildcard")
          .map((transition) => transition.event.type),
      );
      if (wildcardEvents.size === 0) continue;

      for (const transition of configTransitions(machine)) {
        if (transition.source.kind !== "state" || !wildcardEvents.has(transition.event.type)) continue;
        const stateKey = statesById?.get(transition.source.stateId)?.key ?? transition.source.stateId;

        diagnostics.push(
          analyzerDiagnostic(
            "LFG_ANALYZER_WILDCARD_SHADOWING",
            "info",
            `State '${stateKey}' overrides wildcard event '${transition.event.type}'.`,
            { machineId: machine.id, loc: transition.loc },
          ),
        );
      }
    }

    return diagnostics;
  },
};
