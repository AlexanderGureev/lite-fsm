import { useMemo, useState } from "react";
import { Box, Code2, Network, RotateCcw, Send } from "lucide-react";
import type { MachineCanvasBoardView } from "../../canvas";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import {
  DensityRow,
  type DensityRowRelation,
  LayerBadge,
  PaneScrollArea,
  PanelTitle,
  PrimaryActionButton,
  PulseDot,
  StatusBadge,
  WorkspaceHeader,
  WorkspacePane,
} from "@/ui/visualizer";
import { VISUALIZER_TEST_IDS } from "@/test-ids";
import { cn } from "@/lib/utils";
import { MachineCanvasBoard } from "./MachineCanvasBoard";

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
  if (target === "self") return "text-(--vf-reducer)";

  return "text-(--vf-accent)";
};

const rowClass = (row: MachineWorkbenchRowView): string =>
  cn(
    "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 px-3 py-1 text-left font-mono text-[11px] transition-colors shadow-[inset_2px_0_0_transparent]",
    row.action.enabled && "hover:bg-(--vf-row-hover)",
    row.kind === "config" && row.action.enabled &&
      "bg-(--vf-accent-soft) text-(--vf-accent) shadow-[inset_2px_0_0_var(--vf-accent)] hover:bg-(--vf-accent-soft)",
    row.kind === "effect" && row.action.enabled &&
      "bg-(--vf-effect-soft) text-(--vf-effect) shadow-[inset_2px_0_0_var(--vf-effect)] hover:bg-(--vf-effect-soft)",
    row.simulation?.recentlyFired &&
      "vf-row-flash bg-(--vf-warning-soft) text-(--vf-warning) shadow-[inset_2px_0_0_var(--vf-warning)]",
    row.simulation?.inspected &&
      "bg-(--vf-accent-soft) shadow-[inset_2px_0_0_var(--vf-accent)]",
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
          ? "border-(--vf-accent) bg-(--vf-accent) text-(--vf-bg)"
          : "border-(--vf-border) bg-transparent",
      )}
    >
      {machine.selected ? (
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M2.5 6.5l2.5 2.5L9.5 3.5" />
        </svg>
      ) : null}
    </span>
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <strong
        className="min-w-0 max-w-full truncate font-mono text-[12px] font-medium text-foreground"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="machine"
        title={machine.machineId}
      >
        {machine.machineId}
      </strong>
      <span className="flex max-w-full flex-wrap items-center gap-1">
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
    ? "text-(--vf-warning) font-semibold"
    : isCfgAvailable
      ? "text-(--vf-accent)"
      : isEffAvailable
        ? "text-(--vf-effect)"
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
      <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
        <span
          className={cn("break-all", eventColorClass)}
          data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
          data-label-kind="event"
        >
          {row.eventType}
        </span>
        <span className="shrink-0 text-(--vf-text-quiet)">→</span>
        <span
          className={cn("break-all", targetClass(row.targetLabel))}
          data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
          data-label-kind="target"
        >
          {row.targetLabel}
        </span>
      </span>
      <span
        className="shrink-0 justify-self-end text-[10px] text-(--vf-text-quiet) italic"
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
        "border-t border-(--vf-border-soft) first:border-t-0",
        state.current && "bg-(--vf-accent-soft) shadow-[inset_3px_0_0_var(--vf-accent)]",
      )}
      data-testid={VISUALIZER_TEST_IDS.workbench.stateBlock}
      data-state-id={state.stateId}
      data-current={state.current}
    >
      <header className="flex min-w-0 items-start gap-2 px-3 py-1.5 font-mono text-[11px]">
        {state.current ? <PulseDot className="mt-0.5 shrink-0" /> : null}
        <strong
          className={cn(
            "min-w-0 break-all font-medium",
            state.current ? "font-semibold text-(--vf-accent)" : "text-foreground",
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
        <p className="px-3 pb-2 font-mono text-[10px] italic text-(--vf-text-quiet) opacity-70">Collapsed non-current state.</p>
      ) : state.rows.length === 0 ? (
        <p className="px-3 pb-2 font-mono text-[10px] text-(--vf-text-quiet)">No rows in this state.</p>
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
        "flex min-h-0 flex-col overflow-hidden rounded-lg border bg-(--vf-surface) transition-shadow",
        isActive && !isTerminal && "border-(--vf-accent-border) shadow-[0_0_0_1px_var(--vf-accent-border)]",
        isTerminal && isActive && "border-(--vf-border)",
      )}
      data-testid={VISUALIZER_TEST_IDS.workbench.machineCard}
      data-machine-id={card.machineId}
      data-machine-kind={card.kind}
    >
      <header className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-(--vf-border-soft) bg-(--vf-surface-soft) px-3 py-2">
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
            className="max-w-[160px] shrink-0 font-semibold"
            title={`current state: ${card.currentStateKey}`}
          >
            <span className="min-w-0 truncate">@ {card.currentStateKey}</span>
          </StatusBadge>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="View machine source"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-(--vf-border) bg-(--vf-surface-raised) text-(--vf-text-muted) transition-colors duration-(--vf-duration-fast) hover:border-(--vf-accent-border) hover:bg-(--vf-accent-soft) hover:text-(--vf-accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40"
              data-testid={VISUALIZER_TEST_IDS.workbench.sourceAction}
              disabled={!card.sourceAction.available}
              onClick={() => dispatch({ type: "source.overlay.opened", ...card.sourceAction })}
            >
              <Code2 aria-hidden="true" className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>View source</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Open graph"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-(--vf-border) bg-(--vf-surface-raised) text-(--vf-text-muted) transition-colors duration-(--vf-duration-fast) hover:border-(--vf-accent-border) hover:bg-(--vf-accent-soft) hover:text-(--vf-accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              data-testid={VISUALIZER_TEST_IDS.canvas.openAction}
              onClick={() => dispatch({ type: "canvas.machine-board.opened", machineId: card.machineId })}
            >
              <Network aria-hidden="true" className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Open graph</TooltipContent>
        </Tooltip>
      </header>

      {card.actorApproximation ? (
        <p
          className="border-b border-(--vf-border-soft) bg-(--vf-routing-soft) px-3 py-1.5 font-mono text-[11px] text-(--vf-routing)"
          data-testid={VISUALIZER_TEST_IDS.workbench.notice}
        >
          Actor template is simulated as a template approximation.
        </p>
      ) : null}

      {card.globalRows.length > 0 ? (
        <section className="border-b border-(--vf-border-soft)">
          <p className="px-3 pt-1.5 pb-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-(--vf-text-quiet)">
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
          className="h-8 min-w-0 flex-1 border-(--vf-border) bg-(--vf-surface) font-mono text-[11px]"
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
      <PrimaryActionButton
        type="button"
        disabled={!canSend}
        data-testid={VISUALIZER_TEST_IDS.workbench.eventSend}
        onClick={() => dispatch({ type: "l3.event.sent", event: { type: eventType } })}
      >
        <Send data-icon="inline-start" aria-hidden="true" />
        send
      </PrimaryActionButton>
    </div>
  );
};

const sourceLabelClass = (source: string): string => {
  const lower = source.toLowerCase();
  if (lower.includes("manual eff") || lower.includes("effect")) return "text-(--vf-effect)";
  if (lower.includes("manual")) return "text-(--vf-accent)";
  if (lower.includes("external")) return "text-(--vf-warning)";

  return "text-(--vf-text-quiet)";
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
      "flex w-full flex-col gap-0.5 border-l-2 border-transparent px-3 py-1.5 text-left transition-colors hover:bg-(--vf-row-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      step.selected && "border-(--vf-accent) bg-(--vf-accent-soft)",
      step.empty && "bg-(--vf-warning-soft)",
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
      <span className="shrink-0 text-[10px] text-(--vf-text-quiet)">#{step.index}</span>
      <strong
        className="min-w-0 truncate font-medium text-foreground"
        data-testid={VISUALIZER_TEST_IDS.workbench.longLabel}
        data-label-kind="timeline-event"
      >
        {step.eventType}
      </strong>
      <span className={cn("min-w-0 truncate text-[10px]", sourceLabelClass(step.sourceLabel))}>{step.sourceLabel}</span>
    </span>
    <span className="ml-[26px] flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-(--vf-text-muted)">
      <span className="text-(--vf-text-quiet)">accepted</span>
      <span className="text-foreground">{step.acceptedMachines.length}</span>
      <span className="text-(--vf-text-quiet)">·</span>
      <span className="text-(--vf-text-quiet)">refs</span>
      <span className="text-foreground">{step.rowRefCount}</span>
      {step.acceptedMachines.length > 0 ? (
        <>
          <span className="text-(--vf-text-quiet)">·</span>
          <span className="min-w-0 truncate text-(--vf-text-muted)">{step.acceptedMachines.join(", ")}</span>
        </>
      ) : null}
    </span>
  </button>
);

const SimulationStatusBadge = ({ status }: { status: MachineWorkbenchPanelView["simulationStatus"] }) => {
  const tone = status === "blocked" ? "diagnostic" : status === "running" ? "ready" : "muted";

  return <StatusBadge tone={tone}>status {status}</StatusBadge>;
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
  <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-(--vf-border-soft) bg-(--vf-surface-soft) px-3 py-2 font-mono text-[10px] text-(--vf-text-quiet)">
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
  <WorkspacePane>
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-(--vf-border-soft) bg-(--vf-surface-soft) px-3">
      <PanelTitle eyebrow="L3 · Simulator" title="Event timeline" />
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <SimulationStatusBadge status={view.simulationStatus} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Reset simulation"
              className="h-7 gap-1 px-2 font-mono text-[10px] border-(--vf-border) bg-(--vf-surface-soft) text-(--vf-text-muted) hover:border-(--vf-danger-border) hover:bg-(--vf-danger-soft) hover:text-(--vf-danger) disabled:opacity-30"
              disabled={view.timeline.length === 0}
              data-testid={VISUALIZER_TEST_IDS.workbench.simulationReset}
              onClick={() => dispatch({ type: "l3.simulation.reset" })}
            >
              <RotateCcw aria-hidden="true" className="size-3" />
              reset
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset timeline</TooltipContent>
        </Tooltip>
      </div>
    </header>

    <div className="shrink-0 border-b border-(--vf-border-soft) bg-(--vf-surface-soft) p-3">
      <p className="mb-2 text-[11px] text-(--vf-text-quiet)">
        Send an external event or click <span className="font-mono text-(--vf-accent)">cfg</span>/
        <span className="font-mono text-(--vf-effect)">eff</span> rows on cards to step through the system.
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
          <p className="p-4 text-center text-[11px] text-(--vf-text-quiet)">
            No events yet. Send an external event to start.
          </p>
        ) : (
          view.timeline.map((step) => <TimelineStep key={step.stepId} step={step} dispatch={dispatch} />)
        )}
      </div>
    </PaneScrollArea>

    <div className="flex shrink-0 items-center border-t border-(--vf-border-soft) bg-(--vf-surface-soft) px-3 py-1.5">
      <span className="font-mono text-[10px] text-(--vf-text-quiet) tabular-nums">
        {view.timeline.length} {view.timeline.length === 1 ? "step" : "steps"}
      </span>
    </div>
  </WorkspacePane>
);

export const MachinesPanel = ({
  view,
  canvasBoard,
  dispatch,
}: {
  view: MachineWorkbenchPanelView;
  canvasBoard: MachineCanvasBoardView;
  dispatch: (command: VisualizerCommand) => void;
}) => {
  const selectedLabel = useMemo(
    () => `${view.selectedMachineIds.length}/${view.totalMachines}`,
    [view.selectedMachineIds.length, view.totalMachines],
  );

  return (
    <section
      aria-labelledby="machine-workbench-title"
      className="relative flex h-full min-h-0 flex-col gap-3"
      data-testid={VISUALIZER_TEST_IDS.workbench.panel}
    >
      <WorkspaceHeader eyebrow="Machines" title="Machine workbench" titleId="machine-workbench-title">
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <StatusBadge
            tone={view.status === "ready" ? "ready" : "muted"}
            className="tabular-nums"
            data-testid={VISUALIZER_TEST_IDS.workbench.status}
          >
            selected {selectedLabel}
          </StatusBadge>
          {view.diagnosticCount > 0 ? (
            <StatusBadge tone="diagnostic" className="tabular-nums">sim diag {view.diagnosticCount}</StatusBadge>
          ) : null}
        </div>
      </WorkspaceHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(280px,360px)]">
        <WorkspacePane>
          <header className="flex h-10 shrink-0 items-center gap-2 border-b border-(--vf-border-soft) bg-(--vf-surface-soft) px-3">
            <PanelTitle eyebrow="L3 · Picker" title="Machines" />
            <button
              type="button"
              className="ml-auto shrink-0 inline-flex h-6 items-center rounded-full border border-(--vf-border) bg-(--vf-counter-surface) px-2.5 font-mono text-[10px] text-(--vf-text-muted) transition-colors duration-(--vf-duration-fast) hover:border-(--vf-accent-border) hover:text-(--vf-accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-(--vf-border) disabled:hover:text-(--vf-text-muted)"
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
                <p className="p-4 text-[12px] text-(--vf-text-quiet)">
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
        </WorkspacePane>

        <PaneScrollArea className="min-h-0">
          {view.cards.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-(--vf-radius-lg) border border-dashed border-(--vf-border) p-8 text-center">
              <Box aria-hidden="true" className="size-7 text-(--vf-text-quiet) opacity-50" />
              <div>
                <p className="font-mono text-[12px] font-medium text-(--vf-text-muted)">Select machines to inspect.</p>
                <p className="mt-1 text-[11px] text-(--vf-text-quiet)">Pick machines on the left or run a scenario.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] content-start gap-3">
              {view.cards.map((card) => <MachineCard key={card.machineId} card={card} dispatch={dispatch} />)}
            </div>
          )}
        </PaneScrollArea>

        <WorkbenchTimeline view={view} dispatch={dispatch} />
      </div>
      <MachineCanvasBoard view={canvasBoard} dispatch={dispatch} />
    </section>
  );
};
