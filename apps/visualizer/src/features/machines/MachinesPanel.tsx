import { useMemo, useState } from "react";
import { Box, Code2, RotateCcw, Send } from "lucide-react";
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
import {
  DensityRow,
  type DensityRowRelation,
  LayerBadge,
  PaneScrollArea,
  PanelKicker,
  PulseDot,
  StatusBadge,
} from "@/ui/visualizer";
import { VISUALIZER_TEST_IDS } from "@/test-ids";
import { cn } from "@/lib/utils";

const machineTone = (kind: MachinePickerRowView["kind"]): "actor" | "domain" | "muted" => {
  if (kind === "actorTemplate") return "actor";
  if (kind === "domain") return "domain";

  return "muted";
};

const machineKindLabel = (kind: MachinePickerRowView["kind"]): string => {
  if (kind === "actorTemplate") return "actor";

  return kind;
};

const rowTestId = (row: MachineWorkbenchRowView): string => {
  if (row.kind === "config") return VISUALIZER_TEST_IDS.workbench.row.config;
  if (row.kind === "reducer") return VISUALIZER_TEST_IDS.workbench.row.reducer;
  if (row.kind === "effect") return VISUALIZER_TEST_IDS.workbench.row.effect;

  return VISUALIZER_TEST_IDS.workbench.row.simulation;
};

const targetClass = (target: string): string => {
  if (target === "self") return "text-[color:var(--vf-reducer)]";

  return "text-[color:var(--vf-accent)]";
};

const rowClass = (row: MachineWorkbenchRowView): string =>
  cn(
    "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1 text-left font-mono text-[11px] transition-colors shadow-[inset_2px_0_0_transparent]",
    row.action.enabled && "hover:bg-[color:var(--vf-row-hover)]",
    row.kind === "config" && row.action.enabled &&
      "bg-[color:var(--vf-accent-soft)] text-[color:var(--vf-accent)] shadow-[inset_2px_0_0_var(--vf-accent)] hover:bg-[color:var(--vf-accent-soft)]",
    row.kind === "effect" && row.action.enabled &&
      "bg-[color:var(--vf-effect-soft)] text-[color:var(--vf-effect)] shadow-[inset_2px_0_0_var(--vf-effect)] hover:bg-[color:var(--vf-effect-soft)]",
    row.simulation?.recentlyFired &&
      "vf-row-flash bg-[color:var(--vf-warning-soft)] text-[color:var(--vf-warning)] shadow-[inset_2px_0_0_var(--vf-warning)]",
    row.simulation?.inspected &&
      "bg-[color:var(--vf-accent-soft)] shadow-[inset_2px_0_0_var(--vf-accent)]",
    !row.action.enabled && "cursor-default opacity-80",
  );

const noisyMetaLabels = new Set(["exact", ""]);

const visibleMetaLabel = (row: MachineWorkbenchRowView): string | null => {
  if (noisyMetaLabels.has(row.metaLabel)) return null;

  return row.metaLabel;
};

const informativeStateBadgeKinds = new Set([
  "initial",
  "terminal",
  "spawn",
  "wildcard",
  "diagnostic",
]);

const pickerRelation = (row: MachinePickerRowView): DensityRowRelation =>
  row.selected ? "selected" : "idle";

const MachinePickerRow = ({
  machine,
  dispatch,
}: {
  machine: MachinePickerRowView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <DensityRow
    relation={pickerRelation(machine)}
    aria-pressed={machine.selected}
    data-testid={VISUALIZER_TEST_IDS.workbench.machinePickerRow}
    data-machine-id={machine.machineId}
    data-selected={machine.selected}
    onClick={() => dispatch({ type: "l3.machine.toggled", machineId: machine.machineId })}
    className="grid-cols-[16px_minmax(0,1fr)] items-center gap-2 py-1.5"
  >
    <span
      aria-hidden="true"
      className={cn(
        "grid size-3.5 place-items-center rounded-sm border",
        machine.selected
          ? "border-[color:var(--vf-accent)] bg-[color:var(--vf-accent)] text-[color:var(--vf-bg)]"
          : "border-[color:var(--vf-border)] bg-transparent",
      )}
    >
      {machine.selected ? (
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M2.5 6.5l2.5 2.5L9.5 3.5" />
        </svg>
      ) : null}
    </span>
    <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      <strong
        className="min-w-0 shrink truncate font-mono text-[12px] font-medium text-foreground"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="machine"
        title={machine.machineId}
      >
        {machine.machineId}
      </strong>
      <span className="flex shrink-0 items-center gap-1">
        <StatusBadge tone={machineTone(machine.kind)}>{machineKindLabel(machine.kind)}</StatusBadge>
        {machine.groupTag ? <StatusBadge tone="routing">tag:{machine.groupTag}</StatusBadge> : null}
        {machine.diagnosticCount > 0 ? <StatusBadge tone="diagnostic">diag {machine.diagnosticCount}</StatusBadge> : null}
      </span>
    </span>
  </DensityRow>
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

  const isCfgAvailable = row.kind === "config" && row.action.enabled;
  const isEffAvailable = row.kind === "effect" && row.action.enabled;
  const isFlash = Boolean(row.simulation?.recentlyFired);
  const eventColorClass = isFlash
    ? "text-[color:var(--vf-warning)] font-semibold"
    : isCfgAvailable
      ? "text-[color:var(--vf-accent)]"
      : isEffAvailable
        ? "text-[color:var(--vf-effect)]"
        : "text-foreground";

  const meta = visibleMetaLabel(row);

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
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span
          className={cn("min-w-0 truncate", eventColorClass)}
          data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
          data-label-kind="event"
        >
          {row.eventType}
        </span>
        <span className="shrink-0 text-[color:var(--vf-text-quiet)]">→</span>
        <span
          className={cn("min-w-0 truncate", targetClass(row.targetLabel))}
          data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
          data-label-kind="target"
        >
          {row.targetLabel}
        </span>
      </span>
      <span
        className="shrink-0 justify-self-end text-[10px] text-[color:var(--vf-text-quiet)] italic"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="guard"
        data-empty={meta === null}
      >
        {meta ?? ""}
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
}) => {
  const visibleBadges = state.badges.filter((badge) => informativeStateBadgeKinds.has(badge.kind));

  return (
    <section
      className={cn(
        "border-t border-[color:var(--vf-border-soft)] first:border-t-0",
        state.current && "bg-[color:var(--vf-accent-soft)] shadow-[inset_3px_0_0_var(--vf-accent)]",
      )}
      data-testid={VISUALIZER_TEST_IDS.workbench.stateBlock}
      data-state-id={state.stateId}
      data-current={state.current}
    >
      <header className="flex min-w-0 items-center gap-2 px-3 py-1.5 font-mono text-[11px]">
        {state.current ? <PulseDot /> : null}
        <strong
          className={cn(
            "min-w-0 truncate font-medium",
            state.current ? "font-semibold text-[color:var(--vf-accent)]" : "text-foreground",
          )}
          data-testid={state.current ? VISUALIZER_TEST_IDS.workbench.currentState : undefined}
        >
          <span data-testid={VISUALIZER_TEST_IDS.workbench.longLabel} data-label-kind="state">
            {state.stateKey}
          </span>
        </strong>
        {visibleBadges.length > 0 ? (
          <div className="flex min-w-0 flex-wrap gap-1">
            {visibleBadges.map((badge) => (
              <StatusBadge key={`${badge.kind}:${badge.label}`} tone={badge.kind === "diagnostic" ? "diagnostic" : "muted"}>
                {badge.label}
              </StatusBadge>
            ))}
          </div>
        ) : null}
      </header>
      {state.collapsed ? (
        <p className="px-3 pb-2 font-mono text-[10px] italic text-[color:var(--vf-text-quiet)] opacity-70">— collapsed —</p>
      ) : state.rows.length === 0 ? (
        <p className="px-3 pb-2 font-mono text-[10px] text-[color:var(--vf-text-quiet)]">No transitions.</p>
      ) : (
        <div className="pb-1">
          {state.rows.map((row) => (
            <RowButton key={row.rowId} row={row} dispatch={dispatch} />
          ))}
        </div>
      )}
    </section>
  );
};

const MachineCard = ({
  card,
  dispatch,
}: {
  card: MachineCardView;
  dispatch: (command: VisualizerCommand) => void;
}) => {
  const isTerminal = card.currentStateKey?.startsWith("__") ?? false;
  const isActive = !!card.currentStateKey;

  return (
    <article
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border bg-[color:var(--vf-surface)] transition-shadow",
        isActive && !isTerminal && "border-[color:var(--vf-accent-border)] shadow-[0_0_0_1px_var(--vf-accent-border)]",
        isTerminal && isActive && "border-[color:var(--vf-border)]",
      )}
      data-testid={VISUALIZER_TEST_IDS.workbench.machineCard}
      data-machine-id={card.machineId}
      data-machine-kind={card.kind}
    >
      <header className="flex min-w-0 items-center gap-1.5 border-b border-[color:var(--vf-border-soft)] bg-[color:var(--vf-surface-soft)] px-3 py-2">
        <StatusBadge tone={machineTone(card.kind)} className="shrink-0">
          {machineKindLabel(card.kind)}
        </StatusBadge>
        {card.groupTag ? (
          <StatusBadge tone="routing" className="shrink-0">tag:{card.groupTag}</StatusBadge>
        ) : null}
        <strong
          className="ml-0.5 min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-foreground"
          data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
          data-label-kind="machine"
          title={card.machineId}
        >
          {card.machineId}
        </strong>
        {card.currentStateKey ? (
          <StatusBadge
            tone={isTerminal ? "muted" : "ready"}
            className="shrink-0 font-semibold"
            title={`current state: ${card.currentStateKey}`}
          >
            @ {card.currentStateKey}
          </StatusBadge>
        ) : null}
        <button
          type="button"
          aria-label="View machine source"
          title="View machine source"
          className="inline-flex h-5 w-6 shrink-0 items-center justify-center rounded border border-[color:var(--vf-border)] bg-[color:var(--vf-surface-raised)] text-[color:var(--vf-text-muted)] transition-colors hover:border-[color:var(--vf-accent-border)] hover:bg-[color:var(--vf-accent-soft)] hover:text-[color:var(--vf-accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          data-testid={VISUALIZER_TEST_IDS.workbench.sourceAction}
          disabled={!card.sourceAction.available}
          onClick={() => dispatch({ type: "source.overlay.opened", ...card.sourceAction })}
        >
          <Code2 aria-hidden="true" className="size-3" />
        </button>
      </header>

      {card.actorApproximation ? (
        <p
          className="border-b border-[color:var(--vf-border-soft)] bg-[color:var(--vf-routing-soft)] px-3 py-1.5 font-mono text-[11px] text-[color:var(--vf-routing)]"
          data-testid={VISUALIZER_TEST_IDS.workbench.notice}
        >
          Actor template is simulated as a template approximation.
        </p>
      ) : null}

      {card.globalRows.length > 0 ? (
        <section className="border-b border-[color:var(--vf-border-soft)]">
          <p className="px-3 pt-1.5 pb-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-[color:var(--vf-text-quiet)]">
            global
          </p>
          <div className="pb-1">
            {card.globalRows.map((row) => (
              <RowButton key={row.rowId} row={row} dispatch={dispatch} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-col">
        {card.states.map((state) => (
          <StateBlock key={state.stateId} state={state} dispatch={dispatch} />
        ))}
      </div>
    </article>
  );
};

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
    <div className="flex items-center gap-2">
      <Select value={eventType} onValueChange={setRequestedEventType} disabled={disabled || options.length === 0}>
        <SelectTrigger
          size="sm"
          className="min-w-0 flex-1 font-mono text-[11px]"
          aria-label="Select event type"
          data-testid={VISUALIZER_TEST_IDS.workbench.eventSelect}
        >
          <SelectValue placeholder="Select event" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>available now ({available.length})</SelectLabel>
            {available.map((option) => (
              <SelectItem key={option.eventType} value={option.eventType}>
                {option.eventType}
              </SelectItem>
            ))}
          </SelectGroup>
          {notAccepted.length > 0 ? (
            <SelectGroup>
              <SelectLabel>not accepted</SelectLabel>
              {notAccepted.map((option) => (
                <SelectItem key={option.eventType} value={option.eventType}>
                  {option.eventType}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        className="bg-primary font-semibold text-primary-foreground hover:bg-[color:var(--vf-accent-strong)]"
        disabled={!canSend}
        data-testid={VISUALIZER_TEST_IDS.workbench.eventSend}
        onClick={() => dispatch({ type: "l3.event.sent", event: { type: eventType } })}
      >
        <Send data-icon="inline-start" aria-hidden="true" />
        send
      </Button>
    </div>
  );
};

const sourceLabelClass = (source: string): string => {
  const lower = source.toLowerCase();
  if (lower.includes("manual eff") || lower.includes("effect")) return "text-[color:var(--vf-effect)]";
  if (lower.includes("manual")) return "text-[color:var(--vf-accent)]";
  if (lower.includes("external")) return "text-[color:var(--vf-warning)]";

  return "text-[color:var(--vf-text-quiet)]";
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
      "flex w-full flex-col gap-0.5 border-l-2 border-transparent px-3 py-1.5 text-left transition-colors hover:bg-[color:var(--vf-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      step.selected && "border-[color:var(--vf-accent)] bg-[color:var(--vf-accent-soft)]",
      step.empty && "bg-[color:var(--vf-warning-soft)]",
    )}
    data-testid={VISUALIZER_TEST_IDS.workbench.timelineStep}
    data-step-id={step.stepId}
    data-event-type={step.eventType}
    data-source={step.sourceLabel}
    data-empty={step.empty}
    data-selected={step.selected}
    onClick={() => dispatch({ type: "l3.timeline.step.selected", stepId: step.stepId })}
  >
    <span className="flex min-w-0 items-baseline gap-1.5 font-mono text-[11px]">
      <span className="shrink-0 text-[10px] text-[color:var(--vf-text-quiet)]">#{step.index}</span>
      <strong
        className="min-w-0 truncate font-medium text-foreground"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="timeline-event"
      >
        {step.eventType}
      </strong>
      <span className={cn("min-w-0 truncate text-[10px]", sourceLabelClass(step.sourceLabel))}>{step.sourceLabel}</span>
    </span>
    <span className="ml-[26px] flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[color:var(--vf-text-muted)]">
      <span className="text-[color:var(--vf-text-quiet)]">accepted</span>
      <span className="text-foreground">{step.acceptedMachines.length}</span>
      <span className="text-[color:var(--vf-text-quiet)]">·</span>
      <span className="text-[color:var(--vf-text-quiet)]">refs</span>
      <span className="text-foreground">{step.rowRefCount}</span>
      {step.acceptedMachines.length > 0 ? (
        <>
          <span className="text-[color:var(--vf-text-quiet)]">·</span>
          <span className="min-w-0 truncate text-[color:var(--vf-text-muted)]">{step.acceptedMachines.join(", ")}</span>
        </>
      ) : null}
    </span>
  </button>
);

const SimulationStatusBadge = ({ status }: { status: MachineWorkbenchPanelView["simulationStatus"] }) => {
  if (status === "blocked") return <StatusBadge tone="diagnostic">{status}</StatusBadge>;
  if (status === "running") return <StatusBadge tone="ready">{status}</StatusBadge>;

  return <StatusBadge tone="muted">{status}</StatusBadge>;
};

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-[2px]"
      style={{ background: `var(${color})` }}
    />
    <span>{label}</span>
  </span>
);

const Legend = () => (
  <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[color:var(--vf-border-soft)] bg-[color:var(--vf-surface-soft)] px-3 py-2 font-mono text-[10px] text-[color:var(--vf-text-quiet)]">
    <LegendDot color="--vf-config" label="config" />
    <LegendDot color="--vf-effect" label="effect" />
    <LegendDot color="--vf-reducer" label="reducer" />
    <LegendDot color="--vf-routing" label="routing" />
  </div>
);

const WorkbenchTimeline = ({
  view,
  dispatch,
}: {
  view: MachineWorkbenchPanelView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-[color:var(--vf-surface)]">
    <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-[color:var(--vf-border-soft)] bg-[color:var(--vf-surface-soft)] px-3 py-2">
      <PanelKicker className="shrink-0">L3 · Simulator</PanelKicker>
      <h2 className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">Event timeline</h2>
      <div className="flex shrink-0 items-center gap-1.5">
        <SimulationStatusBadge status={view.simulationStatus} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-5 gap-1 px-2 font-mono text-[10px] border-[color:var(--vf-border)] bg-[color:var(--vf-surface-raised)] text-foreground hover:border-[color:var(--vf-danger-border)] hover:bg-[color:var(--vf-danger-soft)] hover:text-[color:var(--vf-danger)] disabled:opacity-30"
          disabled={view.timeline.length === 0}
          data-testid={VISUALIZER_TEST_IDS.workbench.simulationReset}
          onClick={() => dispatch({ type: "l3.simulation.reset" })}
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          reset
        </Button>
      </div>
    </header>

    <div className="shrink-0 border-b border-[color:var(--vf-border-soft)] bg-[color:var(--vf-surface-soft)] p-2.5">
      <p className="mb-2 text-[11px] text-[color:var(--vf-text-quiet)]">
        Send an external event below or click <span className="font-mono text-[color:var(--vf-accent)]">cfg</span>/
        <span className="font-mono text-[color:var(--vf-effect)]">eff</span> rows on machine cards to step through the system.
      </p>
      <SendEventControl options={view.sendOptions} disabled={view.selectedMachineIds.length === 0} dispatch={dispatch} />
    </div>

    <PaneScrollArea>
      <div
        className="flex flex-col py-1"
        data-testid={VISUALIZER_TEST_IDS.workbench.timeline}
        data-empty={view.timeline.length === 0}
      >
        {view.timeline.length === 0 ? (
          <p className="p-3 text-center text-[11px] text-[color:var(--vf-text-quiet)]">
            No events yet. Send an external event to start.
          </p>
        ) : (
          view.timeline.map((step) => <TimelineStep key={step.stepId} step={step} dispatch={dispatch} />)
        )}
      </div>
    </PaneScrollArea>

    <div className="flex shrink-0 items-center border-t border-[color:var(--vf-border-soft)] bg-[color:var(--vf-surface-soft)] px-3 py-1.5">
      <span className="font-mono text-[10px] text-[color:var(--vf-text-quiet)]">
        {view.timeline.length} {view.timeline.length === 1 ? "step" : "steps"}
      </span>
    </div>
  </section>
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
    <section
      aria-labelledby="machine-workbench-title"
      className="flex h-full min-h-0 flex-col gap-2"
      data-testid={VISUALIZER_TEST_IDS.workbench.panel}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 px-1">
        <PanelKicker>Machines</PanelKicker>
        <h2 id="machine-workbench-title" className="text-[12px] font-semibold text-foreground">
          Machine workbench
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={view.status === "ready" ? "ready" : "muted"} data-testid={VISUALIZER_TEST_IDS.workbench.status}>
            selected {selectedLabel}
          </StatusBadge>
          {view.diagnosticCount > 0 ? <StatusBadge tone="diagnostic">sim diag {view.diagnosticCount}</StatusBadge> : null}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-2.5 lg:grid-cols-[minmax(240px,260px)_minmax(0,1fr)_minmax(280px,360px)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-[color:var(--vf-surface)]">
          <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--vf-border-soft)] bg-[color:var(--vf-surface-soft)] px-3 py-2">
            <div className="min-w-0 flex-1">
              <PanelKicker>L3 · Picker</PanelKicker>
              <h2 className="truncate text-[12px] font-semibold leading-tight text-foreground">Machines</h2>
            </div>
            <button
              type="button"
              className="shrink-0 inline-flex items-center rounded-full border border-[color:var(--vf-border)] bg-[color:var(--vf-counter-surface)] px-2.5 py-0.5 font-mono text-[10px] text-[color:var(--vf-text-quiet)] transition-colors hover:border-[color:var(--vf-accent-border)] hover:text-[color:var(--vf-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[color:var(--vf-border)] disabled:hover:text-[color:var(--vf-text-quiet)]"
              disabled={view.selectedMachineIds.length === 0}
              data-testid={VISUALIZER_TEST_IDS.workbench.clearSelection}
              onClick={() => dispatch({ type: "l3.selection.cleared" })}
            >
              clear
            </button>
          </header>
          <PaneScrollArea>
            <div className="flex flex-col" data-testid={VISUALIZER_TEST_IDS.workbench.machinePicker}>
              {view.machineRows.length === 0 ? (
                <p className="p-3 text-[12px] text-[color:var(--vf-text-quiet)]">
                  Open the visualizer to build machines.
                </p>
              ) : (
                view.machineRows.map((machine) => (
                  <MachinePickerRow key={machine.machineId} machine={machine} dispatch={dispatch} />
                ))
              )}
            </div>
          </PaneScrollArea>
          <Legend />
        </aside>

        <PaneScrollArea className="min-h-0">
          {view.cards.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[color:var(--vf-border)] p-8 text-center">
              <Box aria-hidden="true" className="size-7 text-[color:var(--vf-text-quiet)] opacity-50" />
              <div>
                <p className="font-mono text-[12px] font-medium text-[color:var(--vf-text-muted)]">Select machines to inspect.</p>
                <p className="mt-1 text-[11px] text-[color:var(--vf-text-quiet)]">Pick machines on the left or run a scenario.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] content-start gap-2.5">
              {view.cards.map((card) => <MachineCard key={card.machineId} card={card} dispatch={dispatch} />)}
            </div>
          )}
        </PaneScrollArea>

        <WorkbenchTimeline view={view} dispatch={dispatch} />
      </div>
    </section>
  );
};
