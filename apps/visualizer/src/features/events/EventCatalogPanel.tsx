import { Eye, Search } from "lucide-react";
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
import { LayerBadge, PaneScrollArea, Panel, PanelBody, PanelHeader, PanelKicker, StatusBadge } from "@/ui/visualizer";
import { VISUALIZER_TEST_IDS } from "@/test-ids";
import { cn } from "@/lib/utils";

const topicRowClass = (selected: boolean): string =>
  cn(
    "w-full rounded-md border bg-background p-2 text-left transition-colors hover:bg-[color:var(--vf-row-hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    selected && "border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)]",
  );

const TopicRow = ({
  topic,
  dispatch,
}: {
  topic: EventCatalogTopicRowView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <button
    type="button"
    className={topicRowClass(topic.selected)}
    aria-pressed={topic.selected}
    onClick={() => dispatch({ type: "l2.topic.selected", eventType: topic.eventType })}
  >
    <strong className="block min-w-0 font-mono text-[11px] text-foreground [overflow-wrap:anywhere]">{topic.eventType}</strong>
    <span className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[color:var(--vf-text-quiet)]">
      <span>↑ {topic.producerCount}</span>
      <span>↓ {topic.consumerCount}</span>
      {topic.diagnosticCount > 0 ? <StatusBadge tone="diagnostic">diag {topic.diagnosticCount}</StatusBadge> : null}
    </span>
  </button>
);

const SourceButton = ({
  action,
  dispatch,
}: {
  action: EventProducerRowView["sourceAction"];
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <Button
    type="button"
    variant="outline"
    size="sm"
    data-testid={VISUALIZER_TEST_IDS.events.viewSource}
    onClick={() => dispatch({ type: "source.overlay.opened", ...action })}
  >
    <Eye data-icon="inline-start" aria-hidden="true" />
    Source
  </Button>
);

const ProducerRow = ({
  producer,
  dispatch,
}: {
  producer: EventProducerRowView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <li className="rounded-md border bg-background p-2">
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <LayerBadge layer="effect" />
      <strong className="min-w-0 font-mono text-[11px] [overflow-wrap:anywhere]">{producer.machineId}</strong>
      <StatusBadge tone="routing">{producer.routingLabel}</StatusBadge>
      <StatusBadge tone={producer.confidence === "exact" ? "ready" : "diagnostic"}>{producer.confidence}</StatusBadge>
    </div>
    <p className="mt-1 font-mono text-[10px] text-[color:var(--vf-text-quiet)]">from {producer.sourceStateKey}</p>
    {producer.guardLabel ? <p className="mt-1 text-sm text-muted-foreground">{producer.guardLabel}</p> : null}
    <div className="mt-2">
      <SourceButton action={producer.sourceAction} dispatch={dispatch} />
    </div>
  </li>
);

const ConsumerRow = ({
  consumer,
  dispatch,
}: {
  consumer: EventConsumerRowView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <li className="rounded-md border bg-background p-2">
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <LayerBadge layer="config" />
      <strong className="min-w-0 font-mono text-[11px] [overflow-wrap:anywhere]">{consumer.machineId}</strong>
      <StatusBadge tone={consumer.confidence === "exact" ? "ready" : "diagnostic"}>{consumer.confidence}</StatusBadge>
      <StatusBadge tone="muted">branches {consumer.branchCount}</StatusBadge>
    </div>
    <p className="mt-1 font-mono text-[10px] text-[color:var(--vf-text-quiet)]">
      from {consumer.sourceStateKey} to {consumer.targetSummary || "unknown"}
    </p>
    {consumer.guardLabels.length > 0 ? (
      <p className="mt-1 text-sm text-muted-foreground">{consumer.guardLabels.join(", ")}</p>
    ) : null}
    <ol className="mt-2 flex flex-col gap-1.5">
      {consumer.branches.map((branch) => (
        <li key={branch.rowId} className="rounded-md border border-[color:var(--vf-border-soft)] bg-[color:var(--vf-surface-soft)] p-2">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <LayerBadge layer={branch.layer === "config" ? "config" : "reducer"} />
            <span className="min-w-0 font-mono text-[11px] [overflow-wrap:anywhere]">{branch.targetLabel}</span>
            <StatusBadge tone={branch.confidence === "exact" ? "ready" : "diagnostic"}>{branch.confidence}</StatusBadge>
          </span>
          {branch.guardLabel ? <span className="mt-1 block text-sm text-muted-foreground">{branch.guardLabel}</span> : null}
        </li>
      ))}
    </ol>
    <div className="mt-2">
      <SourceButton action={consumer.sourceAction} dispatch={dispatch} />
    </div>
  </li>
);

const TopicDetail = ({
  detail,
  dispatch,
}: {
  detail: Extract<EventCatalogDetailView, { kind: "topic" }>;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <div className="grid min-h-0 gap-3 lg:grid-cols-2">
    <section className="flex min-h-0 flex-col gap-3 lg:col-span-2">
      <div>
        <PanelKicker>Topic</PanelKicker>
        <h3 className="mt-1 min-w-0 font-mono text-sm font-semibold [overflow-wrap:anywhere]">{detail.eventType}</h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge tone="muted">producers {detail.producerCount}</StatusBadge>
        <StatusBadge tone="muted">consumers {detail.consumerCount}</StatusBadge>
        {detail.routingKinds.map((kind) => (
          <StatusBadge key={kind} tone="routing">
            {kind}
          </StatusBadge>
        ))}
      </div>
      <div className="rounded-md border bg-background p-2" data-testid={VISUALIZER_TEST_IDS.events.routingValues}>
        <PanelKicker>Routing values</PanelKicker>
        {detail.routingValues.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No producer routing values.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {detail.routingValues.map((value) => (
              <StatusBadge key={`${value.kind}:${value.label}:${value.value ?? ""}`} tone="routing">
                {value.label} · {value.confidence}
              </StatusBadge>
            ))}
          </div>
        )}
      </div>
    </section>

    <section className="flex min-h-0 flex-col gap-2">
      <PanelKicker>Producers</PanelKicker>
      {detail.producers.length === 0 ? (
        <p className="rounded-md border bg-background p-2 text-sm text-muted-foreground" data-testid={VISUALIZER_TEST_IDS.events.producers}>
          No producers for this topic.
        </p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid={VISUALIZER_TEST_IDS.events.producers}>
          {detail.producers.map((producer) => (
            <ProducerRow key={producer.rowId} producer={producer} dispatch={dispatch} />
          ))}
        </ol>
      )}
    </section>

    <section className="flex min-h-0 flex-col gap-2">
      <PanelKicker>Consumers</PanelKicker>
      {detail.consumers.length === 0 ? (
        <p className="rounded-md border bg-background p-2 text-sm text-muted-foreground" data-testid={VISUALIZER_TEST_IDS.events.consumers}>
          No consumers for this topic.
        </p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid={VISUALIZER_TEST_IDS.events.consumers}>
          {detail.consumers.map((consumer) => (
            <ConsumerRow key={consumer.rowId} consumer={consumer} dispatch={dispatch} />
          ))}
        </ol>
      )}
    </section>
  </div>
);

const EmptyDetail = ({ detail }: { detail: Extract<EventCatalogDetailView, { kind: "empty" }> }) => (
  <div className="flex min-h-48 flex-col justify-center gap-2 text-sm text-muted-foreground">
    <PanelKicker>Events</PanelKicker>
    <h3 className="text-sm font-semibold text-foreground">{detail.title}</h3>
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
  <Panel aria-labelledby="event-catalog-title" className="h-full" data-testid={VISUALIZER_TEST_IDS.events.panel}>
    <PanelHeader>
      <div className="min-w-0">
        <PanelKicker>Events</PanelKicker>
        <h2 id="event-catalog-title" className="truncate text-xs font-semibold">
          Event catalog
        </h2>
      </div>
      <StatusBadge tone={view.status === "ready" ? "ready" : "muted"}>{view.totalTopics} topics</StatusBadge>
    </PanelHeader>

    <PanelBody className="grid min-h-0 gap-2.5 p-2.5 lg:grid-cols-[minmax(220px,0.7fr)_minmax(360px,1.3fr)]">
      <section className="flex min-h-0 flex-col gap-2 rounded-md border bg-[color:var(--vf-surface-soft)] p-2">
        <div className="flex items-center gap-2">
          <Search aria-hidden="true" />
          <Input
            aria-label="Search events"
            value={view.query}
            placeholder="Search events"
            data-testid={VISUALIZER_TEST_IDS.events.search}
            onChange={(event) => dispatch({ type: "l2.query.changed", query: event.currentTarget.value })}
          />
        </div>
        <PaneScrollArea>
          <div className="flex flex-col gap-2" data-testid={VISUALIZER_TEST_IDS.events.list}>
            {view.topics.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No events match this search.</p>
            ) : (
              view.topics.map((topic) => <TopicRow key={topic.eventType} topic={topic} dispatch={dispatch} />)
            )}
          </div>
        </PaneScrollArea>
      </section>

      <section
        className="min-h-0 overflow-auto rounded-md border bg-[color:var(--vf-surface-soft)] p-3"
        data-testid={VISUALIZER_TEST_IDS.events.details}
      >
        {view.detail.kind === "topic" ? <TopicDetail detail={view.detail} dispatch={dispatch} /> : <EmptyDetail detail={view.detail} />}
      </section>
    </PanelBody>
  </Panel>
);
