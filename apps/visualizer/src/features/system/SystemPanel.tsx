import { Box, ExternalLink, Eye, Search } from "lucide-react";
import type { SystemDetailView, SystemMachineRowView, SystemPanelView, SystemTopicRowView, VisualizerCommand } from "../../workbench";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { PaneScrollArea, Panel, PanelBody, PanelHeader, PanelKicker, StatusBadge } from "@/ui/visualizer";
import { VISUALIZER_TEST_IDS } from "@/test-ids";
import { cn } from "@/lib/utils";

const relationState = (item: { selected: boolean; related: boolean; dimmed: boolean }): "selected" | "related" | "dimmed" | "idle" => {
  if (item.selected) return "selected";
  if (item.related) return "related";
  if (item.dimmed) return "dimmed";

  return "idle";
};

const rowClass = (state: ReturnType<typeof relationState>): string =>
  cn(
    "w-full rounded-md border bg-background p-2 text-left transition-colors hover:bg-[color:var(--vf-row-hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    state === "selected" && "border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)]",
    state === "related" && "border-[color:var(--vf-accent-border)] bg-[color:var(--vf-row-hover)]",
    state === "dimmed" && "opacity-45",
  );

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
    <button
      type="button"
      className={rowClass(state)}
      data-relation-state={state}
      onClick={() => dispatch({ type: "l1.machine.selected", machineId: machine.machineId })}
      onMouseEnter={() => dispatch({ type: "l1.machine.hovered", machineId: machine.machineId })}
      onFocus={() => dispatch({ type: "l1.machine.hovered", machineId: machine.machineId })}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <StatusBadge tone={machineTone(machine.kind)}>{machine.kind}</StatusBadge>
        {machine.groupTag ? <StatusBadge tone="routing">{machine.groupTag}</StatusBadge> : null}
        {machine.counts.diagnostics > 0 ? <StatusBadge tone="diagnostic">diag {machine.counts.diagnostics}</StatusBadge> : null}
      </span>
      <strong className="mt-1 block min-w-0 font-mono text-[11px] text-foreground [overflow-wrap:anywhere]">
        {machine.machineId}
      </strong>
      <span className="mt-1 grid grid-cols-3 gap-1 font-mono text-[10px] text-[color:var(--vf-text-quiet)]">
        <span>states {machine.counts.states}</span>
        <span>in {machine.counts.consumedTopics}</span>
        <span>out {machine.counts.producedTopics}</span>
      </span>
    </button>
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
    <button
      type="button"
      className={rowClass(state)}
      data-relation-state={state}
      onClick={() => dispatch({ type: "l1.topic.selected", eventType: topic.eventType })}
      onMouseEnter={() => dispatch({ type: "l1.topic.hovered", eventType: topic.eventType })}
      onFocus={() => dispatch({ type: "l1.topic.hovered", eventType: topic.eventType })}
    >
      <strong className="block min-w-0 font-mono text-[11px] text-foreground [overflow-wrap:anywhere]">{topic.eventType}</strong>
      <span className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[color:var(--vf-text-quiet)]">
        <span>↑ {topic.producerCount}</span>
        <span>↓ {topic.consumerCount}</span>
        {topic.diagnosticCount > 0 ? <StatusBadge tone="diagnostic">diag {topic.diagnosticCount}</StatusBadge> : null}
      </span>
    </button>
  );
};

const TopicChip = ({
  eventType,
  dispatch,
}: {
  eventType: string;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <button
    type="button"
    className="rounded-full border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground hover:bg-[color:var(--vf-row-hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    onClick={() => dispatch({ type: "l1.topic.selected", eventType })}
  >
    {eventType}
  </button>
);

const MachineDetail = ({
  detail,
  dispatch,
}: {
  detail: Extract<SystemDetailView, { kind: "machine" }>;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <div className="flex flex-col gap-3">
    <div>
      <PanelKicker>Machine</PanelKicker>
      <h3 className="mt-1 min-w-0 font-mono text-sm font-semibold [overflow-wrap:anywhere]">{detail.machine.machineId}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {detail.machine.counts.states} states, {detail.machine.counts.configTransitions} config edges,{" "}
        {detail.machine.counts.effectEmissions} emissions
      </p>
    </div>

    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
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
        data-testid={VISUALIZER_TEST_IDS.system.viewSource}
        onClick={() => dispatch({ type: "source.overlay.opened", ...detail.machine.sourceAction })}
      >
        <Eye data-icon="inline-start" aria-hidden="true" />
        View source
      </Button>
    </div>

    <section className="flex flex-col gap-2">
      <PanelKicker>Consumed topics</PanelKicker>
      <div className="flex flex-wrap gap-1.5">
        {detail.consumedTopics.length === 0 ? (
          <span className="text-sm text-muted-foreground">No consumed topics.</span>
        ) : (
          detail.consumedTopics.map((topic) => <TopicChip key={topic} eventType={topic} dispatch={dispatch} />)
        )}
      </div>
    </section>

    <section className="flex flex-col gap-2">
      <PanelKicker>Produced topics</PanelKicker>
      <div className="flex flex-wrap gap-1.5">
        {detail.producedTopics.length === 0 ? (
          <span className="text-sm text-muted-foreground">No produced topics.</span>
        ) : (
          detail.producedTopics.map((topic) => <TopicChip key={topic} eventType={topic} dispatch={dispatch} />)
        )}
      </div>
    </section>
  </div>
);

const TopicDetail = ({
  detail,
  dispatch,
}: {
  detail: Extract<SystemDetailView, { kind: "topic" }>;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <div className="flex flex-col gap-3">
    <div>
      <PanelKicker>Topic</PanelKicker>
      <h3 className="mt-1 min-w-0 font-mono text-sm font-semibold [overflow-wrap:anywhere]">{detail.topic.eventType}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {detail.topic.producerCount} producers, {detail.topic.consumerCount} consumers
      </p>
    </div>

    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="w-fit"
      data-testid={VISUALIZER_TEST_IDS.system.openInEvents}
      onClick={() => dispatch({ type: "l1.topic.opened-in-event-catalog", eventType: detail.topic.eventType })}
    >
      <ExternalLink data-icon="inline-start" aria-hidden="true" />
      Open in event catalog
    </Button>

    <section className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-md border bg-background p-2">
        <PanelKicker>Producers</PanelKicker>
        <p className="mt-1 min-w-0 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
          {detail.producers.length === 0 ? "No producers" : detail.producers.join(", ")}
        </p>
      </div>
      <div className="rounded-md border bg-background p-2">
        <PanelKicker>Consumers</PanelKicker>
        <p className="mt-1 min-w-0 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
          {detail.consumers.length === 0 ? "No consumers" : detail.consumers.join(", ")}
        </p>
      </div>
    </section>
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
    <div className="flex min-h-40 flex-col justify-center gap-2 text-sm text-muted-foreground">
      <PanelKicker>Details</PanelKicker>
      <h3 className="text-sm font-semibold text-foreground">{detail.title}</h3>
      <p>{detail.body}</p>
    </div>
  );
};

export const SystemPanel = ({
  view,
  dispatch,
}: {
  view: SystemPanelView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <Panel aria-labelledby="system-panel-title" className="h-full" data-testid={VISUALIZER_TEST_IDS.system.panel}>
    <PanelHeader>
      <div className="min-w-0">
        <PanelKicker>System</PanelKicker>
        <h2 id="system-panel-title" className="truncate text-xs font-semibold">
          System inventory
        </h2>
      </div>
      <StatusBadge tone={view.status === "ready" ? "ready" : "muted"}>
        {view.totalMachines} machines · {view.totalTopics} topics
      </StatusBadge>
    </PanelHeader>

    <PanelBody className="grid min-h-0 gap-2.5 p-2.5 lg:grid-cols-[minmax(180px,0.85fr)_minmax(180px,0.85fr)_minmax(220px,1fr)]">
      <section className="flex min-h-0 flex-col gap-2 rounded-md border bg-[color:var(--vf-surface-soft)] p-2">
        <div className="flex items-center gap-2">
          <Search aria-hidden="true" />
          <Input
            aria-label="Search machines"
            value={view.machineQuery}
            placeholder="Search machines"
            data-testid={VISUALIZER_TEST_IDS.system.machineSearch}
            onChange={(event) => dispatch({ type: "l1.machine-query.changed", query: event.currentTarget.value })}
          />
        </div>
        <PaneScrollArea onMouseLeave={() => dispatch({ type: "l1.hover.cleared" })}>
          <div className="flex flex-col gap-2" data-testid={VISUALIZER_TEST_IDS.system.machineList}>
            {view.machines.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No machines match this search.</p>
            ) : (
              view.machines.map((machine) => <MachineRow key={machine.machineId} machine={machine} dispatch={dispatch} />)
            )}
          </div>
        </PaneScrollArea>
      </section>

      <section className="flex min-h-0 flex-col gap-2 rounded-md border bg-[color:var(--vf-surface-soft)] p-2">
        <div className="flex items-center gap-2">
          <Search aria-hidden="true" />
          <Input
            aria-label="Search topics"
            value={view.topicQuery}
            placeholder="Search topics"
            data-testid={VISUALIZER_TEST_IDS.system.topicSearch}
            onChange={(event) => dispatch({ type: "l1.topic-query.changed", query: event.currentTarget.value })}
          />
        </div>
        <PaneScrollArea onMouseLeave={() => dispatch({ type: "l1.hover.cleared" })}>
          <div className="flex flex-col gap-2" data-testid={VISUALIZER_TEST_IDS.system.topicList}>
            {view.topics.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No topics match this search.</p>
            ) : (
              view.topics.map((topic) => <TopicRow key={topic.eventType} topic={topic} dispatch={dispatch} />)
            )}
          </div>
        </PaneScrollArea>
      </section>

      <section
        className="min-h-0 rounded-md border bg-[color:var(--vf-surface-soft)] p-3"
        data-testid={VISUALIZER_TEST_IDS.system.details}
      >
        <DetailPanel detail={view.detail} dispatch={dispatch} />
      </section>
    </PanelBody>
  </Panel>
);
