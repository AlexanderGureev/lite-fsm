import type { LiteFsmGraphManager } from "../../types";
import type { MachineCandidate, ManagerCandidate } from "../candidates";
import { createManagerId } from "../ids";
import type { ManagerLinkSlice } from "../manager";

export const createUniqueId = (base: string, usedIds: Set<string>): string => {
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

export const createManagerShells = (managers: readonly ManagerCandidate[]): LiteFsmGraphManager[] => {
  const usedIds = new Set<string>();

  return managers.map((manager) => ({
    id: createUniqueId(createManagerId(manager), usedIds),
    variableName: manager.variableName,
    machineRefs: [],
    loc: manager.loc,
  }));
};

export const createManagersFromLinks = (
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
