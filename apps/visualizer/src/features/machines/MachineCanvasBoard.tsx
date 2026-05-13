import { lazy, Suspense, useEffect } from "react";
import { AlertCircle, Layers3, Network, X } from "lucide-react";
import type { MachineCanvasBoardView } from "../../canvas";
import { machineCanvasLegendItems } from "../../canvas/machine-canvas-render-policy";
import type { VisualizerCommand } from "../../workbench";
import { VISUALIZER_TEST_IDS } from "@/test-ids";
import { IconButton, PanelKicker, StatusBadge } from "@/ui/visualizer";

type MachineCanvasBoardProps = {
  view: MachineCanvasBoardView;
  dispatch: (command: VisualizerCommand) => void;
};

const MachineCanvasGraph = lazy(() => import("./MachineCanvasGraph"));

const closeBoard = (dispatch: (command: VisualizerCommand) => void): void => {
  dispatch({ type: "canvas.machine-board.closed" });
};

const machineKindLabel = (kind: Extract<MachineCanvasBoardView, { status: "ready" }>["flow"]["machine"]["kind"]): string => {
  if (kind === "actorTemplate") return "actor";

  return kind;
};

const machineKindTone = (
  kind: Extract<MachineCanvasBoardView, { status: "ready" }>["flow"]["machine"]["kind"],
): "actor" | "domain" | "muted" => {
  if (kind === "actorTemplate") return "actor";
  if (kind === "domain") return "domain";

  return "muted";
};

const currentStateLabel = (currentStateKey: string | undefined): string => currentStateKey ?? "simulation idle";

const BoardCloseButton = ({ dispatch }: { dispatch: (command: VisualizerCommand) => void }) => (
  <IconButton
    type="button"
    aria-label="Close graph"
    title="Close graph"
    data-testid={VISUALIZER_TEST_IDS.canvas.close}
    onClick={() => closeBoard(dispatch)}
  >
    <X aria-hidden="true" />
  </IconButton>
);

const BoardStatus = ({
  title,
  body,
  dispatch,
}: {
  title: string;
  body: string;
  dispatch: (command: VisualizerCommand) => void;
}) => (
  <section
    className="absolute inset-0 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-(--vf-radius-lg) border bg-(--vf-bg) shadow-(--vf-shadow-overlay)"
    data-testid={VISUALIZER_TEST_IDS.canvas.board}
    aria-labelledby="machine-canvas-title"
  >
    <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-(--vf-border-soft) bg-(--vf-surface) px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <AlertCircle aria-hidden="true" className="size-4 shrink-0 text-(--vf-warning)" />
        <div className="min-w-0">
          <PanelKicker>Machine Canvas</PanelKicker>
          <h2 id="machine-canvas-title" className="truncate font-mono text-[13px] font-semibold text-foreground">
            {title}
          </h2>
        </div>
      </div>
      <div className="ml-auto">
        <BoardCloseButton dispatch={dispatch} />
      </div>
    </header>
    <div className="grid min-h-0 place-items-center p-4">
      <p className="max-w-[48ch] text-center font-mono text-[12px] text-(--vf-text-muted)">{body}</p>
    </div>
  </section>
);

const CounterBadge = ({ label, value }: { label: string; value: number }) => (
  <span className="inline-flex h-6 items-center gap-1 rounded-md border border-(--vf-border) bg-(--vf-counter-surface) px-2 font-mono text-[10px] text-(--vf-text-muted)">
    <span className="text-(--vf-text-quiet)">{label}</span>
    <strong className="text-foreground tabular-nums">{value}</strong>
  </span>
);

const MachineCanvasGraphFallback = () => (
  <div
    className="grid min-h-0 place-items-center bg-(--vf-bg-elevated) p-4"
    data-testid={VISUALIZER_TEST_IDS.canvas.graph}
    data-density="pending"
    data-visible-edge-count="0"
  >
    <div
      className="vf-machine-canvas-status"
      data-testid={VISUALIZER_TEST_IDS.canvas.layoutStatus}
      data-layout-status="loading"
    >
      <Layers3 aria-hidden="true" className="size-4 text-(--vf-accent)" />
      <p>Graph renderer loading</p>
    </div>
  </div>
);

const ReadyBoard = ({
  view,
  dispatch,
}: {
  view: Extract<MachineCanvasBoardView, { status: "ready" }>;
  dispatch: (command: VisualizerCommand) => void;
}) => {
  const machine = view.flow.machine;

  return (
    <section
      className="absolute inset-0 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-(--vf-radius-lg) border bg-(--vf-bg) shadow-(--vf-shadow-overlay)"
      data-testid={VISUALIZER_TEST_IDS.canvas.board}
      data-machine-id={machine.machineId}
      data-source-version={view.sourceVersion}
      aria-labelledby="machine-canvas-title"
    >
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-(--vf-border-soft) bg-(--vf-surface) px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Network aria-hidden="true" className="size-4 shrink-0 text-(--vf-accent)" />
          <div className="min-w-0">
            <PanelKicker>Machine Canvas</PanelKicker>
            <h2 id="machine-canvas-title" className="truncate font-mono text-[13px] font-semibold text-foreground">
              {machine.title}
            </h2>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusBadge tone={machineKindTone(machine.kind)}>{machineKindLabel(machine.kind)}</StatusBadge>
          {machine.groupTag ? <StatusBadge tone="routing">tag:{machine.groupTag}</StatusBadge> : null}
          <StatusBadge tone={machine.currentStateKey ? "ready" : "muted"}>
            current {currentStateLabel(machine.currentStateKey)}
          </StatusBadge>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <CounterBadge label="states" value={machine.counters.states} />
          <CounterBadge label="transitions" value={machine.counters.transitions} />
          <CounterBadge label="emissions" value={machine.counters.emissions} />
          <BoardCloseButton dispatch={dispatch} />
        </div>
      </header>

      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-(--vf-bg-elevated)">
        <Suspense fallback={<MachineCanvasGraphFallback />}>
          <MachineCanvasGraph flow={view.flow} sourceVersion={view.sourceVersion} />
        </Suspense>
        <div
          className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1.5 bg-(--vf-surface) px-3 py-2 font-mono text-[10px] text-(--vf-text-quiet)"
          data-testid={VISUALIZER_TEST_IDS.canvas.legend}
        >
          {machineCanvasLegendItems().map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5" title={item.description}>
              <span
                aria-hidden="true"
                className={cnLegendDot(item.strokeDasharray)}
                style={{ background: `var(${item.colorToken})` }}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

const cnLegendDot = (strokeDasharray: string | undefined): string =>
  strokeDasharray ? "size-2 rounded-full border border-current bg-transparent" : "size-2 rounded-[2px]";

export const MachineCanvasBoard = ({ view, dispatch }: MachineCanvasBoardProps) => {
  useEffect(() => {
    if (view.status === "not-opened") return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeBoard(dispatch);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch, view.status]);

  if (view.status === "not-opened") return null;
  if (view.status === "missing-model") {
    return (
      <BoardStatus
        title={view.board.machineId}
        body="Compiled model is not available for this canvas."
        dispatch={dispatch}
      />
    );
  }
  if (view.status === "missing-machine") {
    return (
      <BoardStatus
        title={view.machineId}
        body="This machine is no longer present in the compiled model."
        dispatch={dispatch}
      />
    );
  }

  return <ReadyBoard view={view} dispatch={dispatch} />;
};
