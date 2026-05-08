import type { GraphDiagnostic, GraphTarget } from "../../types";
import { analyzerDiagnostic, type GraphAnalysisRule } from "../context";
import { isIncompleteUnknownTarget } from "./shared";

const unknownTargetDiagnostic = (
  input: { machineId: string; label: string; loc?: GraphDiagnostic["loc"]; owner: string },
): GraphDiagnostic =>
  analyzerDiagnostic(
    "LFG_ANALYZER_UNKNOWN_TARGET",
    "warning",
    `${input.owner} references unknown target '${input.label}'.`,
    { machineId: input.machineId, loc: input.loc },
  );

const reportTarget = (target: GraphTarget): target is Extract<GraphTarget, { kind: "unknown" }> => {
  return target.kind === "unknown" && !isIncompleteUnknownTarget(target);
};

export const unknownTargetRule: GraphAnalysisRule = {
  id: "unknown-target",
  run(context) {
    const diagnostics: GraphDiagnostic[] = [];

    for (const machine of context.machines) {
      for (const transition of machine.transitions) {
        if (!reportTarget(transition.target)) continue;

        diagnostics.push(
          unknownTargetDiagnostic({
            machineId: machine.id,
            label: transition.target.label ?? "unknown",
            loc: transition.loc,
            owner: `${transition.layer} transition '${transition.event.type}'`,
          }),
        );
      }

      for (const reducerCase of machine.reducerCases) {
        for (const target of reducerCase.targets) {
          if (!reportTarget(target)) continue;

          diagnostics.push(
            unknownTargetDiagnostic({
              machineId: machine.id,
              label: target.label ?? "unknown",
              loc: reducerCase.loc,
              owner: `reducer case '${reducerCase.event.type}'`,
            }),
          );
        }
      }
    }

    return diagnostics;
  },
};
