import {
  Activity,
  Braces,
  FileCode,
  FileText,
  Radio,
  RefreshCw,
  Search,
  Send,
  Terminal,
  X,
} from "lucide-react";
import { useWorkbenchContext } from "../../app/workbench-context";
import { useWorkbenchSelector } from "../../app/use-workbench-selector";
import {
  selectActiveTab,
  selectConsolePanel,
  selectCurrentEmptyPanel,
  selectTabItems,
  type VisualizerTab,
} from "../../workbench";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { ScrollArea } from "@/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Separator } from "@/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import {
  DiagnosticsAlert,
  GraphRow,
  IconButton,
  LayerBadge,
  PaneScrollArea,
  Panel,
  PanelBody,
  PanelHeader,
  PanelKicker,
  SourceEditorShell,
  SourceSnippet,
  StatusBadge,
  type SourceLine,
} from "@/ui/visualizer";

const STYLE_FIXTURE_ROWS = [
  {
    layer: "config",
    event: "AUTH_RESPONSE",
    target: "LOGGED_IN | LOGGED_OUT",
    meta: "2 reducer branches",
  },
  {
    layer: "effect",
    event: "TRACK_LOAD",
    target: "actor:track",
    meta: "routing actor",
  },
  {
    layer: "simulation",
    event: "QUEUE_EMPTY",
    target: "STOPPED",
    meta: "available now",
  },
] as const;

const SOURCE_LINES: readonly SourceLine[] = [
  { line: 12, code: 'AUTHENTICATING: { AUTH_RESPONSE: "LOGGED_IN" }' },
  { line: 13, code: 'if (action.payload.reason === "network_error") state.state = "LOGGED_OUT";', selected: true },
  { line: 14, code: 'transition({ type: "TRACK_LOAD", meta: { actorId: trackId } });' },
];

const SOURCE_FIXTURE = SOURCE_LINES.map((line) => `${line.line.toString().padStart(2, " ")}  ${line.code}`).join("\n");

const LONG_EVENT_LABEL = "PLAYER_TRACK_BUFFERING_PROGRESS_REPORTED_FROM_ACTOR_TEMPLATE_INSTANCE";

export const Shell = () => {
  const { dispatch } = useWorkbenchContext();
  const activeTab = useWorkbenchSelector(selectActiveTab);
  const tabs = useWorkbenchSelector(selectTabItems);
  const emptyPanel = useWorkbenchSelector(selectCurrentEmptyPanel);
  const consolePanel = useWorkbenchSelector(selectConsolePanel);

  return (
    <main className="dark min-h-screen min-w-80 bg-background p-2 text-foreground sm:p-3.5">
      <div className="grid min-h-[calc(100vh-16px)] grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 sm:min-h-[calc(100vh-28px)]">
        <header className="flex min-h-12 flex-col gap-3 rounded-lg border bg-card px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-md border border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)] font-mono text-[11px] font-bold text-primary"
              aria-hidden="true"
            >
              lf
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase text-[color:var(--vf-text-quiet)]">lite-fsm visualizer</p>
              <h1 className="truncate text-base font-semibold leading-tight">Stage 12b shadcn foundation</h1>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge tone="muted">
              <FileCode className="size-3.5" aria-hidden="true" />
              sample.ts
            </StatusBadge>
            <StatusBadge tone="ready">
              <Activity className="size-3.5" aria-hidden="true" />
              shadcn ready
            </StatusBadge>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={consolePanel.open}
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
          <TabsList className="w-full max-w-full justify-start overflow-x-auto border bg-[color:var(--vf-surface-soft)]">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.tab}
                value={tab.tab}
                className="min-w-fit px-3 data-active:bg-[color:var(--vf-surface-raised)]"
              >
                <span>{tab.label}</span>
                {tab.count ? (
                  <span className="rounded-full bg-[color:oklch(0.925_0.012_248/0.08)] px-1.5 font-mono text-[10px] text-[color:var(--vf-text-quiet)]">
                    {tab.count}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <section
          className={[
            "grid min-h-0 gap-2.5",
            consolePanel.open
              ? "lg:grid-cols-[minmax(280px,0.95fr)_minmax(340px,1.2fr)] xl:grid-cols-[minmax(280px,0.95fr)_minmax(340px,1.2fr)_minmax(280px,360px)]"
              : "lg:grid-cols-[minmax(280px,0.95fr)_minmax(340px,1.25fr)]",
          ].join(" ")}
          data-active-tab={activeTab}
        >
          <Panel aria-labelledby="source-fixture-title">
            <PanelHeader>
              <div className="min-w-0">
                <PanelKicker>Source</PanelKicker>
                <h2 id="source-fixture-title" className="truncate text-xs font-semibold">
                  {emptyPanel.title}
                </h2>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="hidden min-w-44 items-center gap-1.5 rounded-md border bg-background px-2 md:flex">
                  <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <Input
                    aria-label="Search source anchors"
                    readOnly
                    value="AUTH_RESPONSE"
                    className="h-7 border-0 bg-transparent px-0 font-mono text-[11px] shadow-none dark:bg-transparent focus-visible:ring-0"
                  />
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton aria-label="Reset source fixture">
                      <RefreshCw aria-hidden="true" />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>Reset source fixture</TooltipContent>
                </Tooltip>
              </div>
            </PanelHeader>

            <PaneScrollArea>
              <div className="flex min-h-full flex-col gap-3 p-3">
                <SourceEditorShell label="Source draft fixture" value={SOURCE_FIXTURE}>
                  <SourceSnippet lines={SOURCE_LINES} />
                </SourceEditorShell>
                <p className="max-w-[66ch] text-sm text-muted-foreground">{emptyPanel.body}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm">
                    <FileText data-icon="inline-start" aria-hidden="true" />
                    Open visualizer
                  </Button>
                  <StatusBadge tone="muted">static fixture</StatusBadge>
                </div>
              </div>
            </PaneScrollArea>
          </Panel>

          <Panel aria-labelledby="workbench-fixture-title">
            <PanelHeader>
              <div className="min-w-0">
                <PanelKicker>{activeTab}</PanelKicker>
                <h2 id="workbench-fixture-title" className="truncate text-xs font-semibold">
                  Machine card grammar
                </h2>
              </div>
              <StatusBadge tone="actor">actor</StatusBadge>
              <StatusBadge tone="routing">@ BUFFERING</StatusBadge>
            </PanelHeader>

            <PaneScrollArea>
              <div className="flex min-h-full flex-col gap-3 p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <div className="flex items-center gap-1.5 rounded-md border bg-background px-2">
                    <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <Input
                      aria-label="Search event labels"
                      readOnly
                      value={LONG_EVENT_LABEL}
                      className="h-8 min-w-0 border-0 bg-transparent px-0 font-mono text-[11px] shadow-none [overflow-wrap:anywhere] dark:bg-transparent focus-visible:ring-0"
                    />
                  </div>
                  <Select value="manual">
                    <SelectTrigger aria-label="Select timeline source" className="w-full bg-background">
                      <SelectValue placeholder="Event source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="manual">manual cascade</SelectItem>
                        <SelectItem value="external">external event</SelectItem>
                        <SelectItem value="effect">effect emission</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <Card aria-label="Representative machine card" className="overflow-hidden rounded-lg border-[color:var(--vf-accent-border)] bg-[color:var(--vf-surface-soft)] py-0 shadow-none">
                  <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-[color:var(--vf-border-soft)] px-3 py-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] font-bold uppercase text-[color:var(--vf-text-quiet)]">trackInstance</p>
                      <CardTitle className="truncate text-sm">Grouped state rows</CardTitle>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <IconButton aria-label="View source for trackInstance">
                          <FileText aria-hidden="true" />
                        </IconButton>
                      </TooltipTrigger>
                      <TooltipContent>View source for trackInstance</TooltipContent>
                    </Tooltip>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-3 p-3">
                    <section
                      className="overflow-hidden rounded-md border border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)]"
                      aria-label="Current state rows"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[color:var(--vf-border-soft)] px-2.5 py-2 font-mono">
                        <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                        <strong className="min-w-0 [overflow-wrap:anywhere]">BUFFERING</strong>
                        <StatusBadge tone="muted">current</StatusBadge>
                        <StatusBadge tone="routing">routing actor</StatusBadge>
                      </div>

                      <div className="grid">
                        {STYLE_FIXTURE_ROWS.map((row) => (
                          <GraphRow
                            key={`${row.layer}-${row.event}`}
                            layer={row.layer}
                            event={row.event}
                            target={row.target}
                            meta={row.meta}
                            selected={row.layer === "simulation"}
                          />
                        ))}
                      </div>
                    </section>

                    <div className="flex items-start gap-2 rounded-md border border-[color:var(--vf-border-soft)] bg-background p-2 font-mono text-[11px] text-muted-foreground">
                      <Braces className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{LONG_EVENT_LABEL}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <LayerBadge layer="config" />
                      <LayerBadge layer="effect" />
                      <LayerBadge layer="simulation" />
                      <StatusBadge tone="diagnostic">diagnostic</StatusBadge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </PaneScrollArea>
          </Panel>

          <Panel
            rail
            role="region"
            aria-label="Visualizer console"
            className={consolePanel.open ? "" : "hidden"}
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
                onClick={() => dispatch({ type: "panel.console.toggled", open: false })}
              >
                <X data-icon="inline-start" aria-hidden="true" />
                Close
              </Button>
            </PanelHeader>

            <PanelBody className="flex flex-col">
              <ScrollArea className="min-h-0 flex-1">
                {consolePanel.entries.length === 0 ? (
                  <div className="flex flex-col gap-2 p-3" aria-label="Representative console entries">
                    <DiagnosticsAlert>Reducer branch is visible as a diagnostic badge.</DiagnosticsAlert>
                    <Alert className="border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)]">
                      <Radio className="size-4 text-primary" aria-hidden="true" />
                      <AlertTitle className="font-mono text-[11px] text-primary">simulator</AlertTitle>
                      <AlertDescription>Manual cascade waits for an explicit row click.</AlertDescription>
                    </Alert>
                  </div>
                ) : (
                  <ol className="flex flex-col gap-2 p-3">
                    {consolePanel.entries.map((entry) => (
                      <li key={entry.entryId} className="rounded-md border bg-background p-2">
                        {entry.message}
                      </li>
                    ))}
                  </ol>
                )}
              </ScrollArea>

              <Separator />

              <div className="m-3 overflow-hidden rounded-md border bg-[color:var(--vf-surface-soft)]" aria-label="Representative timeline">
                <div className="flex items-center justify-between gap-2 border-b px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
                  <span>Event timeline</span>
                  <Button type="button" variant="secondary" size="sm">
                    <Send data-icon="inline-start" aria-hidden="true" />
                    send
                  </Button>
                </div>
                <button
                  className="grid min-h-10 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 text-left hover:bg-[color:var(--vf-accent-soft)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  type="button"
                >
                  <span className="font-mono text-[10px] font-bold uppercase text-[color:var(--vf-text-quiet)]">#1</span>
                  <span className="min-w-0 font-mono text-[11px] text-foreground [overflow-wrap:anywhere]">TRACK_LOAD</span>
                  <span className="min-w-0 text-right font-mono text-[10px] text-[color:var(--vf-warning)] [overflow-wrap:anywhere]">
                    manual · player
                  </span>
                </button>
              </div>
            </PanelBody>
          </Panel>
        </section>
      </div>
    </main>
  );
};
