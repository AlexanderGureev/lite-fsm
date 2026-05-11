import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VISUALIZER_TEST_IDS } from "../../test-ids";
import type {
  EventCatalogPanelView,
  EventCatalogTopicRowView,
  EventConsumerRowView,
  EventProducerRowView,
  VisualizerCommand,
} from "../../workbench";
import { EventCatalogPanel } from "./EventCatalogPanel";

const ids = VISUALIZER_TEST_IDS;

const dispatchOf = () => vi.fn<(command: VisualizerCommand) => void>();

const byData = <ElementType extends HTMLElement>(testId: string, attr: string, value: string): ElementType => {
  const element = document.querySelector<ElementType>(`[data-testid="${testId}"][${attr}="${value}"]`);
  if (!element) throw new Error(`Missing ${testId} with ${attr}=${value}`);

  return element;
};

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

describe("панель EventCatalogPanel", () => {
  it("рендерит detail темы с producers/consumers/routing и отправляет команды", () => {
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
        relatedMachineIds: ["flowMachine", "workerMachine"],
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

    expect(byData(ids.events.topicRow, "data-event-type", "DONE").getAttribute("data-diagnostics")).toBe("1");
    expect(byData(ids.events.routingValue, "data-label", "tag:reviewers").getAttribute("data-confidence")).toBe("exact");
    expect(byData(ids.events.routingValue, "data-label", "action.meta").getAttribute("data-confidence")).toBe("unknown");
    expect(byData(ids.events.producerRow, "data-row-id", "producer:exact").getAttribute("data-routing-label")).toBe("tag:reviewers");
    expect(byData(ids.events.consumerRow, "data-row-id", "consumer:unknown").getAttribute("data-target-summary")).toBe("");
    expect(byData(ids.events.consumerBranch, "data-row-id", "branch:reducer").getAttribute("data-layer")).toBe("reducer");

    fireEvent.change(screen.getByTestId(ids.events.search), { target: { value: "route" } });
    fireEvent.click(byData<HTMLButtonElement>(ids.events.topicRow, "data-event-type", "RESET"));
    fireEvent.click(screen.getByTestId(ids.events.openInWorkbench));
    for (const button of screen.getAllByTestId(ids.events.viewSource)) {
      fireEvent.click(button);
    }

    expect(dispatch.mock.calls.map(([command]) => command)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "l2.query.changed", query: "route" }),
        expect.objectContaining({ type: "l2.topic.selected", eventType: "RESET" }),
        expect.objectContaining({ type: "l2.topic.opened-in-workbench", eventType: "DONE" }),
        expect.objectContaining({ type: "source.overlay.opened", title: "producer:exact", anchors: [] }),
        expect.objectContaining({ type: "source.overlay.opened", title: "producer:partial", anchors: [] }),
        expect.objectContaining({ type: "source.overlay.opened", title: "consumer:exact", anchors: [] }),
        expect.objectContaining({ type: "source.overlay.opened", title: "consumer:unknown", anchors: [] }),
      ]),
    );
  });

  it("рендерит пустые sections для detail темы без routing/producers/consumers", () => {
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
        relatedMachineIds: [],
        routingKinds: [],
        routingValues: [],
        producers: [],
        consumers: [],
      },
    };

    render(<EventCatalogPanel view={view} dispatch={dispatchOf()} />);

    expect(screen.getByTestId(ids.events.routingValues).getAttribute("data-empty")).toBe("true");
    expect(screen.getByTestId(ids.events.openInWorkbench).hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId(ids.events.producers).getAttribute("data-empty")).toBe("true");
    expect(screen.getByTestId(ids.events.consumers).getAttribute("data-empty")).toBe("true");
  });

  it("рендерит пустой detail и пустой список поиска", () => {
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

    expect(screen.getByTestId(ids.events.listEmpty)).toBeTruthy();
    expect(screen.getByTestId(ids.events.detailEmpty)).toBeTruthy();
    expect(screen.getByTestId(ids.events.details).getAttribute("data-detail-kind")).toBe("empty");
  });
});
