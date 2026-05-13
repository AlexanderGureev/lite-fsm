import {
  machineFlowEdgeGroupId,
  machineFlowStateNodeId,
  machineFlowSyntheticTargetNodeId,
  machineFlowWildcardEffectNodeId,
  machineFlowWildcardStateNodeId,
  type MachineFlowSyntheticTargetKind,
} from "./machine-flow-ids";
import type {
  BuildMachineFlowModelInput,
  MachineFlowBadge,
  MachineFlowEdgeGroup,
  MachineFlowEdgeKind,
  MachineFlowMachine,
  MachineFlowModel,
  MachineFlowNode,
  MachineFlowProducerRef,
  MachineFlowRowRef,
} from "./machine-flow-types";
import { compareText, orderedUnique } from "./sort";
import type {
  GraphCondition,
  GraphRouting,
  GraphRoutingTarget,
} from "../types";
import type {
  GraphConfigRow,
  GraphEffectRow,
  GraphMachineSummary,
  GraphMachineWorkbenchModel,
  GraphReducerRow,
  GraphSourceAnchor,
  GraphTargetView,
  GraphTopicProducer,
  GraphTopicSummary,
  GraphWorkbenchRow,
  GraphWorkbenchStateBlock,
  GraphVisualizerModel,
} from "./types";

type FlowBuildContext = {
  machineId: string;
  workbench: GraphMachineWorkbenchModel;
  machineSummary?: GraphMachineSummary;
  machineTitlesById: ReadonlyMap<string, string>;
  topicsByEvent: ReadonlyMap<string, GraphTopicSummary>;
  statesById: ReadonlyMap<string, GraphWorkbenchStateBlock>;
  statesByKey: ReadonlyMap<string, GraphWorkbenchStateBlock>;
  rowOrder: ReadonlyMap<string, number>;
  nodeDrafts: Map<string, NodeDraft>;
  syntheticTargetOrder: Map<string, number>;
};

type NodeDraft = {
  nodeId: string;
  ref: MachineFlowNode["ref"];
  label: string;
  order: number;
  badges: MachineFlowBadge[];
  sourceAnchors: GraphSourceAnchor[];
  diagnosticIds: string[];
  facts: {
    current: boolean;
    initial: boolean;
    terminal: boolean;
    spawn: boolean;
    wildcard: boolean;
    effectSource: boolean;
    synthetic: boolean;
  };
  stats: MachineFlowNode["stats"];
};

type TransitionCandidate = {
  sourceNodeId: string;
  sourceStateKey: string | "*";
  targetNodeId: string;
  direction: MachineFlowEdgeGroup["direction"];
  row: MachineFlowEdgeRowRef;
  eventType: string;
  sourceAnchors: readonly GraphSourceAnchor[];
};

type EffectCandidate = {
  sourceNodeId: string;
  sourceStateKey: string | "*";
  row: MachineFlowEdgeRowRef;
  producer: MachineFlowProducerRef;
  eventType: string;
  sourceAnchors: readonly GraphSourceAnchor[];
};

type MachineFlowEdgeRowRef = Extract<MachineFlowRowRef, { eventType: string }>;

type EdgeDraft = {
  sourceNodeId: string;
  targetNodeId?: string;
  direction: MachineFlowEdgeGroup["direction"];
  kind: MachineFlowEdgeKind;
  producerCategory: MachineFlowEdgeGroup["producerCategory"];
  rows: readonly MachineFlowEdgeRowRef[];
  producers: readonly MachineFlowProducerRef[];
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnostics: readonly string[];
};

const terminalStateKeys = new Set(["__RESOLVED", "__REJECTED", "__CANCELLED"]);

export const buildMachineFlowModel = (input: BuildMachineFlowModelInput): MachineFlowModel => {
  const workbench = input.model.workbenchMachines[input.machineId];
  if (!workbench) return { status: "missing-machine", machineId: input.machineId };

  const context = createBuildContext(input.model, workbench);
  buildStateNodeDrafts(context);
  const transitionCandidates = collectAcceptedTransitionCandidates(context);
  const effectCandidates = collectEffectEmissionCandidates(context);
  const { edgeDrafts, pairedTransitionRows, pairedEffectRows } = pairLocalLifecycleEdges(
    context,
    transitionCandidates,
    effectCandidates,
  );

  edgeDrafts.push(...buildAcceptedTransitionEdges(context, transitionCandidates, pairedTransitionRows));
  edgeDrafts.push(...buildEmissionOnlyEdges(context, effectCandidates, pairedEffectRows));

  const edgeGroups = groupEdgeDrafts(context, edgeDrafts);
  applyNodeStats(context, edgeGroups);

  return {
    status: "ready",
    machine: buildMachineSummary(context),
    nodes: finalNodes(context),
    edgeGroups,
  };
};

const createBuildContext = (
  model: GraphVisualizerModel,
  workbench: GraphMachineWorkbenchModel,
): FlowBuildContext => {
  const machineTitlesById = new Map(model.machines.map((machine) => [machine.machineId, machine.title]));
  const topicsByEvent = new Map(model.topics.map((topic) => [topic.eventType, topic]));
  const statesById = new Map(workbench.states.map((state) => [state.stateId, state]));
  const statesByKey = new Map(workbench.states.map((state) => [state.stateKey, state]));
  const rows = allRows(workbench);
  const rowOrder = new Map(rows.map((row, index) => [row.rowId, index]));

  return {
    machineId: workbench.machineId,
    workbench,
    machineSummary: model.machines.find((machine) => machine.machineId === workbench.machineId),
    machineTitlesById,
    topicsByEvent,
    statesById,
    statesByKey,
    rowOrder,
    nodeDrafts: new Map(),
    syntheticTargetOrder: new Map(),
  };
};

const allRows = (workbench: GraphMachineWorkbenchModel): readonly GraphWorkbenchRow[] => [
  ...workbench.states.flatMap((state) => state.rows),
  ...workbench.globalBehavior,
];

const buildStateNodeDrafts = (context: FlowBuildContext): void => {
  context.workbench.states.forEach((state, index) => {
    const isWildcard = isWildcardState(state);
    const nodeId = isWildcard
      ? machineFlowWildcardStateNodeId(context.machineId)
      : machineFlowStateNodeId(context.machineId, state.stateId);
    const draft = createNodeDraft({
      nodeId,
      ref: isWildcard ? { kind: "wildcard-state" } : { kind: "state", stateId: state.stateId },
      label: state.stateKey,
      order: index,
      sourceAnchors: state.sourceAnchors,
      diagnosticIds: state.diagnosticIds,
      facts: {
        current: isCurrentState(context, state),
        initial: isInitialState(context, state),
        terminal: isTerminalState(state),
        spawn: state.stateKey === "__INIT",
        wildcard: isWildcard,
        effectSource: !isWildcard && state.rows.some((row) => row.kind === "effect"),
        synthetic: false,
      },
    });
    addBadgesFromFacts(draft, context.workbench.groupTag);
    context.nodeDrafts.set(nodeId, draft);
  });
};

const createNodeDraft = (input: {
  nodeId: string;
  ref: MachineFlowNode["ref"];
  label: string;
  order: number;
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnosticIds?: readonly string[];
  facts: NodeDraft["facts"];
}): NodeDraft => ({
  nodeId: input.nodeId,
  ref: input.ref,
  label: input.label,
  order: input.order,
  badges: [],
  sourceAnchors: [...input.sourceAnchors],
  diagnosticIds: [...(input.diagnosticIds ?? [])],
  facts: input.facts,
  stats: { incoming: 0, outgoing: 0, selfLoops: 0, emissions: 0 },
});

const isWildcardState = (state: GraphWorkbenchStateBlock): boolean =>
  state.kind === "wildcard" || state.stateKey === "*";

const isCurrentState = (
  context: FlowBuildContext,
  state: GraphWorkbenchStateBlock,
): boolean => context.workbench.currentStateId === state.stateId || state.current;

const isInitialState = (
  context: FlowBuildContext,
  state: GraphWorkbenchStateBlock,
): boolean => context.workbench.initialState === state.stateKey || state.badges.some((badge) => badge.kind === "initial");

const isTerminalState = (state: GraphWorkbenchStateBlock): boolean =>
  state.kind === "terminal" || terminalStateKeys.has(state.stateKey);

const addBadgesFromFacts = (draft: NodeDraft, groupTag: string | undefined): void => {
  if (draft.facts.initial) draft.badges.push({ kind: "initial", label: "initial" });
  if (draft.facts.current) draft.badges.push({ kind: "current", label: "current" });
  if (draft.facts.terminal) draft.badges.push({ kind: "terminal", label: "terminal" });
  if (draft.facts.spawn) draft.badges.push({ kind: "spawn", label: "spawn" });
  if (draft.facts.wildcard) draft.badges.push({ kind: "wildcard", label: "*" });
  if (draft.facts.effectSource) draft.badges.push({ kind: "effect-source", label: "effect source" });
  if (groupTag) draft.badges.push({ kind: "group-tag", label: groupTag });
  if (draft.diagnosticIds.length > 0) draft.badges.push({ kind: "diagnostic", label: String(draft.diagnosticIds.length) });
};

const collectAcceptedTransitionCandidates = (
  context: FlowBuildContext,
): TransitionCandidate[] => {
  const candidates: TransitionCandidate[] = [];

  for (const row of allRows(context.workbench)) {
    if (row.kind === "config") {
      candidates.push(createTransitionCandidate(context, row));
      continue;
    }

    if (row.kind === "reducer" && !row.foldedIntoConfig) {
      candidates.push(createTransitionCandidate(context, row));
    }
  }

  return candidates;
};

const createTransitionCandidate = (
  context: FlowBuildContext,
  row: GraphConfigRow | GraphReducerRow,
): TransitionCandidate => {
  const sourceNode = sourceNodeForTransition(context, row.sourceStateId);
  const target = resolveTarget(context, sourceNode.nodeId, row.target);

  return {
    sourceNodeId: sourceNode.nodeId,
    sourceStateKey: sourceNode.stateKey,
    targetNodeId: target.targetNodeId,
    direction: target.direction,
    row: transitionRowRef(row),
    eventType: row.eventType,
    sourceAnchors: row.sourceAnchors,
  };
};

const transitionRowRef = (row: GraphConfigRow | GraphReducerRow): MachineFlowEdgeRowRef => ({
  machineId: row.machineId,
  rowId: row.rowId,
  rowKind: row.kind,
  eventType: row.eventType,
  targetLabel: row.target.label,
  ...(row.guard ? { guardLabel: guardLabel(row.guard) } : {}),
  confidence: row.confidence,
  sourceAnchors: row.sourceAnchors,
});

const sourceNodeForTransition = (
  context: FlowBuildContext,
  sourceStateId: string,
): { nodeId: string; stateKey: string | "*" } => {
  const state = context.statesById.get(sourceStateId);
  if (state) return { nodeId: nodeIdForState(context, state), stateKey: state.stateKey === "*" ? "*" : state.stateKey };
  if (sourceStateId === "wildcard") return { nodeId: ensureWildcardStateNode(context), stateKey: "*" };

  return { nodeId: ensureSyntheticTargetNode(context, "unknown", sourceStateId), stateKey: sourceStateId };
};

const nodeIdForState = (context: FlowBuildContext, state: GraphWorkbenchStateBlock): string =>
  isWildcardState(state)
    ? machineFlowWildcardStateNodeId(context.machineId)
    : machineFlowStateNodeId(context.machineId, state.stateId);

const ensureWildcardStateNode = (context: FlowBuildContext): string => {
  const nodeId = machineFlowWildcardStateNodeId(context.machineId);
  const existing = context.nodeDrafts.get(nodeId);
  if (existing) return existing.nodeId;

  const draft = createNodeDraft({
    nodeId,
    ref: { kind: "wildcard-state" },
    label: "*",
    order: context.workbench.states.length,
    sourceAnchors: [],
    facts: {
      current: false,
      initial: false,
      terminal: false,
      spawn: false,
      wildcard: true,
      effectSource: false,
      synthetic: false,
    },
  });
  addBadgesFromFacts(draft, context.workbench.groupTag);
  context.nodeDrafts.set(nodeId, draft);
  return nodeId;
};

const ensureWildcardEffectNode = (context: FlowBuildContext): string => {
  const nodeId = machineFlowWildcardEffectNodeId(context.machineId);
  const existing = context.nodeDrafts.get(nodeId);
  if (existing) return existing.nodeId;

  const draft = createNodeDraft({
    nodeId,
    ref: { kind: "wildcard-effect" },
    label: "*",
    order: context.workbench.states.length + 1,
    sourceAnchors: [],
    facts: {
      current: false,
      initial: false,
      terminal: false,
      spawn: false,
      wildcard: false,
      effectSource: true,
      synthetic: false,
    },
  });
  draft.badges.push({ kind: "effect-source", label: "effect source" });
  context.nodeDrafts.set(nodeId, draft);
  return nodeId;
};

const ensureSyntheticTargetNode = (
  context: FlowBuildContext,
  targetKind: MachineFlowSyntheticTargetKind,
  label: string,
): string => {
  const nodeId = machineFlowSyntheticTargetNodeId(context.machineId, targetKind, label);
  const existing = context.nodeDrafts.get(nodeId);
  if (existing) return existing.nodeId;

  const order = context.workbench.states.length + 2 + context.syntheticTargetOrder.size;
  context.syntheticTargetOrder.set(nodeId, order);
  const draft = createNodeDraft({
    nodeId,
    ref: { kind: "synthetic-target", targetKind },
    label,
    order,
    sourceAnchors: [],
    facts: {
      current: false,
      initial: false,
      terminal: false,
      spawn: false,
      wildcard: false,
      effectSource: false,
      synthetic: true,
    },
  });
  draft.badges.push({ kind: "unknown", label: targetKind });
  context.nodeDrafts.set(nodeId, draft);
  return nodeId;
};

const resolveTarget = (
  context: FlowBuildContext,
  sourceNodeId: string,
  target: GraphTargetView,
): { targetNodeId: string; direction: MachineFlowEdgeGroup["direction"] } => {
  if (target.kind === "self") return { targetNodeId: sourceNodeId, direction: "self" };

  const targetNodeId = resolveTargetNodeId(context, target);
  return {
    targetNodeId,
    direction: targetNodeId === sourceNodeId ? "self" : "normal",
  };
};

const resolveTargetNodeId = (
  context: FlowBuildContext,
  target: GraphTargetView,
): string => {
  if (target.kind === "state") {
    const state = target.stateId ? context.statesById.get(target.stateId) : undefined;
    return state ? nodeIdForState(context, state) : ensureSyntheticTargetNode(context, "unknown", target.label);
  }

  if (target.kind === "terminal") {
    const state = target.terminal ? context.statesByKey.get(target.terminal) : undefined;
    return state ? nodeIdForState(context, state) : ensureSyntheticTargetNode(context, "unknown", target.label);
  }

  if (target.kind === "dynamic" || target.kind === "blocked" || target.kind === "unknown") {
    return ensureSyntheticTargetNode(context, target.kind, target.label);
  }

  return ensureSyntheticTargetNode(context, "unknown", target.label);
};

const collectEffectEmissionCandidates = (
  context: FlowBuildContext,
): EffectCandidate[] => {
  return allRows(context.workbench).flatMap((row) => {
    if (row.kind !== "effect") return [];

    const source = sourceNodeForEffect(context, row);
    return [
      {
        sourceNodeId: source.nodeId,
        sourceStateKey: source.stateKey,
        row: effectRowRef(row),
        producer: producerRefForEffectRow(context, row),
        eventType: row.eventType,
        sourceAnchors: row.sourceAnchors,
      },
    ];
  });
};

const sourceNodeForEffect = (
  context: FlowBuildContext,
  row: GraphEffectRow,
): { nodeId: string; stateKey: string | "*" } => {
  if (row.sourceStateKey === "*") return { nodeId: ensureWildcardEffectNode(context), stateKey: "*" };
  const state = row.sourceStateId ? context.statesById.get(row.sourceStateId) : undefined;
  if (state) {
    const nodeId = nodeIdForState(context, state);
    const draft = context.nodeDrafts.get(nodeId);
    if (draft && !draft.facts.effectSource) {
      draft.facts.effectSource = true;
      draft.badges.push({ kind: "effect-source", label: "effect source" });
    }
    return { nodeId, stateKey: state.stateKey };
  }

  return { nodeId: ensureSyntheticTargetNode(context, "unknown", row.sourceStateKey), stateKey: row.sourceStateKey };
};

const effectRowRef = (row: GraphEffectRow): MachineFlowEdgeRowRef => ({
  machineId: row.machineId,
  rowId: row.rowId,
  rowKind: "effect",
  eventType: row.eventType,
  routingLabel: routingLabel(row.routing),
  ...(row.guard ? { guardLabel: guardLabel(row.guard) } : {}),
  confidence: row.confidence,
  sourceAnchors: row.sourceAnchors,
});

const producerRefForEffectRow = (
  context: FlowBuildContext,
  row: GraphEffectRow,
): MachineFlowProducerRef => {
  const topicProducer = context.topicsByEvent
    .get(row.eventType)
    ?.producers.find((producer) => producer.machineId === row.machineId && producer.emissionId === row.emissionId);

  return producerRefFromProducer(context, {
    machineId: row.machineId,
    emissionId: row.emissionId,
    eventType: row.eventType,
    sourceStateKey: row.sourceStateKey,
    routing: topicProducer?.routing ?? row.routing,
    guard: topicProducer?.guard ?? row.guard,
    confidence: topicProducer?.confidence ?? row.confidence,
    sourceAnchors: topicProducer?.sourceAnchors ?? row.sourceAnchors,
  });
};

const producerRefFromProducer = (
  context: FlowBuildContext,
  producer: Pick<
    GraphTopicProducer,
    "machineId" | "emissionId" | "sourceStateKey" | "routing" | "guard" | "confidence" | "sourceAnchors"
  > & { eventType: string },
): MachineFlowProducerRef => ({
  machineId: producer.machineId,
  machineTitle: context.machineTitlesById.get(producer.machineId) ?? producer.machineId,
  emissionId: producer.emissionId,
  eventType: producer.eventType,
  sourceStateKey: producer.sourceStateKey,
  routingLabel: routingLabel(producer.routing),
  ...(producer.guard ? { guardLabel: guardLabel(producer.guard) } : {}),
  confidence: producer.confidence,
  sourceAnchors: producer.sourceAnchors,
});

const pairLocalLifecycleEdges = (
  context: FlowBuildContext,
  transitionCandidates: readonly TransitionCandidate[],
  effectCandidates: readonly EffectCandidate[],
): {
  edgeDrafts: EdgeDraft[];
  pairedTransitionRows: ReadonlySet<string>;
  pairedEffectRows: ReadonlySet<string>;
} => {
  const edgeDrafts: EdgeDraft[] = [];
  const pairedTransitionRows = new Set<string>();
  const pairedEffectRows = new Set<string>();

  for (const effect of effectCandidates) {
    const localConsumers = localConsumersForEffect(effect, transitionCandidates);
    if (localConsumers.length === 0) continue;

    pairedEffectRows.add(effect.row.rowId);
    for (const consumer of localConsumers) {
      pairedTransitionRows.add(consumer.row.rowId);
      edgeDrafts.push({
        sourceNodeId: effect.sourceNodeId,
        targetNodeId: consumer.targetNodeId,
        direction: effect.sourceNodeId === consumer.targetNodeId ? "self" : "normal",
        kind: "self-emitted-transition",
        producerCategory: "self-emitted",
        rows: sortRows(context, [consumer.row, effect.row]),
        producers: [effect.producer],
        sourceAnchors: [...consumer.sourceAnchors, ...effect.sourceAnchors],
        diagnostics: topicDiagnosticIds(context, effect.eventType),
      });
    }
  }

  return { edgeDrafts, pairedTransitionRows, pairedEffectRows };
};

const localConsumersForEffect = (
  effect: EffectCandidate,
  transitionCandidates: readonly TransitionCandidate[],
): TransitionCandidate[] => {
  const sameEvent = transitionCandidates.filter((candidate) => candidate.eventType === effect.eventType);
  if (effect.sourceStateKey === "*") {
    return sameEvent.filter((candidate) => candidate.sourceStateKey === "*");
  }

  const sameSource = sameEvent.filter((candidate) => candidate.sourceStateKey === effect.sourceStateKey);
  return sameSource.length > 0 ? sameSource : sameEvent.filter((candidate) => candidate.sourceStateKey === "*");
};

const buildAcceptedTransitionEdges = (
  context: FlowBuildContext,
  candidates: readonly TransitionCandidate[],
  pairedTransitionRows: ReadonlySet<string>,
): EdgeDraft[] => {
  return candidates.flatMap((candidate) => {
    if (pairedTransitionRows.has(candidate.row.rowId)) return [];

    const classification = classifyEdgeProducer(context, candidate.eventType);
    return [
      {
        sourceNodeId: candidate.sourceNodeId,
        targetNodeId: candidate.targetNodeId,
        direction: candidate.direction,
        kind: classification.kind,
        producerCategory: classification.producerCategory,
        rows: [candidate.row],
        producers: classification.producers,
        sourceAnchors: candidate.sourceAnchors,
        diagnostics: topicDiagnosticIds(context, candidate.eventType),
      },
    ];
  });
};

const classifyEdgeProducer = (
  context: FlowBuildContext,
  eventType: string,
): {
  kind: MachineFlowEdgeKind;
  producerCategory: MachineFlowEdgeGroup["producerCategory"];
  producers: readonly MachineFlowProducerRef[];
} => {
  const producers = context.topicsByEvent.get(eventType)?.producers ?? [];
  if (producers.length === 0) {
    return { kind: "accepted-transition", producerCategory: "external", producers: [] };
  }

  const sameMachine = producers.filter((producer) => producer.machineId === context.machineId);
  const otherMachines = producers.filter((producer) => producer.machineId !== context.machineId);
  const refs = producers.map((producer) => producerRefFromProducer(context, { ...producer, eventType }));

  if (sameMachine.length === 0) {
    return { kind: "from-other-transition", producerCategory: "from-other", producers: refs };
  }

  if (otherMachines.length === 0) {
    return { kind: "accepted-transition", producerCategory: "self-emitted", producers: refs };
  }

  return { kind: "accepted-transition", producerCategory: "external", producers: refs };
};

const buildEmissionOnlyEdges = (
  context: FlowBuildContext,
  effectCandidates: readonly EffectCandidate[],
  pairedEffectRows: ReadonlySet<string>,
): EdgeDraft[] =>
  effectCandidates.flatMap((effect) => {
    if (pairedEffectRows.has(effect.row.rowId)) return [];

    return [
      {
        sourceNodeId: effect.sourceNodeId,
        direction: "normal" as const,
        kind: "emission-only" as const,
        producerCategory: "self-emitted" as const,
        rows: [effect.row],
        producers: [effect.producer],
        sourceAnchors: effect.sourceAnchors,
        diagnostics: topicDiagnosticIds(context, effect.eventType),
      },
    ];
  });

const topicDiagnosticIds = (
  context: FlowBuildContext,
  eventType: string,
): readonly string[] => context.topicsByEvent.get(eventType)?.diagnosticIds ?? [];

const groupEdgeDrafts = (
  context: FlowBuildContext,
  drafts: readonly EdgeDraft[],
): MachineFlowEdgeGroup[] => {
  const groups = new Map<string, EdgeDraft[]>();

  for (const draft of drafts) {
    const groupId = machineFlowEdgeGroupId({
      machineId: context.machineId,
      sourceNodeId: draft.sourceNodeId,
      targetNodeId: draft.targetNodeId,
      kind: draft.kind,
      producerCategory: draft.producerCategory,
      direction: draft.direction,
    });
    groups.set(groupId, [...(groups.get(groupId) ?? []), draft]);
  }

  return [...groups.entries()]
    .map(([groupId, items]) => buildEdgeGroup(context, groupId, items))
    .sort((left, right) => compareText(edgeSortKey(context, left), edgeSortKey(context, right)));
};

const buildEdgeGroup = (
  context: FlowBuildContext,
  groupId: string,
  items: readonly EdgeDraft[],
): MachineFlowEdgeGroup => {
  const first = items[0] as EdgeDraft;

  const rows = sortRows(context, items.flatMap((item) => item.rows));
  const producers = dedupeProducers(items.flatMap((item) => item.producers));
  const labels = displayLabels(rows);

  return {
    groupId,
    sourceNodeId: first.sourceNodeId,
    ...(first.targetNodeId ? { targetNodeId: first.targetNodeId } : {}),
    direction: first.direction,
    kind: first.kind,
    layer: edgeLayer(rows),
    producerCategory: first.producerCategory,
    label: labels[0] as string,
    count: labels.length,
    rows,
    producers,
    sourceAnchors: orderedUnique(items.flatMap((item) => item.sourceAnchors)),
    diagnostics: orderedUnique(items.flatMap((item) => item.diagnostics)),
  };
};

const sortRows = (
  context: FlowBuildContext,
  rows: readonly MachineFlowEdgeRowRef[],
): MachineFlowEdgeRowRef[] =>
  [...rows].sort((left, right) => (context.rowOrder.get(left.rowId) as number) - (context.rowOrder.get(right.rowId) as number));

const dedupeProducers = (
  producers: readonly MachineFlowProducerRef[],
): MachineFlowProducerRef[] => {
  const seen = new Set<string>();
  const result: MachineFlowProducerRef[] = [];
  for (const producer of producers) {
    const key = `${producer.machineId}:${producer.emissionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(producer);
  }

  return result;
};

const displayLabels = (rows: readonly MachineFlowEdgeRowRef[]): string[] =>
  orderedUnique(rows.map((row) => row.eventType));

const edgeLayer = (rows: readonly MachineFlowEdgeRowRef[]): MachineFlowEdgeGroup["layer"] => {
  const layers = orderedUnique(rows.map((row) => row.rowKind));
  if (layers.length === 1 && (layers[0] === "config" || layers[0] === "reducer" || layers[0] === "effect")) return layers[0];

  return "mixed";
};

const applyNodeStats = (
  context: FlowBuildContext,
  edgeGroups: readonly MachineFlowEdgeGroup[],
): void => {
  for (const edge of edgeGroups) {
    const source = context.nodeDrafts.get(edge.sourceNodeId) as NodeDraft;
    source.stats.outgoing += 1;
    if (edge.kind === "emission-only") source.stats.emissions += edge.count;

    const target = edge.targetNodeId ? context.nodeDrafts.get(edge.targetNodeId) : undefined;
    if (target) target.stats.incoming += 1;
    if (edge.direction === "self") source.stats.selfLoops += 1;
  }
};

const buildMachineSummary = (context: FlowBuildContext): MachineFlowMachine => {
  const summary = context.machineSummary;
  const counters = fallbackCounters(context);
  const currentStateKey = currentMachineStateKey(context);
  const badges: MachineFlowBadge[] = [];
  if (context.workbench.groupTag) badges.push({ kind: "group-tag", label: context.workbench.groupTag });
  if (context.workbench.diagnostics.length > 0) badges.push({ kind: "diagnostic", label: String(context.workbench.diagnostics.length) });

  return {
    machineId: context.workbench.machineId,
    title: context.workbench.title,
    kind: context.workbench.kind,
    ...(context.workbench.groupTag ? { groupTag: context.workbench.groupTag } : {}),
    ...(context.workbench.initialState ? { initialState: context.workbench.initialState } : {}),
    ...(currentStateKey ? { currentStateKey } : {}),
    sourceAnchors: context.workbench.sourceAnchors,
    badges,
    counters: {
      states: summary?.counts.states ?? counters.states,
      transitions: summary?.counts.configTransitions ?? counters.transitions,
      reducerBranches: summary?.counts.reducerBranches ?? counters.reducerBranches,
      emissions: summary?.counts.effectEmissions ?? counters.emissions,
      diagnostics: summary?.counts.diagnostics ?? counters.diagnostics,
    },
  };
};

const fallbackCounters = (
  context: FlowBuildContext,
): MachineFlowMachine["counters"] => {
  const rows = allRows(context.workbench);
  return {
    states: context.workbench.states.length,
    transitions: rows.filter((row) => row.kind === "config").length,
    reducerBranches: rows.filter((row) => row.kind === "reducer").length,
    emissions: rows.filter((row) => row.kind === "effect").length,
    diagnostics: context.workbench.diagnostics.length,
  };
};

const currentMachineStateKey = (context: FlowBuildContext): string | undefined => {
  const currentById = context.workbench.currentStateId
    ? context.statesById.get(context.workbench.currentStateId)?.stateKey
    : undefined;
  if (currentById) return currentById;

  return context.workbench.states.find((state) => state.current)?.stateKey;
};

const finalNodes = (context: FlowBuildContext): MachineFlowNode[] =>
  [...context.nodeDrafts.values()]
    .sort((left, right) => compareText(nodeSortKey(left), nodeSortKey(right)))
    .map((draft) => ({
      nodeId: draft.nodeId,
      ref: draft.ref,
      label: draft.label,
      role: nodeRole(draft),
      badges: draft.badges,
      sourceAnchors: draft.sourceAnchors,
      diagnosticIds: draft.diagnosticIds,
      stats: draft.stats,
    }));

const nodeRole = (draft: NodeDraft): MachineFlowNode["role"] => {
  if (draft.facts.current) return "current";
  if (draft.facts.spawn) return "spawn";
  if (draft.facts.terminal) return "terminal";
  if (draft.facts.initial) return "initial";
  if (draft.facts.effectSource) return "effect-source";
  if (draft.facts.wildcard) return "wildcard";
  if (draft.facts.synthetic) return "synthetic";

  return "normal";
};

const nodeLabel = (context: FlowBuildContext, nodeId: string): string =>
  (context.nodeDrafts.get(nodeId) as NodeDraft).label;

const targetLabel = (
  context: FlowBuildContext,
  edge: MachineFlowEdgeGroup,
): string => (edge.targetNodeId ? nodeLabel(context, edge.targetNodeId) : "");

const edgeSortKey = (
  context: FlowBuildContext,
  edge: MachineFlowEdgeGroup,
): string =>
  [
    nodeLabel(context, edge.sourceNodeId),
    targetLabel(context, edge),
    edge.kind,
    edge.producerCategory,
    edge.label,
  ].join("\u0000");

const nodeSortKey = (draft: NodeDraft): string => `${String(draft.order).padStart(8, "0")}\u0000${draft.label}`;

const guardLabel = (guard: GraphCondition): string => guard.text;

const routingLabel = (routing: GraphRouting): string => {
  if (routing.kind === "default") return "default";
  if (routing.kind === "unscoped") return "unscoped";
  if (routing.kind === "unknown") return routing.label ?? "unknown";

  return `${routing.kind}:${routingTargetLabel(routing.target)}`;
};

const routingTargetLabel = (target: GraphRoutingTarget): string => {
  if (target.kind === "literal") return target.value;
  if (target.kind === "selfField") return `self.${target.field}`;
  if (target.kind === "dynamic") return target.label ?? "dynamic";

  return target.items.map(routingTargetLabel).join(",");
};
