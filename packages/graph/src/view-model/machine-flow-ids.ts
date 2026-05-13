import type {
  MachineFlowEdgeGroup,
  MachineFlowEdgeKind,
} from "./machine-flow-types";

export type MachineFlowSyntheticTargetKind = "dynamic" | "blocked" | "unknown";

type EdgeGroupIdInput = {
  machineId: string;
  sourceNodeId: string;
  targetNodeId?: string;
  kind: MachineFlowEdgeKind;
  producerCategory: MachineFlowEdgeGroup["producerCategory"];
  direction: MachineFlowEdgeGroup["direction"];
};

const segment = (value: string): string => encodeURIComponent(value).replace(/\*/g, "%2A");

export const machineFlowStateNodeId = (machineId: string, stateId: string): string =>
  `machine-flow:${segment(machineId)}:state:${segment(stateId)}`;

export const machineFlowWildcardStateNodeId = (machineId: string): string =>
  `machine-flow:${segment(machineId)}:wildcard-state`;

export const machineFlowWildcardEffectNodeId = (machineId: string): string =>
  `machine-flow:${segment(machineId)}:wildcard-effect`;

export const machineFlowSyntheticTargetNodeId = (
  machineId: string,
  targetKind: MachineFlowSyntheticTargetKind,
  label: string,
): string => `machine-flow:${segment(machineId)}:synthetic:${targetKind}:${segment(label)}`;

export const machineFlowEdgeGroupId = (input: EdgeGroupIdInput): string =>
  [
    "machine-flow",
    segment(input.machineId),
    "edge",
    segment(input.sourceNodeId),
    segment(input.targetNodeId ?? "target:none"),
    input.kind,
    input.producerCategory,
    input.direction,
  ].join(":");
