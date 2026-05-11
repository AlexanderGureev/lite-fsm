import { Box, ExternalLink, Eye, Search } from "lucide-react";
import type { SystemDetailView, SystemMachineRowView, SystemPanelView, SystemTopicRowView, VisualizerCommand } from "../../workbench";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import {
  Chip,
  ChipPill,
  Counter,
  DensityRow,
  type DensityRowRelation,
  PaneScrollArea,
  PanelKicker,
  PanelTitle,
  StatusBadge,
  WorkspaceHeader,
  WorkspacePane,
} from "@/ui/visualizer";
import { VISUALIZER_TEST_IDS } from "@/test-ids";
import { cn } from "@/lib/utils";

const relationState = (item: { selected: boolean; related: boolean; dimmed: boolean }): DensityRowRelation => {
  if (item.selected) return "selected";
  if (item.related) return "related";
  if (item.dimmed) return "dimmed";

  return "idle";
};

const machineTone = (kind: SystemMachineRowView["kind"]): "actor" | "domain" | "muted" => {
  if (kind === "actorTemplate") return "actor";
  if (kind === "domain") return "domain";

  return "muted";
};

const MachineRow = ({
  machine,
  dispatch,
}: {
  machine: SystemMachineRowView;
  dispatch: (command: VisualizerCommand) => void;
}) => {
  const state = relationState(machine);

  return (
    <DensityRow
      relation={state}
      data-testid={VISUALIZER_TEST_IDS.system.machineRow}
      data-machine-id={machine.machineId}
      data-machine-kind={machine.kind}
      data-diagnostics={machine.counts.diagnostics}
      onClick={() => dispatch({ type: "l1.machine.selected", machineId: machine.machineId })}
      onMouseEnter={() => dispatch({ type: "l1.machine.hovered", machineId: machine.machineId })}
      onFocus={() => dispatch({ type: "l1.machine.hovered", machineId: machine.machineId })}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <StatusBadge tone={machineTone(machine.kind)} className="shrink-0">{machine.kind}</StatusBadge>
        {machine.groupTag ? <StatusBadge tone="routing" className="shrink-0">tag:{machine.groupTag}</StatusBadge> : null}
        <strong
          className="min-w-0 truncate font-mono text-[12px] font-medium text-foreground"
          data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
          data-label-kind="machine"
          title={machine.machineId}
        >
          {machine.machineId}
        </strong>
        {machine.counts.diagnostics > 0 ? (
          <StatusBadge tone="diagnostic" className="shrink-0">diag {machine.counts.diagnostics}</StatusBadge>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-1 tabular-nums">
        <Counter title={`${machine.counts.states} states`}>{machine.counts.states}st</Counter>
        <Counter tone="in" title={`${machine.counts.consumedTopics} consumed topics`}>{machine.counts.consumedTopics}↓</Counter>
        <Counter tone="out" title={`${machine.counts.producedTopics} produced topics`}>{machine.counts.producedTopics}↑</Counter>
      </span>
    </DensityRow>
  );
};

const TopicRow = ({
  topic,
  dispatch,
}: {
  topic: SystemTopicRowView;
  dispatch: (command: VisualizerCommand) => void;
}) => {
  const state = relationState(topic);

  return (
    <DensityRow
      relation={state}
      data-testid={VISUALIZER_TEST_IDS.system.topicRow}
      data-event-type={topic.eventType}
      data-producer-count={topic.producerCount}
      data-consumer-count={topic.consumerCount}
      data-diagnostics={topic.diagnosticCount}
      onClick={() => dispatch({ type: "l1.topic.selected", eventType: topic.eventType })}
      onMouseEnter={() => dispatch({ type: "l1.topic.hovered", eventType: topic.eventType })}
      onFocus={() => dispatch({ type: "l1.topic.hovered", eventType: topic.eventType })}
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
        {topic.diagnosticCount > 0 ? <StatusBadge tone="diagnostic" className="shrink-0">diag {topic.diagnosticCount}</StatusBadge> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1 tabular-nums">
        <Counter tone="out" title={`${topic.producerCount} producers`}>{topic.producerCount}↑</Counter>
        <Counter tone="in" title={`${topic.consumerCount} consumers`}>{topic.consumerCount}↓</Counter>
      </span>
    </DensityRow>
  );
};

const TopicChip = ({
  eventType,
  count,
  countTone,
  dispatch,
}: {
  eventType: string;
  count?: number;
  countTone?: "in" | "out";
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <Chip
    data-testid={VISUALIZER_TEST_IDS.system.topicChip}
    data-event-type={eventType}
    onClick={() => dispatch({ type: "l1.topic.selected", eventType })}
  >
    <span data-testid={VISUALIZER_TEST_IDS.workbench.longLabel} data-label-kind="event">
      {eventType}
    </span>
    {typeof count === "number" ? (
      <ChipPill tone={countTone ?? "neutral"}>
        {count}
        {countTone === "in" ? "↑" : countTone === "out" ? "↓" : ""}
      </ChipPill>
    ) : null}
  </Chip>
);

const SectionTitle = ({ children, count }: { children: React.ReactNode; count?: number }) => (
  <p className="mt-3 mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-(--vf-text-quiet)">
    {children}
    {typeof count === "number" ? (
      <span className="rounded-full bg-(--vf-counter-surface) px-1.5 font-normal tracking-normal text-(--vf-text-muted) tabular-nums">
        {count}
      </span>
    ) : null}
  </p>
);

const MachineDetail = ({
  detail,
  dispatch,
}: {
  detail: Extract<SystemDetailView, { kind: "machine" }>;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <div
    className="flex min-w-0 flex-col gap-1"
    data-testid={VISUALIZER_TEST_IDS.system.detailMachine}
    data-detail-kind="machine"
    data-machine-id={detail.machine.machineId}
  >
    <PanelKicker>machine</PanelKicker>
    <h3
      className="min-w-0 font-mono text-[14px] font-semibold text-foreground wrap-anywhere"
      data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
      data-label-kind="machine"
    >
      {detail.machine.machineId}
    </h3>
    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
      <StatusBadge tone={machineTone(detail.machine.kind)}>{detail.machine.kind}</StatusBadge>
      {detail.machine.groupTag ? <StatusBadge tone="routing">tag:{detail.machine.groupTag}</StatusBadge> : null}
      <StatusBadge tone="muted" className="tabular-nums">{detail.machine.counts.states} states</StatusBadge>
    </div>

    <SectionTitle count={detail.consumedTopics.length}>Consumes</SectionTitle>
    <div
      className="flex flex-wrap gap-1"
      data-testid={VISUALIZER_TEST_IDS.system.detailConsumedTopics}
      data-empty={detail.consumedTopics.length === 0}
      data-values={detail.consumedTopics.join("|")}
    >
      {detail.consumedTopics.length === 0 ? (
        <StatusBadge tone="muted">no consumed topics</StatusBadge>
      ) : (
        detail.consumedTopics.map((topic) => <TopicChip key={topic} eventType={topic} dispatch={dispatch} />)
      )}
    </div>

    <SectionTitle count={detail.producedTopics.length}>Emits</SectionTitle>
    <div
      className="flex flex-wrap gap-1"
      data-testid={VISUALIZER_TEST_IDS.system.detailProducedTopics}
      data-empty={detail.producedTopics.length === 0}
      data-values={detail.producedTopics.join("|")}
    >
      {detail.producedTopics.length === 0 ? (
        <StatusBadge tone="muted">no effects</StatusBadge>
      ) : (
        detail.producedTopics.map((topic) => <TopicChip key={topic} eventType={topic} dispatch={dispatch} />)
      )}
    </div>

    <SectionTitle>Open</SectionTitle>
    <div className="flex flex-wrap gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 border-(--vf-border) bg-(--vf-surface-soft) hover:border-(--vf-accent-border) hover:bg-(--vf-accent-soft) hover:text-(--vf-accent)"
        data-testid={VISUALIZER_TEST_IDS.system.openInWorkbench}
        onClick={() => dispatch({ type: "l1.machine.opened-in-workbench", machineId: detail.machine.machineId })}
      >
        <Box data-icon="inline-start" aria-hidden="true" />
        Open in workbench
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 border-(--vf-border) bg-(--vf-surface-soft) hover:border-(--vf-accent-border) hover:bg-(--vf-accent-soft) hover:text-(--vf-accent)"
        data-testid={VISUALIZER_TEST_IDS.system.viewSource}
        onClick={() => dispatch({ type: "source.overlay.opened", ...detail.machine.sourceAction })}
      >
        <Eye data-icon="inline-start" aria-hidden="true" />
        View source
      </Button>
    </div>
  </div>
);

const TopicDetail = ({
  detail,
  dispatch,
}: {
  detail: Extract<SystemDetailView, { kind: "topic" }>;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <div
    className="flex min-w-0 flex-col gap-1"
    data-testid={VISUALIZER_TEST_IDS.system.detailTopic}
    data-detail-kind="topic"
    data-event-type={detail.topic.eventType}
  >
    <PanelKicker>event topic</PanelKicker>
    <h3
      className="min-w-0 font-mono text-[14px] font-semibold text-foreground wrap-anywhere"
      data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
      data-label-kind="event"
    >
      {detail.topic.eventType}
    </h3>
    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
      <StatusBadge
        tone="muted"
        className="border-(--vf-effect-border) bg-(--vf-effect-soft) text-(--vf-effect) tabular-nums"
      >
        {detail.topic.producerCount}↑ producers
      </StatusBadge>
      <StatusBadge
        tone="muted"
        className="border-(--vf-config-border) bg-(--vf-config-soft) text-(--vf-config) tabular-nums"
      >
        {detail.topic.consumerCount}↓ consumers
      </StatusBadge>
    </div>

    <SectionTitle count={detail.producers.length}>Producers (effects)</SectionTitle>
    <div
      className="flex flex-wrap gap-1"
      data-testid={VISUALIZER_TEST_IDS.system.detailProducers}
      data-empty={detail.producers.length === 0}
      data-values={detail.producers.join("|")}
    >
      {detail.producers.length === 0 ? (
        <StatusBadge tone="muted">external only</StatusBadge>
      ) : (
        detail.producers.map((producer) => (
          <Chip
            key={producer}
            data-testid={VISUALIZER_TEST_IDS.system.topicChip}
            data-event-type={producer}
            onClick={() => dispatch({ type: "l1.machine.selected", machineId: producer })}
          >
            <span data-testid={VISUALIZER_TEST_IDS.workbench.longLabel} data-label-kind="machine">
              {producer}
            </span>
          </Chip>
        ))
      )}
    </div>

    <SectionTitle count={detail.consumers.length}>Consumers (config)</SectionTitle>
    <div
      className="flex flex-wrap gap-1"
      data-testid={VISUALIZER_TEST_IDS.system.detailConsumers}
      data-empty={detail.consumers.length === 0}
      data-values={detail.consumers.join("|")}
    >
      {detail.consumers.length === 0 ? (
        <StatusBadge tone="muted">no consumers</StatusBadge>
      ) : (
        detail.consumers.map((consumer) => (
          <Chip
            key={consumer}
            data-testid={VISUALIZER_TEST_IDS.system.topicChip}
            data-event-type={consumer}
            onClick={() => dispatch({ type: "l1.machine.selected", machineId: consumer })}
          >
            <span data-testid={VISUALIZER_TEST_IDS.workbench.longLabel} data-label-kind="machine">
              {consumer}
            </span>
          </Chip>
        ))
      )}
    </div>

    <SectionTitle>Open</SectionTitle>
    <div className="flex flex-wrap gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 border-(--vf-border) bg-(--vf-surface-soft) hover:border-(--vf-accent-border) hover:bg-(--vf-accent-soft) hover:text-(--vf-accent)"
        data-testid={VISUALIZER_TEST_IDS.system.openInEvents}
        onClick={() => dispatch({ type: "l1.topic.opened-in-event-catalog", eventType: detail.topic.eventType })}
      >
        <ExternalLink data-icon="inline-start" aria-hidden="true" />
        Open in event catalog
      </Button>
    </div>
  </div>
);

const DetailPanel = ({
  detail,
  dispatch,
}: {
  detail: SystemDetailView;
  dispatch: (command: VisualizerCommand) => void;
}) => {
  if (detail.kind === "machine") return <MachineDetail detail={detail} dispatch={dispatch} />;
  if (detail.kind === "topic") return <TopicDetail detail={detail} dispatch={dispatch} />;

  return (
    <div
      className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-6 text-center text-[12px] text-(--vf-text-quiet)"
      data-testid={VISUALIZER_TEST_IDS.system.detailEmpty}
      data-detail-kind="empty"
    >
      <PanelKicker>detail</PanelKicker>
      <h3 className="font-mono text-[13px] font-semibold text-foreground">{detail.title}</h3>
      <p className="max-w-xs leading-relaxed">{detail.body}</p>
      <p className="text-[11px] text-(--vf-text-quiet)">Relations appear only on selection — no permanent edges.</p>
    </div>
  );
};

const SectionPaneSearch = ({
  placeholder,
  testId,
  value,
  onChange,
}: {
  placeholder: string;
  testId?: string;
  value?: string;
  onChange?: (value: string) => void;
}) => (
  <div className="relative ml-auto min-w-[140px] max-w-[220px] flex-1">
    <Search
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-(--vf-text-quiet)"
    />
    <Input
      aria-label={placeholder}
      value={value ?? ""}
      placeholder={placeholder}
      data-testid={testId}
      onChange={(event) => onChange?.(event.currentTarget.value)}
      className="h-8 w-full rounded-md border-(--vf-border-soft) bg-(--vf-surface-soft) pl-7 font-mono text-[11px] focus-visible:border-(--vf-accent-border) focus-visible:ring-1 focus-visible:ring-ring"
    />
  </div>
);

const SectionPane = ({
  eyebrow,
  title,
  search,
  searchPlaceholder,
  searchTestId,
  searchValue,
  onSearchChange,
  children,
  onMouseLeave,
}: {
  eyebrow: string;
  title: string;
  search: boolean;
  searchPlaceholder?: string;
  searchTestId?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  children: React.ReactNode;
  onMouseLeave?: () => void;
}) => (
  <WorkspacePane>
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-(--vf-border-soft) bg-(--vf-surface-soft) px-3">
      <PanelTitle eyebrow={eyebrow} title={title} />
      {search ? (
        <SectionPaneSearch
          placeholder={searchPlaceholder ?? ""}
          testId={searchTestId}
          value={searchValue}
          onChange={onSearchChange}
        />
      ) : null}
    </header>
    <PaneScrollArea onMouseLeave={onMouseLeave}>{children}</PaneScrollArea>
  </WorkspacePane>
);

export const SystemPanel = ({
  view,
  dispatch,
}: {
  view: SystemPanelView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <section
    aria-labelledby="system-panel-title"
    className="flex h-full min-h-0 flex-col gap-3"
    data-testid={VISUALIZER_TEST_IDS.system.panel}
  >
    <WorkspaceHeader eyebrow="System" title="System inventory" titleId="system-panel-title">
      <StatusBadge tone={view.status === "ready" ? "ready" : "muted"} className="ml-auto tabular-nums">
        {view.totalMachines} machines · {view.totalTopics} topics
      </StatusBadge>
    </WorkspaceHeader>

    <div
      className={cn(
        "grid min-h-0 flex-1 grid-cols-1 gap-3",
        "lg:grid-cols-[minmax(220px,1.1fr)_minmax(220px,1.4fr)_minmax(260px,0.9fr)]",
      )}
    >
      <SectionPane
        eyebrow="L1 · Inventory"
        title="Machines"
        search
        searchPlaceholder="filter machines"
        searchTestId={VISUALIZER_TEST_IDS.system.machineSearch}
        searchValue={view.machineQuery}
        onSearchChange={(query) => dispatch({ type: "l1.machine-query.changed", query })}
        onMouseLeave={() => dispatch({ type: "l1.hover.cleared" })}
      >
        <div className="flex flex-col" data-testid={VISUALIZER_TEST_IDS.system.machineList}>
          {view.machines.length === 0 ? (
            <p
              className="p-4 text-[12px] text-(--vf-text-quiet)"
              data-testid={VISUALIZER_TEST_IDS.system.machineEmpty}
            >
              No machines match this search.
            </p>
          ) : (
            view.machines.map((machine) => (
              <MachineRow key={machine.machineId} machine={machine} dispatch={dispatch} />
            ))
          )}
        </div>
      </SectionPane>

      <SectionPane
        eyebrow="L1 · Bus"
        title="Event topics"
        search
        searchPlaceholder="filter events"
        searchTestId={VISUALIZER_TEST_IDS.system.topicSearch}
        searchValue={view.topicQuery}
        onSearchChange={(query) => dispatch({ type: "l1.topic-query.changed", query })}
        onMouseLeave={() => dispatch({ type: "l1.hover.cleared" })}
      >
        <div className="flex flex-col" data-testid={VISUALIZER_TEST_IDS.system.topicList}>
          {view.topics.length === 0 ? (
            <p
              className="p-4 text-[12px] text-(--vf-text-quiet)"
              data-testid={VISUALIZER_TEST_IDS.system.topicEmpty}
            >
              No topics match this search.
            </p>
          ) : (
            view.topics.map((topic) => (
              <TopicRow key={topic.eventType} topic={topic} dispatch={dispatch} />
            ))
          )}
        </div>
      </SectionPane>

      <WorkspacePane data-detail-kind={view.detail.kind} data-testid={VISUALIZER_TEST_IDS.system.details}>
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-(--vf-border-soft) bg-(--vf-surface-soft) px-3">
          <PanelTitle eyebrow="L1 · Selection" title="Detail" />
        </header>
        <PaneScrollArea>
          <div className="p-3">
            <DetailPanel detail={view.detail} dispatch={dispatch} />
          </div>
        </PaneScrollArea>
      </WorkspacePane>
    </div>
  </section>
);
