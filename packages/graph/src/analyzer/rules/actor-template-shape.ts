import type { GraphDiagnostic, GraphState, LiteFsmGraphMachine } from "../../types";
import { analyzerDiagnostic, type GraphAnalysisRule } from "../context";
import { configTransitions, isReservedState, transitionSourceState } from "./shared";

const initStateOf = (machine: LiteFsmGraphMachine): GraphState | undefined => {
  return machine.states.find((state) => state.key === "__INIT");
};

const hasInitExit = (machine: LiteFsmGraphMachine, initState: GraphState): boolean => {
  return configTransitions(machine).some((transition) => {
    return transition.source.kind === "state" && transition.source.stateId === initState.id;
  });
};

export const actorTemplateShapeRule: GraphAnalysisRule = {
  id: "actor-template-shape",
  run(context) {
    const diagnostics: GraphDiagnostic[] = [];

    for (const machine of context.machines) {
      if (machine.kind !== "actorTemplate") continue;

      const statesById = context.index.statesByMachineId.get(machine.id) as ReadonlyMap<string, GraphState>;
      const initState = initStateOf(machine);

      if (!initState) {
        diagnostics.push(
          analyzerDiagnostic(
            "LFG_ANALYZER_ACTOR_TEMPLATE_SHAPE",
            "error",
            "Actor template must declare a __INIT state.",
            { machineId: machine.id, loc: machine.loc },
          ),
        );
      } else if (!hasInitExit(machine, initState)) {
        diagnostics.push(
          analyzerDiagnostic(
            "LFG_ANALYZER_ACTOR_TEMPLATE_SHAPE",
            "warning",
            "Actor template __INIT state has no outgoing config transitions.",
            { machineId: machine.id, loc: initState.loc },
          ),
        );
      }

      if (machine.initialState !== "__INIT") {
        diagnostics.push(
          analyzerDiagnostic(
            "LFG_ANALYZER_ACTOR_TEMPLATE_SHAPE",
            "warning",
            "Actor template initialState must be '__INIT'.",
            { machineId: machine.id, loc: machine.loc },
          ),
        );
      }

      for (const state of machine.states) {
        if (!isReservedState(state) || !state.isPublicActorState) continue;

        diagnostics.push(
          analyzerDiagnostic(
            "LFG_ANALYZER_ACTOR_TEMPLATE_SHAPE",
            "warning",
            `Reserved actor state '${state.key}' must not be public.`,
            { machineId: machine.id, loc: state.loc },
          ),
        );
      }

      for (const transition of configTransitions(machine)) {
        const source = transitionSourceState(statesById, transition);
        if (!source || source.kind !== "terminal") continue;

        diagnostics.push(
          analyzerDiagnostic(
            "LFG_ANALYZER_ACTOR_TEMPLATE_SHAPE",
            "warning",
            `Terminal state '${source.key}' must not be used as a config source.`,
            { machineId: machine.id, loc: transition.loc },
          ),
        );
      }
    }

    return diagnostics;
  },
};
