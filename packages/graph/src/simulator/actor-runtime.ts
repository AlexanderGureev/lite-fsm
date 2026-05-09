import type { GraphSimulationActorMeta, GraphSimulationSlice, GraphSimulationSliceRef } from "./types";

export type ActorSliceRef = Extract<GraphSimulationSliceRef, { kind: "actor" }>;

export type ActorSlice = GraphSimulationSlice & {
  kind: "actor";
  ref: ActorSliceRef;
  actor: GraphSimulationActorMeta;
};

export type ActorRuntimeIndexes = {
  actorSliceIdsByMachineId: Record<string, readonly string[]>;
};
