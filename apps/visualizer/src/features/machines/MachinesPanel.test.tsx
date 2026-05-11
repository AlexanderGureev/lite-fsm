import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VISUALIZER_TEST_IDS } from "../../test-ids";
import type { MachineWorkbenchPanelView, VisualizerCommand } from "../../workbench";
import { MachinesPanel } from "./MachinesPanel";

const ids = VISUALIZER_TEST_IDS;

const dispatchOf = () => vi.fn<(command: VisualizerCommand) => void>();

const viewFixture = (overrides: Partial<MachineWorkbenchPanelView> = {}): MachineWorkbenchPanelView => ({
  status: "ready",
  totalMachines: 2,
  selectedMachineIds: ["player"],
  machineRows: [
    {
      machineId: "player",
      title: "player",
      kind: "domain",
      selected: true,
      stateCount: 2,
      diagnosticCount: 0,
    },
    {
      machineId: "worker",
      title: "worker",
      kind: "actorTemplate",
      groupTag: "jobs",
      selected: false,
      stateCount: 3,
      diagnosticCount: 1,
    },
  ],
  cards: [
    {
      card: {
        cardId: "machine-card:player",
        title: "player",
        origin: { kind: "ir", ref: { kind: "machine", machineId: "player" }, sourceAnchors: [] },
        badges: [],
        sections: [],
        actions: [
          { kind: "inspect", ref: { kind: "machine", machineId: "player" } },
          { kind: "select-source", anchors: [] },
          { kind: "propose-source-edit", enabled: false, intent: { kind: "add-state", machineId: "player", stateKey: "" } },
        ],
        editable: { kind: "readonly", reason: "analysis-only" },
      },
      machineId: "player",
      title: "player",
      kind: "domain",
      currentStateKey: "idle",
      sourceAction: { title: "player", anchors: [], available: false },
      actorApproximation: false,
      globalRows: [],
      states: [
        {
          stateId: "player:state:idle",
          stateKey: "idle",
          current: true,
          collapsed: false,
          badges: [{ kind: "initial", label: "initial" }],
          sourceAction: { title: "idle", anchors: [], available: false },
          rows: [
            {
              rowId: "player:row:play",
              kind: "config",
              layer: "config",
              eventType: "PLAY",
              targetLabel: "playing",
              metaLabel: "exact",
              sourceAction: { title: "PLAY", anchors: [], available: false },
              simulation: { available: true, recentlyFired: true },
              action: {
                enabled: true,
                target: {
                  kind: "transition",
                  machineId: "player",
                  rowId: "player:row:play",
                  transitionId: "player:transition:PLAY",
                  slice: { kind: "domain", machineId: "player" },
                },
              },
            },
            {
              rowId: "player:row:effect",
              kind: "effect",
              layer: "effect",
              eventType: "DONE",
              targetLabel: "default",
              metaLabel: "can-dispatch",
              sourceAction: { title: "DONE", anchors: [], available: false },
              simulation: { suggested: true },
              action: {
                enabled: true,
                target: {
                  kind: "emission",
                  machineId: "player",
                  rowId: "player:row:effect",
                  emissionId: "player:emission:DONE",
                  slice: { kind: "domain", machineId: "player" },
                },
              },
            },
          ],
        },
      ],
    },
  ],
  sendOptions: [
    { eventType: "PLAY", group: "available" },
    { eventType: "STOP", group: "not-accepted" },
  ],
  timeline: [
    {
      stepId: "root",
      index: 0,
      eventType: "initial",
      sourceLabel: "initial",
      acceptedMachines: [],
      rowRefCount: 0,
      selected: false,
      empty: false,
    },
    {
      stepId: "step:1",
      index: 1,
      eventType: "PLAY",
      sourceLabel: "external",
      acceptedMachines: ["player"],
      rowRefCount: 1,
      selected: true,
      empty: false,
    },
  ],
  simulationStatus: "running",
  diagnosticCount: 0,
  actorApproximation: false,
  ...overrides,
});

describe("панель MachinesPanel", () => {
  it("рендерит picker, cards, send control и actions timeline", () => {
    const dispatch = dispatchOf();
    render(<MachinesPanel view={viewFixture()} dispatch={dispatch} />);

    expect(screen.getByTestId(ids.workbench.panel)).toBeTruthy();
    expect(screen.getAllByTestId(ids.workbench.machinePickerRow)).toHaveLength(2);
    expect(screen.getByTestId(ids.workbench.machineCard).getAttribute("data-machine-id")).toBe("player");
    expect(screen.getByTestId(ids.workbench.currentState).textContent).toBe("idle");
    expect(screen.getAllByTestId(ids.workbench.timelineStep)).toHaveLength(2);

    fireEvent.click(screen.getAllByTestId(ids.workbench.machinePickerRow)[1]);
    fireEvent.click(screen.getByTestId(ids.workbench.eventSend));
    fireEvent.click(screen.getByTestId(ids.workbench.row.config));
    fireEvent.click(screen.getByTestId(ids.workbench.row.effect));
    fireEvent.click(screen.getAllByTestId(ids.workbench.timelineStep)[0]);
    fireEvent.click(screen.getByTestId(ids.workbench.simulationReset));

    expect(dispatch).toHaveBeenCalledWith({ type: "l3.machine.toggled", machineId: "worker" });
    expect(dispatch).toHaveBeenCalledWith({ type: "l3.event.sent", event: { type: "PLAY" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "l3.transition-row.sent",
      target: {
        kind: "transition",
        machineId: "player",
        rowId: "player:row:play",
        transitionId: "player:transition:PLAY",
        slice: { kind: "domain", machineId: "player" },
      },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "l3.effect-row.followed",
      target: {
        kind: "emission",
        machineId: "player",
        rowId: "player:row:effect",
        emissionId: "player:emission:DONE",
        slice: { kind: "domain", machineId: "player" },
      },
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "l3.timeline.step.selected", stepId: "root" });
    expect(dispatch).toHaveBeenCalledWith({ type: "l3.simulation.reset" });
  });

  it("показывает пустые состояния и отключенные controls", () => {
    const dispatch = dispatchOf();
    render(
      <MachinesPanel
        view={viewFixture({
          selectedMachineIds: [],
          machineRows: [],
          cards: [],
          sendOptions: [],
          timeline: [],
          simulationStatus: "idle",
        })}
        dispatch={dispatch}
      />,
    );

    expect(screen.getByTestId(ids.workbench.machinePicker).textContent).toContain("Open the visualizer");
    expect(screen.getByTestId(ids.workbench.timeline).getAttribute("data-empty")).toBe("true");
    fireEvent.click(screen.getByTestId(ids.workbench.clearSelection));
    expect(screen.getByTestId(ids.workbench.eventSend).hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId(ids.workbench.simulationReset).hasAttribute("disabled")).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("не отправляет команды из disabled source buttons", () => {
    const dispatch = dispatchOf();
    render(<MachinesPanel view={viewFixture()} dispatch={dispatch} />);

    fireEvent.click(screen.getByTestId(ids.workbench.sourceAction));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "source.overlay.opened" }));
  });

  it("выбирает первое доступное событие после появления simulation overlay", async () => {
    const dispatch = dispatchOf();
    const { rerender } = render(
      <MachinesPanel view={viewFixture({ sendOptions: [{ eventType: "DONE", group: "not-accepted" }] })} dispatch={dispatch} />,
    );

    expect(screen.getByTestId(ids.workbench.eventSend).hasAttribute("disabled")).toBe(true);

    rerender(
      <MachinesPanel
        view={viewFixture({
          sendOptions: [
            { eventType: "DONE", group: "not-accepted" },
            { eventType: "START", group: "available" },
          ],
        })}
        dispatch={dispatch}
      />,
    );

    await waitFor(() => expect(screen.getByTestId(ids.workbench.eventSend).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByTestId(ids.workbench.eventSend));

    expect(dispatch).toHaveBeenCalledWith({ type: "l3.event.sent", event: { type: "START" } });
  });

  it("покрывает actor cards, global rows, collapsed/no-row states и source/clear actions", () => {
    const dispatch = dispatchOf();
    render(
      <MachinesPanel
        view={viewFixture({
          selectedMachineIds: ["worker"],
          machineRows: [
            {
              machineId: "unknown",
              title: "unknown",
              kind: "unknown",
              selected: false,
              stateCount: 0,
              diagnosticCount: 0,
            },
          ],
          cards: [
            {
              card: {
                cardId: "machine-card:worker",
                title: "worker",
                origin: { kind: "ir", ref: { kind: "machine", machineId: "worker" }, sourceAnchors: [] },
                badges: [],
                sections: [],
                actions: [],
                editable: { kind: "readonly", reason: "analysis-only" },
              },
              machineId: "worker",
              title: "worker",
              kind: "actorTemplate",
              groupTag: "jobs",
              currentStateKey: undefined,
              sourceAction: { title: "worker source", anchors: [], available: true },
              actorApproximation: true,
              globalRows: [
                {
                  rowId: "worker:unknown",
                  kind: "unknown",
                  layer: "simulation",
                  eventType: "dynamic",
                  targetLabel: "unknown",
                  metaLabel: "partial",
                  sourceAction: { title: "dynamic", anchors: [], available: false },
                  action: { enabled: false, reason: "read-only" },
                },
              ],
              states: [
                {
                  stateId: "worker:state:collapsed",
                  stateKey: "collapsed",
                  current: false,
                  collapsed: true,
                  badges: [],
                  sourceAction: { title: "collapsed", anchors: [], available: false },
                  rows: [],
                },
                {
                  stateId: "worker:state:empty",
                  stateKey: "empty",
                  current: false,
                  collapsed: false,
                  badges: [{ kind: "diagnostic", label: "diag" }],
                  sourceAction: { title: "empty", anchors: [], available: false },
                  rows: [],
                },
                {
                  stateId: "worker:state:rows",
                  stateKey: "rows",
                  current: false,
                  collapsed: false,
                  badges: [],
                  sourceAction: { title: "rows", anchors: [], available: false },
                  rows: [
                    {
                      rowId: "worker:inspected",
                      kind: "config",
                      layer: "config",
                      eventType: "INSPECTED",
                      targetLabel: "next",
                      metaLabel: "exact",
                      sourceAction: { title: "INSPECTED", anchors: [], available: false },
                      simulation: { inspected: true },
                      action: { enabled: true },
                    },
                    {
                      rowId: "worker:reducer",
                      kind: "reducer",
                      layer: "reducer",
                      eventType: "REDUCE",
                      targetLabel: "next",
                      metaLabel: "exact",
                      sourceAction: { title: "REDUCE", anchors: [], available: false },
                      action: { enabled: false, reason: "not-current" },
                    },
                  ],
                },
              ],
            },
          ],
          timeline: [
            {
              stepId: "empty",
              index: 1,
              eventType: "NOOP",
              sourceLabel: "external",
              acceptedMachines: [],
              rowRefCount: 0,
              selected: false,
              empty: true,
            },
          ],
          simulationStatus: "blocked",
          diagnosticCount: 1,
        })}
        dispatch={dispatch}
      />,
    );

    expect(screen.getByText("Actor template is simulated as a template approximation.")).toBeTruthy();
    expect(screen.getByTestId(ids.workbench.row.simulation).getAttribute("data-row-id")).toBe("worker:unknown");
    expect(screen.getByText("INSPECTED").closest("button")?.getAttribute("data-inspected")).toBe("true");
    expect(screen.getByTestId(ids.workbench.row.reducer).getAttribute("data-dispatch-enabled")).toBe("false");
    expect(screen.getByText("Collapsed non-current state.")).toBeTruthy();
    expect(screen.getByText("No rows in this state.")).toBeTruthy();
    fireEvent.click(screen.getByText("INSPECTED"));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId(ids.workbench.sourceAction));
    fireEvent.click(screen.getByTestId(ids.workbench.clearSelection));

    expect(dispatch).toHaveBeenCalledWith({ type: "source.overlay.opened", title: "worker source", anchors: [], available: true });
    expect(dispatch).toHaveBeenCalledWith({ type: "l3.selection.cleared" });
  });
});
