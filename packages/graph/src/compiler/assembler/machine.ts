import type {
  GraphEmission,
  GraphReducerCase,
  GraphState,
  GraphStateRef,
  GraphTransition,
  LiteFsmGraphMachine,
} from "../../types";
import { normalizeDiagnostics } from "../diagnostics";
import {
  createEmissionId,
  createGraphTargetFromLabel,
  createReducerCaseId,
  createStateId,
  createTransitionId,
} from "../ids";
import type { MachineGraphSlice } from "../pipeline";
import {
  graphTargetLabel,
  routingLabel,
  sortConfigTransitions,
  sortEmissions,
  sortReducerCases,
  sortReducerTransitions,
} from "./sort";

const createStateKind = (key: string): GraphState["kind"] => {
  if (key === "*") return "wildcard";
  if (key === "__INIT") return "init";
  if (key === "__RESOLVED" || key === "__REJECTED" || key === "__CANCELLED") return "terminal";

  return "normal";
};

export const createMachineFromSlice = (
  slice: MachineGraphSlice,
  machineId: string,
): LiteFsmGraphMachine => {
  const config = slice.config;
  const stateIdsByKey = new Map<string, string>();
  const states = (config?.states ?? []).map((state): GraphState => {
    const id = createStateId(machineId, state.key);
    stateIdsByKey.set(state.key, id);

    return {
      id,
      key: state.key,
      kind: state.kind ?? createStateKind(state.key),
      isInitial: state.isInitial ?? state.key === config?.initialState,
      isPublicActorState: state.isPublicActorState ?? !state.key.startsWith("__"),
      loc: state.loc,
    };
  });

  const sourceRefFromKey = (sourceKey: string): GraphStateRef =>
    sourceKey === "*"
      ? { kind: "wildcard" }
      : stateIdsByKey.has(sourceKey)
        ? { kind: "state", stateId: stateIdsByKey.get(sourceKey) as string }
        : { kind: "unknown", label: sourceKey };

  const reducerCaseOrdinals = new Map<string, number>();
  const reducerCaseIdsByInputIndex = new Map<number, string>();
  const reducerCases = sortReducerCases(slice.reducer?.reducerCases ?? []).map((entry): GraphReducerCase => {
    const reducerCase = entry.value;
    const ordinal = reducerCaseOrdinals.get(reducerCase.event.type) ?? 0;
    reducerCaseOrdinals.set(reducerCase.event.type, ordinal + 1);
    const id = createReducerCaseId({
      machineId,
      eventType: reducerCase.event.type,
      ordinal,
    });
    reducerCaseIdsByInputIndex.set(entry.index, id);

    return {
      id,
      event: reducerCase.event,
      guard: reducerCase.guard,
      writesState: reducerCase.writesState,
      targets: reducerCase.targets.map((target) => target.target ?? createGraphTargetFromLabel(target.targetLabel, stateIdsByKey)),
      confidence: reducerCase.confidence,
      loc: reducerCase.loc,
    };
  });

  const transitionOrdinals = new Map<string, number>();
  const configTransitions = sortConfigTransitions(config?.transitions ?? []).map((transition, index): GraphTransition => {
    const source = sourceRefFromKey(transition.sourceKey);
    const target = transition.target ?? createGraphTargetFromLabel(transition.targetLabel, stateIdsByKey);
    const targetLabel = graphTargetLabel(transition.targetLabel, transition.target);
    const bucket = `${transition.layer ?? "config"}:${transition.sourceKey}:${transition.event.type}:${targetLabel}`;
    const ordinal = transitionOrdinals.get(bucket) ?? 0;
    transitionOrdinals.set(bucket, ordinal + 1);

    return {
      id: createTransitionId({
        machineId,
        layer: transition.layer ?? "config",
        sourceKey: transition.sourceKey,
        eventType: transition.event.type,
        targetLabel,
        ordinal,
      }),
      machineId,
      source,
      event: transition.event,
      target,
      layer: transition.layer ?? "config",
      order: transition.order ?? index,
      confidence: transition.confidence ?? "exact",
      loc: transition.loc,
    };
  });
  const reducerTransitions = sortReducerTransitions(slice.reducer?.transitions ?? []).map((transition, index): GraphTransition => {
    const source = sourceRefFromKey(transition.sourceKey);
    const target = transition.target ?? createGraphTargetFromLabel(transition.targetLabel, stateIdsByKey);
    const targetLabel = graphTargetLabel(transition.targetLabel, transition.target);
    const bucket = `reducer:${transition.sourceKey}:${transition.event.type}:${targetLabel}`;
    const ordinal = transitionOrdinals.get(bucket) ?? 0;
    transitionOrdinals.set(bucket, ordinal + 1);

    return {
      id: createTransitionId({
        machineId,
        layer: "reducer",
        sourceKey: transition.sourceKey,
        eventType: transition.event.type,
        targetLabel,
        ordinal,
      }),
      machineId,
      source,
      event: transition.event,
      target,
      layer: "reducer",
      order: configTransitions.length + index,
      guard: transition.guard,
      reducerCaseId: reducerCaseIdsByInputIndex.get(transition.reducerCaseIndex),
      confidence: transition.confidence,
      loc: transition.loc,
    };
  });
  const transitions = [...configTransitions, ...reducerTransitions];
  const emissionOrdinals = new Map<string, number>();
  const emissions = sortEmissions(slice.effects?.emissions ?? []).map((emission): GraphEmission => {
    const routeLabel = routingLabel(emission.routing);
    const bucket = `${emission.sourceKey}:${emission.event.type}:${routeLabel}`;
    const ordinal = emissionOrdinals.get(bucket) ?? 0;
    emissionOrdinals.set(bucket, ordinal + 1);

    return {
      id: createEmissionId({
        machineId,
        sourceState: emission.sourceKey,
        eventType: emission.event.type,
        routingLabel: routeLabel,
        ordinal,
      }),
      machineId,
      sourceState: emission.sourceKey === "*" ? "*" : sourceRefFromKey(emission.sourceKey),
      event: emission.event,
      routing: emission.routing,
      origin: emission.origin,
      guard: emission.guard,
      confidence: emission.confidence,
      loc: emission.loc,
    };
  });

  const diagnostics = normalizeDiagnostics([
    ...slice.diagnostics,
    ...(slice.config?.diagnostics ?? []),
    ...(slice.reducer?.diagnostics ?? []),
    ...(slice.effects?.diagnostics ?? []),
  ]).map((diagnostic) => ({ ...diagnostic, machineId }));
  const candidate = slice.candidate;

  return {
    id: machineId,
    index: candidate.index,
    variableName: candidate.variableName,
    exportName: candidate.exportName,
    managerKeys: slice.managerKeys,
    kind: config?.kind ?? "unknown",
    initialState: config?.initialState,
    initialContextSummary: config?.initialContextSummary,
    initialContextJson: config?.initialContextJson,
    groupTag: config?.groupTag,
    persistence: config?.persistence,
    states,
    transitions,
    emissions,
    reducerCases,
    diagnostics,
    loc: candidate.loc,
  };
};
