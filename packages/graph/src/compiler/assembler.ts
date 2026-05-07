import type { GraphDiagnostic, GraphSource, LiteFsmGraphDocument } from "../types";
import type { MachineCandidate, ManagerCandidate } from "./candidates";
import { normalizeDiagnostics } from "./diagnostics";
import { createMachineId } from "./ids";
import type { ManagerLinkSlice } from "./manager";
import type { MachineGraphSlice } from "./pipeline";
import { createMachineFromSlice } from "./assembler/machine";
import { createManagerShells, createManagersFromLinks, createUniqueId } from "./assembler/manager";
import {
  sortMachineCandidates,
  sortMachineSlices,
  sortManagerCandidates,
  sortManagerLinks,
} from "./assembler/sort";

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
