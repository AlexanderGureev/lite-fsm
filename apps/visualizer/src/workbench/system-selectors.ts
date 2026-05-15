import type {
  GraphMachineSummary,
  GraphSourceAnchor,
  GraphTopicSummary,
  GraphVisualizerModel,
} from "@lite-fsm/graph/view-model";
import { prioritizeMachineSourceAnchors } from "./source-overlay";
import { createSelector } from "./selectors";
import { matchesQuery, sourceAction, type SourceActionView } from "./selector-utils";
import type { SystemViewState } from "./types";

export type SystemMachineRowView = {
  machineId: string;
  title: string;
  kind: GraphMachineSummary["kind"];
  groupTag?: string;
  initialState?: string;
  counts: GraphMachineSummary["counts"];
  consumedTopicTypes: readonly string[];
  producedTopicTypes: readonly string[];
  diagnosticIds: readonly string[];
  selected: boolean;
  related: boolean;
  dimmed: boolean;
  sourceAction: SourceActionView;
};

export type SystemTopicRowView = {
  eventType: string;
  producerCount: number;
  consumerCount: number;
  diagnosticCount: number;
  diagnosticIds: readonly string[];
  selected: boolean;
  related: boolean;
  dimmed: boolean;
};

export type SystemDetailView =
  | { kind: "empty"; title: string; body: string }
  | {
      kind: "machine";
      machine: SystemMachineRowView;
      consumedTopics: readonly string[];
      producedTopics: readonly string[];
    }
  | {
      kind: "topic";
      topic: SystemTopicRowView;
      producers: readonly string[];
      consumers: readonly string[];
    };

export type SystemPanelView = {
  status: "empty" | "ready";
  machineQuery: string;
  machineScope?: {
    eventType: string;
    machineCount: number;
  };
  topicQuery: string;
  topicScope?: {
    machineId: string;
    topicCount: number;
  };
  totalMachines: number;
  totalTopics: number;
  machines: readonly SystemMachineRowView[];
  topics: readonly SystemTopicRowView[];
  detail: SystemDetailView;
};

type RelationContext = { kind: "machine"; machineId: string } | { kind: "topic"; eventType: string };

const relationContext = (l1: SystemViewState): RelationContext | undefined => {
  if (l1.hoveredMachineId) return { kind: "machine", machineId: l1.hoveredMachineId };
  if (l1.hoveredTopic) return { kind: "topic", eventType: l1.hoveredTopic };
  if (l1.selectedMachineId) return { kind: "machine", machineId: l1.selectedMachineId };
  if (l1.selectedTopic) return { kind: "topic", eventType: l1.selectedTopic };

  return undefined;
};

const topicScopeMachineId = (l1: SystemViewState): string | undefined =>
  l1.selectedMachineId;

const machineScopeEventType = (l1: SystemViewState): string | undefined =>
  l1.selectedTopic;

const relatedMachineIdsForTopic = (
  model: GraphVisualizerModel,
  eventType: string | undefined,
): ReadonlySet<string> | undefined => {
  if (!eventType) return undefined;

  const relations = model.relations.machineIdsByTopicType[eventType];
  return new Set(relations?.related ?? []);
};

const relatedTopicTypesForMachine = (
  model: GraphVisualizerModel,
  machineId: string | undefined,
): ReadonlySet<string> | undefined => {
  if (!machineId) return undefined;

  const relations = model.relations.topicTypesByMachineId[machineId];
  return new Set([...(relations?.consumed ?? []), ...(relations?.produced ?? [])]);
};

const topicMatchesMachineScope = (
  topic: GraphTopicSummary,
  relatedTopicTypes: ReadonlySet<string> | undefined,
): boolean => !relatedTopicTypes || relatedTopicTypes.has(topic.eventType);

const machineMatchesTopicScope = (
  machine: GraphMachineSummary,
  relatedMachineIds: ReadonlySet<string> | undefined,
): boolean => !relatedMachineIds || relatedMachineIds.has(machine.machineId);

const pinSelectedFirst = <Item>(items: readonly Item[], isSelected: (item: Item) => boolean): readonly Item[] => {
  const selectedIndex = items.findIndex(isSelected);
  if (selectedIndex <= 0) return items;

  return [
    items[selectedIndex],
    ...items.slice(0, selectedIndex),
    ...items.slice(selectedIndex + 1),
  ];
};

const machineSourceAnchors = (
  model: GraphVisualizerModel,
  machine: GraphMachineSummary,
): readonly GraphSourceAnchor[] => {
  const workbench = model.workbenchMachines[machine.machineId];
  if (!workbench) return prioritizeMachineSourceAnchors(machine.sourceAnchors);

  const anchors = [
    ...machine.sourceAnchors,
    ...workbench.sourceAnchors,
    ...workbench.states.flatMap((state) => state.sourceAnchors),
    ...workbench.states.flatMap((state) => state.rows.flatMap((row) => row.sourceAnchors)),
    ...workbench.globalBehavior.flatMap((row) => row.sourceAnchors),
  ];

  return prioritizeMachineSourceAnchors(anchors);
};

const machineMatches = (machine: GraphMachineSummary, query: string): boolean =>
  matchesQuery(query, [
    machine.machineId,
    machine.title,
    machine.kind,
    machine.groupTag,
    machine.initialState,
    ...machine.consumedTopicTypes,
    ...machine.producedTopicTypes,
  ]);

const topicMatches = (topic: GraphTopicSummary, query: string): boolean =>
  matchesQuery(query, [
    topic.eventType,
    ...topic.routingKinds,
    ...topic.routingValues.map((value) => value.label),
    ...topic.producers.map((producer) => producer.machineId),
    ...topic.consumers.map((consumer) => consumer.machineId),
  ]);

const isMachineRelated = (
  model: GraphVisualizerModel,
  machineId: string,
  context: RelationContext | undefined,
): boolean => {
  if (!context) return false;
  if (context.kind === "machine") return machineId === context.machineId;

  return model.relations.machineIdsByTopicType[context.eventType]?.related.includes(machineId) ?? false;
};

const isTopicRelated = (
  model: GraphVisualizerModel,
  eventType: string,
  context: RelationContext | undefined,
): boolean => {
  if (!context) return false;
  if (context.kind === "topic") return eventType === context.eventType;

  const relations = model.relations.topicTypesByMachineId[context.machineId];
  return [...(relations?.consumed ?? []), ...(relations?.produced ?? [])].includes(eventType);
};

const systemMachineRow = (
  model: GraphVisualizerModel,
  machine: GraphMachineSummary,
  l1: SystemViewState,
  context: RelationContext | undefined,
): SystemMachineRowView => {
  const related = isMachineRelated(model, machine.machineId, context);

  return {
    machineId: machine.machineId,
    title: machine.title,
    kind: machine.kind,
    groupTag: machine.groupTag,
    initialState: machine.initialState,
    counts: machine.counts,
    consumedTopicTypes: machine.consumedTopicTypes,
    producedTopicTypes: machine.producedTopicTypes,
    diagnosticIds: machine.diagnosticIds,
    selected: machine.machineId === l1.selectedMachineId,
    related,
    dimmed: Boolean(context && !related),
    sourceAction: sourceAction(machine.title, machineSourceAnchors(model, machine)),
  };
};

const systemTopicRow = (
  model: GraphVisualizerModel,
  topic: GraphTopicSummary,
  l1: SystemViewState,
  context: RelationContext | undefined,
): SystemTopicRowView => {
  const related = isTopicRelated(model, topic.eventType, context);

  return {
    eventType: topic.eventType,
    producerCount: topic.producerCount,
    consumerCount: topic.consumerCount,
    diagnosticCount: topic.diagnosticIds.length,
    diagnosticIds: topic.diagnosticIds,
    selected: topic.eventType === l1.selectedTopic,
    related,
    dimmed: Boolean(context && !related),
  };
};

const emptySystemDetail = (): SystemDetailView => ({
  kind: "empty",
  title: "System inventory",
  body: "Select a machine or topic to inspect event-bus relations.",
});

const systemDetail = (
  model: GraphVisualizerModel,
  machineRows: readonly SystemMachineRowView[],
  topicRows: readonly SystemTopicRowView[],
  context: RelationContext | undefined,
): SystemDetailView => {
  if (!context) return emptySystemDetail();

  if (context.kind === "machine") {
    const machine = machineRows.find((candidate) => candidate.machineId === context.machineId);
    if (!machine) return emptySystemDetail();

    return {
      kind: "machine",
      machine,
      consumedTopics: model.relations.topicTypesByMachineId[machine.machineId]?.consumed ?? [],
      producedTopics: model.relations.topicTypesByMachineId[machine.machineId]?.produced ?? [],
    };
  }

  const topic = topicRows.find((candidate) => candidate.eventType === context.eventType);
  if (!topic) return emptySystemDetail();

  return {
    kind: "topic",
    topic,
    producers: model.relations.machineIdsByTopicType[topic.eventType]?.producers ?? [],
    consumers: model.relations.machineIdsByTopicType[topic.eventType]?.consumers ?? [],
  };
};

export const selectSystemPanel = createSelector(
  (snapshot) => ({
    model: snapshot.state.model.model,
    l1: snapshot.state.l1,
  }),
  ({ model, l1 }): SystemPanelView => {
    if (!model) {
      return {
        status: "empty",
        machineQuery: l1.machineQuery,
        machineScope: undefined,
        topicQuery: l1.topicQuery,
        topicScope: undefined,
        totalMachines: 0,
        totalTopics: 0,
        machines: [],
        topics: [],
        detail: emptySystemDetail(),
      };
    }

    const context = relationContext(l1);
    const scopedEventType = machineScopeEventType(l1);
    const scopedMachineIds = relatedMachineIdsForTopic(model, scopedEventType);
    const scopedMachineId = topicScopeMachineId(l1);
    const scopedTopicTypes = relatedTopicTypesForMachine(model, scopedMachineId);
    const machines = model.machines
      .filter((machine) => machineMatchesTopicScope(machine, scopedMachineIds))
      .filter((machine) => machineMatches(machine, l1.machineQuery))
      .map((machine) => systemMachineRow(model, machine, l1, context));
    const topics = model.topics
      .filter((topic) => topicMatchesMachineScope(topic, scopedTopicTypes))
      .filter((topic) => topicMatches(topic, l1.topicQuery))
      .map((topic) => systemTopicRow(model, topic, l1, context));
    const orderedMachines = pinSelectedFirst(machines, (machine) => machine.selected);
    const orderedTopics = pinSelectedFirst(topics, (topic) => topic.selected);

    return {
      status: "ready",
      machineQuery: l1.machineQuery,
      machineScope: scopedEventType && scopedMachineIds
        ? { eventType: scopedEventType, machineCount: scopedMachineIds.size }
        : undefined,
      topicQuery: l1.topicQuery,
      topicScope: scopedMachineId && scopedTopicTypes
        ? { machineId: scopedMachineId, topicCount: scopedTopicTypes.size }
        : undefined,
      totalMachines: model.machines.length,
      totalTopics: model.topics.length,
      machines: orderedMachines,
      topics: orderedTopics,
      detail: systemDetail(model, orderedMachines, orderedTopics, context),
    };
  },
);
