import type {
  GraphDiagnostic,
  GraphSource,
  GraphState,
  GraphStateRef,
  GraphTransition,
  LiteFsmGraphDocument,
  LiteFsmGraphMachine,
  LiteFsmGraphManager,
} from "../types";
import type { MachineCandidate, ManagerCandidate } from "./candidates";
import { normalizeDiagnostics } from "./diagnostics";
import {
  createGraphTargetFromLabel,
  createMachineId,
  createManagerId,
  createStateId,
  createTransitionId,
} from "./ids";
import type { ManagerLinkSlice } from "./manager";
import type { MachineGraphSlice } from "./pipeline";

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

  const transitionOrdinals = new Map<string, number>();
  const transitions = (config?.transitions ?? []).map((transition, index): GraphTransition => {
    const source: GraphStateRef =
      transition.sourceKey === "*"
        ? { kind: "wildcard" }
        : stateIdsByKey.has(transition.sourceKey)
          ? { kind: "state", stateId: stateIdsByKey.get(transition.sourceKey) as string }
          : { kind: "unknown", label: transition.sourceKey };
    const target = transition.target ?? createGraphTargetFromLabel(transition.targetLabel, stateIdsByKey);
    const targetLabel = transition.targetLabel ?? "self";
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

  const diagnostics = normalizeDiagnostics([
    ...slice.diagnostics,
    ...(slice.config?.diagnostics ?? []),
    ...(slice.reducer?.diagnostics ?? []),
    ...(slice.effects?.diagnostics ?? []),
  ]);
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
    emissions: [],
    reducerCases: [],
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
  const candidates = input.candidates ?? input.machineSlices?.map((slice) => slice.candidate) ?? [];
  const slices =
    input.machineSlices ??
    candidates.map((candidate) => ({
      candidate,
      managerKeys: candidate.managerKeys,
      diagnostics: [],
    }));
  const managerKeysByCandidate = input.managerLinks ? managerKeysFromLinks(input.managerLinks) : undefined;
  const slicesWithManagerKeys = slices.map((slice) => ({
    ...slice,
    managerKeys: managerKeysByCandidate?.get(slice.candidate) ?? slice.managerKeys,
  }));
  const idKeySources: readonly MachineKeySource[] = input.managerLinks
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
  const managers = input.managerLinks
    ? createManagersFromLinks(input.managerLinks, machineIdsByCandidate)
    : createManagerShells(input.managers ?? []);
  const diagnostics = normalizeDiagnostics([
    ...(input.diagnostics ?? []),
    ...(input.managerLinks?.flatMap((link) => link.diagnostics) ?? []),
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
