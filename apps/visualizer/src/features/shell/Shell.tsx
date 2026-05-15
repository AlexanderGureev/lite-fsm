import { useRef, type ChangeEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Braces,
  FileCode,
  FileJson,
  Play,
  RotateCcw,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import type { ConsolePanelView } from "../../console";
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
  StatusBadge,
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
    <div className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-md border border-(--vf-accent-border) bg-(--vf-surface) text-(--vf-accent)">
        <FileJson aria-hidden="true" className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <PanelKicker>JSON export · loaded</PanelKicker>
        <h3 className="mt-0.5 min-w-0 truncate text-[15px] font-semibold text-foreground">
          {inputMode.jsonFileName}
        </h3>
        <p className="mt-1 text-[12px] text-(--vf-text-muted)">
          The visualizer compiled this CLI graph export automatically. Use the tabs above to inspect{" "}
          <span className="font-mono text-foreground">System</span>,{" "}
          <span className="font-mono text-foreground">Events</span>, and{" "}
          <span className="font-mono text-foreground">Machines</span>.
        </p>
      </div>
    </div>

    <dl className="grid grid-cols-1 gap-2 rounded-md border border-(--vf-border-soft) bg-card/80 p-3 font-mono text-[11px] sm:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-[10px] uppercase tracking-[0.06em] text-(--vf-text-quiet)">entry</dt>
        <dd className="min-w-0 truncate text-foreground" title={inputMode.entryPath}>
          {inputMode.entryPath}
        </dd>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-[10px] uppercase tracking-[0.06em] text-(--vf-text-quiet)">files</dt>
        <dd className="text-foreground tabular-nums">
          {inputMode.fileCount} {inputMode.fileCount === 1 ? "file" : "files"}
        </dd>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-[10px] uppercase tracking-[0.06em] text-(--vf-text-quiet)">source bundle</dt>
        <dd className="text-foreground">
          {inputMode.hasSources ? `embedded · ${inputMode.sourceFileCount}` : "not included"}
        </dd>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-[10px] uppercase tracking-[0.06em] text-(--vf-text-quiet)">model</dt>
        <dd className="text-foreground">
          {sourcePanel.modelStatus === "ready"
            ? `${sourcePanel.machineCount} machines · ${sourcePanel.topicCount} topics`
            : sourcePanel.modelStatus}
        </dd>
      </div>
    </dl>

    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 border-(--vf-border) bg-(--vf-surface) text-foreground hover:bg-(--vf-surface-raised)"
        onClick={onChangeFile}
      >
        <Upload aria-hidden="true" className="size-3.5" />
        Change file
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
      <PrimaryActionButton
        type="button"
        className="ml-auto"
        onClick={() => dispatch({ type: "tab.selected", tab: "system" })}
      >
        Explore system
        <ArrowRight data-icon="inline-end" aria-hidden="true" />
      </PrimaryActionButton>
    </div>
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
  const eyebrow = isJsonMode ? "Source · JSON export" : "Source · paste TypeScript";
  const title = isJsonMode ? sourceInputMode.jsonFileName : sourcePanel.filename;

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
          onUseSource={isJsonMode ? switchToPasteSource : () => undefined}
          onUseJson={pickFile}
        />
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          {isJsonMode ? null : (
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
        ) : (
          <PasteSourcePane sourcePanel={sourcePanel} dispatch={dispatch} />
        )}

        <SourceMetaSidebar sourcePanel={sourcePanel} />
      </div>
    </section>
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
        "absolute inset-y-2 right-2 w-[min(calc(100vw-1rem),460px)] bg-card shadow-(--vf-shadow-overlay) sm:inset-y-3 sm:right-3",
        !consolePanel.open && "hidden",
      )}
      data-testid={VISUALIZER_TEST_IDS.console.panel}
    >
      <PanelHeader className="justify-between">
        <PanelTitle eyebrow="Diagnostics" title="Console" />
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
        <div
          className="flex flex-wrap gap-1 border-b border-(--vf-border-soft) bg-(--vf-surface-soft) p-2"
          data-testid={VISUALIZER_TEST_IDS.console.channels}
        >
          {consolePanel.channels.map((channel) => (
            <Button
              key={channel.channel}
              type="button"
              variant={channel.selected ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={channel.selected}
              className={cn(
                "h-7 gap-1.5 px-2 font-mono text-[11px]",
                channel.selected
                  ? "bg-(--vf-surface-raised) text-foreground"
                  : "text-(--vf-text-muted) hover:bg-(--vf-row-hover) hover:text-foreground",
              )}
              data-testid={consoleChannelTestId(channel.channel)}
              onClick={() => dispatch({ type: "console.channel.selected", channel: channel.channel })}
            >
              {channel.label}
              <span
                className={cn(
                  "rounded-full px-1.5 font-mono text-[10px] tabular-nums",
                  channel.selected
                    ? "bg-(--vf-counter-surface) text-(--vf-text-muted)"
                    : "bg-(--vf-counter-surface) text-(--vf-text-quiet)",
                )}
              >
                {channel.count}
              </span>
            </Button>
          ))}
        </div>

        <PaneScrollArea>
          {consolePanel.entries.length === 0 ? (
            <div
              className="flex min-h-36 flex-col items-center justify-center gap-2 p-4 text-center text-[12px] text-(--vf-text-quiet)"
              data-testid={VISUALIZER_TEST_IDS.console.entries}
              data-empty="true"
              data-entry-count="0"
            >
              <AlertCircle className="size-4 text-(--vf-text-quiet)" aria-hidden="true" />
              <p>No console entries in this channel.</p>
            </div>
          ) : (
            <ol
              className="flex flex-col gap-1.5 p-2.5"
              data-testid={VISUALIZER_TEST_IDS.console.entries}
              data-empty="false"
              data-entry-count={consolePanel.entries.length}
            >
              {consolePanel.entries.map((entry) => (
                <li key={entry.entryId}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-(--vf-border-soft) bg-(--vf-surface-soft) p-2 text-left transition-colors duration-(--vf-duration-fast) hover:border-(--vf-border) hover:bg-(--vf-surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    data-testid={VISUALIZER_TEST_IDS.console.entry}
                    data-entry-id={entry.entryId}
                    data-channel={entry.channel}
                    data-severity={entry.severity ?? ""}
                    data-origin={entry.origin ?? ""}
                    onClick={() => dispatch({ type: "console.entry.selected", entryId: entry.entryId })}
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <StatusBadge tone={entry.channel === "diagnostics" ? "diagnostic" : "muted"}>
                        {entry.channel}
                      </StatusBadge>
                      {entry.severity ? (
                        <StatusBadge tone={statusTone(entry.severity)}>{entry.severity}</StatusBadge>
                      ) : null}
                      {entry.origin ? (
                        <span className="font-mono text-[10px] text-(--vf-text-quiet)">{entry.origin}</span>
                      ) : null}
                      {entry.locationLabel ? (
                        <span className="font-mono text-[10px] text-(--vf-text-quiet)">· {entry.locationLabel}</span>
                      ) : null}
                    </span>
                    <strong className="mt-1.5 block min-w-0 font-mono text-[11px] font-semibold text-foreground wrap-anywhere">
                      {entry.title}
                    </strong>
                    <span className="mt-0.5 block min-w-0 text-[12px] text-(--vf-text-muted) wrap-anywhere">
                      {entry.message}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </PaneScrollArea>

        <Separator />

        <div className="flex items-center justify-between gap-2 border-t border-(--vf-border-soft) bg-(--vf-surface-soft) px-3 py-1.5 font-mono text-[10px] text-(--vf-text-quiet)">
          <span className="tabular-nums">{consolePanel.totalEntries} entries</span>
          <span>filter · {consolePanel.selectedChannel}</span>
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
  const inputLabel = isJsonMode ? sourceInputMode.jsonFileName : sourcePanel.filename;
  const inputKindLabel = isJsonMode ? "JSON" : "TS";
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
                isJsonMode
                  ? "border-(--vf-accent-border) bg-(--vf-accent-soft) text-(--vf-accent) hover:bg-(--vf-accent-soft)/80"
                  : "border-(--vf-border) bg-(--vf-surface-soft) text-(--vf-text-muted) hover:bg-(--vf-surface-raised) hover:text-foreground",
              )}
              title={`Input: ${inputKindLabel.toLowerCase()} · ${inputLabel}`}
              onClick={() => dispatch({ type: "tab.selected", tab: "source" })}
            >
              {isJsonMode ? (
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
