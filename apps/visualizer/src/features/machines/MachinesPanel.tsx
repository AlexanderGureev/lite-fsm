import { useMemo, useState } from "react";
import { Box, Eye, RotateCcw, Send, X } from "lucide-react";
import type {
  MachineCardView,
  MachinePickerRowView,
  MachineStateBlockView,
  MachineWorkbenchPanelView,
  MachineWorkbenchRowView,
  SendEventOptionView,
  TimelineStepView,
  VisualizerCommand,
} from "../../workbench";
import { Button } from "@/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { LayerBadge, PaneScrollArea, Panel, PanelBody, PanelHeader, PanelKicker, StatusBadge } from "@/ui/visualizer";
import { VISUALIZER_TEST_IDS } from "@/test-ids";
import { cn } from "@/lib/utils";

const machineTone = (kind: MachinePickerRowView["kind"]): "actor" | "domain" | "muted" => {
  if (kind === "actorTemplate") return "actor";
  if (kind === "domain") return "domain";

  return "muted";
};

const rowTestId = (row: MachineWorkbenchRowView): string => {
  if (row.kind === "config") return VISUALIZER_TEST_IDS.workbench.row.config;
  if (row.kind === "reducer") return VISUALIZER_TEST_IDS.workbench.row.reducer;
  if (row.kind === "effect") return VISUALIZER_TEST_IDS.workbench.row.effect;

  return VISUALIZER_TEST_IDS.workbench.row.simulation;
};

const rowClass = (row: MachineWorkbenchRowView): string =>
  cn(
    "grid min-h-10 w-full grid-cols-[auto_minmax(0,1fr)_minmax(0,0.8fr)_auto] items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    row.action.enabled && "hover:bg-[color:var(--vf-row-hover)]",
    row.simulation?.recentlyFired && "border-[color:var(--vf-warning-border)] bg-[color:var(--vf-warning-soft)]",
    row.simulation?.inspected && "border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)]",
    !row.action.enabled && "cursor-default opacity-80",
  );

const MachinePickerRow = ({
  machine,
  dispatch,
}: {
  machine: MachinePickerRowView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <button
    type="button"
    className={cn(
      "w-full rounded-md border bg-background p-2 text-left transition-colors hover:bg-[color:var(--vf-row-hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      machine.selected && "border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)]",
    )}
    aria-pressed={machine.selected}
    data-testid={VISUALIZER_TEST_IDS.workbench.machinePickerRow}
    data-machine-id={machine.machineId}
    data-selected={machine.selected}
    onClick={() => dispatch({ type: "l3.machine.toggled", machineId: machine.machineId })}
  >
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <StatusBadge tone={machineTone(machine.kind)}>{machine.kind}</StatusBadge>
      {machine.groupTag ? <StatusBadge tone="routing">{machine.groupTag}</StatusBadge> : null}
      {machine.diagnosticCount > 0 ? <StatusBadge tone="diagnostic">diag {machine.diagnosticCount}</StatusBadge> : null}
    </span>
    <strong
      className="mt-1 block min-w-0 font-mono text-[11px] [overflow-wrap:anywhere]"
      data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
      data-label-kind="machine"
    >
      {machine.machineId}
    </strong>
    <span className="mt-1 block font-mono text-[10px] text-[color:var(--vf-text-quiet)]">states {machine.stateCount}</span>
  </button>
);

const RowButton = ({
  row,
  dispatch,
}: {
  row: MachineWorkbenchRowView;
  dispatch: (command: VisualizerCommand) => void;
}) => {
  const activate = () => {
    if (!row.action.enabled || !row.action.target) return;
    if (row.action.target.kind === "transition") {
      dispatch({ type: "l3.transition-row.sent", target: row.action.target });
      return;
    }

    dispatch({ type: "l3.effect-row.followed", target: row.action.target });
  };

  return (
    <button
      type="button"
      className={rowClass(row)}
      disabled={!row.action.enabled}
      data-testid={rowTestId(row)}
      data-row-id={row.rowId}
      data-row-kind={row.kind}
      data-event-type={row.eventType}
      data-dispatch-enabled={row.action.enabled}
      data-recently-fired={Boolean(row.simulation?.recentlyFired)}
      data-inspected={Boolean(row.simulation?.inspected)}
      onClick={activate}
    >
      <LayerBadge layer={row.layer} />
      <span
        className="min-w-0 font-mono text-[11px] [overflow-wrap:anywhere]"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="event"
      >
        {row.eventType}
      </span>
      <span
        className="min-w-0 font-mono text-[11px] text-primary [overflow-wrap:anywhere]"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="target"
      >
        {row.targetLabel}
      </span>
      <span
        className="justify-self-end font-mono text-[10px] text-[color:var(--vf-text-quiet)]"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="guard"
      >
        {row.metaLabel}
      </span>
    </button>
  );
};

const StateBlock = ({
  state,
  dispatch,
}: {
  state: MachineStateBlockView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <section
    className={cn(
      "flex flex-col gap-2 rounded-md border bg-[color:var(--vf-surface-soft)] p-2",
      state.current && "border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)]",
    )}
    data-testid={VISUALIZER_TEST_IDS.workbench.stateBlock}
    data-state-id={state.stateId}
    data-current={state.current}
  >
    <div className="flex min-w-0 items-center gap-2">
      <strong
        className="min-w-0 font-mono text-[11px] [overflow-wrap:anywhere]"
        data-testid={state.current ? VISUALIZER_TEST_IDS.workbench.currentState : undefined}
      >
        <span data-testid={VISUALIZER_TEST_IDS.workbench.longLabel} data-label-kind="state">
          {state.stateKey}
        </span>
      </strong>
      <div className="flex min-w-0 flex-wrap gap-1">
        {state.badges.map((badge) => (
          <StatusBadge key={`${badge.kind}:${badge.label}`} tone={badge.kind === "diagnostic" ? "diagnostic" : "muted"}>
            {badge.label}
          </StatusBadge>
        ))}
      </div>
    </div>
    {state.collapsed ? (
      <p className="text-sm text-muted-foreground">Collapsed non-current state.</p>
    ) : state.rows.length === 0 ? (
      <p className="rounded-md border bg-background p-2 text-sm text-muted-foreground">No rows in this state.</p>
    ) : (
      <div className="flex flex-col gap-1.5">
        {state.rows.map((row) => (
          <RowButton key={row.rowId} row={row} dispatch={dispatch} />
        ))}
      </div>
    )}
  </section>
);

const MachineCard = ({
  card,
  dispatch,
}: {
  card: MachineCardView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <article
    className="flex min-h-0 flex-col gap-3 rounded-lg border bg-card p-3"
    data-testid={VISUALIZER_TEST_IDS.workbench.machineCard}
    data-machine-id={card.machineId}
    data-machine-kind={card.kind}
  >
    <header className="flex min-w-0 flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <PanelKicker>{card.kind}</PanelKicker>
        <h3
          className="mt-1 min-w-0 font-mono text-sm font-semibold [overflow-wrap:anywhere]"
          data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
          data-label-kind="machine"
        >
          {card.machineId}
        </h3>
      </div>
      <StatusBadge tone="ready">state {card.currentStateKey ?? "unknown"}</StatusBadge>
      {card.groupTag ? <StatusBadge tone="routing">{card.groupTag}</StatusBadge> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid={VISUALIZER_TEST_IDS.workbench.sourceAction}
        disabled={!card.sourceAction.available}
        onClick={() => dispatch({ type: "source.overlay.opened", ...card.sourceAction })}
      >
        <Eye data-icon="inline-start" aria-hidden="true" />
        Source
      </Button>
    </header>

    {card.actorApproximation ? (
      <p
        className="rounded-md border border-[color:var(--vf-routing-border)] bg-[color:var(--vf-routing-soft)] p-2 text-sm text-muted-foreground"
        data-testid={VISUALIZER_TEST_IDS.workbench.notice}
      >
        Actor template is simulated as a template approximation.
      </p>
    ) : null}

    {card.globalRows.length > 0 ? (
      <section className="flex flex-col gap-1.5">
        <PanelKicker>global behavior</PanelKicker>
        {card.globalRows.map((row) => (
          <RowButton key={row.rowId} row={row} dispatch={dispatch} />
        ))}
      </section>
    ) : null}

    <div className="flex flex-col gap-2">
      {card.states.map((state) => (
        <StateBlock key={state.stateId} state={state} dispatch={dispatch} />
      ))}
    </div>
  </article>
);

const groupedOptions = (
  options: readonly SendEventOptionView[],
  group: SendEventOptionView["group"],
): readonly SendEventOptionView[] => options.filter((option) => option.group === group);

const SendEventControl = ({
  options,
  disabled,
  dispatch,
}: {
  options: readonly SendEventOptionView[];
  disabled: boolean;
  dispatch: (command: VisualizerCommand) => void;
}) => {
  const firstAvailableEventType = options.find((option) => option.group === "available")?.eventType;
  const firstEventType = firstAvailableEventType ?? options[0]?.eventType ?? "";
  const [requestedEventType, setRequestedEventType] = useState(firstEventType);
  const requestedOption = options.find((option) => option.eventType === requestedEventType);
  const eventType = !requestedOption || (requestedOption.group !== "available" && firstAvailableEventType)
    ? firstEventType
    : requestedEventType;
  const selectedOption = options.find((option) => option.eventType === eventType);
  const selectedGroup = selectedOption?.group;

  const available = groupedOptions(options, "available");
  const notAccepted = groupedOptions(options, "not-accepted");
  const canSend = !disabled && selectedGroup === "available";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={eventType} onValueChange={setRequestedEventType} disabled={disabled || options.length === 0}>
        <SelectTrigger
          size="sm"
          className="min-w-44 max-w-full"
          aria-label="Select event type"
          data-testid={VISUALIZER_TEST_IDS.workbench.eventSelect}
        >
          <SelectValue placeholder="Select event" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>available now</SelectLabel>
            {available.map((option) => (
              <SelectItem key={option.eventType} value={option.eventType}>
                {option.eventType}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>not accepted</SelectLabel>
            {notAccepted.map((option) => (
              <SelectItem key={option.eventType} value={option.eventType}>
                {option.eventType}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!canSend}
        data-testid={VISUALIZER_TEST_IDS.workbench.eventSend}
        onClick={() => dispatch({ type: "l3.event.sent", event: { type: eventType } })}
      >
        <Send data-icon="inline-start" aria-hidden="true" />
        Send
      </Button>
    </div>
  );
};

const TimelineStep = ({
  step,
  dispatch,
}: {
  step: TimelineStepView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <button
    type="button"
    className={cn(
      "w-full rounded-md border bg-background p-2 text-left transition-colors hover:bg-[color:var(--vf-row-hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      step.selected && "border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)]",
    )}
    data-testid={VISUALIZER_TEST_IDS.workbench.timelineStep}
    data-step-id={step.stepId}
    data-event-type={step.eventType}
    data-source={step.sourceLabel}
    data-empty={step.empty}
    data-selected={step.selected}
    onClick={() => dispatch({ type: "l3.timeline.step.selected", stepId: step.stepId })}
  >
    <span className="flex min-w-0 items-center gap-2">
      <StatusBadge tone={step.empty ? "diagnostic" : "muted"}>#{step.index}</StatusBadge>
      <strong
        className="min-w-0 font-mono text-[11px] [overflow-wrap:anywhere]"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="timeline-event"
      >
        {step.eventType}
      </strong>
    </span>
    <span className="mt-1 block font-mono text-[10px] text-[color:var(--vf-text-quiet)]">
      {step.sourceLabel} · accepted {step.acceptedMachines.length} · refs {step.rowRefCount}
    </span>
  </button>
);

const WorkbenchTimeline = ({
  view,
  dispatch,
}: {
  view: MachineWorkbenchPanelView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <aside className="flex min-h-0 flex-col gap-2 rounded-md border bg-[color:var(--vf-surface-soft)] p-2">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <PanelKicker>simulation</PanelKicker>
        <p className="font-mono text-[11px] text-muted-foreground">status {view.simulationStatus}</p>
      </div>
      <StatusBadge tone={view.simulationStatus === "blocked" ? "diagnostic" : view.simulationStatus === "running" ? "ready" : "muted"}>
        {view.simulationStatus}
      </StatusBadge>
    </div>

    <SendEventControl options={view.sendOptions} disabled={view.selectedMachineIds.length === 0} dispatch={dispatch} />

    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={view.timeline.length === 0}
      data-testid={VISUALIZER_TEST_IDS.workbench.simulationReset}
      onClick={() => dispatch({ type: "l3.simulation.reset" })}
    >
      <RotateCcw data-icon="inline-start" aria-hidden="true" />
      Reset
    </Button>

    <PaneScrollArea>
      <div className="flex flex-col gap-2" data-testid={VISUALIZER_TEST_IDS.workbench.timeline} data-empty={view.timeline.length === 0}>
        {view.timeline.length === 0 ? (
          <p className="rounded-md border bg-background p-2 text-sm text-muted-foreground">Select machines to start a manual session.</p>
        ) : (
          view.timeline.map((step) => <TimelineStep key={step.stepId} step={step} dispatch={dispatch} />)
        )}
      </div>
    </PaneScrollArea>
  </aside>
);

export const MachinesPanel = ({
  view,
  dispatch,
}: {
  view: MachineWorkbenchPanelView;
  dispatch: (command: VisualizerCommand) => void;
}) => {
  const selectedLabel = useMemo(
    () => `${view.selectedMachineIds.length}/${view.totalMachines}`,
    [view.selectedMachineIds.length, view.totalMachines],
  );

  return (
    <Panel aria-labelledby="machine-workbench-title" className="h-full" data-testid={VISUALIZER_TEST_IDS.workbench.panel}>
      <PanelHeader>
        <div className="min-w-0">
          <PanelKicker>machines</PanelKicker>
          <h2 id="machine-workbench-title" className="truncate text-xs font-semibold">
            Machine workbench
          </h2>
        </div>
        <StatusBadge tone={view.status === "ready" ? "ready" : "muted"} data-testid={VISUALIZER_TEST_IDS.workbench.status}>
          selected {selectedLabel}
        </StatusBadge>
        {view.diagnosticCount > 0 ? <StatusBadge tone="diagnostic">sim diag {view.diagnosticCount}</StatusBadge> : null}
      </PanelHeader>

      <PanelBody className="grid min-h-0 gap-2.5 p-2.5 xl:grid-cols-[minmax(220px,0.55fr)_minmax(420px,1.45fr)_minmax(260px,0.75fr)]">
        <aside className="flex min-h-0 flex-col gap-2 rounded-md border bg-[color:var(--vf-surface-soft)] p-2">
          <div className="flex min-w-0 items-center gap-2">
            <PanelKicker className="flex-1">select machines</PanelKicker>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={view.selectedMachineIds.length === 0}
              data-testid={VISUALIZER_TEST_IDS.workbench.clearSelection}
              onClick={() => dispatch({ type: "l3.selection.cleared" })}
            >
              <X data-icon="inline-start" aria-hidden="true" />
              Clear
            </Button>
          </div>
          <PaneScrollArea>
            <div className="flex flex-col gap-2" data-testid={VISUALIZER_TEST_IDS.workbench.machinePicker}>
              {view.machineRows.length === 0 ? (
                <p className="rounded-md border bg-background p-2 text-sm text-muted-foreground">Open the visualizer to build machines.</p>
              ) : (
                view.machineRows.map((machine) => (
                  <MachinePickerRow key={machine.machineId} machine={machine} dispatch={dispatch} />
                ))
              )}
            </div>
          </PaneScrollArea>
        </aside>

        <PaneScrollArea className="rounded-md border bg-[color:var(--vf-surface-soft)]">
          <div className="flex min-h-full flex-col gap-3 p-2">
            {view.cards.length === 0 ? (
              <div className="flex min-h-48 flex-col justify-center rounded-md border bg-background p-3 text-sm text-muted-foreground">
                <Box aria-hidden="true" />
                <p className="mt-2">Select a machine to inspect state blocks and simulation rows.</p>
              </div>
            ) : (
              view.cards.map((card) => <MachineCard key={card.machineId} card={card} dispatch={dispatch} />)
            )}
          </div>
        </PaneScrollArea>

        <WorkbenchTimeline view={view} dispatch={dispatch} />
      </PanelBody>
    </Panel>
  );
};
