import type { GraphCondition, GraphRouting, GraphRoutingTarget } from "@lite-fsm/graph";
import type {
  GraphTopicConsumer,
  GraphTopicConsumerBranch,
  GraphTopicProducer,
  GraphTopicSummary,
  GraphVisualizerModel,
} from "@lite-fsm/graph/view-model";
import { createSelector } from "./selectors";
import { matchesQuery, sourceAction, type SourceActionView } from "./selector-utils";

export type RoutingValueView = {
  kind: string;
  label: string;
  value?: string;
  confidence: string;
};

export type EventProducerRowView = {
  rowId: string;
  machineId: string;
  sourceStateKey: string;
  routingLabel: string;
  guardLabel?: string;
  confidence: string;
  sourceAction: SourceActionView;
};

export type EventConsumerBranchView = {
  rowId: string;
  layer: GraphTopicConsumerBranch["layer"];
  targetLabel: string;
  guardLabel?: string;
  confidence: string;
};

export type EventConsumerRowView = {
  rowId: string;
  machineId: string;
  sourceStateKey: string;
  targetSummary: string;
  branchCount: number;
  guardLabels: readonly string[];
  confidence: string;
  branches: readonly EventConsumerBranchView[];
  sourceAction: SourceActionView;
};

export type EventCatalogTopicRowView = {
  eventType: string;
  producerCount: number;
  consumerCount: number;
  diagnosticCount: number;
  selected: boolean;
};

export type EventCatalogDetailView =
  | { kind: "empty"; title: string; body: string }
  | {
      kind: "topic";
      eventType: string;
      producerCount: number;
      consumerCount: number;
      routingKinds: readonly string[];
      routingValues: readonly RoutingValueView[];
      relatedMachineIds: readonly string[];
      producers: readonly EventProducerRowView[];
      consumers: readonly EventConsumerRowView[];
    };

export type EventCatalogPanelView = {
  status: "empty" | "ready";
  query: string;
  totalTopics: number;
  topics: readonly EventCatalogTopicRowView[];
  detail: EventCatalogDetailView;
};

const conditionLabel = (condition: GraphCondition | undefined): string | undefined => {
  if (!condition) return undefined;

  return `${condition.kind}: ${condition.text}`;
};

const routingTargetLabel = (target: GraphRoutingTarget): string => {
  if (target.kind === "literal") return target.value;
  if (target.kind === "selfField") return `self.${target.field}`;
  if (target.kind === "dynamic") return target.label ?? "dynamic";

  return `[${target.items.map(routingTargetLabel).join(", ")}]`;
};

const routingLabel = (routing: GraphRouting): string => {
  if (routing.kind === "default" || routing.kind === "unscoped") return routing.kind;
  if (routing.kind === "unknown") return routing.label ?? "unknown";

  return `${routing.kind}:${routingTargetLabel(routing.target)}`;
};

const producerRow = (producer: GraphTopicProducer): EventProducerRowView => ({
  rowId: producer.emissionId,
  machineId: producer.machineId,
  sourceStateKey: producer.sourceStateKey,
  routingLabel: routingLabel(producer.routing),
  guardLabel: conditionLabel(producer.guard),
  confidence: producer.confidence,
  sourceAction: sourceAction(`${producer.machineId} producer`, producer.sourceAnchors),
});

const consumerBranchRow = (branch: GraphTopicConsumerBranch): EventConsumerBranchView => ({
  rowId: branch.transitionId,
  layer: branch.layer,
  targetLabel: branch.target.label,
  guardLabel: conditionLabel(branch.guard),
  confidence: branch.confidence,
});

const uniqueLabels = (labels: readonly (string | undefined)[]): readonly string[] => [
  ...new Set(labels.filter((label): label is string => Boolean(label))),
];

const consumerRow = (consumer: GraphTopicConsumer): EventConsumerRowView => {
  const branches = consumer.branches.map(consumerBranchRow);

  return {
    rowId: consumer.acceptedTransitionId,
    machineId: consumer.machineId,
    sourceStateKey: consumer.sourceStateKey,
    targetSummary: uniqueLabels(branches.map((branch) => branch.targetLabel)).join(" | "),
    branchCount: branches.length,
    guardLabels: uniqueLabels(branches.map((branch) => branch.guardLabel)),
    confidence: consumer.confidence,
    branches,
    sourceAction: sourceAction(`${consumer.machineId} ${consumer.sourceStateKey}`, consumer.sourceAnchors),
  };
};

const eventTopicMatches = (topic: GraphTopicSummary, query: string): boolean =>
  matchesQuery(query, [
    topic.eventType,
    ...topic.routingKinds,
    ...topic.routingValues.map((value) => value.label),
    ...topic.producers.flatMap((producer) => [
      producer.machineId,
      producer.sourceStateKey,
      routingLabel(producer.routing),
      conditionLabel(producer.guard),
    ]),
    ...topic.consumers.flatMap((consumer) => [
      consumer.machineId,
      consumer.sourceStateKey,
      ...consumer.branches.flatMap((branch) => [branch.target.label, conditionLabel(branch.guard), branch.layer]),
    ]),
  ]);

const eventTopicRow = (topic: GraphTopicSummary, selectedTopic: string | undefined): EventCatalogTopicRowView => ({
  eventType: topic.eventType,
  producerCount: topic.producerCount,
  consumerCount: topic.consumerCount,
  diagnosticCount: topic.diagnosticIds.length,
  selected: topic.eventType === selectedTopic,
});

const eventDetail = (
  model: GraphVisualizerModel,
  topics: readonly GraphTopicSummary[],
  selectedTopic: string | undefined,
): EventCatalogDetailView => {
  const topic = topics.find((candidate) => candidate.eventType === selectedTopic) ?? topics[0] ?? model.topics[0];
  if (!topic) {
    return {
      kind: "empty",
      title: "Event catalog",
      body: "Open the visualizer to inspect producers, consumers and routing.",
    };
  }

  return {
    kind: "topic",
    eventType: topic.eventType,
    producerCount: topic.producerCount,
    consumerCount: topic.consumerCount,
    routingKinds: topic.routingKinds,
    routingValues: topic.routingValues.map((value) => ({
      kind: value.kind,
      label: value.label,
      value: value.value,
      confidence: value.confidence,
    })),
    relatedMachineIds: model.relations.machineIdsByTopicType[topic.eventType]?.related ?? [],
    producers: topic.producers.map(producerRow),
    consumers: topic.consumers.map(consumerRow),
  };
};

const emptyEventSearchDetail = (): EventCatalogDetailView => ({
  kind: "empty",
  title: "No matching events",
  body: "No event topics match the current search.",
});

export const selectEventCatalogPanel = createSelector(
  (snapshot) => ({
    model: snapshot.state.model.model,
    l2: snapshot.state.l2,
  }),
  ({ model, l2 }): EventCatalogPanelView => {
    if (!model) {
      return {
        status: "empty",
        query: l2.query,
        totalTopics: 0,
        topics: [],
        detail: {
          kind: "empty",
          title: "Event catalog",
          body: "Open the visualizer from Source before browsing event topics.",
        },
      };
    }

    const filteredTopics = model.topics.filter((topic) => eventTopicMatches(topic, l2.query));
    const selectedTopic =
      filteredTopics.find((topic) => topic.eventType === l2.selectedTopic)?.eventType ?? filteredTopics[0]?.eventType;
    const detail =
      model.topics.length > 0 && filteredTopics.length === 0
        ? emptyEventSearchDetail()
        : eventDetail(model, filteredTopics, selectedTopic);

    return {
      status: "ready",
      query: l2.query,
      totalTopics: model.topics.length,
      topics: filteredTopics.map((topic) => eventTopicRow(topic, selectedTopic)),
      detail,
    };
  },
);
