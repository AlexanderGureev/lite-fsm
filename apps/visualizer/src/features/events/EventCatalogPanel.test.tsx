import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  EventCatalogPanelView,
  EventCatalogTopicRowView,
  EventConsumerRowView,
  EventProducerRowView,
  VisualizerCommand,
} from "../../workbench";
import { EventCatalogPanel } from "./EventCatalogPanel";

const dispatchOf = () => vi.fn<(command: VisualizerCommand) => void>();

const topic = (overrides: Partial<EventCatalogTopicRowView> & Pick<EventCatalogTopicRowView, "eventType">): EventCatalogTopicRowView => {
  const { eventType, ...rest } = overrides;

  return {
    eventType,
    producerCount: 0,
    consumerCount: 0,
    diagnosticCount: 0,
    selected: false,
    ...rest,
  };
};

const producer = (overrides: Partial<EventProducerRowView> & Pick<EventProducerRowView, "rowId">): EventProducerRowView => {
  const { rowId, ...rest } = overrides;

  return {
    rowId,
    machineId: "flowMachine",
    sourceStateKey: "loading",
    routingLabel: "tag:reviewers",
    confidence: "exact",
    sourceAction: { title: rowId, anchors: [], available: true },
    ...rest,
  };
};

const consumer = (overrides: Partial<EventConsumerRowView> & Pick<EventConsumerRowView, "rowId">): EventConsumerRowView => {
  const { rowId, ...rest } = overrides;

  return {
    rowId,
    machineId: "workerMachine",
    sourceStateKey: "idle",
    targetSummary: "done",
    branchCount: 1,
    guardLabels: [],
    confidence: "exact",
    branches: [
      {
        rowId: `${rowId}:branch`,
        layer: "config",
        targetLabel: "done",
        confidence: "exact",
      },
    ],
    sourceAction: { title: rowId, anchors: [], available: true },
    ...rest,
  };
};

describe("EventCatalogPanel", () => {
  it("рендерит topic detail с producers/consumers/routing и отправляет commands", () => {
    const dispatch = dispatchOf();
    const view: EventCatalogPanelView = {
      status: "ready",
      query: "",
      totalTopics: 2,
      topics: [
        topic({ eventType: "DONE", producerCount: 2, consumerCount: 2, diagnosticCount: 1, selected: true }),
        topic({ eventType: "RESET" }),
      ],
      detail: {
        kind: "topic",
        eventType: "DONE",
        producerCount: 2,
        consumerCount: 2,
        routingKinds: ["tag", "unknown"],
        routingValues: [
          { kind: "tag", label: "tag:reviewers", value: "reviewers", confidence: "exact" },
          { kind: "unknown", label: "action.meta", confidence: "unknown" },
        ],
        producers: [
          producer({ rowId: "producer:exact", guardLabel: "if: action.ready" }),
          producer({ rowId: "producer:partial", routingLabel: "unknown", confidence: "partial" }),
        ],
        consumers: [
          consumer({
            rowId: "consumer:exact",
            guardLabels: ["if: context.ready"],
            branches: [
              { rowId: "branch:config", layer: "config", targetLabel: "done", guardLabel: "if: context.ready", confidence: "exact" },
              { rowId: "branch:reducer", layer: "reducer", targetLabel: "failed", confidence: "partial" },
            ],
            branchCount: 2,
            targetSummary: "done | failed",
          }),
          consumer({
            rowId: "consumer:unknown",
            confidence: "partial",
            targetSummary: "",
            branches: [{ rowId: "branch:unknown", layer: "reducer", targetLabel: "unknown", confidence: "unknown" }],
          }),
        ],
      },
    };

    render(<EventCatalogPanel view={view} dispatch={dispatch} />);

    expect(screen.getByText("diag 1")).toBeTruthy();
    expect(screen.getByText("tag:reviewers · exact")).toBeTruthy();
    expect(screen.getByText("action.meta · unknown")).toBeTruthy();
    expect(screen.getByText("if: action.ready")).toBeTruthy();
    expect(screen.getByText("from idle to unknown")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search events"), { target: { value: "route" } });
    fireEvent.click(screen.getByText("RESET").closest("button")!);
    for (const button of screen.getAllByTestId("visualizer-events-view-source")) {
      fireEvent.click(button);
    }

    expect(dispatch.mock.calls.map(([command]) => command)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "l2.query.changed", query: "route" }),
        expect.objectContaining({ type: "l2.topic.selected", eventType: "RESET" }),
        expect.objectContaining({ type: "source.overlay.opened", title: "producer:exact", anchors: [] }),
        expect.objectContaining({ type: "source.overlay.opened", title: "producer:partial", anchors: [] }),
        expect.objectContaining({ type: "source.overlay.opened", title: "consumer:exact", anchors: [] }),
        expect.objectContaining({ type: "source.overlay.opened", title: "consumer:unknown", anchors: [] }),
      ]),
    );
  });

  it("рендерит empty sections для topic detail без routing/producers/consumers", () => {
    const view: EventCatalogPanelView = {
      status: "ready",
      query: "done",
      totalTopics: 1,
      topics: [topic({ eventType: "DONE", selected: true })],
      detail: {
        kind: "topic",
        eventType: "DONE",
        producerCount: 0,
        consumerCount: 0,
        routingKinds: [],
        routingValues: [],
        producers: [],
        consumers: [],
      },
    };

    render(<EventCatalogPanel view={view} dispatch={dispatchOf()} />);

    expect(screen.getByText("No producer routing values.")).toBeTruthy();
    expect(screen.getByText("No producers for this topic.")).toBeTruthy();
    expect(screen.getByText("No consumers for this topic.")).toBeTruthy();
  });

  it("рендерит empty detail и empty search list", () => {
    const view: EventCatalogPanelView = {
      status: "empty",
      query: "missing",
      totalTopics: 3,
      topics: [],
      detail: {
        kind: "empty",
        title: "No matching events",
        body: "No event topics match the current search.",
      },
    };

    render(<EventCatalogPanel view={view} dispatch={dispatchOf()} />);

    expect(screen.getByText("No events match this search.")).toBeTruthy();
    expect(screen.getByText("No matching events")).toBeTruthy();
    expect(screen.getByText("No event topics match the current search.")).toBeTruthy();
  });
});
