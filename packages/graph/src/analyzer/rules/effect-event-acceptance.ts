import type { GraphDiagnostic, GraphEmission, GraphRoutingTarget } from "../../types";
import { analyzerDiagnostic, type GraphAnalysisContext, type GraphAnalysisRule } from "../context";

const routingTargetIsDynamic = (target: GraphRoutingTarget): boolean => {
  if (target.kind === "dynamic") return true;
  if (target.kind === "array") return target.items.some(routingTargetIsDynamic);

  return false;
};

const hasKnownRouting = (emission: GraphEmission): boolean => {
  if (emission.routing.kind === "unknown") return false;
  if (
    emission.routing.kind === "actor" ||
    emission.routing.kind === "group" ||
    emission.routing.kind === "tag"
  ) {
    return !routingTargetIsDynamic(emission.routing.target);
  }

  return true;
};

const severityFor = (context: GraphAnalysisContext): GraphDiagnostic["severity"] => {
  return context.options.strict || context.scopeKind === "manager" ? "warning" : "info";
};

const acceptsEvent = (context: GraphAnalysisContext, machineId: string, eventType: string): boolean => {
  return context.index.acceptedEventsByMachineId.get(machineId)?.has(eventType) ?? false;
};

const scopedMachineAcceptsEvent = (context: GraphAnalysisContext, eventType: string): boolean => {
  for (const machineId of context.index.scopedMachineIds) {
    if (acceptsEvent(context, machineId, eventType)) return true;
  }

  return false;
};

const emissionIsAccepted = (context: GraphAnalysisContext, emission: GraphEmission): boolean => {
  if (emission.routing.kind === "default") return acceptsEvent(context, emission.machineId, emission.event.type);

  return scopedMachineAcceptsEvent(context, emission.event.type);
};

export const effectEventAcceptanceRule: GraphAnalysisRule = {
  id: "effect-event-acceptance",
  run(context) {
    const diagnostics: GraphDiagnostic[] = [];
    const severity = severityFor(context);

    for (const machine of context.machines) {
      for (const emission of machine.emissions) {
        if (!hasKnownRouting(emission) || emissionIsAccepted(context, emission)) continue;

        diagnostics.push(
          analyzerDiagnostic(
            "LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE",
            severity,
            `Effect emits event '${emission.event.type}', but no scoped machine accepts this event.`,
            { machineId: machine.id, loc: emission.loc },
          ),
        );
      }
    }

    return diagnostics;
  },
};
