import { AlertCircle, FileCode, Play, RotateCcw, Terminal, X } from "lucide-react";
import type { ConsolePanelView } from "../../console";
import { useWorkbenchContext } from "../../app/workbench-context";
import { useWorkbenchSelector } from "../../app/use-workbench-selector";
import { EventCatalogPanel } from "../events/EventCatalogPanel";
import { MachinesPanel } from "../machines/MachinesPanel";
import { SourceOverlay } from "../source/SourceOverlay";
import { SystemPanel } from "../system/SystemPanel";
import {
  selectActiveTab,
  selectConsolePanel,
  selectEventCatalogPanel,
  selectMachineWorkbenchPanel,
  selectSourceOverlay,
  selectSourcePanel,
  selectSystemPanel,
  selectTabItems,
  type SourcePanelView,
  type VisualizerCommand,
  type VisualizerTab,
} from "../../workbench";
import { Button } from "@/ui/button";
import { Separator } from "@/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { VISUALIZER_TEST_IDS } from "@/test-ids";
import {
  IconButton,
  PaneScrollArea,
  Panel,
  PanelBody,
  PanelHeader,
  PanelKicker,
  PanelTitle,
  SourceEditorShell,
  StatusBadge,
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
  if (status === "blocked") return "blocked";

  return "idle";
};

const SourceWorkspace = ({
  sourcePanel,
  dispatch,
}: {
  sourcePanel: SourcePanelView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <section aria-labelledby="source-pipeline-title" className="flex h-full min-h-0 flex-col gap-2" data-testid={VISUALIZER_TEST_IDS.source.panel}>
    <header className="flex shrink-0 flex-wrap items-center gap-2 px-1">
      <PanelKicker>Source · pasted snippet</PanelKicker>
      <h2 id="source-pipeline-title" className="truncate font-mono text-[12px] font-semibold text-foreground">
        {sourcePanel.filename}
      </h2>
      <div className="ml-auto flex items-center gap-2">
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
        <Button
          type="button"
          size="sm"
          className="bg-primary font-semibold text-primary-foreground hover:bg-[color:var(--vf-accent-strong)]"
          data-testid={VISUALIZER_TEST_IDS.source.open}
          disabled={!sourcePanel.canOpen}
          onClick={() => dispatch({ type: "source.open-visualizer" })}
        >
          <Play data-icon="inline-start" aria-hidden="true" />
          Open visualizer
        </Button>
      </div>
    </header>

    <div className="grid min-h-0 flex-1 gap-2.5 overflow-auto lg:grid-cols-[minmax(0,1fr)_minmax(220px,260px)] lg:overflow-hidden">
      <div className="flex min-h-[420px] min-w-0 flex-col gap-2 lg:min-h-0">
        <SourceEditorShell
          label="Source editor"
          value={sourcePanel.source}
          textareaTestId={VISUALIZER_TEST_IDS.source.editor}
          className="min-h-[420px] flex-1 lg:min-h-0"
          textareaClassName="min-h-[420px] flex-1 lg:min-h-0"
          onValueChange={(source) => dispatch({ type: "source.changed", source })}
        />
        <p className="px-1 text-[11px] text-[color:var(--vf-text-quiet)]">
          paste source → <span className="font-mono text-[color:var(--vf-accent)]">compile</span> → explore. The compiler accepts one or more{" "}
          <code className="rounded-sm bg-[color:var(--vf-surface-soft)] px-1 font-mono text-[10px] text-foreground">createMachine(…)</code> calls per spec.
        </p>
      </div>

      <aside className="flex min-h-fit flex-col gap-2.5 lg:min-h-0">
        <div
          className="grid gap-1.5 rounded-lg border bg-[color:var(--vf-surface-soft)] p-3 font-mono text-[11px] text-[color:var(--vf-text-muted)]"
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
          <div className="mt-1 grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-[color:var(--vf-text-quiet)]">machines</p>
              <p className="mt-0.5 text-base text-foreground">{sourcePanel.machineCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-[color:var(--vf-text-quiet)]">topics</p>
              <p className="mt-0.5 text-base text-foreground">{sourcePanel.topicCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-[color:var(--vf-text-quiet)]">issues</p>
              <p
                className={cn(
                  "mt-0.5 text-base",
                  sourcePanel.diagnosticCount > 0 ? "text-[color:var(--vf-warning)]" : "text-foreground",
                )}
              >
                {sourcePanel.diagnosticCount}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-1.5 rounded-lg border bg-[color:var(--vf-surface-soft)] p-3 font-mono text-[11px]">
          <PanelKicker>Source meta</PanelKicker>
          <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[color:var(--vf-text-muted)]">
            <dt className="text-[color:var(--vf-text-quiet)]">version</dt>
            <dd className="font-mono text-foreground">{sourcePanel.version}</dd>
            <dt className="text-[color:var(--vf-text-quiet)]">hash</dt>
            <dd className="min-w-0 break-all font-mono text-foreground [overflow-wrap:anywhere]">{sourcePanel.hash}</dd>
            <dt className="text-[color:var(--vf-text-quiet)]">compile</dt>
            <dd className="font-mono">{sourcePanel.compileStatus}</dd>
            <dt className="text-[color:var(--vf-text-quiet)]">analyze</dt>
            <dd className="font-mono">{sourcePanel.analysisStatus}</dd>
            <dt className="text-[color:var(--vf-text-quiet)]">model</dt>
            <dd className="font-mono">{sourcePanel.modelStatus}</dd>
          </dl>
        </div>
      </aside>
    </div>
  </section>
);

const ConsoleDrawer = ({
  consolePanel,
  dispatch,
}: {
  consolePanel: ConsolePanelView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <aside
    aria-hidden={!consolePanel.open}
    className={cn("fixed inset-0 z-40 bg-background/65 lg:bg-transparent", !consolePanel.open && "hidden")}
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
        "absolute inset-y-2 right-2 w-[min(calc(100vw-1rem),440px)] bg-card shadow-[0_20px_60px_oklch(0_0_0/0.45)] sm:inset-y-3.5 sm:right-3.5",
        !consolePanel.open && "hidden",
      )}
      data-testid={VISUALIZER_TEST_IDS.console.panel}
    >
      <PanelHeader className="justify-between">
        <PanelTitle eyebrow="Diagnostics" title="Console" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid={VISUALIZER_TEST_IDS.console.close}
          onClick={() => dispatch({ type: "panel.console.toggled", open: false })}
        >
          <X data-icon="inline-start" aria-hidden="true" />
          Close
        </Button>
      </PanelHeader>

      <PanelBody className="flex flex-col">
        <div className="flex flex-wrap gap-1.5 border-b p-2" data-testid={VISUALIZER_TEST_IDS.console.channels}>
          {consolePanel.channels.map((channel) => (
            <Button
              key={channel.channel}
              type="button"
              variant={channel.selected ? "secondary" : "outline"}
              size="sm"
              aria-pressed={channel.selected}
              data-testid={consoleChannelTestId(channel.channel)}
              onClick={() => dispatch({ type: "console.channel.selected", channel: channel.channel })}
            >
              {channel.label}
              <span className="font-mono text-[10px] text-muted-foreground">{channel.count}</span>
            </Button>
          ))}
        </div>

        <PaneScrollArea>
          {consolePanel.entries.length === 0 ? (
            <div
              className="flex min-h-36 items-center justify-center gap-2 p-3 text-sm text-muted-foreground"
              data-testid={VISUALIZER_TEST_IDS.console.entries}
              data-empty="true"
              data-entry-count="0"
            >
              <AlertCircle className="text-[color:var(--vf-text-quiet)]" aria-hidden="true" />
              <p>No console entries in this channel.</p>
            </div>
          ) : (
            <ol
              className="flex flex-col gap-2 p-3"
              data-testid={VISUALIZER_TEST_IDS.console.entries}
              data-empty="false"
              data-entry-count={consolePanel.entries.length}
            >
              {consolePanel.entries.map((entry) => (
                <li key={entry.entryId}>
                  <button
                    type="button"
                    className="w-full rounded-md border bg-background p-2 text-left hover:bg-[color:var(--vf-row-hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    data-testid={VISUALIZER_TEST_IDS.console.entry}
                    data-entry-id={entry.entryId}
                    data-channel={entry.channel}
                    data-severity={entry.severity ?? ""}
                    data-origin={entry.origin ?? ""}
                    onClick={() => dispatch({ type: "console.entry.selected", entryId: entry.entryId })}
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <StatusBadge tone={entry.channel === "diagnostics" ? "diagnostic" : "muted"}>{entry.channel}</StatusBadge>
                      {entry.severity ? <StatusBadge tone={statusTone(entry.severity)}>{entry.severity}</StatusBadge> : null}
                      {entry.origin ? (
                        <span className="font-mono text-[10px] text-[color:var(--vf-text-quiet)]">{entry.origin}</span>
                      ) : null}
                      {entry.locationLabel ? (
                        <span className="font-mono text-[10px] text-[color:var(--vf-text-quiet)]">{entry.locationLabel}</span>
                      ) : null}
                    </span>
                    <strong className="mt-1 block min-w-0 font-mono text-[11px] text-foreground [overflow-wrap:anywhere]">
                      {entry.title}
                    </strong>
                    <span className="mt-1 block min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                      {entry.message}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </PaneScrollArea>

        <Separator />

        <div className="p-3 font-mono text-[11px] text-[color:var(--vf-text-quiet)]">
          {consolePanel.totalEntries} entries · filter {consolePanel.selectedChannel}
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
  const systemPanel = useWorkbenchSelector(selectSystemPanel);
  const eventCatalogPanel = useWorkbenchSelector(selectEventCatalogPanel);
  const machineWorkbenchPanel = useWorkbenchSelector(selectMachineWorkbenchPanel);
  const sourceOverlay = useWorkbenchSelector(selectSourceOverlay);

  const compileLabel = compileStatusLabel(sourcePanel.compileStatus);
  const compileTone = statusTone(sourcePanel.compileStatus);

  return (
    <main
      className="dark min-h-screen min-w-80 bg-background text-foreground"
      data-testid={VISUALIZER_TEST_IDS.shell.root}
    >
      <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <header
          className="flex min-h-12 flex-col gap-2 border-b bg-[color:var(--vf-surface)] px-4 py-2 lg:flex-row lg:items-center lg:gap-4"
          data-testid={VISUALIZER_TEST_IDS.shell.topbar}
        >
          <div className="flex min-w-0 shrink-0 items-center gap-2.5">
            <span
              className="grid size-6 shrink-0 place-items-center rounded-[5px] border border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)] font-mono text-[11px] font-bold text-[color:var(--vf-accent)]"
              aria-hidden="true"
            >
              lf
            </span>
            <div className="flex min-w-0 items-baseline gap-1.5 font-mono text-[12px] text-[color:var(--vf-text-muted)]">
              <span className="truncate">lite-fsm visualizer</span>
              <span className="text-[color:var(--vf-text-quiet)]">·</span>
              <h1 className="inline truncate font-semibold text-foreground">stage 12e</h1>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => dispatch({ type: "tab.selected", tab: value as VisualizerTab })}
            className="min-w-0"
          >
            <TabsList
              className="w-full max-w-full gap-0.5 overflow-x-auto rounded-lg border bg-[color:var(--vf-surface-soft)] p-[3px] lg:w-fit"
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
                  className="min-w-fit gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium text-[color:var(--vf-text-muted)] transition-colors hover:bg-[oklch(1_0_0/0.06)] hover:text-foreground data-active:font-semibold data-active:shadow-[0_1px_4px_oklch(0_0_0/0.4)] dark:data-active:bg-[color:var(--vf-accent-border)] dark:data-active:text-foreground dark:data-active:border-transparent"
                >
                  <span>{tab.label}</span>
                  {tab.count ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 font-mono text-[10px]",
                        activeTab === tab.tab
                          ? "bg-[oklch(0_0_0/0.25)] text-foreground"
                          : "bg-[color:var(--vf-counter-surface)] text-[color:var(--vf-text-quiet)]",
                      )}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                  {tab.diagnosticCount > 0 ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 font-mono text-[10px]",
                        tab.hasError
                          ? "bg-[color:var(--vf-danger-soft)] text-[color:var(--vf-danger)]"
                          : "bg-[color:var(--vf-warning-soft)] text-[color:var(--vf-warning)]",
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

          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-[color:var(--vf-surface-soft)] px-2 py-1 font-mono text-[11px] text-[color:var(--vf-text-muted)]">
              <FileCode aria-hidden="true" className="size-3.5 text-[color:var(--vf-text-quiet)]" />
              {sourcePanel.filename}
            </span>
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-[color:var(--vf-surface-soft)] px-2 py-1 font-mono text-[11px] text-[color:var(--vf-text-muted)]"
              data-testid={VISUALIZER_TEST_IDS.source.status}
              data-status={sourcePanel.modelStatus}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  compileTone === "ready"
                    ? "bg-[color:var(--vf-accent)]"
                    : compileTone === "diagnostic"
                      ? "bg-[color:var(--vf-danger)]"
                      : "bg-[color:var(--vf-text-quiet)]",
                )}
              />
              <span className={cn(compileTone === "diagnostic" && "text-[color:var(--vf-danger)]", compileTone === "ready" && "text-[color:var(--vf-accent)]")}>
                {compileLabel}
              </span>
              {sourcePanel.diagnosticCount > 0 ? (
                <>
                  <span className="text-[color:var(--vf-border)]">·</span>
                  <span className="text-[color:var(--vf-warning)]">{sourcePanel.diagnosticCount} {sourcePanel.diagnosticCount === 1 ? "issue" : "issues"}</span>
                </>
              ) : null}
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={consolePanel.open}
              data-testid={VISUALIZER_TEST_IDS.console.toggle}
              onClick={() => dispatch({ type: "panel.console.toggled" })}
            >
              <Terminal data-icon="inline-start" aria-hidden="true" />
              Console
            </Button>
          </div>
        </header>

        <section
          className="min-h-0 p-2.5 sm:p-3"
          data-active-tab={activeTab}
          data-testid={VISUALIZER_TEST_IDS.shell.workspace}
        >
          {activeTab === "source" ? (
            <SourceWorkspace sourcePanel={sourcePanel} dispatch={dispatch} />
          ) : activeTab === "system" ? (
            <SystemPanel view={systemPanel} dispatch={dispatch} />
          ) : activeTab === "events" ? (
            <EventCatalogPanel view={eventCatalogPanel} dispatch={dispatch} />
          ) : (
            <MachinesPanel view={machineWorkbenchPanel} dispatch={dispatch} />
          )}
        </section>
      </div>
      <ConsoleDrawer consolePanel={consolePanel} dispatch={dispatch} />
      <SourceOverlay view={sourceOverlay} onClose={() => dispatch({ type: "source.overlay.closed" })} />
    </main>
  );
};
