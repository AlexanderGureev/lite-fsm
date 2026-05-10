import { Activity } from "lucide-react";
import type { EmptyPanelView, SourcePanelView } from "../../workbench";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { PaneScrollArea, Panel, PanelHeader, PanelKicker, StatusBadge } from "@/ui/visualizer";
import { VISUALIZER_TEST_IDS } from "@/test-ids";

const statusTone = (status: string): "ready" | "muted" | "diagnostic" => {
  if (status === "ready") return "ready";
  if (status === "failed" || status === "blocked") return "diagnostic";

  return "muted";
};

export const MachinesPanel = ({
  view,
  sourcePanel,
}: {
  view: EmptyPanelView;
  sourcePanel: Pick<SourcePanelView, "machineCount" | "topicCount" | "diagnosticCount">;
}) => (
  <Panel aria-labelledby="machine-workbench-status-title" className="h-full" data-testid={VISUALIZER_TEST_IDS.workbench.panel}>
    <PanelHeader>
      <div className="min-w-0">
        <PanelKicker>machines</PanelKicker>
        <h2 id="machine-workbench-status-title" className="truncate text-xs font-semibold">
          {view.title}
        </h2>
      </div>
      <StatusBadge tone={statusTone(view.status)} data-testid={VISUALIZER_TEST_IDS.workbench.status} data-status={view.status}>
        {view.status}
      </StatusBadge>
    </PanelHeader>

    <PaneScrollArea>
      <div className="flex min-h-full flex-col gap-3 p-3">
        <Alert
          className="border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)]"
          data-testid={VISUALIZER_TEST_IDS.workbench.notice}
          data-status={view.status}
        >
          <Activity className="text-primary" aria-hidden="true" />
          <AlertTitle className="font-mono text-[11px] text-primary">source pipeline</AlertTitle>
          <AlertDescription className="text-muted-foreground">{view.body}</AlertDescription>
        </Alert>

        <div className="grid gap-2 sm:grid-cols-3">
          <div
            className="rounded-md border bg-background p-3"
            data-testid={VISUALIZER_TEST_IDS.workbench.metricMachines}
            data-value={sourcePanel.machineCount}
          >
            <p className="font-mono text-[10px] font-bold uppercase text-[color:var(--vf-text-quiet)]">Machines</p>
            <p className="mt-1 font-mono text-lg text-foreground">{sourcePanel.machineCount}</p>
          </div>
          <div
            className="rounded-md border bg-background p-3"
            data-testid={VISUALIZER_TEST_IDS.workbench.metricTopics}
            data-value={sourcePanel.topicCount}
          >
            <p className="font-mono text-[10px] font-bold uppercase text-[color:var(--vf-text-quiet)]">Topics</p>
            <p className="mt-1 font-mono text-lg text-foreground">{sourcePanel.topicCount}</p>
          </div>
          <div
            className="rounded-md border bg-background p-3"
            data-testid={VISUALIZER_TEST_IDS.workbench.metricDiagnostics}
            data-value={sourcePanel.diagnosticCount}
          >
            <p className="font-mono text-[10px] font-bold uppercase text-[color:var(--vf-text-quiet)]">Diagnostics</p>
            <p className="mt-1 font-mono text-lg text-foreground">{sourcePanel.diagnosticCount}</p>
          </div>
        </div>
      </div>
    </PaneScrollArea>
  </Panel>
);
