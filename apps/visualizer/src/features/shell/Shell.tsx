import { Activity, AlertCircle, FileCode, FileText, RefreshCw, Terminal, X } from "lucide-react";
import { useWorkbenchContext } from "../../app/workbench-context";
import { useWorkbenchSelector } from "../../app/use-workbench-selector";
import {
  selectActiveTab,
  selectConsolePanel,
  selectCurrentEmptyPanel,
  selectSourcePanel,
  selectTabItems,
  type VisualizerTab,
} from "../../workbench";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
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

export const Shell = () => {
  const { dispatch } = useWorkbenchContext();
  const activeTab = useWorkbenchSelector(selectActiveTab);
  const tabs = useWorkbenchSelector(selectTabItems);
  const emptyPanel = useWorkbenchSelector(selectCurrentEmptyPanel);
  const consolePanel = useWorkbenchSelector(selectConsolePanel);
  const sourcePanel = useWorkbenchSelector(selectSourcePanel);

  return (
    <main
      className="dark min-h-screen min-w-80 bg-background p-2 text-foreground sm:p-3.5"
      data-testid={VISUALIZER_TEST_IDS.shell.root}
    >
      <div className="grid min-h-[calc(100vh-16px)] grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 sm:min-h-[calc(100vh-28px)]">
        <header
          className="flex min-h-12 flex-col gap-3 rounded-lg border bg-card px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
          data-testid={VISUALIZER_TEST_IDS.shell.topbar}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-md border border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)] font-mono text-[11px] font-bold text-primary"
              aria-hidden="true"
            >
              lf
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase text-[color:var(--vf-text-quiet)]">lite-fsm visualizer</p>
              <h1 className="truncate text-base font-semibold leading-tight">Stage 12c source pipeline</h1>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge tone="muted">
              <FileCode data-icon="inline-start" aria-hidden="true" />
              {sourcePanel.filename}
            </StatusBadge>
            <StatusBadge tone={statusTone(sourcePanel.modelStatus)} data-testid={VISUALIZER_TEST_IDS.source.status}>
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

        <Tabs
          value={activeTab}
          onValueChange={(value) => dispatch({ type: "tab.selected", tab: value as VisualizerTab })}
          className="min-w-0"
        >
          <TabsList
            className="w-full max-w-full justify-start overflow-x-auto border bg-[color:var(--vf-surface-soft)]"
            data-testid={VISUALIZER_TEST_IDS.tabs.root}
          >
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.tab}
                value={tab.tab}
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

        <section
          className={cn(
            "grid min-h-0 gap-2.5",
            consolePanel.open
              ? "lg:grid-cols-[minmax(280px,0.9fr)_minmax(340px,1.15fr)] xl:grid-cols-[minmax(300px,0.9fr)_minmax(360px,1.1fr)_minmax(300px,380px)]"
              : "lg:grid-cols-[minmax(300px,0.9fr)_minmax(360px,1.2fr)]",
          )}
          data-active-tab={activeTab}
          data-testid={VISUALIZER_TEST_IDS.shell.workspace}
        >
          <Panel aria-labelledby="source-pipeline-title" data-testid={VISUALIZER_TEST_IDS.source.panel}>
            <PanelHeader>
              <div className="min-w-0">
                <PanelKicker>Source</PanelKicker>
                <h2 id="source-pipeline-title" className="truncate text-xs font-semibold">
                  {sourcePanel.filename}
                </h2>
              </div>
              <div className="ml-auto flex items-center gap-2">
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

            <PaneScrollArea>
              <div className="flex min-h-full flex-col gap-3 p-3">
                <SourceEditorShell
                  label="Source editor"
                  value={sourcePanel.source}
                  textareaTestId={VISUALIZER_TEST_IDS.source.editor}
                  onChange={(event) => dispatch({ type: "source.changed", source: event.currentTarget.value })}
                />

                <div
                  className="grid gap-2 rounded-md border bg-background p-2.5 font-mono text-[11px] text-muted-foreground sm:grid-cols-2"
                  data-testid={VISUALIZER_TEST_IDS.source.summary}
                >
                  <span>version {sourcePanel.version}</span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">hash {sourcePanel.hash}</span>
                  <span>compile {sourcePanel.compileStatus}</span>
                  <span>analyze {sourcePanel.analysisStatus}</span>
                  <span>model {sourcePanel.modelStatus}</span>
                  <span>diagnostics {sourcePanel.diagnosticCount}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid={VISUALIZER_TEST_IDS.source.open}
                    disabled={!sourcePanel.canOpen}
                    onClick={() => dispatch({ type: "source.open-visualizer" })}
                  >
                    <FileText data-icon="inline-start" aria-hidden="true" />
                    Open visualizer
                  </Button>
                  <StatusBadge tone={statusTone(sourcePanel.compileStatus)}>compile {sourcePanel.compileStatus}</StatusBadge>
                  <StatusBadge tone={statusTone(sourcePanel.validationStatus)}>validation {sourcePanel.validationStatus}</StatusBadge>
                </div>
              </div>
            </PaneScrollArea>
          </Panel>

          <Panel aria-labelledby="workbench-status-title" data-testid={VISUALIZER_TEST_IDS.workbench.panel}>
            <PanelHeader>
              <div className="min-w-0">
                <PanelKicker>{activeTab}</PanelKicker>
                <h2 id="workbench-status-title" className="truncate text-xs font-semibold">
                  {emptyPanel.title}
                </h2>
              </div>
              <StatusBadge tone={statusTone(emptyPanel.status)}>{emptyPanel.status}</StatusBadge>
            </PanelHeader>

            <PaneScrollArea>
              <div className="flex min-h-full flex-col gap-3 p-3">
                <Alert className="border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)]">
                  <Activity className="text-primary" aria-hidden="true" />
                  <AlertTitle className="font-mono text-[11px] text-primary">source pipeline</AlertTitle>
                  <AlertDescription className="text-muted-foreground">{emptyPanel.body}</AlertDescription>
                </Alert>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border bg-background p-3">
                    <p className="font-mono text-[10px] font-bold uppercase text-[color:var(--vf-text-quiet)]">Machines</p>
                    <p className="mt-1 font-mono text-lg text-foreground">{sourcePanel.machineCount}</p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <p className="font-mono text-[10px] font-bold uppercase text-[color:var(--vf-text-quiet)]">Topics</p>
                    <p className="mt-1 font-mono text-lg text-foreground">{sourcePanel.topicCount}</p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <p className="font-mono text-[10px] font-bold uppercase text-[color:var(--vf-text-quiet)]">Diagnostics</p>
                    <p className="mt-1 font-mono text-lg text-foreground">{sourcePanel.diagnosticCount}</p>
                  </div>
                </div>
              </div>
            </PaneScrollArea>
          </Panel>

          <Panel
            rail
            role="region"
            aria-label="Visualizer console"
            className={consolePanel.open ? "" : "hidden"}
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
                  >
                    <AlertCircle className="text-[color:var(--vf-text-quiet)]" aria-hidden="true" />
                    <p>No console entries in this channel.</p>
                  </div>
                ) : (
                  <ol className="flex flex-col gap-2 p-3" data-testid={VISUALIZER_TEST_IDS.console.entries}>
                    {consolePanel.entries.map((entry) => (
                      <li key={entry.entryId}>
                        <button
                          type="button"
                          className="w-full rounded-md border bg-background p-2 text-left hover:bg-[color:var(--vf-row-hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          onClick={() => dispatch({ type: "console.entry.selected", entryId: entry.entryId })}
                        >
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            <StatusBadge tone={entry.channel === "diagnostics" ? "diagnostic" : "muted"}>{entry.channel}</StatusBadge>
                            {entry.severity ? <StatusBadge tone={statusTone(entry.severity)}>{entry.severity}</StatusBadge> : null}
                            {entry.origin ? <span className="font-mono text-[10px] text-[color:var(--vf-text-quiet)]">{entry.origin}</span> : null}
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
        </section>
      </div>
    </main>
  );
};
