import type { GraphRouting, GraphRoutingTarget, LiteFsmGraphDocument, LiteFsmGraphMachine } from "../types";
import type { GraphSimulationEvent, GraphSimulationSlice, GraphSimulationSnapshot } from "./types";
import type { RoutedSlice } from "./pipeline-types";
import { machineById, orderedSlices } from "./snapshot";

export const normalizeRoutingTargetValues = (
  target: GraphRoutingTarget,
  sourceSlice: GraphSimulationSlice | undefined,
  sourceMachine: LiteFsmGraphMachine | undefined,
): string[] | undefined => {
  if (target.kind === "literal") return [target.value];
  if (target.kind === "array") {
    const values: string[] = [];
    for (const item of target.items) {
      const itemValues = normalizeRoutingTargetValues(item, sourceSlice, sourceMachine);
      if (!itemValues) return undefined;

      values.push(...itemValues);
    }

    return values;
  }
  if (target.kind === "selfField") {
    if (target.field === "groupTag" && sourceMachine?.groupTag) return [sourceMachine.groupTag];
    /* v8 ignore next -- exact actor slice metadata is reserved for future actorMode. */
    if (sourceSlice?.actor) return [sourceSlice.actor[target.field]];
    if (sourceSlice?.kind === "actorTemplate" && sourceMachine?.kind === "actorTemplate") {
      return [`${sourceSlice.machineId}:self.${target.field}`];
    }

    return undefined;
  }

  return undefined;
};

const valuesFromMetaField = (value: string | readonly string[] | undefined): string[] | undefined => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return [...value];

  return undefined;
};

export const routingFromEvent = (event: GraphSimulationEvent): GraphRouting => {
  const meta = event.meta;
  if (!meta) return { kind: "default" };

  const actorIds = valuesFromMetaField(meta.actorId);
  if (actorIds) return { kind: "actor", target: { kind: "array", items: actorIds.map((value) => ({ kind: "literal", value })) } };

  const groupIds = valuesFromMetaField(meta.groupId);
  if (groupIds) return { kind: "group", target: { kind: "array", items: groupIds.map((value) => ({ kind: "literal", value })) } };

  const groupTags = valuesFromMetaField(meta.groupTag);
  if (groupTags) return { kind: "tag", target: { kind: "array", items: groupTags.map((value) => ({ kind: "literal", value })) } };

  return { kind: "default" };
};

export const routeSlices = (
  document: LiteFsmGraphDocument,
  snapshot: GraphSimulationSnapshot,
  routing: GraphRouting,
  sourceSlice?: GraphSimulationSlice,
): RoutedSlice[] => {
  /* v8 ignore next -- unknown emission routing is rejected before dispatch in stage 9 manual mode. */
  if (routing.kind === "unknown") return [];

  const slices = orderedSlices(snapshot);
  const domains = slices.filter((slice) => slice.kind === "domain").map((slice): RoutedSlice => ({ slice, confidence: "exact" }));
  const actorTemplates = slices.filter((slice) => slice.kind === "actorTemplate");
  const sourceMachine = sourceSlice ? machineById(document, sourceSlice.machineId) : undefined;

  if (routing.kind === "default" || routing.kind === "unscoped") {
    return [...domains, ...actorTemplates.map((slice): RoutedSlice => ({ slice, confidence: "exact" }))];
  }

  if (routing.kind === "tag") {
    const values = normalizeRoutingTargetValues(routing.target, sourceSlice, sourceMachine);
    /* v8 ignore next -- non-resolvable tag routing is marked non-dispatchable before dispatch. */
    if (!values) return domains;
    const valueSet = new Set(values);

    return [
      ...domains,
      ...actorTemplates
        .filter((slice) => valueSet.has(machineById(document, slice.machineId)?.groupTag ?? ""))
        .map((slice): RoutedSlice => ({ slice, confidence: "exact" })),
    ];
  }

  const values = normalizeRoutingTargetValues(routing.target, sourceSlice, sourceMachine);
  /* v8 ignore next -- non-resolvable actor/group routing is marked non-dispatchable before dispatch. */
  if (!values) return domains;

  return [...domains, ...actorTemplates.map((slice): RoutedSlice => ({ slice, confidence: "partial" }))];
};
