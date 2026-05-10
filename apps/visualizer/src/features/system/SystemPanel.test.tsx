import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SystemMachineRowView, SystemPanelView, SystemTopicRowView, VisualizerCommand } from "../../workbench";
import { VISUALIZER_TEST_IDS } from "../../test-ids";
import { SystemPanel } from "./SystemPanel";

const ids = VISUALIZER_TEST_IDS;

const byData = <ElementType extends HTMLElement>(testId: string, attr: string, value: string): ElementType => {
  const element = document.querySelector<ElementType>(`[data-testid="${testId}"][${attr}="${value}"]`);
  if (!element) throw new Error(`Missing ${testId} with ${attr}=${value}`);

  return element;
};

const counts = (diagnostics = 0): SystemMachineRowView["counts"] => ({
  states: 2,
  consumedTopics: 1,
  producedTopics: 1,
  configTransitions: 2,
  reducerBranches: 1,
  effectEmissions: 1,
  diagnostics,
});

const machine = (overrides: Partial<SystemMachineRowView> & Pick<SystemMachineRowView, "machineId">): SystemMachineRowView => {
  const { machineId, ...rest } = overrides;

  return {
    machineId,
    title: machineId,
    kind: "unknown",
    counts: counts(),
    consumedTopicTypes: ["START"],
    producedTopicTypes: ["DONE"],
    selected: false,
    related: false,
    dimmed: false,
    sourceAction: { title: machineId, anchors: [], available: false },
    ...rest,
  };
};

const topic = (overrides: Partial<SystemTopicRowView> & Pick<SystemTopicRowView, "eventType">): SystemTopicRowView => {
  const { eventType, ...rest } = overrides;

  return {
    eventType,
    producerCount: 0,
    consumerCount: 0,
    diagnosticCount: 0,
    selected: false,
    related: false,
    dimmed: false,
    ...rest,
  };
};

const dispatchOf = () => vi.fn<(command: VisualizerCommand) => void>();

describe("SystemPanel", () => {
  it("рендерит machine detail, relation states и отправляет L1 commands", () => {
    const dispatch = dispatchOf();
    const selectedMachine = machine({
      machineId: "selectedMachine",
      kind: "domain",
      groupTag: "core",
      initialState: "idle",
      selected: true,
      sourceAction: { title: "selectedMachine", anchors: [], available: true },
    });
    const view: SystemPanelView = {
      status: "ready",
      machineQuery: "",
      topicQuery: "",
      totalMachines: 4,
      totalTopics: 4,
      machines: [
        selectedMachine,
        machine({ machineId: "relatedActor", kind: "actorTemplate", related: true, counts: counts(2) }),
        machine({ machineId: "dimmedMachine", dimmed: true }),
        machine({ machineId: "idleMachine" }),
      ],
      topics: [
        topic({ eventType: "SELECTED", selected: true, diagnosticCount: 1 }),
        topic({ eventType: "RELATED", related: true }),
        topic({ eventType: "DIMMED", dimmed: true }),
        topic({ eventType: "IDLE" }),
      ],
      detail: {
        kind: "machine",
        machine: selectedMachine,
        consumedTopics: ["START"],
        producedTopics: [],
      },
    };

    render(<SystemPanel view={view} dispatch={dispatch} />);
    const machineList = screen.getByTestId(ids.system.machineList);
    const topicList = screen.getByTestId(ids.system.topicList);
    const selectedMachineRow = byData<HTMLButtonElement>(ids.system.machineRow, "data-machine-id", "selectedMachine");
    const relatedMachineRow = byData<HTMLButtonElement>(ids.system.machineRow, "data-machine-id", "relatedActor");
    const idleMachineRow = byData<HTMLButtonElement>(ids.system.machineRow, "data-machine-id", "idleMachine");
    const selectedTopicRow = byData<HTMLButtonElement>(ids.system.topicRow, "data-event-type", "SELECTED");
    const relatedTopicRow = byData<HTMLButtonElement>(ids.system.topicRow, "data-event-type", "RELATED");
    const idleTopicRow = byData<HTMLButtonElement>(ids.system.topicRow, "data-event-type", "IDLE");

    expect(selectedMachineRow.getAttribute("data-relation-state")).toBe("selected");
    expect(relatedMachineRow.getAttribute("data-relation-state")).toBe("related");
    expect(byData(ids.system.machineRow, "data-machine-id", "dimmedMachine").getAttribute("data-relation-state")).toBe("dimmed");
    expect(idleMachineRow.getAttribute("data-relation-state")).toBe("idle");
    expect(relatedMachineRow.getAttribute("data-diagnostics")).toBe("2");
    expect(screen.getByTestId(ids.system.detailProducedTopics).getAttribute("data-empty")).toBe("true");

    fireEvent.change(screen.getByTestId(ids.system.machineSearch), { target: { value: "actor" } });
    fireEvent.change(screen.getByTestId(ids.system.topicSearch), { target: { value: "done" } });
    fireEvent.click(selectedMachineRow);
    fireEvent.mouseEnter(relatedMachineRow);
    fireEvent.focus(idleMachineRow);
    fireEvent.click(selectedTopicRow);
    fireEvent.mouseEnter(relatedTopicRow);
    fireEvent.focus(idleTopicRow);
    fireEvent.mouseLeave(machineList.parentElement!.parentElement!);
    fireEvent.mouseLeave(topicList.parentElement!.parentElement!);
    fireEvent.click(byData<HTMLButtonElement>(ids.system.topicChip, "data-event-type", "START"));
    fireEvent.click(screen.getByTestId(ids.system.openInWorkbench));
    fireEvent.click(screen.getByTestId(ids.system.viewSource));

    expect(dispatch.mock.calls.map(([command]) => command)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "l1.machine-query.changed", query: "actor" }),
        expect.objectContaining({ type: "l1.topic-query.changed", query: "done" }),
        expect.objectContaining({ type: "l1.machine.selected", machineId: "selectedMachine" }),
        expect.objectContaining({ type: "l1.machine.hovered", machineId: "relatedActor" }),
        expect.objectContaining({ type: "l1.machine.hovered", machineId: "idleMachine" }),
        expect.objectContaining({ type: "l1.topic.selected", eventType: "SELECTED" }),
        expect.objectContaining({ type: "l1.topic.hovered", eventType: "RELATED" }),
        expect.objectContaining({ type: "l1.topic.hovered", eventType: "IDLE" }),
        expect.objectContaining({ type: "l1.hover.cleared" }),
        expect.objectContaining({ type: "l1.topic.selected", eventType: "START" }),
        expect.objectContaining({ type: "l1.machine.opened-in-workbench", machineId: "selectedMachine" }),
        expect.objectContaining({ type: "source.overlay.opened", title: "selectedMachine", anchors: [] }),
      ]),
    );
  });

  it("рендерит topic detail, empty lists и topic navigation", () => {
    const dispatch = dispatchOf();
    const detailTopic = topic({ eventType: "DONE", producerCount: 0, consumerCount: 0 });
    const view: SystemPanelView = {
      status: "ready",
      machineQuery: "missing",
      topicQuery: "missing",
      totalMachines: 1,
      totalTopics: 1,
      machines: [],
      topics: [],
      detail: {
        kind: "topic",
        topic: detailTopic,
        producers: [],
        consumers: ["workerMachine"],
      },
    };

    const { rerender } = render(<SystemPanel view={view} dispatch={dispatch} />);

    expect(screen.getByTestId(ids.system.machineEmpty)).toBeTruthy();
    expect(screen.getByTestId(ids.system.topicEmpty)).toBeTruthy();
    expect(screen.getByTestId(ids.system.detailProducers).getAttribute("data-empty")).toBe("true");
    expect(screen.getByTestId(ids.system.detailConsumers).getAttribute("data-values")).toBe("workerMachine");

    fireEvent.click(screen.getByTestId(ids.system.openInEvents));

    expect(dispatch).toHaveBeenCalledWith({ type: "l1.topic.opened-in-event-catalog", eventType: "DONE" });

    rerender(
      <SystemPanel
        view={{
          ...view,
          detail: {
            kind: "topic",
            topic: detailTopic,
            producers: ["flowMachine"],
            consumers: [],
          },
        }}
        dispatch={dispatch}
      />,
    );

    expect(screen.getByTestId(ids.system.detailProducers).getAttribute("data-values")).toBe("flowMachine");
    expect(screen.getByTestId(ids.system.detailConsumers).getAttribute("data-empty")).toBe("true");
  });

  it("рендерит empty detail и produced topic chips", () => {
    const dispatch = dispatchOf();
    const producedMachine = machine({ machineId: "producer" });
    const view: SystemPanelView = {
      status: "empty",
      machineQuery: "",
      topicQuery: "",
      totalMachines: 0,
      totalTopics: 0,
      machines: [producedMachine],
      topics: [],
      detail: {
        kind: "machine",
        machine: producedMachine,
        consumedTopics: [],
        producedTopics: ["DONE"],
      },
    };
    const { rerender } = render(<SystemPanel view={view} dispatch={dispatch} />);

    expect(screen.getByTestId(ids.system.detailConsumedTopics).getAttribute("data-empty")).toBe("true");
    fireEvent.click(byData<HTMLButtonElement>(ids.system.topicChip, "data-event-type", "DONE"));
    expect(dispatch).toHaveBeenCalledWith({ type: "l1.topic.selected", eventType: "DONE" });

    rerender(
      <SystemPanel
        view={{
          ...view,
          machines: [],
          detail: { kind: "empty", title: "System inventory", body: "Select something." },
        }}
        dispatch={dispatch}
      />,
    );

    expect(screen.getByTestId(ids.system.detailEmpty)).toBeTruthy();
  });
});
