import type {
  GraphDiagnostic,
  GraphEmission,
  GraphReducerCase,
  GraphRouting,
  GraphRoutingTarget,
  GraphSource,
  GraphState,
  GraphStateRef,
  GraphTarget,
  GraphTransition,
  LiteFsmGraphDocument,
  LiteFsmGraphMachine,
  LiteFsmGraphManager,
} from "../types";
import type { MachineCandidate, ManagerCandidate } from "./candidates";
import { normalizeDiagnostics } from "./diagnostics";
import {
  createGraphTargetFromLabel,
  createEmissionId,
  createMachineId,
  createManagerId,
  createReducerCaseId,
  createStateId,
  createTransitionId,
  targetLabelOf,
} from "./ids";
import type { ManagerLinkSlice } from "./manager";
import type {
  ConfigTransitionSlice,
  EffectEmissionSlice,
  MachineGraphSlice,
  ReducerCaseSlice,
  ReducerTransitionSlice,
  ReducerTargetSlice,
} from "./pipeline";

export type GraphAssemblyInput = {
  source: GraphSource;
  candidates?: readonly MachineCandidate[];
  managers?: readonly ManagerCandidate[];
  managerLinks?: readonly ManagerLinkSlice[];
  machineSlices?: readonly MachineGraphSlice[];
  diagnostics?: readonly GraphDiagnostic[];
};

type MachineKeySource = {
  candidate: MachineCandidate;
  managerKeys: readonly string[];
};

type Indexed<T> = {
  value: T;
  index: number;
};

type SortPart = number | string;

const withIndex = <T>(values: readonly T[]): Array<Indexed<T>> => {
  return values.map((value, index) => ({ value, index }));
};

const compareParts = (
  left: ReadonlyArray<SortPart>,
  right: ReadonlyArray<SortPart>,
): number => {
  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index] as number | string;
    const rightPart = right[index] as number | string;
    if (leftPart === rightPart) continue;

    if (typeof leftPart === "number" && typeof rightPart === "number") return leftPart - rightPart;

    return String(leftPart).localeCompare(String(rightPart));
  }

  /* v8 ignore next -- all assembler sort tuples include original index as the final tie-breaker. */
  return 0;
};

const sortIndexedByParts = <T>(
  values: readonly T[],
  readParts: (value: T, index: number) => ReadonlyArray<SortPart>,
): Array<Indexed<T>> => {
  return withIndex(values).sort((left, right) =>
    compareParts(readParts(left.value, left.index), readParts(right.value, right.index)),
  );
};

const sortByParts = <T>(
  values: readonly T[],
  readParts: (value: T, index: number) => ReadonlyArray<SortPart>,
): T[] => {
  return sortIndexedByParts(values, readParts).map((item) => item.value);
};

const locOffset = (value: { loc?: GraphDiagnostic["loc"] }): number => {
  return value.loc?.start.offset ?? Number.MAX_SAFE_INTEGER;
};

const uniqueOrUndefined = (values: readonly string[]): string | undefined => {
  const uniqueValues = [...new Set(values)];

  return uniqueValues.length === 1 ? uniqueValues[0] : undefined;
};

const uniqueMachineKeyBySource = (sources: readonly MachineKeySource[]): ReadonlyMap<MachineCandidate, string> => {
  const keyCounts = new Map<string, number>();
  for (const source of sources) {
    for (const key of source.managerKeys) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }

  const result = new Map<MachineCandidate, string>();
  for (const source of sources) {
    const key = uniqueOrUndefined(source.managerKeys);
    if (key && keyCounts.get(key) === 1) result.set(source.candidate, key);
  }

  return result;
};

const managerKeysFromLinks = (managerLinks: readonly ManagerLinkSlice[]): ReadonlyMap<MachineCandidate, string[]> => {
  const result = new Map<MachineCandidate, string[]>();

  for (const link of managerLinks) {
    for (const ref of link.refs) {
      const keys = result.get(ref.machineCandidate) ?? [];
      if (keys.includes(ref.key)) continue;

      result.set(ref.machineCandidate, [...keys, ref.key]);
    }
  }

  return result;
};

const createUniqueId = (base: string, usedIds: Set<string>): string => {
  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }

  let suffix = 1;
  while (usedIds.has(`${base}:${suffix}`)) suffix += 1;

  const id = `${base}:${suffix}`;
  usedIds.add(id);
  return id;
};

const createStateKind = (key: string): GraphState["kind"] => {
  if (key === "*") return "wildcard";
  if (key === "__INIT") return "init";
  if (key === "__RESOLVED" || key === "__REJECTED" || key === "__CANCELLED") return "terminal";

  return "normal";
};

const routingTargetLabel = (target: GraphRoutingTarget): string => {
  switch (target.kind) {
    case "literal":
      return target.value;
    case "array":
      return `[${target.items.map(routingTargetLabel).join(",")}]`;
    case "selfField":
      return `self.${target.field}`;
    case "dynamic":
      return target.label ?? "dynamic";
  }
};

const routingLabel = (routing: GraphRouting): string => {
  switch (routing.kind) {
    case "default":
      return "default";
    case "unscoped":
      return "unscoped";
    case "actor":
    case "group":
    case "tag":
      return `${routing.kind}:${routingTargetLabel(routing.target)}`;
    case "unknown":
      return routing.label ?? "unknown";
  }
};

const graphTargetLabel = (targetLabel: string | null, target?: GraphTarget): string => {
  if (targetLabel !== null) return targetLabel;
  if (target) return targetLabelOf(target);

  return "self";
};

const reducerTargetLabel = (target: ReducerTargetSlice): string => {
  return graphTargetLabel(target.targetLabel, target.target);
};

const conditionLabel = (guard: { kind: string; text: string } | undefined): string => {
  if (!guard) return "";

  return `${guard.kind}:${guard.text}`;
};

const sortConfigTransitions = (
  transitions: readonly ConfigTransitionSlice[],
): ConfigTransitionSlice[] => {
  return sortByParts(transitions, (transition, index) => [
    locOffset(transition),
    transition.sourceKey,
    transition.event.type,
    graphTargetLabel(transition.targetLabel, transition.target),
    index,
  ]);
};

const sortReducerCases = (
  reducerCases: readonly ReducerCaseSlice[],
): Array<Indexed<ReducerCaseSlice>> => {
  return sortIndexedByParts(reducerCases, (reducerCase, index) => [
    locOffset(reducerCase),
    reducerCase.event.type,
    conditionLabel(reducerCase.guard),
    reducerCase.targets.map(reducerTargetLabel).join("|"),
    index,
  ]);
};

const sortReducerTransitions = (
  transitions: readonly ReducerTransitionSlice[],
): ReducerTransitionSlice[] => {
  return sortByParts(transitions, (transition, index) => [
    locOffset(transition),
    transition.sourceKey,
    transition.event.type,
    graphTargetLabel(transition.targetLabel, transition.target),
    conditionLabel(transition.guard),
    index,
  ]);
};

const sortEmissions = (emissions: readonly EffectEmissionSlice[]): EffectEmissionSlice[] => {
  return sortByParts(emissions, (emission, index) => [
    locOffset(emission),
    emission.sourceKey,
    emission.event.type,
    routingLabel(emission.routing),
    conditionLabel(emission.guard),
    index,
  ]);
};

const sortMachineSlices = (slices: readonly MachineGraphSlice[]): MachineGraphSlice[] => {
  return sortByParts(slices, (slice, index) => [slice.candidate.index, index]);
};

const sortMachineCandidates = (candidates: readonly MachineCandidate[]): MachineCandidate[] => {
  return sortByParts(candidates, (candidate, index) => [candidate.index, index]);
};

const sortManagerCandidates = (managers: readonly ManagerCandidate[]): ManagerCandidate[] => {
  return sortByParts(managers, (manager, index) => [manager.index, index]);
};

const sortManagerLinks = (links: readonly ManagerLinkSlice[]): ManagerLinkSlice[] => {
  return sortByParts(links, (link, index) => [link.manager.index, index]);
};

const createMachineFromSlice = (
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

const createManagerShells = (managers: readonly ManagerCandidate[]): LiteFsmGraphManager[] => {
  const usedIds = new Set<string>();

  return managers.map((manager) => ({
    id: createUniqueId(createManagerId(manager), usedIds),
    variableName: manager.variableName,
    machineRefs: [],
    loc: manager.loc,
  }));
};

const createManagersFromLinks = (
  managerLinks: readonly ManagerLinkSlice[],
  machineIdsByCandidate: ReadonlyMap<MachineCandidate, string>,
): LiteFsmGraphManager[] => {
  const usedIds = new Set<string>();

  return managerLinks.map((link) => ({
    id: createUniqueId(createManagerId(link.manager), usedIds),
    variableName: link.manager.variableName,
    machineRefs: link.refs.flatMap((ref) => {
      const machineId = machineIdsByCandidate.get(ref.machineCandidate);
      if (!machineId) return [];

      return [
        {
          key: ref.key,
          machineId,
          loc: ref.loc,
        },
      ];
    }),
    loc: link.manager.loc,
  }));
};

export const assembleGraphDocument = (input: GraphAssemblyInput): LiteFsmGraphDocument => {
  const inputMachineSlices = input.machineSlices ? sortMachineSlices(input.machineSlices) : undefined;
  const managerLinks = input.managerLinks ? sortManagerLinks(input.managerLinks) : undefined;
  const candidates = inputMachineSlices?.map((slice) => slice.candidate) ?? sortMachineCandidates(input.candidates ?? []);
  const slices =
    inputMachineSlices ??
    candidates.map((candidate) => ({
      candidate,
      managerKeys: candidate.managerKeys,
      diagnostics: [],
    }));
  const managerKeysByCandidate = managerLinks ? managerKeysFromLinks(managerLinks) : undefined;
  const slicesWithManagerKeys = slices.map((slice) => ({
    ...slice,
    managerKeys: managerKeysByCandidate?.get(slice.candidate) ?? slice.managerKeys,
  }));
  const idKeySources: readonly MachineKeySource[] = managerLinks
    ? slicesWithManagerKeys
    : candidates.map((candidate) => ({
        candidate,
        managerKeys: candidate.managerKeys,
      }));
  const uniqueManagerKeys = uniqueMachineKeyBySource(idKeySources);
  const usedMachineIds = new Set<string>();
  const machineIdsByCandidate = new Map<MachineCandidate, string>();
  const machines = slicesWithManagerKeys.map((slice) => {
    const preferredId = createMachineId(slice.candidate, uniqueManagerKeys.get(slice.candidate));
    const machineId = createUniqueId(preferredId, usedMachineIds);

    machineIdsByCandidate.set(slice.candidate, machineId);

    return createMachineFromSlice(slice, machineId);
  });
  const managers = managerLinks
    ? createManagersFromLinks(managerLinks, machineIdsByCandidate)
    : createManagerShells(sortManagerCandidates(input.managers ?? []));
  const diagnostics = normalizeDiagnostics([
    ...(input.diagnostics ?? []),
    ...(managerLinks?.flatMap((link) => link.diagnostics) ?? []),
    ...machines.flatMap((machine) => machine.diagnostics),
  ]);

  return {
    version: "lite-fsm.graph/v1",
    source: input.source,
    machines,
    managers,
    diagnostics,
  };
};
