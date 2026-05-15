import { Box, Eye, Search } from "lucide-react";
import type {
  EventCatalogDetailView,
  EventCatalogPanelView,
  EventCatalogTopicRowView,
  EventConsumerRowView,
  EventProducerRowView,
  VisualizerCommand,
} from "../../workbench";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import {
  Counter,
  DensityRow,
  type DensityRowRelation,
  LayerBadge,
  PaneScrollArea,
  PanelKicker,
  PanelTitle,
  RoutingPill,
  StatusBadge,
  WorkspaceHeader,
  WorkspacePane,
} from "@/ui/visualizer";
import { VISUALIZER_TEST_IDS } from "@/test-ids";

const topicRelation = (topic: EventCatalogTopicRowView): DensityRowRelation =>
  topic.selected ? "selected" : "idle";

const TopicRow = ({
  topic,
  dispatch,
}: {
  topic: EventCatalogTopicRowView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <DensityRow
    relation={topicRelation(topic)}
    aria-pressed={topic.selected}
    data-testid={VISUALIZER_TEST_IDS.events.topicRow}
    data-event-type={topic.eventType}
    data-producer-count={topic.producerCount}
    data-consumer-count={topic.consumerCount}
    data-diagnostics={topic.diagnosticCount}
    onClick={() => dispatch({ type: "l2.topic.selected", eventType: topic.eventType })}
  >
    <span className="flex min-w-0 items-center gap-1.5">
      <strong
        className="min-w-0 truncate font-mono text-[12px] font-semibold text-foreground"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="event"
        title={topic.eventType}
      >
        {topic.eventType}
      </strong>
      {topic.diagnosticCount > 0 ? <StatusBadge tone="diagnostic">diag {topic.diagnosticCount}</StatusBadge> : null}
    </span>
    <span className="flex shrink-0 items-center gap-1 tabular-nums">
      <Counter tone="out" title={`${topic.producerCount} producers`}>{topic.producerCount}↑</Counter>
      <Counter tone="in" title={`${topic.consumerCount} consumers`}>{topic.consumerCount}↓</Counter>
    </span>
  </DensityRow>
);

const SourceLink = ({
  action,
  dispatch,
}: {
  action: EventProducerRowView["sourceAction"];
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <button
    type="button"
    className="ml-1 inline-flex items-center gap-1 rounded-sm border border-transparent px-1 py-0.5 font-mono text-[10px] text-(--vf-text-quiet) transition-colors duration-(--vf-duration-fast) hover:border-(--vf-accent-border) hover:bg-(--vf-accent-soft) hover:text-(--vf-accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50"
    title="View source"
    data-testid={VISUALIZER_TEST_IDS.events.viewSource}
    onClick={() => dispatch({ type: "source.overlay.opened", ...action })}
  >
    <Eye aria-hidden="true" className="size-3" />
    source
  </button>
);

const ProducerRow = ({
  producer,
  dispatch,
}: {
  producer: EventProducerRowView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <li
    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md border bg-(--vf-surface-soft) px-2.5 py-1.5"
    data-testid={VISUALIZER_TEST_IDS.events.producerRow}
    data-row-id={producer.rowId}
    data-machine-id={producer.machineId}
    data-source-state={producer.sourceStateKey}
    data-routing-label={producer.routingLabel}
    data-confidence={producer.confidence}
  >
    <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px]">
      <LayerBadge layer="effect" />
      <strong
        className="min-w-0 truncate text-foreground"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="machine"
      >
        {producer.machineId}
      </strong>
      <SourceLink action={producer.sourceAction} dispatch={dispatch} />
    </span>
    <span className="shrink-0">
      <StatusBadge tone={producer.confidence === "exact" ? "ready" : "diagnostic"}>{producer.confidence}</StatusBadge>
    </span>
    <span className="col-span-2 min-w-0 font-mono text-[10px] text-(--vf-text-muted)">
      on entering <span className="text-(--vf-accent)">{producer.sourceStateKey}</span>
      <span className="mx-1 text-(--vf-text-quiet)">may emit via</span>
      <RoutingPill className="ml-0.5">{producer.routingLabel}</RoutingPill>
      {producer.guardLabel ? (
        <span className="ml-1 italic text-(--vf-warning)" data-testid={VISUALIZER_TEST_IDS.workbench.longLabel} data-label-kind="guard">
          · {producer.guardLabel}
        </span>
      ) : null}
    </span>
  </li>
);

const consumerLayerForBranch = (branch: EventConsumerRowView["branches"][number]): "config" | "reducer" =>
  branch.layer === "config" ? "config" : "reducer";

const targetClass = (target: string): string => {
  if (target === "self") return "text-(--vf-reducer)";
  if (target.startsWith("__")) return "text-(--vf-accent)";

  return "text-(--vf-accent)";
};

const ConsumerRow = ({
  consumer,
  dispatch,
}: {
  consumer: EventConsumerRowView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <li
    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md border bg-(--vf-surface-soft) px-2.5 py-1.5"
    data-testid={VISUALIZER_TEST_IDS.events.consumerRow}
    data-row-id={consumer.rowId}
    data-machine-id={consumer.machineId}
    data-source-state={consumer.sourceStateKey}
    data-target-summary={consumer.targetSummary}
    data-branch-count={consumer.branchCount}
    data-confidence={consumer.confidence}
  >
    <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px]">
      <LayerBadge layer="config" />
      <strong
        className="min-w-0 truncate text-foreground"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="machine"
      >
        {consumer.machineId}
      </strong>
      <SourceLink action={consumer.sourceAction} dispatch={dispatch} />
    </span>
    <span className="flex shrink-0 items-center gap-1">
      <StatusBadge tone={consumer.confidence === "exact" ? "ready" : "diagnostic"}>{consumer.confidence}</StatusBadge>
      {consumer.branchCount > 1 ? <StatusBadge tone="muted">branches {consumer.branchCount}</StatusBadge> : null}
    </span>
    <ol className="col-span-2 flex flex-col gap-0.5 font-mono text-[10px] text-(--vf-text-muted)">
      {consumer.branches.map((branch) => (
        <li
          key={branch.rowId}
          className="flex min-w-0 flex-wrap items-center gap-1.5"
          data-testid={VISUALIZER_TEST_IDS.events.consumerBranch}
          data-row-id={branch.rowId}
          data-layer={branch.layer}
          data-target-label={branch.targetLabel}
          data-confidence={branch.confidence}
        >
          <LayerBadge layer={consumerLayerForBranch(branch)} />
          <span className="text-(--vf-accent)">{consumer.sourceStateKey}</span>
          <span className="text-(--vf-text-quiet)">→</span>
          <span
            className={targetClass(branch.targetLabel)}
            data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
            data-label-kind="target"
          >
            {branch.targetLabel}
          </span>
          {branch.guardLabel ? (
            <span
              className="italic text-(--vf-warning)"
              data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
              data-label-kind="guard"
            >
              · {branch.guardLabel}
            </span>
          ) : null}
          <span className="ml-auto text-(--vf-text-quiet)">{branch.confidence}</span>
        </li>
      ))}
    </ol>
    {consumer.guardLabels.length > 0 ? (
      <span
        className="col-span-2 font-mono text-[10px] text-(--vf-text-quiet)"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="guard"
      >
        guards: {consumer.guardLabels.join(", ")}
      </span>
    ) : null}
  </li>
);

const TopicDetail = ({
  detail,
  dispatch,
}: {
  detail: Extract<EventCatalogDetailView, { kind: "topic" }>;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <div
    className="flex min-h-0 min-w-0 flex-col gap-3 p-3"
    data-testid={VISUALIZER_TEST_IDS.events.detailTopic}
    data-detail-kind="topic"
    data-event-type={detail.eventType}
  >
    <div className="flex min-w-0 flex-col gap-2">
      <PanelKicker>event topic</PanelKicker>
      <h3
        className="min-w-0 font-mono text-[16px] font-semibold text-foreground wrap-anywhere"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="event"
      >
        {detail.eventType}
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge
          tone="muted"
          className="border-(--vf-effect-border) bg-(--vf-effect-soft) text-(--vf-effect) tabular-nums"
        >
          {detail.producerCount}↑ producers
        </StatusBadge>
        <StatusBadge
          tone="muted"
          className="border-(--vf-config-border) bg-(--vf-config-soft) text-(--vf-config) tabular-nums"
        >
          {detail.consumerCount}↓ consumers
        </StatusBadge>
        <StatusBadge tone="muted" className="tabular-nums">{detail.relatedMachineIds.length} machines</StatusBadge>
        {detail.routingKinds.map((kind) => (
          <StatusBadge key={kind} tone="routing">
            {kind}
          </StatusBadge>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-(--vf-border) bg-(--vf-surface-soft) hover:border-(--vf-accent-border) hover:bg-(--vf-accent-soft) hover:text-(--vf-accent)"
          disabled={detail.relatedMachineIds.length === 0}
          data-testid={VISUALIZER_TEST_IDS.events.openInWorkbench}
          data-machine-count={detail.relatedMachineIds.length}
          onClick={() => dispatch({ type: "l2.topic.opened-in-workbench", eventType: detail.eventType })}
        >
          <Box data-icon="inline-start" aria-hidden="true" />
          Open related machines
        </Button>
      </div>
    </div>

    <section
      className="rounded-md border border-(--vf-border-soft) bg-(--vf-surface-soft) p-2.5"
      data-testid={VISUALIZER_TEST_IDS.events.routingValues}
      data-empty={detail.routingValues.length === 0}
    >
      <PanelKicker>Routing values</PanelKicker>
      {detail.routingValues.length === 0 ? (
        <p className="mt-1.5 font-mono text-[11px] text-(--vf-text-quiet)" data-empty="true">
          No producer routing values.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1">
          {detail.routingValues.map((value) => (
            <StatusBadge
              key={`${value.kind}:${value.label}:${value.value ?? ""}`}
              tone="routing"
              data-testid={VISUALIZER_TEST_IDS.events.routingValue}
              data-kind={value.kind}
              data-label={value.label}
              data-value={value.value ?? ""}
              data-confidence={value.confidence}
            >
              {value.label} · {value.confidence}
            </StatusBadge>
          ))}
        </div>
      )}
    </section>

    <div className="grid min-h-0 gap-3 lg:grid-cols-2">
      <section className="flex min-w-0 flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-(--vf-text-quiet)">
          <span className="inline-flex items-center gap-1.5">
            <LayerBadge layer="effect" />
            Producers
          </span>
          <span className="font-normal text-(--vf-text-muted) normal-case tracking-normal">
            machines that emit from an effect
          </span>
        </p>
        {detail.producers.length === 0 ? (
          <p
            className="rounded-md border border-(--vf-border-soft) bg-(--vf-surface-soft) p-2.5 font-mono text-[11px] text-(--vf-text-quiet)"
            data-testid={VISUALIZER_TEST_IDS.events.producers}
            data-empty="true"
          >
            No producers for this topic.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5" data-testid={VISUALIZER_TEST_IDS.events.producers} data-empty="false">
            {detail.producers.map((producer) => (
              <ProducerRow key={producer.rowId} producer={producer} dispatch={dispatch} />
            ))}
          </ol>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-(--vf-text-quiet)">
          <span className="inline-flex items-center gap-1.5">
            <LayerBadge layer="config" />
            Consumers
          </span>
          <span className="font-normal text-(--vf-text-muted) normal-case tracking-normal">
            machines that accept from a state
          </span>
        </p>
        {detail.consumers.length === 0 ? (
          <p
            className="rounded-md border border-(--vf-border-soft) bg-(--vf-surface-soft) p-2.5 font-mono text-[11px] text-(--vf-text-quiet)"
            data-testid={VISUALIZER_TEST_IDS.events.consumers}
            data-empty="true"
          >
            No consumers for this topic.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5" data-testid={VISUALIZER_TEST_IDS.events.consumers} data-empty="false">
            {detail.consumers.map((consumer) => (
              <ConsumerRow key={consumer.rowId} consumer={consumer} dispatch={dispatch} />
            ))}
          </ol>
        )}
      </section>
    </div>
  </div>
);

const EmptyDetail = ({ detail }: { detail: Extract<EventCatalogDetailView, { kind: "empty" }> }) => (
  <div
    className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center text-[12px] text-(--vf-text-quiet)"
    data-testid={VISUALIZER_TEST_IDS.events.detailEmpty}
    data-detail-kind="empty"
  >
    <PanelKicker>events</PanelKicker>
    <h3 className="font-mono text-sm font-semibold text-foreground">{detail.title}</h3>
    <p>{detail.body}</p>
  </div>
);

export const EventCatalogPanel = ({
  view,
  dispatch,
}: {
  view: EventCatalogPanelView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <section
    aria-labelledby="event-catalog-title"
    className="flex h-full min-h-0 flex-col gap-3"
    data-testid={VISUALIZER_TEST_IDS.events.panel}
  >
    <WorkspaceHeader eyebrow="Events" title="Event catalog" titleId="event-catalog-title">
      <StatusBadge tone={view.status === "ready" ? "ready" : "muted"} className="ml-auto tabular-nums">
        {view.totalTopics} topics
      </StatusBadge>
    </WorkspaceHeader>

    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,0.85fr)_minmax(360px,2fr)]">
      <WorkspacePane>
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-(--vf-border-soft) bg-(--vf-surface-soft) px-3">
          <PanelTitle eyebrow="L2 · Catalog" title="Events" />
          <div className="relative ml-auto min-w-[130px] max-w-[200px] flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-(--vf-text-quiet)"
            />
            <Input
              aria-label="Search events"
              value={view.query}
              placeholder="filter events"
              data-testid={VISUALIZER_TEST_IDS.events.search}
              onChange={(event) => dispatch({ type: "l2.query.changed", query: event.currentTarget.value })}
              className="h-7 w-full rounded-[5px] border-(--vf-border-soft) bg-(--vf-surface-soft) pl-6 font-mono text-[9px] focus-visible:border-(--vf-accent-border) focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </header>
        <PaneScrollArea>
          <div className="flex flex-col" data-testid={VISUALIZER_TEST_IDS.events.list}>
            {view.topics.length === 0 ? (
              <p
                className="p-4 text-[12px] text-(--vf-text-quiet)"
                data-testid={VISUALIZER_TEST_IDS.events.listEmpty}
              >
                No events match this search.
              </p>
            ) : (
              view.topics.map((topic) => <TopicRow key={topic.eventType} topic={topic} dispatch={dispatch} />)
            )}
          </div>
        </PaneScrollArea>
      </WorkspacePane>

      <WorkspacePane data-detail-kind={view.detail.kind} data-testid={VISUALIZER_TEST_IDS.events.details}>
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-(--vf-border-soft) bg-(--vf-surface-soft) px-3">
          <PanelTitle
            eyebrow="L2 · Topic"
            title={view.detail.kind === "topic" ? view.detail.eventType : "Pick an event"}
            titleClassName="font-mono"
          />
        </header>
        <PaneScrollArea>
          {view.detail.kind === "topic" ? (
            <TopicDetail detail={view.detail} dispatch={dispatch} />
          ) : (
            <EmptyDetail detail={view.detail} />
          )}
        </PaneScrollArea>
      </WorkspacePane>
    </div>
  </section>
);
