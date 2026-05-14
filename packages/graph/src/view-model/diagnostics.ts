import type { GraphDiagnostic, LiteFsmGraphDocument, LiteFsmGraphMachine, SourceLocation } from "../types";
import { diagnosticId } from "./ids";
import type { GraphItemRef, GraphDiagnosticAnchor } from "./types";
import { sourceAnchor } from "./source-anchors";
import { createGraphVisualizerIndexes, type GraphVisualizerIndexes } from "./indexes";

export type DiagnosticIndex = {
  byId: Map<string, GraphDiagnosticAnchor>;
  idsByMachineId: Map<string, string[]>;
  idsByManagerId: Map<string, string[]>;
  idsByStateId: Map<string, string[]>;
  idsByTransitionId: Map<string, string[]>;
  idsByEmissionId: Map<string, string[]>;
  idsByReducerCaseId: Map<string, string[]>;
  idsByTopicType: Map<string, string[]>;
};

const locKey = (loc: SourceLocation | undefined): string | undefined => {
  if (!loc) return undefined;

  return `${loc.fileName ?? ""}:${loc.start.line}:${loc.start.column}:${loc.start.offset}-${loc.end.line}:${loc.end.column}:${loc.end.offset}`;
};

const add = (map: Map<string, string[]>, key: string | undefined, id: string): void => {
  if (!key) return;

  const items = map.get(key) ?? [];
  items.push(id);
  map.set(key, items);
};

const bindDiagnosticToGraphItem = (
  document: LiteFsmGraphDocument,
  indexes: GraphVisualizerIndexes,
  diagnostic: GraphDiagnostic,
): GraphItemRef | undefined => {
  const diagnosticLoc = locKey(diagnostic.loc);

  if (diagnostic.machineId) {
    const machine = indexes.machinesById.get(diagnostic.machineId);
    if (!machine) return undefined;

    if (diagnosticLoc && locKey(machine.loc) === diagnosticLoc) return { kind: "machine", machineId: machine.id };

    const state = machine.states.find((candidate) => locKey(candidate.loc) === diagnosticLoc);
    if (state) return { kind: "state", machineId: machine.id, stateId: state.id };

    const transition = machine.transitions.find((candidate) => locKey(candidate.loc) === diagnosticLoc);
    if (transition) return { kind: "transition", machineId: machine.id, transitionId: transition.id };

    const emission = machine.emissions.find((candidate) => locKey(candidate.loc) === diagnosticLoc);
    if (emission) return { kind: "emission", machineId: machine.id, emissionId: emission.id };

    const reducerCase = machine.reducerCases.find((candidate) => locKey(candidate.loc) === diagnosticLoc);
    if (reducerCase) return { kind: "reducerCase", machineId: machine.id, reducerCaseId: reducerCase.id };

    return { kind: "machine", machineId: machine.id };
  }

  if (!diagnosticLoc) return undefined;

  const manager = document.managers.find((candidate) => locKey(candidate.loc) === diagnosticLoc);
  if (manager) return { kind: "manager", managerId: manager.id };

  for (const machine of document.machines) {
    if (locKey(machine.loc) === diagnosticLoc) return { kind: "machine", machineId: machine.id };

    const state = machine.states.find((candidate) => locKey(candidate.loc) === diagnosticLoc);
    if (state) return { kind: "state", machineId: machine.id, stateId: state.id };

    const transition = machine.transitions.find((candidate) => locKey(candidate.loc) === diagnosticLoc);
    if (transition) return { kind: "transition", machineId: machine.id, transitionId: transition.id };

    const emission = machine.emissions.find((candidate) => locKey(candidate.loc) === diagnosticLoc);
    if (emission) return { kind: "emission", machineId: machine.id, emissionId: emission.id };

    const reducerCase = machine.reducerCases.find((candidate) => locKey(candidate.loc) === diagnosticLoc);
    if (reducerCase) return { kind: "reducerCase", machineId: machine.id, reducerCaseId: reducerCase.id };
  }

  return undefined;
};

const topicForGraphItem = (
  document: LiteFsmGraphDocument,
  graphItemRef: GraphItemRef | undefined,
): string | undefined => {
  if (!graphItemRef || graphItemRef.kind === "topic") return graphItemRef?.eventType;
  if (!("machineId" in graphItemRef)) return undefined;

  const machine = document.machines.find((candidate) => candidate.id === graphItemRef.machineId);
  if (!machine) return undefined;

  if (graphItemRef.kind === "transition") {
    return machine.transitions.find((candidate) => candidate.id === graphItemRef.transitionId)?.event.type;
  }
  if (graphItemRef.kind === "emission") {
    return machine.emissions.find((candidate) => candidate.id === graphItemRef.emissionId)?.event.type;
  }
  if (graphItemRef.kind === "reducerCase") {
    return machine.reducerCases.find((candidate) => candidate.id === graphItemRef.reducerCaseId)?.event.type;
  }

  return undefined;
};

export const buildDiagnosticAnchors = (
  document: LiteFsmGraphDocument,
  analysisDiagnostics: readonly GraphDiagnostic[] = [],
  indexes: GraphVisualizerIndexes = createGraphVisualizerIndexes(document),
): GraphDiagnosticAnchor[] => {
  const bucketOrdinals = new Map<string, number>();
  const diagnostics = [
    ...document.diagnostics.map((diagnostic) => ({ origin: "compiler" as const, diagnostic })),
    ...analysisDiagnostics.map((diagnostic) => ({ origin: "analyzer" as const, diagnostic })),
  ];

  return diagnostics.map(({ origin, diagnostic }) => {
    const bucket = `${origin}:${diagnostic.machineId ?? "document"}:${diagnostic.code}:${locKey(diagnostic.loc) ?? "no-loc"}`;
    const ordinal = bucketOrdinals.get(bucket) ?? 0;
    bucketOrdinals.set(bucket, ordinal + 1);

    const graphItemRef = bindDiagnosticToGraphItem(document, indexes, diagnostic);
    const anchor = sourceAnchor("diagnostic", diagnostic.loc);

    return {
      diagnosticId: diagnosticId(origin, diagnostic, ordinal),
      origin,
      diagnostic,
      ...(graphItemRef ? { graphItemRef } : {}),
      ...(anchor ? { sourceAnchor: anchor } : {}),
    };
  });
};

export const buildMachineDiagnosticAnchors = (machine: LiteFsmGraphMachine): GraphDiagnosticAnchor[] => {
  const document: LiteFsmGraphDocument = {
    version: "lite-fsm.graph/v1",
    source: { language: "unknown" },
    machines: [machine],
    managers: [],
    diagnostics: machine.diagnostics,
  };

  return buildDiagnosticAnchors(document);
};

export const indexDiagnostics = (
  document: LiteFsmGraphDocument,
  diagnostics: readonly GraphDiagnosticAnchor[],
  indexes: GraphVisualizerIndexes,
): DiagnosticIndex => {
  const index: DiagnosticIndex = {
    byId: new Map(),
    idsByMachineId: new Map(),
    idsByManagerId: new Map(),
    idsByStateId: new Map(),
    idsByTransitionId: new Map(),
    idsByEmissionId: new Map(),
    idsByReducerCaseId: new Map(),
    idsByTopicType: new Map(),
  };

  for (const diagnostic of diagnostics) {
    index.byId.set(diagnostic.diagnosticId, diagnostic);

    const graphItemRef = diagnostic.graphItemRef;
    const refMachineId = graphItemRef && "machineId" in graphItemRef ? graphItemRef.machineId : undefined;
    const machineId =
      diagnostic.diagnostic.machineId && indexes.machinesById.has(diagnostic.diagnostic.machineId)
        ? diagnostic.diagnostic.machineId
        : refMachineId;
    add(index.idsByMachineId, machineId, diagnostic.diagnosticId);

    if (graphItemRef?.kind === "manager") add(index.idsByManagerId, graphItemRef.managerId, diagnostic.diagnosticId);
    if (graphItemRef?.kind === "state") add(index.idsByStateId, graphItemRef.stateId, diagnostic.diagnosticId);
    if (graphItemRef?.kind === "transition") add(index.idsByTransitionId, graphItemRef.transitionId, diagnostic.diagnosticId);
    if (graphItemRef?.kind === "emission") add(index.idsByEmissionId, graphItemRef.emissionId, diagnostic.diagnosticId);
    if (graphItemRef?.kind === "reducerCase") add(index.idsByReducerCaseId, graphItemRef.reducerCaseId, diagnostic.diagnosticId);

    add(index.idsByTopicType, topicForGraphItem(document, graphItemRef), diagnostic.diagnosticId);
  }

  return index;
};

export const idsForMachine = (diagnostics: DiagnosticIndex, machineId: string): readonly string[] =>
  diagnostics.idsByMachineId.get(machineId) ?? [];

export const idsForTopic = (diagnostics: DiagnosticIndex, eventType: string): readonly string[] =>
  diagnostics.idsByTopicType.get(eventType) ?? [];
