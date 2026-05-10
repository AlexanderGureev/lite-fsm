import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SystemMachineRowView, SystemPanelView, SystemTopicRowView, VisualizerCommand } from "../../workbench";
import { SystemPanel } from "./SystemPanel";

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
    const machineList = screen.getByTestId("visualizer-system-machine-list");
    const topicList = screen.getByTestId("visualizer-system-topic-list");

    expect(within(machineList).getByText("selectedMachine").closest("button")?.getAttribute("data-relation-state")).toBe("selected");
    expect(within(machineList).getByText("relatedActor").closest("button")?.getAttribute("data-relation-state")).toBe("related");
    expect(within(machineList).getByText("dimmedMachine").closest("button")?.getAttribute("data-relation-state")).toBe("dimmed");
    expect(within(machineList).getByText("idleMachine").closest("button")?.getAttribute("data-relation-state")).toBe("idle");
    expect(screen.getByText("diag 2")).toBeTruthy();
    expect(screen.getByText("No produced topics.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search machines"), { target: { value: "actor" } });
    fireEvent.change(screen.getByLabelText("Search topics"), { target: { value: "done" } });
    fireEvent.click(within(machineList).getByText("selectedMachine").closest("button")!);
    fireEvent.mouseEnter(within(machineList).getByText("relatedActor").closest("button")!);
    fireEvent.focus(within(machineList).getByText("idleMachine").closest("button")!);
    fireEvent.click(within(topicList).getByText("SELECTED").closest("button")!);
    fireEvent.mouseEnter(within(topicList).getByText("RELATED").closest("button")!);
    fireEvent.focus(within(topicList).getByText("IDLE").closest("button")!);
    fireEvent.mouseLeave(machineList.parentElement!.parentElement!);
    fireEvent.mouseLeave(topicList.parentElement!.parentElement!);
    fireEvent.click(screen.getByText("START"));
    fireEvent.click(screen.getByTestId("visualizer-system-open-workbench"));
    fireEvent.click(screen.getByTestId("visualizer-system-view-source"));

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

    expect(screen.getByText("No machines match this search.")).toBeTruthy();
    expect(screen.getByText("No topics match this search.")).toBeTruthy();
    expect(screen.getByText("No producers")).toBeTruthy();
    expect(screen.getByText("workerMachine")).toBeTruthy();

    fireEvent.click(screen.getByTestId("visualizer-system-open-events"));

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

    expect(screen.getByText("flowMachine")).toBeTruthy();
    expect(screen.getByText("No consumers")).toBeTruthy();
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

    expect(screen.getByText("No consumed topics.")).toBeTruthy();
    fireEvent.click(screen.getByText("DONE"));
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

    expect(screen.getByText("Select something.")).toBeTruthy();
  });
});
