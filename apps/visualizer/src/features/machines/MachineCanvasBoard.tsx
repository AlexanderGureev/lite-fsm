import { useEffect } from "react";
import { AlertCircle, Layers3, Network, X } from "lucide-react";
import type { MachineCanvasBoardView } from "../../canvas";
import type { VisualizerCommand } from "../../workbench";
import { VISUALIZER_TEST_IDS } from "@/test-ids";
import { IconButton, PanelKicker, StatusBadge } from "@/ui/visualizer";

type MachineCanvasBoardProps = {
  view: MachineCanvasBoardView;
  dispatch: (command: VisualizerCommand) => void;
};

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
        <div
          className="grid min-h-0 place-items-center overflow-hidden border-b border-(--vf-border-soft) bg-[radial-gradient(circle_at_1px_1px,var(--vf-border)_1px,transparent_0)] bg-[length:22px_22px] p-4"
          data-testid={VISUALIZER_TEST_IDS.canvas.graph}
          data-node-count={view.flow.nodes.length}
          data-edge-count={view.flow.edgeGroups.length}
        >
          <div className="flex max-w-[460px] flex-col items-center gap-2 rounded-(--vf-radius-lg) border border-(--vf-border) bg-(--vf-surface) p-4 text-center shadow-(--vf-shadow-overlay)">
            <Layers3 aria-hidden="true" className="size-5 text-(--vf-accent)" />
            <p className="font-mono text-[12px] font-semibold text-foreground">Graph renderer loading</p>
            <p className="font-mono text-[11px] text-(--vf-text-muted)">
              {view.flow.nodes.length} nodes · {view.flow.edgeGroups.length} edge groups
            </p>
          </div>
        </div>
        <div
          className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1.5 bg-(--vf-surface) px-3 py-2 font-mono text-[10px] text-(--vf-text-quiet)"
          data-testid={VISUALIZER_TEST_IDS.canvas.legend}
        >
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-(--vf-config)" />
            accepted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-(--vf-effect)" />
            self-emitted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-(--vf-routing)" />
            from other
          </span>
        </div>
      </div>
    </section>
  );
};

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
