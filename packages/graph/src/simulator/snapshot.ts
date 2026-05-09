import type { LiteFsmGraphDocument, LiteFsmGraphMachine } from "../types";
import type { GraphSimulationSlice, GraphSimulationSliceRef, GraphSimulationSnapshot } from "./types";
import { sliceRefEquals } from "./ids";
import { freezeDeep } from "./json";

export const freezeSnapshot = (snapshot: GraphSimulationSnapshot): GraphSimulationSnapshot => freezeDeep(snapshot);

export const orderedSlices = (snapshot: GraphSimulationSnapshot): GraphSimulationSlice[] => {
  const result: GraphSimulationSlice[] = [];
  for (const machineId of snapshot.machineIds) {
    const domainSliceId = snapshot.domainSlicesByMachineId[machineId];
    if (domainSliceId) result.push(snapshot.slices[domainSliceId] as GraphSimulationSlice);

    const actorTemplateSliceId = snapshot.actorTemplateSlicesByMachineId[machineId];
    if (actorTemplateSliceId) result.push(snapshot.slices[actorTemplateSliceId] as GraphSimulationSlice);

    /* v8 ignore next 3 -- stage 9 reserves actor instance indexes but never creates exact actor slices. */
    for (const actorSliceId of snapshot.actorSliceIdsByMachineId[machineId] ?? []) {
      result.push(snapshot.slices[actorSliceId] as GraphSimulationSlice);
    }
  }

  return result;
};

export const sliceByRef = (
  snapshot: GraphSimulationSnapshot,
  ref: GraphSimulationSliceRef,
): GraphSimulationSlice | undefined => orderedSlices(snapshot).find((slice) => sliceRefEquals(slice.ref, ref));

export const machineById = (document: LiteFsmGraphDocument, machineId: string): LiteFsmGraphMachine | undefined =>
  document.machines.find((machine) => machine.id === machineId);
