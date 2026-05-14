import type { GraphTarget } from "../types";
import type { MachineCandidate } from "./candidates";

const TERMINAL_TARGETS = new Set(["__RESOLVED", "__REJECTED", "__CANCELLED"]);

export const encodeIdSegment = (segment: string | number): string => {
  return encodeURIComponent(String(segment));
};

const joinIdSegments = (segments: ReadonlyArray<string | number>): string => {
  return segments.map(encodeIdSegment).join(":");
};

export const createStableHash = (source: string): string => {
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const createMachineId = (candidate: MachineCandidate, uniqueManagerKey?: string): string => {
  if (candidate.preferredId) return candidate.preferredId;
  if (candidate.exportName) return candidate.exportName;
  if (candidate.variableName) return candidate.variableName;
  if (uniqueManagerKey) return uniqueManagerKey;
  if (candidate.isDefaultExport) return "default";

  return `machine:${candidate.index}`;
};

export const createManagerId = (input: { index: number; exportName?: string; variableName?: string }): string => {
  if (input.exportName) return input.exportName;
  if (input.variableName) return input.variableName;

  return `manager:${input.index}`;
};

export const createStateId = (machineId: string, stateKey: string): string => {
  return joinIdSegments([machineId, "state", stateKey]);
};

export const createTransitionId = (input: {
  machineId: string;
  layer: "config" | "reducer";
  sourceKey: string;
  eventType: string;
  targetLabel: string;
  ordinal: number;
}): string => {
  return joinIdSegments([
    input.machineId,
    "transition",
    input.layer,
    input.sourceKey,
    input.eventType,
    input.targetLabel,
    input.ordinal,
  ]);
};

export const createReducerCaseId = (input: { machineId: string; eventType: string; ordinal: number }): string => {
  return joinIdSegments([input.machineId, "reducer", input.eventType, input.ordinal]);
};

export const createEmissionId = (input: {
  machineId: string;
  sourceState: string;
  eventType: string;
  routingLabel: string;
  ordinal: number;
}): string => {
  return joinIdSegments([
    input.machineId,
    "emission",
    input.sourceState,
    input.eventType,
    input.routingLabel,
    input.ordinal,
  ]);
};

export const createGraphTargetFromLabel = (
  targetLabel: string | null,
  stateIdsByKey: ReadonlyMap<string, string>,
): GraphTarget => {
  if (targetLabel === null) return { kind: "self" };
  if (TERMINAL_TARGETS.has(targetLabel)) {
    return { kind: "terminal", terminal: targetLabel as "__RESOLVED" | "__REJECTED" | "__CANCELLED" };
  }

  const stateId = stateIdsByKey.get(targetLabel);
  if (stateId) return { kind: "state", stateId };

  return { kind: "unknown", label: targetLabel };
};

export const targetLabelOf = (target: GraphTarget): string => {
  switch (target.kind) {
    case "state":
      return target.stateId;
    case "self":
      return "self";
    case "terminal":
      return target.terminal;
    case "dynamic":
      return target.label ?? "dynamic";
    case "blocked":
      return target.reason;
    case "unknown":
      return target.label ?? "unknown";
  }
};
