import type { GraphRouting, GraphRoutingTarget, GraphTransition, LiteFsmGraphDocument, LiteFsmGraphMachine } from "../types";
import type { DiagnosticIndex } from "./diagnostics";
import { idsForTopic } from "./diagnostics";
import { sourceStateKey, sourcesEqual } from "./indexes";
import { transitionAnchors, emissionAnchors } from "./source-anchors";
import { compareText, orderedUnique } from "./sort";
import { targetView } from "./targets";
import type {
  GraphRelationIndex,
  GraphTopicConsumer,
  GraphTopicProducer,
  GraphTopicRoutingValue,
  GraphTopicSummary,
} from "./types";

type TopicAccumulator = {
  eventType: string;
  producers: GraphTopicProducer[];
  consumers: GraphTopicConsumer[];
};

const topic = (topics: Map<string, TopicAccumulator>, eventType: string): TopicAccumulator => {
  const existing = topics.get(eventType);
  if (existing) return existing;

  const created: TopicAccumulator = { eventType, producers: [], consumers: [] };
  topics.set(eventType, created);
  return created;
};

const routingTargetValues = (
  routingKind: GraphRouting["kind"],
  target: GraphRoutingTarget,
): GraphTopicRoutingValue[] => {
  if (target.kind === "literal") {
    return [{ kind: routingKind, label: `${routingKind}:${target.value}`, value: target.value, confidence: "exact" }];
  }
  if (target.kind === "selfField") {
    return [{ kind: routingKind, label: `${routingKind}:self.${target.field}`, value: target.field, confidence: "partial" }];
  }
  if (target.kind === "dynamic") {
    return [{ kind: routingKind, label: `${routingKind}:${target.label ?? "dynamic"}`, confidence: "unknown" }];
  }

  return target.items.flatMap((item) => routingTargetValues(routingKind, item));
};

const routingValues = (routing: GraphRouting): GraphTopicRoutingValue[] => {
  if (routing.kind === "default") return [{ kind: "default", label: "default", confidence: "exact" }];
  if (routing.kind === "unscoped") return [{ kind: "unscoped", label: "unscoped", confidence: "exact" }];
  if (routing.kind === "unknown") return [{ kind: "unknown", label: routing.label ?? "unknown", confidence: "unknown" }];

  return routingTargetValues(routing.kind, routing.target);
};

const dedupeRoutingValues = (values: readonly GraphTopicRoutingValue[]): GraphTopicRoutingValue[] => {
  const byKey = new Map<string, GraphTopicRoutingValue>();

  for (const value of values) {
    const key = `${value.kind}:${value.label}:${value.value ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, value);
  }

  return [...byKey.values()].sort((left, right) => {
    const kind = compareText(left.kind, right.kind);
    if (kind !== 0) return kind;

    return compareText(left.label, right.label);
  });
};

const reducerBranchesForAccepted = (
  machine: LiteFsmGraphMachine,
  accepted: GraphTransition,
): GraphTransition[] => {
  return machine.transitions.filter(
    (transition) =>
      transition.layer === "reducer" &&
      transition.event.type === accepted.event.type &&
      sourcesEqual(transition.source, accepted.source),
  );
};

const consumerBranches = (
  machine: LiteFsmGraphMachine,
  accepted: GraphTransition,
): GraphTopicConsumer["branches"] => {
  return [accepted, ...reducerBranchesForAccepted(machine, accepted)].map((transition) => ({
    transitionId: transition.id,
    layer: transition.layer,
    target: targetView(machine, transition.target),
    guard: transition.guard,
    reducerCaseId: transition.reducerCaseId,
    confidence: transition.confidence,
  }));
};

export const buildTopicSummaries = (
  document: LiteFsmGraphDocument,
  diagnostics: DiagnosticIndex,
): GraphTopicSummary[] => {
  const topics = new Map<string, TopicAccumulator>();

  for (const machine of document.machines) {
    for (const transition of machine.transitions) {
      topic(topics, transition.event.type);
      if (transition.layer !== "config") continue;

      topic(topics, transition.event.type).consumers.push({
        machineId: machine.id,
        sourceStateKey: sourceStateKey(machine, transition.source),
        acceptedTransitionId: transition.id,
        branches: consumerBranches(machine, transition),
        confidence: transition.confidence,
        sourceAnchors: transitionAnchors(transition),
      });
    }

    for (const reducerCase of machine.reducerCases) {
      topic(topics, reducerCase.event.type);
    }

    for (const emission of machine.emissions) {
      topic(topics, emission.event.type).producers.push({
        machineId: machine.id,
        emissionId: emission.id,
        sourceStateKey: sourceStateKey(machine, emission.sourceState),
        routing: emission.routing,
        guard: emission.guard,
        confidence: emission.confidence,
        sourceAnchors: emissionAnchors(emission),
      });
    }
  }

  return [...topics.values()]
    .sort((left, right) => compareText(left.eventType, right.eventType))
    .map((item) => {
      const routingKinds = orderedUnique(item.producers.map((producer) => producer.routing.kind)).sort(compareText);
      const values = dedupeRoutingValues(item.producers.flatMap((producer) => routingValues(producer.routing)));

      return {
        eventType: item.eventType,
        producerCount: item.producers.length,
        consumerCount: item.consumers.length,
        routingKinds,
        routingValues: values,
        producers: item.producers,
        consumers: item.consumers,
        diagnosticIds: idsForTopic(diagnostics, item.eventType),
      };
    });
};

export const buildRelationIndex = (
  document: LiteFsmGraphDocument,
  topics: readonly GraphTopicSummary[],
): GraphRelationIndex => {
  const topicTypesByMachineId: GraphRelationIndex["topicTypesByMachineId"] = {};

  for (const machine of document.machines) {
    topicTypesByMachineId[machine.id] = {
      consumed: orderedUnique(
        machine.transitions.filter((transition) => transition.layer === "config").map((transition) => transition.event.type),
      ).sort(compareText),
      produced: orderedUnique(machine.emissions.map((emission) => emission.event.type)).sort(compareText),
    };
  }

  const machineIdsByTopicType: GraphRelationIndex["machineIdsByTopicType"] = {};

  for (const item of topics) {
    const producers = orderedUnique(item.producers.map((producer) => producer.machineId));
    const consumers = orderedUnique(item.consumers.map((consumer) => consumer.machineId));
    machineIdsByTopicType[item.eventType] = {
      producers,
      consumers,
      related: orderedUnique([...producers, ...consumers]),
    };
  }

  return { topicTypesByMachineId, machineIdsByTopicType };
};
