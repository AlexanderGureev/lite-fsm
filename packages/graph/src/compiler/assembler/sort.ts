import type { GraphDiagnostic, GraphRouting, GraphRoutingTarget, GraphTarget } from "../../types";
import type { MachineCandidate, ManagerCandidate } from "../candidates";
import { targetLabelOf } from "../ids";
import type { ManagerLinkSlice } from "../manager";
import type {
  ConfigTransitionSlice,
  EffectEmissionSlice,
  MachineGraphSlice,
  ReducerCaseSlice,
  ReducerTargetSlice,
  ReducerTransitionSlice,
} from "../pipeline";

export type Indexed<T> = {
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

export const routingLabel = (routing: GraphRouting): string => {
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

export const graphTargetLabel = (targetLabel: string | null, target?: GraphTarget): string => {
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

export const sortConfigTransitions = (
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

export const sortReducerCases = (
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

export const sortReducerTransitions = (
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

export const sortEmissions = (emissions: readonly EffectEmissionSlice[]): EffectEmissionSlice[] => {
  return sortByParts(emissions, (emission, index) => [
    locOffset(emission),
    emission.sourceKey,
    emission.event.type,
    routingLabel(emission.routing),
    conditionLabel(emission.guard),
    index,
  ]);
};

export const sortMachineSlices = (slices: readonly MachineGraphSlice[]): MachineGraphSlice[] => {
  return sortByParts(slices, (slice, index) => [slice.candidate.index, index]);
};

export const sortMachineCandidates = (candidates: readonly MachineCandidate[]): MachineCandidate[] => {
  return sortByParts(candidates, (candidate, index) => [candidate.index, index]);
};

export const sortManagerCandidates = (managers: readonly ManagerCandidate[]): ManagerCandidate[] => {
  return sortByParts(managers, (manager, index) => [manager.index, index]);
};

export const sortManagerLinks = (links: readonly ManagerLinkSlice[]): ManagerLinkSlice[] => {
  return sortByParts(links, (link, index) => [link.manager.index, index]);
};
