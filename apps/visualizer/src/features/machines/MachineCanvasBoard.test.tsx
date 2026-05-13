import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MachineCanvasBoardView } from "../../canvas";
import { VISUALIZER_TEST_IDS } from "../../test-ids";
import type { VisualizerCommand } from "../../workbench";
import { MachineCanvasBoard } from "./MachineCanvasBoard";

vi.mock("./MachineCanvasGraph", () => ({
  default: ({ flow, sourceVersion }: { flow: Extract<MachineCanvasBoardView, { status: "ready" }>["flow"]; sourceVersion: number }) => (
    <div
      data-testid="visualizer-machine-canvas-graph"
      data-density="normal"
      data-visible-edge-count={flow.edgeGroups.filter((group) => group.targetNodeId).length}
      data-source-version={sourceVersion}
    >
      <span data-testid="visualizer-machine-canvas-state-node">{flow.nodes[0]?.label}</span>
      <span data-testid="visualizer-machine-canvas-edge-label">{flow.edgeGroups[0]?.label}</span>
    </div>
  ),
}));

const ids = VISUALIZER_TEST_IDS;
const emptyAnchors = [] as const;

const dispatchOf = () => vi.fn<(command: VisualizerCommand) => void>();

const readyView = (
  machine: Partial<Extract<MachineCanvasBoardView, { status: "ready" }>["flow"]["machine"]> = {},
): Extract<MachineCanvasBoardView, { status: "ready" }> => {
  const currentStateKey = Object.prototype.hasOwnProperty.call(machine, "currentStateKey")
    ? machine.currentStateKey
    : "playing";

  return {
    status: "ready",
    sourceVersion: 7,
    machineId: machine.machineId ?? "player",
    flow: {
      status: "ready",
      machine: {
        machineId: machine.machineId ?? "player",
        title: machine.title ?? "player",
        kind: machine.kind ?? "domain",
        initialState: machine.initialState ?? "idle",
        ...(currentStateKey ? { currentStateKey } : {}),
        sourceAnchors: emptyAnchors,
        badges: [],
        counters: machine.counters ?? {
          states: 2,
          transitions: 1,
          reducerBranches: 0,
          emissions: 1,
          diagnostics: 0,
        },
        ...(machine.groupTag ? { groupTag: machine.groupTag } : {}),
      },
      nodes: [
        {
          nodeId: "player:state:idle",
          ref: { kind: "state", stateId: "player:state:idle" },
          label: "idle",
          role: "initial",
          badges: [{ kind: "initial", label: "initial" }],
          sourceAnchors: emptyAnchors,
          diagnosticIds: [],
          stats: { incoming: 0, outgoing: 1, selfLoops: 0, emissions: 0 },
        },
        {
          nodeId: "player:state:playing",
          ref: { kind: "state", stateId: "player:state:playing" },
          label: "playing",
          role: currentStateKey ? "current" : "normal",
          badges: currentStateKey ? [{ kind: "current", label: "current" }] : [],
          sourceAnchors: emptyAnchors,
          diagnosticIds: [],
          stats: { incoming: 1, outgoing: 0, selfLoops: 0, emissions: 1 },
        },
      ],
      edgeGroups: [
        {
          groupId: "player:edge:play",
          sourceNodeId: "player:state:idle",
          targetNodeId: "player:state:playing",
          direction: "normal",
          kind: "accepted-transition",
          layer: "config",
          producerCategory: "external",
          label: "PLAY",
          count: 1,
          rows: [],
          producers: [],
          sourceAnchors: emptyAnchors,
          diagnostics: [],
        },
      ],
    },
  };
};

describe("MachineCanvasBoard", () => {
  it("не рендерит board когда canvas не открыт", () => {
    const dispatch = dispatchOf();

    render(<MachineCanvasBoard view={{ status: "not-opened", reason: "not-opened" }} dispatch={dispatch} />);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByTestId(ids.canvas.board)).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("рендерит controlled missing states и закрывает board", () => {
    const missingModelDispatch = dispatchOf();
    const { rerender } = render(
      <MachineCanvasBoard
        view={{ status: "missing-model", reason: "missing-model", board: { sourceVersion: 7, machineId: "player" } }}
        dispatch={missingModelDispatch}
      />,
    );

    expect(screen.getByTestId(ids.canvas.board).textContent).toContain("Compiled model is not available");
    fireEvent.click(screen.getByTestId(ids.canvas.close));
    expect(missingModelDispatch).toHaveBeenCalledWith({ type: "canvas.machine-board.closed" });

    const missingMachineDispatch = dispatchOf();
    rerender(<MachineCanvasBoard view={{ status: "missing-machine", sourceVersion: 7, machineId: "worker" }} dispatch={missingMachineDispatch} />);

    expect(screen.getByTestId(ids.canvas.board).textContent).toContain("worker");
    expect(screen.getByTestId(ids.canvas.board).textContent).toContain("no longer present");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(missingMachineDispatch).toHaveBeenCalledWith({ type: "canvas.machine-board.closed" });
  });

  it("рендерит ready header из Machine Flow Model", async () => {
    const dispatch = dispatchOf();

    render(<MachineCanvasBoard view={readyView({ groupTag: "jobs" })} dispatch={dispatch} />);

    expect(screen.getByTestId(ids.canvas.board).getAttribute("data-machine-id")).toBe("player");
    expect(screen.getByTestId(ids.canvas.board).getAttribute("data-source-version")).toBe("7");
    expect(screen.getByText("player")).toBeTruthy();
    expect(screen.getByText("domain")).toBeTruthy();
    expect(screen.getByText("tag:jobs")).toBeTruthy();
    expect(screen.getByText("current playing")).toBeTruthy();
    expect(screen.getByText("states").nextSibling?.textContent).toBe("2");
    expect(screen.getByText("transitions").nextSibling?.textContent).toBe("1");
    expect(screen.getByText("emissions").nextSibling?.textContent).toBe("1");
    expect(screen.getByTestId(ids.canvas.legend).textContent).toContain("self-emitted");
    expect((await screen.findByTestId(ids.canvas.stateNode)).textContent).toBe("idle");
    expect(screen.getByTestId(ids.canvas.edgeLabel).textContent).toBe("PLAY");
    expect(screen.getByTestId(ids.canvas.graph).getAttribute("data-visible-edge-count")).toBe("1");
  });

  it("не dispatch-ит machine events при кликах по read-only graph items", async () => {
    const dispatch = dispatchOf();

    render(<MachineCanvasBoard view={readyView()} dispatch={dispatch} />);

    fireEvent.click(await screen.findByTestId(ids.canvas.graph));
    fireEvent.click(screen.getByTestId(ids.canvas.stateNode));
    fireEvent.click(screen.getByTestId(ids.canvas.edgeLabel));

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("не подменяет absent current initial state и закрывается по Escape", () => {
    const dispatch = dispatchOf();

    render(
      <MachineCanvasBoard
        view={readyView({
          kind: "unknown",
          currentStateKey: undefined,
          initialState: "idle",
          counters: { states: 3, transitions: 0, reducerBranches: 0, emissions: 0, diagnostics: 0 },
        })}
        dispatch={dispatch}
      />,
    );

    expect(screen.getByText("unknown")).toBeTruthy();
    expect(screen.getByText("current simulation idle")).toBeTruthy();
    expect(screen.queryByText("current idle")).toBeNull();
    expect(screen.queryByText(/tag:/)).toBeNull();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.machine-board.closed" });
    expect(screen.getByTestId(ids.canvas.close).closest("button")).toBe(screen.getByLabelText("Close graph"));
  });

  it("рендерит actor template kind", () => {
    render(<MachineCanvasBoard view={readyView({ machineId: "actor", title: "actor", kind: "actorTemplate" })} dispatch={dispatchOf()} />);

    expect(screen.getAllByText("actor").length).toBeGreaterThan(0);
  });

  it("очищает Escape listener после закрытия и unmount", () => {
    const openedDispatch = dispatchOf();
    const { rerender, unmount } = render(<MachineCanvasBoard view={readyView()} dispatch={openedDispatch} />);

    rerender(<MachineCanvasBoard view={{ status: "not-opened", reason: "not-opened" }} dispatch={openedDispatch} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(openedDispatch).not.toHaveBeenCalled();

    const unmountedDispatch = dispatchOf();
    rerender(<MachineCanvasBoard view={readyView({ machineId: "worker", title: "worker" })} dispatch={unmountedDispatch} />);
    unmount();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(unmountedDispatch).not.toHaveBeenCalled();
  });
});
