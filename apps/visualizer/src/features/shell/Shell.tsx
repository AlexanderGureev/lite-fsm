import { Activity, AlertCircle, FileCode, FileText, RefreshCw, Terminal, X } from "lucide-react";
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
  selectCurrentEmptyPanel,
  selectEventCatalogPanel,
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

const SourceWorkspace = ({
  sourcePanel,
  dispatch,
}: {
  sourcePanel: SourcePanelView;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <Panel aria-labelledby="source-pipeline-title" className="h-full" data-testid={VISUALIZER_TEST_IDS.source.panel}>
    <PanelHeader>
      <div className="min-w-0">
        <PanelKicker>Source</PanelKicker>
        <h2 id="source-pipeline-title" className="truncate text-xs font-semibold">
          {sourcePanel.filename}
        </h2>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <StatusBadge tone={statusTone(sourcePanel.compileStatus)}>compile {sourcePanel.compileStatus}</StatusBadge>
        <StatusBadge tone={statusTone(sourcePanel.validationStatus)}>validation {sourcePanel.validationStatus}</StatusBadge>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              aria-label="Reset source to sample"
              data-testid={VISUALIZER_TEST_IDS.source.reset}
              onClick={() => dispatch({ type: "source.reset-to-sample" })}
            >
              <RefreshCw aria-hidden="true" />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>Reset to sample</TooltipContent>
        </Tooltip>
      </div>
    </PanelHeader>

    <PanelBody className="grid min-h-0 gap-2.5 overflow-auto p-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:overflow-hidden">
      <SourceEditorShell
        label="Source editor"
        value={sourcePanel.source}
        textareaTestId={VISUALIZER_TEST_IDS.source.editor}
        className="min-h-[420px] lg:min-h-0"
        textareaClassName="min-h-[420px] lg:min-h-0 lg:flex-1"
        onValueChange={(source) => dispatch({ type: "source.changed", source })}
      />

      <aside className="flex min-h-fit flex-col gap-3 rounded-md border bg-[color:var(--vf-surface-soft)] p-3 lg:min-h-0">
        <div
          className="grid gap-2 rounded-md border bg-background p-2.5 font-mono text-[11px] text-muted-foreground"
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
          <span>version {sourcePanel.version}</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">hash {sourcePanel.hash}</span>
          <span>compile {sourcePanel.compileStatus}</span>
          <span>analyze {sourcePanel.analysisStatus}</span>
          <span>model {sourcePanel.modelStatus}</span>
          <span>diagnostics {sourcePanel.diagnosticCount}</span>
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="justify-start"
          data-testid={VISUALIZER_TEST_IDS.source.open}
          disabled={!sourcePanel.canOpen}
          onClick={() => dispatch({ type: "source.open-visualizer" })}
        >
          <FileText data-icon="inline-start" aria-hidden="true" />
          Open visualizer
        </Button>

        <div className="grid gap-2 rounded-md border bg-background p-2.5">
          <PanelKicker>Projection</PanelKicker>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="font-mono text-[10px] text-[color:var(--vf-text-quiet)]">Machines</p>
              <p className="mt-1 font-mono text-lg text-foreground">{sourcePanel.machineCount}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-[color:var(--vf-text-quiet)]">Topics</p>
              <p className="mt-1 font-mono text-lg text-foreground">{sourcePanel.topicCount}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-[color:var(--vf-text-quiet)]">Issues</p>
              <p className="mt-1 font-mono text-lg text-foreground">{sourcePanel.diagnosticCount}</p>
            </div>
          </div>
        </div>
      </aside>
    </PanelBody>
  </Panel>
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
        <div className="min-w-0">
          <PanelKicker>Diagnostics</PanelKicker>
          <h2 className="truncate text-xs font-semibold">Console</h2>
        </div>
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
              className="flex min-h-36 flex-col items-start justify-center gap-2 p-3 text-sm text-muted-foreground"
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
  const emptyPanel = useWorkbenchSelector(selectCurrentEmptyPanel);
  const consolePanel = useWorkbenchSelector(selectConsolePanel);
  const sourcePanel = useWorkbenchSelector(selectSourcePanel);
  const systemPanel = useWorkbenchSelector(selectSystemPanel);
  const eventCatalogPanel = useWorkbenchSelector(selectEventCatalogPanel);
  const sourceOverlay = useWorkbenchSelector(selectSourceOverlay);

  return (
    <main
      className="dark min-h-screen min-w-80 bg-background text-foreground"
      data-testid={VISUALIZER_TEST_IDS.shell.root}
    >
      <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <header
          className="flex min-h-14 flex-col gap-2 border-b bg-card px-3 py-2 lg:flex-row lg:items-center"
          data-testid={VISUALIZER_TEST_IDS.shell.topbar}
        >
          <div className="flex min-w-0 shrink-0 items-center gap-2.5">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-md border border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)] font-mono text-[11px] font-bold text-primary"
              aria-hidden="true"
            >
              lf
            </span>
            <div className="min-w-0 truncate font-mono text-[12px] text-muted-foreground">
              <span>lite-fsm visualizer</span> <span className="text-[color:var(--vf-text-quiet)]">·</span>{" "}
              <h1 className="inline truncate font-semibold text-foreground">Stage 12d read-only graph views</h1>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => dispatch({ type: "tab.selected", tab: value as VisualizerTab })}
            className="min-w-0 lg:flex-1"
          >
            <TabsList
              className="w-full max-w-full justify-start overflow-x-auto border bg-[color:var(--vf-surface-soft)] lg:w-fit"
              data-testid={VISUALIZER_TEST_IDS.tabs.root}
            >
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.tab}
                  value={tab.tab}
                  data-tab={tab.tab}
                  data-count={tab.count}
                  data-testid={VISUALIZER_TEST_IDS.tabs.trigger[tab.tab]}
                  className="min-w-fit px-3 data-active:bg-[color:var(--vf-surface-raised)]"
                >
                  <span>{tab.label}</span>
                  {tab.count ? (
                    <span className="rounded-full bg-[color:var(--vf-counter-surface)] px-1.5 font-mono text-[10px] text-[color:var(--vf-text-quiet)]">
                      {tab.count}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
            <StatusBadge tone="muted">
              <FileCode data-icon="inline-start" aria-hidden="true" />
              {sourcePanel.filename}
            </StatusBadge>
            <StatusBadge
              tone={statusTone(sourcePanel.modelStatus)}
              data-testid={VISUALIZER_TEST_IDS.source.status}
              data-status={sourcePanel.modelStatus}
            >
              <span className="sr-only">model status</span>
              <Activity data-icon="inline-start" aria-hidden="true" />
              model {sourcePanel.modelStatus}
            </StatusBadge>
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
          className="min-h-0 p-2.5 sm:p-3.5"
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
            <MachinesPanel view={emptyPanel} sourcePanel={sourcePanel} />
          )}
        </section>
      </div>
      <ConsoleDrawer consolePanel={consolePanel} dispatch={dispatch} />
      <SourceOverlay view={sourceOverlay} onClose={() => dispatch({ type: "source.overlay.closed" })} />
    </main>
  );
};
