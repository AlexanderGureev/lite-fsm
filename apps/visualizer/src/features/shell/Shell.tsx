import { useRef, type ChangeEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  Braces,
  ChevronDown,
  FileCode,
  FileJson,
  FileSearch,
  Search,
  SlidersHorizontal,
  Play,
  RotateCcw,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import { machineIdForConsoleEntry, type ConsoleEntry, type ConsolePanelView } from "../../console";
import { useWorkbenchContext } from "../../app/workbench-context";
import { useWorkbenchSelector } from "../../app/use-workbench-selector";
import { EventCatalogPanel } from "../events/EventCatalogPanel";
import { MachinesPanel } from "../machines/MachinesPanel";
import { SourceOverlay } from "../source/SourceOverlay";
import { SystemPanel } from "../system/SystemPanel";
import { selectMachineCanvasBoard } from "../../canvas";
import { readProjectGraphExportFile } from "../../project-export";
import {
  selectActiveTab,
  selectConsolePanel,
  selectEventCatalogPanel,
  selectMachineWorkbenchPanel,
  selectSourceInputMode,
  selectSourceOverlay,
  selectSourcePanel,
  selectSystemPanel,
  selectTabItems,
  type SourceInputModeView,
  type SourcePanelView,
  type VisualizerCommand,
  type VisualizerTab,
} from "../../workbench";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Separator } from "@/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { VISUALIZER_TEST_IDS } from "@/test-ids";
import { useOverflowFade } from "@/lib/use-overflow-fade";
import {
  IconButton,
  PaneScrollArea,
  Panel,
  PanelBody,
  PanelHeader,
  PanelKicker,
  PanelTitle,
  PrimaryActionButton,
  SourceEditorShell,
  WorkspaceHeader,
} from "@/ui/visualizer";
import { cn } from "@/lib/utils";

const consoleChannelTestId = (channel: string): string => {
  if (channel === "system") return VISUALIZER_TEST_IDS.console.channelSystem;
  if (channel === "diagnostics") return VISUALIZER_TEST_IDS.console.channelDiagnostics;
  if (channel === "debug") return VISUALIZER_TEST_IDS.console.channelDebug;

  return VISUALIZER_TEST_IDS.console.channelAll;
};

const statusTone = (status: string): "ready" | "muted" | "diagnostic" => {
  if (status === "ready") return "ready";
  if (status === "failed" || status === "blocked") return "diagnostic";

  return "muted";
};

const compileStatusLabel = (status: string): string => {
  if (status === "ready") return "compiled";
  if (status === "running") return "compiling";
  if (status === "failed") return "failed";

  return "idle";
};

const consoleFilterSummary = (consolePanel: ConsolePanelView): string => {
  const filters = [
    consolePanel.scope ? `scope:${consolePanel.scope.owner.kind}:${consolePanel.scope.owner.label}` : undefined,
    consolePanel.selectedChannel !== "all" ? `channel:${consolePanel.selectedChannel}` : undefined,
    consolePanel.filters.severity !== "all" ? `level:${consolePanel.filters.severity}` : undefined,
    consolePanel.filters.machineId !== "all" ? `machine:${consolePanel.filters.machineId}` : undefined,
    consolePanel.filters.code !== "all" ? `code:${consolePanel.filters.code}` : undefined,
    consolePanel.filters.origin !== "all" ? `origin:${consolePanel.filters.origin}` : undefined,
    consolePanel.filters.query.trim() ? `search:${consolePanel.filters.query.trim()}` : undefined,
  ].filter(Boolean);

  return filters.length > 0 ? filters.join(" · ") : "all";
};

const consoleScopeLabel = (scope: NonNullable<ConsolePanelView["scope"]>): string =>
  `${scope.owner.kind} · ${scope.owner.label}`;

const severityToneClass: Record<NonNullable<ConsoleEntry["severity"]>, string> = {
  error: "bg-(--vf-danger-soft) text-(--vf-danger) shadow-[inset_0_0_0_1px_var(--vf-danger-border)]",
  warning: "bg-(--vf-warning-soft) text-(--vf-warning) shadow-[inset_0_0_0_1px_var(--vf-warning-border)]",
  info: "bg-(--vf-effect-soft) text-(--vf-effect) shadow-[inset_0_0_0_1px_var(--vf-effect-border)]",
};

const severityDotClass: Record<NonNullable<ConsoleEntry["severity"]>, string> = {
  error: "bg-(--vf-danger) shadow-[0_0_4px_var(--vf-danger)]",
  warning: "bg-(--vf-warning)",
  info: "bg-(--vf-effect)",
};

const channelLabelClass: Record<ConsoleEntry["channel"], string> = {
  system: "text-(--vf-effect)",
  diagnostics: "text-(--vf-warning)",
  debug: "text-(--vf-routing)",
};

type ConsoleFilterSelectProps = {
  label: string;
  value: string;
  allLabel: string;
  allCount: number;
  options: ConsolePanelView["originOptions"];
  testId: string;
  onValueChange: (value: string) => void;
};

const ConsoleFilterSelect = ({
  label,
  value,
  allLabel,
  allCount,
  options,
  testId,
  onValueChange,
}: ConsoleFilterSelectProps) => (
  <label className="grid min-w-0 gap-1">
    <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-(--vf-text-quiet)">
      {label}
    </span>
    <span className="relative block">
      <select
        value={value}
        data-testid={testId}
        disabled={allCount === 0}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        className="h-8 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-(--vf-border) bg-(--vf-surface) py-0 pl-2.5 pr-8 font-mono text-[11px] text-foreground outline-none transition-colors hover:border-(--vf-accent-border) focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
      >
        <option value="all">{`${allLabel} · ${allCount}`}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {`${option.label} · ${option.count}`}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-(--vf-text-quiet)"
      />
    </span>
  </label>
);

type ConsoleChannelStripProps = {
  consolePanel: ConsolePanelView;
  dispatch: (command: VisualizerCommand) => void;
};

const ConsoleChannelStrip = ({ consolePanel, dispatch }: ConsoleChannelStripProps) => (
  <div
    role="tablist"
    aria-label="Console channels"
    data-testid={VISUALIZER_TEST_IDS.console.channels}
    className="scrollbar-none flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto p-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
  >
    {consolePanel.channels.map((channel) => (
      <button
        key={channel.channel}
        type="button"
        role="tab"
        aria-selected={channel.selected}
        data-testid={consoleChannelTestId(channel.channel)}
        onClick={() => dispatch({ type: "console.channel.selected", channel: channel.channel })}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-mono text-[11px] transition-colors duration-(--vf-duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          channel.selected
            ? cn(
                "bg-(--vf-surface-raised) shadow-[0_1px_2px_oklch(0_0_0/0.3)]",
                channel.channel !== "all" && channelLabelClass[channel.channel]
                  ? channelLabelClass[channel.channel]
                  : "text-foreground",
              )
            : "text-(--vf-text-muted) hover:bg-(--vf-row-hover) hover:text-foreground",
        )}
      >
        <span>{channel.label}</span>
        <span
          className={cn(
            "rounded-full bg-(--vf-counter-surface) px-1.5 font-mono text-[10px] tabular-nums",
            channel.selected ? "text-(--vf-text-muted)" : "text-(--vf-text-quiet)",
          )}
        >
          {channel.count}
        </span>
      </button>
    ))}
  </div>
);

type ConsoleSeverityControlsProps = {
  consolePanel: ConsolePanelView;
  dispatch: (command: VisualizerCommand) => void;
};

const ConsoleSeverityControls = ({ consolePanel, dispatch }: ConsoleSeverityControlsProps) => (
  <div
    role="group"
    aria-label="Console severity filter"
    data-testid={VISUALIZER_TEST_IDS.console.levelFilter}
    className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md border border-(--vf-border) bg-(--vf-surface) p-[3px]"
  >
    <button
      type="button"
      aria-pressed={consolePanel.filters.severity === "all"}
      onClick={() => dispatch({ type: "console.filter.changed", filter: "severity", value: "all" })}
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 font-mono text-[11px] transition-colors duration-(--vf-duration-fast)",
        consolePanel.filters.severity === "all"
          ? "bg-(--vf-surface-raised) font-semibold text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.35)]"
          : "text-(--vf-text-muted) hover:text-foreground",
      )}
    >
      all
      <span className="rounded-full bg-(--vf-counter-surface) px-1.5 text-[10px] text-(--vf-text-quiet) tabular-nums">
        {consolePanel.channelEntryCount}
      </span>
    </button>
    {consolePanel.severitySummary.map((severity) => (
      <button
        key={severity.severity}
        type="button"
        aria-pressed={severity.selected}
        disabled={severity.count === 0}
        onClick={() => dispatch({ type: "console.filter.changed", filter: "severity", value: severity.severity })}
        className={cn(
          "inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 font-mono text-[11px] transition-colors duration-(--vf-duration-fast) disabled:opacity-40",
          severity.selected
            ? cn(severityToneClass[severity.severity], "font-semibold")
            : "text-(--vf-text-muted) hover:text-foreground",
        )}
      >
        {severity.severity}
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] tabular-nums",
            severity.selected ? "bg-black/15 text-current" : "bg-(--vf-counter-surface) text-(--vf-text-quiet)",
          )}
        >
          {severity.count}
        </span>
      </button>
    ))}
  </div>
);

type ConsoleHotspotStripProps = {
  consolePanel: ConsolePanelView;
  dispatch: (command: VisualizerCommand) => void;
};

const ConsoleHotspotStrip = ({ consolePanel, dispatch }: ConsoleHotspotStripProps) => {
  if (consolePanel.hotspots.length === 0) return null;

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1.5"
      data-testid={VISUALIZER_TEST_IDS.console.hotspots}
    >
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-(--vf-text-quiet)">
        hot
      </span>
      {consolePanel.hotspots.map((hotspot) => (
        <button
          key={`${hotspot.filter}:${hotspot.value}`}
          type="button"
          aria-pressed={hotspot.selected}
          onClick={() => dispatch({ type: "console.filter.changed", filter: hotspot.filter, value: hotspot.value })}
          className={cn(
            "inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-md px-2 font-mono text-[10px] transition-colors duration-(--vf-duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            hotspot.selected
              ? "bg-(--vf-accent-soft) text-(--vf-accent) shadow-[inset_0_0_0_1px_var(--vf-accent-border)]"
              : "bg-(--vf-surface) text-(--vf-text-muted) shadow-[inset_0_0_0_1px_var(--vf-border)] hover:text-foreground",
          )}
        >
          <span className="font-semibold uppercase tracking-[0.04em] text-(--vf-text-quiet)">
            {hotspot.filter === "machineId" ? "machine" : hotspot.filter}
          </span>
          <span className="min-w-0 truncate">{hotspot.label}</span>
          <span className="rounded-full bg-(--vf-counter-surface) px-1.5 text-[10px] tabular-nums">
            {hotspot.count}
          </span>
        </button>
      ))}
    </div>
  );
};

type InputModeToggleProps = {
  mode: SourceInputModeView["kind"];
  onUseSource: () => void;
  onUseJson: () => void;
};

const InputModeToggle = ({ mode, onUseSource, onUseJson }: InputModeToggleProps) => (
  <div
    role="tablist"
    aria-label="Input mode"
    className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md border border-(--vf-border) bg-(--vf-surface-soft) p-[3px]"
    data-testid={VISUALIZER_TEST_IDS.source.inputModeToggle}
    data-mode={mode}
  >
    <button
      type="button"
      role="tab"
      aria-selected={mode === "pasted-source"}
      data-testid={VISUALIZER_TEST_IDS.source.inputModeUseSource}
      onClick={onUseSource}
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 rounded-[5px] px-2.5 font-mono text-[11px] transition-colors duration-(--vf-duration-fast)",
        mode === "pasted-source"
          ? "bg-(--vf-surface-raised) font-semibold text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.35)]"
          : "text-(--vf-text-muted) hover:text-foreground",
      )}
    >
      <FileCode aria-hidden="true" className="size-3.5" />
      Paste source
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={mode === "project-export"}
      data-testid={VISUALIZER_TEST_IDS.source.inputModeUseJson}
      onClick={onUseJson}
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 rounded-[5px] px-2.5 font-mono text-[11px] transition-colors duration-(--vf-duration-fast)",
        mode === "project-export"
          ? "bg-(--vf-surface-raised) font-semibold text-foreground shadow-[0_1px_2px_oklch(0_0_0/0.35)]"
          : "text-(--vf-text-muted) hover:text-foreground",
      )}
    >
      <Braces aria-hidden="true" className="size-3.5" />
      Import JSON
    </button>
    {mode === "local-session" ? (
      <button
        type="button"
        role="tab"
        aria-selected
        data-testid={VISUALIZER_TEST_IDS.source.inputModeUseLocal}
        className="inline-flex h-[26px] items-center gap-1.5 rounded-[5px] bg-(--vf-surface-raised) px-2.5 font-mono text-[11px] font-semibold text-(--vf-accent) shadow-[0_1px_2px_oklch(0_0_0/0.35)] transition-colors duration-(--vf-duration-fast)"
      >
        <Terminal aria-hidden="true" className="size-3.5" />
        Local
      </button>
    ) : null}
  </div>
);

const sourceFileCountLabel = (count: number): string => `${count} ${count === 1 ? "file" : "files"}`;

const sourceModelSummary = (sourcePanel: SourcePanelView): string =>
  sourcePanel.modelStatus === "ready"
    ? `${sourcePanel.machineCount} machines · ${sourcePanel.topicCount} topics`
    : sourcePanel.modelStatus;

const SourceMetadataGrid = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <dl className={cn("grid grid-cols-1 gap-2 rounded-md border border-(--vf-border-soft) p-3 font-mono text-[11px] sm:grid-cols-2", className)}>
    {children}
  </dl>
);

const SourceMetadataItem = ({
  label,
  title,
  wide,
  children,
}: {
  label: string;
  title?: string;
  wide?: boolean;
  children: ReactNode;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-0.5", wide && "sm:col-span-2")}>
    <dt className="text-[10px] uppercase tracking-[0.06em] text-(--vf-text-quiet)">{label}</dt>
    <dd className="min-w-0 truncate text-foreground" title={title}>
      {children}
    </dd>
  </div>
);

const LoadedInputHeader = ({
  icon,
  iconClassName,
  kicker,
  title,
  titleClassName,
  description,
}: {
  icon: ReactNode;
  iconClassName: string;
  kicker: string;
  title: string;
  titleClassName?: string;
  description: ReactNode;
}) => (
  <div className="flex items-start gap-3">
    <div className={cn("grid size-10 shrink-0 place-items-center rounded-md border border-(--vf-accent-border) text-(--vf-accent)", iconClassName)}>
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <PanelKicker>{kicker}</PanelKicker>
      <h3 className={cn("mt-0.5 min-w-0 truncate text-[15px] font-semibold text-foreground", titleClassName)}>
        {title}
      </h3>
      {description}
    </div>
  </div>
);

const LoadedInputActions = ({
  importLabel,
  onChangeFile,
  onSwitchToSource,
  onExploreSystem,
}: {
  importLabel: string;
  onChangeFile: () => void;
  onSwitchToSource: () => void;
  onExploreSystem: () => void;
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 border-(--vf-border) bg-(--vf-surface) text-foreground hover:bg-(--vf-surface-raised)"
      onClick={onChangeFile}
    >
      <Upload aria-hidden="true" className="size-3.5" />
      {importLabel}
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 text-(--vf-text-muted) hover:text-foreground"
      onClick={onSwitchToSource}
    >
      <FileCode aria-hidden="true" className="size-3.5" />
      Switch to paste source
    </Button>
    <PrimaryActionButton type="button" className="ml-auto" onClick={onExploreSystem}>
      Explore system
      <ArrowRight data-icon="inline-end" aria-hidden="true" />
    </PrimaryActionButton>
  </div>
);

const JsonLoadedCard = ({
  inputMode,
  sourcePanel,
  onChangeFile,
  onSwitchToSource,
  dispatch,
}: {
  inputMode: Extract<SourceInputModeView, { kind: "project-export" }>;
  sourcePanel: SourcePanelView;
  onChangeFile: () => void;
  onSwitchToSource: () => void;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <div
    className="flex min-h-[420px] min-w-0 flex-1 flex-col gap-4 rounded-(--vf-radius-lg) border border-(--vf-accent-border) bg-linear-to-br from-(--vf-accent-soft) to-(--vf-routing-soft) p-5 lg:min-h-0"
    data-testid={VISUALIZER_TEST_IDS.source.jsonLoadedCard}
    data-file-name={inputMode.jsonFileName}
  >
    <LoadedInputHeader
      icon={<FileJson aria-hidden="true" className="size-5" />}
      iconClassName="bg-(--vf-surface)"
      kicker="JSON export · loaded"
      title={inputMode.jsonFileName}
      description={
        <p className="mt-1 text-[12px] text-(--vf-text-muted)">
          The visualizer compiled this CLI graph export automatically. Use the tabs above to inspect{" "}
          <span className="font-mono text-foreground">System</span>,{" "}
          <span className="font-mono text-foreground">Events</span>, and{" "}
          <span className="font-mono text-foreground">Machines</span>.
        </p>
      }
    />

    <SourceMetadataGrid className="bg-card/80">
      <SourceMetadataItem label="entry" title={inputMode.entryPath}>
        {inputMode.entryPath}
      </SourceMetadataItem>
      <SourceMetadataItem label="files">
        <span className="tabular-nums">{sourceFileCountLabel(inputMode.fileCount)}</span>
      </SourceMetadataItem>
      <SourceMetadataItem label="source bundle">
        {inputMode.hasSources ? `embedded · ${inputMode.sourceFileCount}` : "not included"}
      </SourceMetadataItem>
      <SourceMetadataItem label="model">{sourceModelSummary(sourcePanel)}</SourceMetadataItem>
    </SourceMetadataGrid>

    <LoadedInputActions
      importLabel="Change file"
      onChangeFile={onChangeFile}
      onSwitchToSource={onSwitchToSource}
      onExploreSystem={() => dispatch({ type: "tab.selected", tab: "system" })}
    />
  </div>
);

const LocalSessionLoadedCard = ({
  inputMode,
  sourcePanel,
  onChangeFile,
  onSwitchToSource,
  dispatch,
}: {
  inputMode: Extract<SourceInputModeView, { kind: "local-session" }>;
  sourcePanel: SourcePanelView;
  onChangeFile: () => void;
  onSwitchToSource: () => void;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <div
    className="flex min-h-[420px] min-w-0 flex-1 flex-col gap-4 rounded-(--vf-radius-lg) border border-(--vf-accent-border) bg-card p-5 shadow-[inset_3px_0_0_var(--vf-accent)] lg:min-h-0"
    data-testid={VISUALIZER_TEST_IDS.source.localSessionCard}
    data-session-id={inputMode.sessionId}
    data-entry-path={inputMode.entryPath}
    data-file-count={inputMode.fileCount}
  >
    <LoadedInputHeader
      icon={<Terminal aria-hidden="true" className="size-5" />}
      iconClassName="bg-(--vf-accent-soft)"
      kicker="Local session · loaded"
      title={inputMode.entryPath}
      titleClassName="font-mono"
      description={
        <p className="mt-1 font-mono text-[11px] text-(--vf-text-muted)">
          session {inputMode.sessionId}
        </p>
      }
    />

    <SourceMetadataGrid className="bg-(--vf-surface-soft)">
      <SourceMetadataItem label="entry" title={inputMode.entryPath}>
        {inputMode.entryPath}
      </SourceMetadataItem>
      <SourceMetadataItem label="files">
        <span className="tabular-nums">{sourceFileCountLabel(inputMode.fileCount)}</span>
      </SourceMetadataItem>
      <SourceMetadataItem label="project root" title={inputMode.projectRoot ?? "not reported"}>
        {inputMode.projectRoot ?? "not reported"}
      </SourceMetadataItem>
      <SourceMetadataItem label="host">
        read:{inputMode.canReadFiles ? "yes" : "no"} · write:{inputMode.canWriteFiles ? "yes" : "no"} · patch:
        {inputMode.canApplyPatch ? "yes" : "no"}
      </SourceMetadataItem>
      {inputMode.tsconfigPath ? (
        <SourceMetadataItem label="tsconfig" title={inputMode.tsconfigPath} wide>
          {inputMode.tsconfigPath}
        </SourceMetadataItem>
      ) : null}
      <SourceMetadataItem label="model" wide>{sourceModelSummary(sourcePanel)}</SourceMetadataItem>
    </SourceMetadataGrid>

    <LoadedInputActions
      importLabel="Import JSON"
      onChangeFile={onChangeFile}
      onSwitchToSource={onSwitchToSource}
      onExploreSystem={() => dispatch({ type: "tab.selected", tab: "system" })}
    />
  </div>
);

const PasteSourcePane = ({
  sourcePanel,
  dispatch,
}: {
  sourcePanel: SourcePanelView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <div className="flex min-h-[420px] min-w-0 flex-col gap-2 lg:min-h-0">
    <SourceEditorShell
      label="Source editor"
      value={sourcePanel.source}
      textareaTestId={VISUALIZER_TEST_IDS.source.editor}
      className="min-h-[420px] flex-1 lg:min-h-0"
      textareaClassName="min-h-[420px] flex-1 lg:min-h-0"
      onValueChange={(source) => dispatch({ type: "source.changed", source })}
    />
    <p className="px-1 text-[11px] text-(--vf-text-quiet)">
      paste TypeScript source with one or more{" "}
      <code className="rounded-sm bg-(--vf-surface-soft) px-1 font-mono text-[10px] text-foreground">
        createMachine(…)
      </code>{" "}
      calls, then press <span className="font-mono text-(--vf-accent)">Compile &amp; open</span>.
    </p>
  </div>
);

const SourceMetaSidebar = ({ sourcePanel }: { sourcePanel: SourcePanelView }) => (
  <aside className="flex min-h-fit flex-col gap-3 lg:min-h-0">
    <div
      className="grid gap-2 rounded-(--vf-radius-lg) border bg-card p-3 font-mono text-[11px] text-(--vf-text-muted)"
      data-testid={VISUALIZER_TEST_IDS.source.summary}
      data-version={sourcePanel.version}
      data-compile-status={sourcePanel.compileStatus}
      data-analysis-status={sourcePanel.analysisStatus}
      data-model-status={sourcePanel.modelStatus}
      data-validation-status={sourcePanel.validationStatus}
      data-diagnostic-count={sourcePanel.diagnosticCount}
      data-machine-count={sourcePanel.machineCount}
      data-topic-count={sourcePanel.topicCount}
    >
      <PanelKicker>Projection</PanelKicker>
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-[10px] text-(--vf-text-quiet)">machines</dt>
          <dd className="mt-0.5 font-sans text-[18px] font-semibold text-foreground tabular-nums">
            {sourcePanel.machineCount}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-(--vf-text-quiet)">topics</dt>
          <dd className="mt-0.5 font-sans text-[18px] font-semibold text-foreground tabular-nums">
            {sourcePanel.topicCount}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-(--vf-text-quiet)">issues</dt>
          <dd
            className={cn(
              "mt-0.5 font-sans text-[18px] font-semibold tabular-nums",
              sourcePanel.diagnosticCount > 0 ? "text-(--vf-warning)" : "text-foreground",
            )}
          >
            {sourcePanel.diagnosticCount}
          </dd>
        </div>
      </dl>
    </div>

    <div className="grid gap-2 rounded-(--vf-radius-lg) border bg-card p-3 font-mono text-[11px]">
      <PanelKicker>Source meta</PanelKicker>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-(--vf-text-muted)">
        <dt className="text-(--vf-text-quiet)">version</dt>
        <dd className="font-mono text-foreground tabular-nums">{sourcePanel.version}</dd>
        <dt className="text-(--vf-text-quiet)">hash</dt>
        <dd className="min-w-0 break-all font-mono text-foreground wrap-anywhere">{sourcePanel.hash}</dd>
        <dt className="text-(--vf-text-quiet)">compile</dt>
        <dd className="font-mono">{sourcePanel.compileStatus}</dd>
        <dt className="text-(--vf-text-quiet)">analyze</dt>
        <dd className="font-mono">{sourcePanel.analysisStatus}</dd>
        <dt className="text-(--vf-text-quiet)">model</dt>
        <dd className="font-mono">{sourcePanel.modelStatus}</dd>
      </dl>
    </div>
  </aside>
);

const handleProjectExportFile = async (
  event: ChangeEvent<HTMLInputElement>,
  dispatch: (command: VisualizerCommand) => void,
) => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const result = await readProjectGraphExportFile(file);
    if (result.ok) {
      dispatch({ type: "project-export.loaded", fileName: file.name, exportDocument: result.document });
    } else {
      dispatch({ type: "project-export.load.failed", fileName: file.name, issue: result.issue });
    }
  } catch (error) {
    dispatch({
      type: "project-export.load.failed",
      fileName: file.name,
      issue: {
        code: "invalid-json",
        message: error instanceof Error ? error.message : "Could not read project graph export file.",
      },
    });
  } finally {
    input.value = "";
  }
};

const SourceWorkspace = ({
  sourcePanel,
  sourceInputMode,
  dispatch,
}: {
  sourcePanel: SourcePanelView;
  sourceInputMode: SourceInputModeView;
  dispatch: (command: VisualizerCommand) => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pickFile = () => fileInputRef.current?.click();
  const switchToPasteSource = () => dispatch({ type: "input-mode.use-pasted-source" });
  const isJsonMode = sourceInputMode.kind === "project-export";
  const isLocalMode = sourceInputMode.kind === "local-session";
  const eyebrow = isLocalMode ? "Source · local session" : isJsonMode ? "Source · JSON export" : "Source · paste TypeScript";
  const title = isLocalMode ? sourceInputMode.entryPath : isJsonMode ? sourceInputMode.jsonFileName : sourcePanel.filename;

  return (
    <section
      aria-labelledby="source-pipeline-title"
      className="flex h-full min-h-0 flex-col gap-3"
      data-testid={VISUALIZER_TEST_IDS.source.panel}
      data-input-mode={sourceInputMode.kind}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        data-testid={VISUALIZER_TEST_IDS.source.projectExportFile}
        onChange={(event) => handleProjectExportFile(event, dispatch)}
      />

      <WorkspaceHeader eyebrow={eyebrow} title={title} titleId="source-pipeline-title">
        <InputModeToggle
          mode={sourceInputMode.kind}
          onUseSource={isJsonMode || isLocalMode ? switchToPasteSource : () => undefined}
          onUseJson={pickFile}
        />
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          {isJsonMode || isLocalMode ? null : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    aria-label="Reset source to sample"
                    data-testid={VISUALIZER_TEST_IDS.source.reset}
                    onClick={() => dispatch({ type: "source.reset-to-sample" })}
                  >
                    <RotateCcw aria-hidden="true" />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>Reset to sample</TooltipContent>
              </Tooltip>
              <PrimaryActionButton
                type="button"
                className="flex-1 sm:flex-initial"
                data-testid={VISUALIZER_TEST_IDS.source.open}
                disabled={!sourcePanel.canOpen}
                onClick={() => dispatch({ type: "source.open-visualizer" })}
              >
                <Play data-icon="inline-start" aria-hidden="true" />
                Compile &amp; open
              </PrimaryActionButton>
            </>
          )}
        </div>
      </WorkspaceHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto lg:grid-cols-[minmax(0,1fr)_minmax(220px,260px)] lg:overflow-hidden">
        {isJsonMode ? (
          <JsonLoadedCard
            inputMode={sourceInputMode}
            sourcePanel={sourcePanel}
            onChangeFile={pickFile}
            onSwitchToSource={switchToPasteSource}
            dispatch={dispatch}
          />
        ) : isLocalMode ? (
          <LocalSessionLoadedCard
            inputMode={sourceInputMode}
            sourcePanel={sourcePanel}
            onChangeFile={pickFile}
            onSwitchToSource={switchToPasteSource}
            dispatch={dispatch}
          />
        ) : (
          <PasteSourcePane sourcePanel={sourcePanel} dispatch={dispatch} />
        )}

        <SourceMetaSidebar sourcePanel={sourcePanel} />
      </div>
    </section>
  );
};

type ConsoleEntryRowProps = {
  entry: ConsolePanelView["entries"][number];
  selected: boolean;
  dispatch: (command: VisualizerCommand) => void;
};

const ConsoleEntryRow = ({ entry, selected, dispatch }: ConsoleEntryRowProps) => {
  const machineId = machineIdForConsoleEntry(entry);
  const dotClass = entry.severity ? severityDotClass[entry.severity] : "bg-(--vf-text-quiet)";
  const channelClass = channelLabelClass[entry.channel];
  const sourceAnchor = entry.sourceAnchor;

  const selectEntry = () => dispatch({ type: "console.entry.selected", entryId: entry.entryId });
  const openSource = (event: MouseEvent<HTMLButtonElement>, anchor: NonNullable<typeof sourceAnchor>) => {
    event.stopPropagation();
    dispatch({ type: "source.overlay.opened", title: entry.title, anchors: [anchor] });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectEntry();
  };

  return (
    <li className="contents">
      <div
        role="button"
        tabIndex={0}
        data-testid={VISUALIZER_TEST_IDS.console.entry}
        data-entry-id={entry.entryId}
        data-channel={entry.channel}
        data-severity={entry.severity ?? ""}
        data-origin={entry.origin ?? ""}
        data-machine-id={machineId ?? ""}
        data-code={entry.title}
        onClick={selectEntry}
        onKeyDown={handleKeyDown}
        className={cn(
          "group relative grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 border-t border-(--vf-border-soft) px-3 py-2 transition-colors duration-(--vf-duration-fast) first:border-t-0 hover:bg-(--vf-row-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          selected && "bg-(--vf-row-selected) shadow-[inset_2px_0_0_var(--vf-row-selected-line)] hover:bg-(--vf-row-selected)",
        )}
      >
      <span
        aria-hidden="true"
        className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", dotClass)}
      />
      <span className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn("shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]", channelClass)}>
            {entry.channel}
          </span>
          {entry.severity ? (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-(--vf-text-quiet)">
              {entry.severity}
            </span>
          ) : null}
          <strong className="min-w-0 font-mono text-[11px] font-semibold text-foreground wrap-anywhere">
            {entry.title}
          </strong>
        </span>
        <span className="min-w-0 text-[12px] leading-snug text-(--vf-text-muted) wrap-anywhere">
          {entry.message}
        </span>
        {machineId || entry.origin || entry.locationLabel ? (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 font-mono text-[10px] text-(--vf-text-quiet)">
            {machineId ? (
              <span className="rounded-[3px] bg-(--vf-domain-soft) px-1.5 py-0.5 font-semibold text-(--vf-domain)">
                {machineId}
              </span>
            ) : null}
            {entry.origin ? <span>{entry.origin}</span> : null}
            {entry.locationLabel ? (
              <span className="min-w-0 truncate" title={entry.locationLabel}>
                {entry.locationLabel}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      {sourceAnchor ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Open source code"
              data-testid={VISUALIZER_TEST_IDS.console.entryViewSource}
              onClick={(event) => openSource(event, sourceAnchor)}
              className="inline-flex size-7 shrink-0 items-center justify-center self-start rounded-md border border-(--vf-border-soft) bg-(--vf-surface) text-(--vf-text-muted) opacity-0 transition-all duration-(--vf-duration-fast) hover:border-(--vf-accent-border) hover:bg-(--vf-accent-soft) hover:text-(--vf-accent) focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
            >
              <FileSearch aria-hidden="true" className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Open source code</TooltipContent>
        </Tooltip>
      ) : (
        <span aria-hidden="true" className="size-7 shrink-0" />
      )}
      </div>
    </li>
  );
};

const ConsoleDrawer = ({
  consolePanel,
  dispatch,
}: {
  consolePanel: ConsolePanelView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <aside
    aria-hidden={!consolePanel.open}
    className={cn(
      "fixed inset-0 z-40 bg-background/70 backdrop-blur-[1px] lg:bg-background/40",
      !consolePanel.open && "hidden",
    )}
  >
    <button
      type="button"
      aria-label="Close console"
      className="absolute inset-0 cursor-default appearance-none border-0 bg-transparent p-0"
      data-testid={VISUALIZER_TEST_IDS.console.backdrop}
      onClick={() => dispatch({ type: "panel.console.toggled", open: false })}
    />
    <Panel
      rail
      role="region"
      aria-label="Visualizer console"
      className={cn(
        "absolute inset-y-2 right-2 w-[min(calc(100vw-1rem),780px)] bg-card shadow-(--vf-shadow-overlay) sm:inset-y-3 sm:right-3 lg:w-[min(calc(100vw-2rem),960px)] xl:w-[min(62vw,1180px)]",
        !consolePanel.open && "hidden",
      )}
      data-testid={VISUALIZER_TEST_IDS.console.panel}
    >
      <PanelHeader className="justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PanelTitle eyebrow="Diagnostics" title="Console" />
          <span className="hidden font-mono text-[10px] text-(--vf-text-quiet) tabular-nums sm:inline">
            {consolePanel.totalEntries} {consolePanel.totalEntries === 1 ? "entry" : "entries"}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              type="button"
              aria-label="Close console"
              data-testid={VISUALIZER_TEST_IDS.console.close}
              onClick={() => dispatch({ type: "panel.console.toggled", open: false })}
            >
              <X aria-hidden="true" />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>Close · Esc</TooltipContent>
        </Tooltip>
      </PanelHeader>

      <PanelBody className="flex flex-col">
        <div className="flex flex-col gap-3 border-b border-(--vf-border-soft) bg-(--vf-surface-soft)/40 px-3 py-3">
          <ConsoleChannelStrip consolePanel={consolePanel} dispatch={dispatch} />
          {consolePanel.scope ? (
            <div
              className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-(--vf-warning-border) bg-(--vf-warning-soft) px-2.5 py-2 font-mono text-[11px] text-(--vf-warning)"
              data-testid={VISUALIZER_TEST_IDS.console.scope}
              data-scope-kind={consolePanel.scope.owner.kind}
              data-scope-id={consolePanel.scope.owner.id}
              data-diagnostic-count={consolePanel.scope.diagnosticIds.length}
            >
              <span className="font-semibold uppercase tracking-[0.08em]">scope</span>
              <span className="min-w-0 max-w-full truncate text-foreground" title={consoleScopeLabel(consolePanel.scope)}>
                {consoleScopeLabel(consolePanel.scope)}
              </span>
              <span className="rounded-full bg-black/15 px-1.5 text-[10px] tabular-nums">
                {consolePanel.scope.diagnosticIds.length}
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-[220px]">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-(--vf-text-quiet)"
              />
              <Input
                type="search"
                value={consolePanel.filters.query}
                placeholder="search code, message, file, machine"
                aria-label="Search console entries"
                data-testid={VISUALIZER_TEST_IDS.console.search}
                className="h-8 rounded-md border-(--vf-border) bg-(--vf-surface) pl-8 font-mono text-[11px] text-foreground placeholder:text-(--vf-text-quiet) focus-visible:ring-2"
                onChange={(event) => dispatch({ type: "console.query.changed", query: event.currentTarget.value })}
              />
            </div>
            <ConsoleSeverityControls consolePanel={consolePanel} dispatch={dispatch} />
            <button
              type="button"
              disabled={consolePanel.activeFilterCount === 0}
              data-testid={VISUALIZER_TEST_IDS.console.clearFilters}
              onClick={() => dispatch({ type: "console.filters.reset" })}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] text-(--vf-text-muted) transition-colors duration-(--vf-duration-fast) hover:bg-(--vf-row-hover) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-(--vf-text-muted)"
            >
              <SlidersHorizontal aria-hidden="true" className="size-3.5" />
              clear
              {consolePanel.activeFilterCount > 0 ? (
                <span className="rounded-full bg-(--vf-counter-surface) px-1.5 text-[10px] text-(--vf-text-quiet) tabular-nums">
                  {consolePanel.activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ConsoleFilterSelect
              label="machine"
              value={consolePanel.filters.machineId}
              allLabel="all"
              allCount={consolePanel.channelEntryCount}
              options={consolePanel.machineOptions}
              testId={VISUALIZER_TEST_IDS.console.machineFilter}
              onValueChange={(value) => dispatch({ type: "console.filter.changed", filter: "machineId", value })}
            />
            <ConsoleFilterSelect
              label="code"
              value={consolePanel.filters.code}
              allLabel="all"
              allCount={consolePanel.channelEntryCount}
              options={consolePanel.codeOptions}
              testId={VISUALIZER_TEST_IDS.console.codeFilter}
              onValueChange={(value) => dispatch({ type: "console.filter.changed", filter: "code", value })}
            />
            <ConsoleFilterSelect
              label="origin"
              value={consolePanel.filters.origin}
              allLabel="all"
              allCount={consolePanel.channelEntryCount}
              options={consolePanel.originOptions}
              testId={VISUALIZER_TEST_IDS.console.originFilter}
              onValueChange={(value) => dispatch({ type: "console.filter.changed", filter: "origin", value })}
            />
          </div>

          <ConsoleHotspotStrip consolePanel={consolePanel} dispatch={dispatch} />
        </div>

        <PaneScrollArea>
          {consolePanel.entries.length === 0 ? (
            <div
              className="flex min-h-36 flex-col items-center justify-center gap-2 p-4 text-center text-[12px] text-(--vf-text-quiet)"
              data-testid={VISUALIZER_TEST_IDS.console.entries}
              data-empty="true"
              data-entry-count="0"
              data-empty-reason={consolePanel.emptyReason}
            >
              <AlertCircle className="size-4 text-(--vf-text-quiet)" aria-hidden="true" />
              <p>{consolePanel.emptyReason === "filtered" ? "No entries match the active filters." : "No console entries yet."}</p>
            </div>
          ) : (
            <ol
              data-testid={VISUALIZER_TEST_IDS.console.entries}
              data-empty="false"
              data-entry-count={consolePanel.entries.length}
            >
              {consolePanel.entries.map((entry) => (
                <ConsoleEntryRow
                  key={entry.entryId}
                  entry={entry}
                  selected={consolePanel.selectedEntryId === entry.entryId}
                  dispatch={dispatch}
                />
              ))}
            </ol>
          )}
        </PaneScrollArea>

        <Separator />

        <div className="flex items-center justify-between gap-2 border-t border-(--vf-border-soft) bg-(--vf-surface-soft) px-3 py-1.5 font-mono text-[10px] text-(--vf-text-quiet)">
          <span className="tabular-nums">
            {consolePanel.entries.length} shown · {consolePanel.totalEntries} total
          </span>
          <span className="min-w-0 truncate">filter · {consoleFilterSummary(consolePanel)}</span>
        </div>
      </PanelBody>
    </Panel>
  </aside>
);

export const Shell = () => {
  const { dispatch } = useWorkbenchContext();
  const activeTab = useWorkbenchSelector(selectActiveTab);
  const tabs = useWorkbenchSelector(selectTabItems);
  const consolePanel = useWorkbenchSelector(selectConsolePanel);
  const sourcePanel = useWorkbenchSelector(selectSourcePanel);
  const sourceInputMode = useWorkbenchSelector(selectSourceInputMode);
  const systemPanel = useWorkbenchSelector(selectSystemPanel);
  const eventCatalogPanel = useWorkbenchSelector(selectEventCatalogPanel);
  const machineWorkbenchPanel = useWorkbenchSelector(selectMachineWorkbenchPanel);
  const machineCanvasBoard = useWorkbenchSelector(selectMachineCanvasBoard);
  const sourceOverlay = useWorkbenchSelector(selectSourceOverlay);

  const compileLabel = compileStatusLabel(sourcePanel.compileStatus);
  const compileTone = statusTone(sourcePanel.compileStatus);
  const isJsonMode = sourceInputMode.kind === "project-export";
  const isLocalMode = sourceInputMode.kind === "local-session";
  const inputLabel = isLocalMode ? sourceInputMode.entryPath : isJsonMode ? sourceInputMode.jsonFileName : sourcePanel.filename;
  const inputKindLabel = isLocalMode ? "LOCAL" : isJsonMode ? "JSON" : "TS";
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  useOverflowFade(tabsScrollRef);

  return (
    <main
      className="dark min-h-screen min-w-80 bg-background text-foreground"
      data-testid={VISUALIZER_TEST_IDS.shell.root}
    >
      <div className="grid h-screen grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <header
          className="flex flex-col gap-2 border-b bg-(--vf-surface) px-3 py-2 sm:px-4 lg:h-13 lg:flex-row lg:items-center lg:gap-4 lg:py-0"
          data-testid={VISUALIZER_TEST_IDS.shell.topbar}
        >
          <button
            type="button"
            aria-label="Go to Source"
            className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => dispatch({ type: "tab.selected", tab: "source" })}
          >
            <div className="relative size-6 shrink-0">
              <span className="vf-logo-orb vf-logo-orb-1" aria-hidden="true" />
              <span className="vf-logo-orb vf-logo-orb-2" aria-hidden="true" />
              <span
                className="vf-logo-badge grid size-6 place-items-center rounded-[5px] border border-(--vf-accent-border) bg-linear-to-br from-(--vf-accent-soft) to-(--vf-routing-soft) font-mono text-[11px] font-bold text-(--vf-accent)"
                aria-hidden="true"
              >
                lf
              </span>
            </div>
            <div className="flex min-w-0 items-baseline gap-1.5 font-mono text-[12px] text-(--vf-text-muted)">
              <span className="hidden truncate sm:inline">lite-fsm visualizer</span>
              <span className="hidden text-(--vf-text-quiet) sm:inline">·</span>
              <span className="inline truncate font-semibold text-foreground">alpha v1</span>
            </div>
          </button>

          <div ref={tabsScrollRef} className="vf-tabs-scroll min-w-0">
            <Tabs
              value={activeTab}
              onValueChange={(value) => dispatch({ type: "tab.selected", tab: value as VisualizerTab })}
            >
              <TabsList
                className="gap-0.5 rounded-lg border border-(--vf-border) bg-(--vf-surface-soft) p-[3px]"
                data-testid={VISUALIZER_TEST_IDS.tabs.root}
              >
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.tab}
                    value={tab.tab}
                    data-tab={tab.tab}
                    data-count={tab.count}
                    data-diagnostic-count={tab.diagnosticCount}
                    data-has-error={tab.hasError}
                    data-testid={VISUALIZER_TEST_IDS.tabs.trigger[tab.tab]}
                    className="min-w-fit gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium text-(--vf-text-muted) transition-colors duration-(--vf-duration-fast) hover:bg-[oklch(1_0_0/0.05)] hover:text-foreground data-active:font-semibold data-active:shadow-[0_1px_2px_oklch(0_0_0/0.35)] dark:data-active:border-transparent dark:data-active:bg-(--vf-surface-raised) dark:data-active:text-foreground"
                  >
                    <span>{tab.label}</span>
                    {tab.count ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 font-mono text-[10px] tabular-nums",
                          activeTab === tab.tab
                            ? "bg-(--vf-accent-soft) text-(--vf-accent)"
                            : "bg-(--vf-counter-surface) text-(--vf-text-quiet)",
                        )}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                    {tab.diagnosticCount > 0 ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 font-mono text-[10px] tabular-nums",
                          tab.hasError
                            ? "bg-(--vf-danger-soft) text-(--vf-danger)"
                            : "bg-(--vf-warning-soft) text-(--vf-warning)",
                        )}
                        data-testid={VISUALIZER_TEST_IDS.tabs.diagnosticBadge}
                        data-tab={tab.tab}
                        data-count={tab.diagnosticCount}
                        data-has-error={tab.hasError}
                      >
                        diag {tab.diagnosticCount}
                      </span>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:ml-auto lg:justify-end">
            <button
              type="button"
              aria-label={`Go to Source · ${inputKindLabel} input · ${inputLabel}`}
              className={cn(
                "hidden h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 font-mono text-[11px] transition-colors duration-(--vf-duration-fast) sm:inline-flex",
                isJsonMode || isLocalMode
                  ? "border-(--vf-accent-border) bg-(--vf-accent-soft) text-(--vf-accent) hover:bg-(--vf-accent-soft)/80"
                  : "border-(--vf-border) bg-(--vf-surface-soft) text-(--vf-text-muted) hover:bg-(--vf-surface-raised) hover:text-foreground",
              )}
              title={`Input: ${inputKindLabel.toLowerCase()} · ${inputLabel}`}
              onClick={() => dispatch({ type: "tab.selected", tab: "source" })}
            >
              {isLocalMode ? (
                <Terminal aria-hidden="true" className="size-3.5 shrink-0" />
              ) : isJsonMode ? (
                <Braces aria-hidden="true" className="size-3.5 shrink-0" />
              ) : (
                <FileCode aria-hidden="true" className="size-3.5 shrink-0 text-(--vf-text-quiet)" />
              )}
              <span className="font-semibold">{inputKindLabel}</span>
            </button>
            <span
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-(--vf-border) bg-(--vf-surface-soft) px-2 font-mono text-[11px] text-(--vf-text-muted)"
              data-testid={VISUALIZER_TEST_IDS.source.status}
              data-status={sourcePanel.modelStatus}
              title={`compile status: ${sourcePanel.compileStatus}`}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  compileTone === "ready"
                    ? "bg-(--vf-accent) shadow-[0_0_4px_var(--vf-accent)]"
                    : compileTone === "diagnostic"
                      ? "bg-(--vf-danger) shadow-[0_0_4px_var(--vf-danger)]"
                      : "bg-(--vf-text-quiet)",
                )}
              />
              <span
                className={cn(
                  compileTone === "diagnostic" && "text-(--vf-danger)",
                  compileTone === "ready" && "text-(--vf-accent)",
                )}
              >
                {compileLabel}
              </span>
              {sourcePanel.diagnosticCount > 0 ? (
                <>
                  <span className="text-(--vf-border)">·</span>
                  <span className="text-(--vf-warning) tabular-nums">
                    {sourcePanel.diagnosticCount} {sourcePanel.diagnosticCount === 1 ? "issue" : "issues"}
                  </span>
                </>
              ) : null}
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={consolePanel.open}
              className={cn(
                "h-8 border-(--vf-border) bg-(--vf-surface-soft) text-foreground hover:bg-(--vf-surface-raised)",
                consolePanel.open && "border-(--vf-accent-border) bg-(--vf-accent-soft) text-(--vf-accent)",
              )}
              data-testid={VISUALIZER_TEST_IDS.console.toggle}
              onClick={() => dispatch({ type: "panel.console.toggled" })}
            >
              <Terminal data-icon="inline-start" aria-hidden="true" />
              Console
            </Button>
          </div>
        </header>

        <section
          className="min-h-0 min-w-0 p-2.5 sm:p-3"
          data-active-tab={activeTab}
          data-testid={VISUALIZER_TEST_IDS.shell.workspace}
        >
          {activeTab === "source" ? (
            <SourceWorkspace sourcePanel={sourcePanel} sourceInputMode={sourceInputMode} dispatch={dispatch} />
          ) : activeTab === "system" ? (
            <SystemPanel view={systemPanel} dispatch={dispatch} />
          ) : activeTab === "events" ? (
            <EventCatalogPanel view={eventCatalogPanel} dispatch={dispatch} />
          ) : (
            <MachinesPanel view={machineWorkbenchPanel} canvasBoard={machineCanvasBoard} dispatch={dispatch} />
          )}
        </section>
      </div>
      <ConsoleDrawer consolePanel={consolePanel} dispatch={dispatch} />
      <SourceOverlay view={sourceOverlay} onClose={() => dispatch({ type: "source.overlay.closed" })} />
    </main>
  );
};
