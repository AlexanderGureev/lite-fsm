import { compileLiteFsmGraph } from "@lite-fsm/graph";
import { buildGraphVisualizerModel, type GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { describe, expect, it } from "vitest";
import { createSourceSession } from "../source";
import { selectEventCatalogPanel } from "./event-catalog-selectors";
import { createInitialWorkbenchSnapshot } from "./state";
import { createWorkbenchStore } from "./store";
import { selectSourceOverlay } from "./selectors";
import { selectSystemPanel } from "./system-selectors";
import type { WorkbenchSnapshot } from "./types";

const fixtureSource = `import { createMachine } from "@lite-fsm/core";

const REVIEW_GROUP = "reviewers";

export const flowMachine = createMachine({
  config: {
    idle: {
      START: null,
    },
    loading: {
      DONE: "done",
      DYNAMIC: "done",
      UNKNOWN: "failed",
      FAIL: "failed",
    },
    done: {
      RESET: "idle",
    },
    failed: {
      RESET: "idle",
    },
  },
  initialState: "idle",
  initialContext: {},
  reducer: (state, action, { nextState }) => {
    if (action.type === "START" && action.payload.fast) {
      state.state = "done";
      return;
    }

    if (action.type === "START") {
      state.state = "loading";
      return;
    }

    state.state = nextState;
  },
  effects: {
    loading: ({ transition, action }) => {
      transition({ type: "DONE", meta: { groupTag: REVIEW_GROUP } });
      transition({ type: "DYNAMIC", meta: { groupTag: action.payload.group } });
      transition({ type: "UNKNOWN", meta: action.meta });
    },
  },
});

export const workerMachine = createMachine({
  groupTag: "reviewers",
  config: {
    idle: {
      DONE: "done",
      DYNAMIC: "done",
    },
    done: {},
  },
  initialState: "idle",
  initialContext: {},
});

export const auditMachine = createMachine({
  config: {
    idle: {
      PING: "idle",
    },
  },
  initialState: "idle",
  initialContext: {},
});
`;

const buildModel = (): GraphVisualizerModel => {
  const result = compileLiteFsmGraph(fixtureSource, { filename: "selectors-12d.ts" });

  return buildGraphVisualizerModel(result.document);
};

const readySnapshot = (): WorkbenchSnapshot => {
  const snapshot = createInitialWorkbenchSnapshot();
  const model = buildModel();

  return {
    ...snapshot,
    state: {
      ...snapshot.state,
      source: createSourceSession({ source: fixtureSource, filename: "selectors-12d.ts" }),
      model: { status: "ready", model, diagnostics: [] },
      activeTab: "system",
    },
  };
};

describe("12d selectors визуализатора", () => {
  it("строит L1 rows, search и relation highlight без мутации projection", () => {
    const store = createWorkbenchStore(readySnapshot());
    const initial = selectSystemPanel(store.getSnapshot());

    expect(initial.machines.map((machine) => machine.machineId)).toEqual(["flowMachine", "workerMachine", "auditMachine"]);
    expect(initial.topics.map((topic) => topic.eventType)).toContain("DYNAMIC");
    expect(initial.detail.kind).toBe("empty");

    store.dispatch({ type: "l1.machine-query.changed", query: "audit" });
    expect(selectSystemPanel(store.getSnapshot()).machines.map((machine) => machine.machineId)).toEqual(["auditMachine"]);
    store.dispatch({ type: "l1.machine-query.changed", query: "" });
    store.dispatch({ type: "l1.topic-query.changed", query: "dynamic" });
    expect(selectSystemPanel(store.getSnapshot()).topics.map((topic) => topic.eventType)).toEqual(["DYNAMIC"]);
    expect(store.getSnapshot().state.model.model).toBe(buildModelSnapshotModel(store.getSnapshot()));

    store.dispatch({ type: "l1.topic-query.changed", query: "" });
    store.dispatch({ type: "l1.topic.selected", eventType: "DONE" });
    const selectedTopic = selectSystemPanel(store.getSnapshot());
    expect(selectedTopic.detail).toMatchObject({ kind: "topic", topic: { eventType: "DONE" }, producers: ["flowMachine"] });
    expect(selectedTopic.machineScope).toEqual({ eventType: "DONE", machineCount: 2 });
    expect(selectedTopic.topics[0]).toMatchObject({ eventType: "DONE", selected: true });
    expect(selectedTopic.machines.map((machine) => machine.machineId)).toEqual(["flowMachine", "workerMachine"]);
    expect(selectedTopic.machines.find((machine) => machine.machineId === "flowMachine")).toMatchObject({ related: true, dimmed: false });

    store.dispatch({ type: "l1.machine.hovered", machineId: "workerMachine" });
    const hoveredMachine = selectSystemPanel(store.getSnapshot());
    expect(hoveredMachine.detail).toMatchObject({ kind: "machine", machine: { machineId: "workerMachine" } });
    expect(hoveredMachine.machineScope).toEqual({ eventType: "DONE", machineCount: 2 });
    expect(hoveredMachine.topicScope).toBeUndefined();
    expect(hoveredMachine.topics[0]).toMatchObject({ eventType: "DONE", selected: true });
    expect(hoveredMachine.topics.map((topic) => topic.eventType)).toContain("PING");
    store.dispatch({ type: "l1.hover.cleared" });
    expect(selectSystemPanel(store.getSnapshot()).detail).toMatchObject({ kind: "topic", topic: { eventType: "DONE" } });
  });

  it("держит L1 machine/topic selection взаимоисключающим при последовательных кликах", () => {
    const store = createWorkbenchStore(readySnapshot());

    store.dispatch({ type: "l1.machine.selected", machineId: "flowMachine" });
    const selectedFlow = selectSystemPanel(store.getSnapshot());
    expect(selectedFlow.detail).toMatchObject({ kind: "machine", machine: { machineId: "flowMachine" } });
    expect(selectedFlow.machines[0]).toMatchObject({ machineId: "flowMachine", selected: true });

    store.dispatch({ type: "l1.topic.selected", eventType: "DONE" });
    const selectedTopic = selectSystemPanel(store.getSnapshot());
    expect(selectedTopic.detail).toMatchObject({ kind: "topic", topic: { eventType: "DONE" } });
    expect(selectedTopic.machineScope).toEqual({ eventType: "DONE", machineCount: 2 });
    expect(selectedTopic.machines.map((machine) => machine.machineId)).toEqual(["flowMachine", "workerMachine"]);
    expect(selectedTopic.machines.find((machine) => machine.machineId === "flowMachine")).toMatchObject({
      selected: false,
      related: true,
      dimmed: false,
    });

    store.dispatch({ type: "l1.topic.selected", eventType: "DONE" });
    const deselectedTopic = selectSystemPanel(store.getSnapshot());
    expect(deselectedTopic.detail).toMatchObject({ kind: "empty" });
    expect(deselectedTopic.machineScope).toBeUndefined();
    expect(deselectedTopic.machines.map((machine) => machine.machineId)).toEqual(["flowMachine", "workerMachine", "auditMachine"]);

    store.dispatch({ type: "l1.machine.selected", machineId: "auditMachine" });
    const selectedMachine = selectSystemPanel(store.getSnapshot());
    expect(selectedMachine.detail).toMatchObject({ kind: "machine", machine: { machineId: "auditMachine" } });
    expect(selectedMachine.machines[0]).toMatchObject({ machineId: "auditMachine", selected: true });
    expect(selectedMachine.topicScope).toEqual({ machineId: "auditMachine", topicCount: 1 });
    expect(selectedMachine.topics.map((topic) => topic.eventType)).toEqual(["PING"]);

    store.dispatch({ type: "l1.machine.selected", machineId: "auditMachine" });
    const deselectedMachine = selectSystemPanel(store.getSnapshot());
    expect(deselectedMachine.detail).toMatchObject({ kind: "empty" });
    expect(deselectedMachine.topicScope).toBeUndefined();
    expect(deselectedMachine.topics.map((topic) => topic.eventType)).toContain("DONE");
  });

  it("строит L2 producer, consumer, routing, branch и dynamic/unknown details", () => {
    const store = createWorkbenchStore(readySnapshot());

    store.dispatch({ type: "l2.topic.selected", eventType: "START" });
    const start = selectEventCatalogPanel(store.getSnapshot());
    expect(start.topics.some((topic) => topic.selected && topic.eventType === "START")).toBe(true);
    expect(start.detail).toMatchObject({
      kind: "topic",
      eventType: "START",
      producers: [],
      consumers: [
        {
          machineId: "flowMachine",
          branchCount: 3,
        },
      ],
    });
    if (start.detail.kind === "topic") {
      expect(start.detail.consumers[0]?.branches.map((branch) => [branch.layer, branch.targetLabel])).toEqual([
        ["config", "self"],
        ["reducer", "done"],
        ["reducer", "loading"],
      ]);
    }

    store.dispatch({ type: "l2.topic.selected", eventType: "DONE" });
    const done = selectEventCatalogPanel(store.getSnapshot());
    expect(done.detail).toMatchObject({
      kind: "topic",
      eventType: "DONE",
      routingValues: [{ label: "tag:reviewers" }],
      producers: [{ machineId: "flowMachine", routingLabel: "tag:reviewers" }],
    });
    if (done.detail.kind === "topic") {
      expect(done.detail.consumers.map((consumer) => [consumer.machineId, consumer.targetSummary])).toEqual([
        ["flowMachine", "done"],
        ["workerMachine", "done"],
      ]);
    }

    store.dispatch({ type: "l2.topic.selected", eventType: "DYNAMIC" });
    const dynamic = selectEventCatalogPanel(store.getSnapshot());
    expect(dynamic.detail).toMatchObject({
      kind: "topic",
      eventType: "DYNAMIC",
      routingValues: [{ label: "tag:LFG_UNSUPPORTED_EXPRESSION", confidence: "unknown" }],
      producers: [{ routingLabel: "tag:LFG_UNSUPPORTED_EXPRESSION", confidence: "partial" }],
    });

    store.dispatch({ type: "l2.topic.selected", eventType: "UNKNOWN" });
    const unknown = selectEventCatalogPanel(store.getSnapshot());
    expect(unknown.detail).toMatchObject({
      kind: "topic",
      eventType: "UNKNOWN",
      routingValues: [{ label: "action.meta", confidence: "unknown" }],
      producers: [{ routingLabel: "action.meta", confidence: "unknown" }],
    });
  });

  it("сохраняет стабильность ссылок для несвязанных L1/L2 changes", () => {
    const store = createWorkbenchStore(readySnapshot());
    const initialSystem = selectSystemPanel(store.getSnapshot());
    const initialModel = store.getSnapshot().state.model;
    const initialSimulation = store.getSnapshot().state.simulation;

    store.dispatch({ type: "l2.topic.selected", eventType: "DONE" });
    expect(selectSystemPanel(store.getSnapshot())).toBe(initialSystem);
    const eventsAfterL2 = selectEventCatalogPanel(store.getSnapshot());
    expect(store.getSnapshot().state.model).toBe(initialModel);
    expect(store.getSnapshot().state.simulation).toBe(initialSimulation);

    store.dispatch({ type: "l1.machine.selected", machineId: "flowMachine" });
    expect(selectEventCatalogPanel(store.getSnapshot())).toBe(eventsAfterL2);
    store.dispatch({ type: "panel.console.toggled" });
    expect(selectSystemPanel(store.getSnapshot())).toBe(selectSystemPanel(store.getSnapshot()));
    expect(selectEventCatalogPanel(store.getSnapshot())).toBe(eventsAfterL2);
  });

  it("строит selector source overlay из команды открытия", () => {
    const store = createWorkbenchStore(readySnapshot());
    const system = selectSystemPanel(store.getSnapshot());
    const action = system.machines.find((machine) => machine.machineId === "flowMachine")?.sourceAction;
    if (!action) throw new Error("Missing source action");

    store.dispatch({ type: "source.overlay.opened", ...action });
    const overlay = selectSourceOverlay(store.getSnapshot());

    expect(overlay.open).toBe(true);
    if (overlay.open) {
      expect(overlay.title).toBe("flowMachine");
      expect(overlay.lines.some((line) => line.selected && line.code.includes("flowMachine"))).toBe(true);
    }
  });

  it("покрывает fallback details L1 и machine source без workbench model", () => {
    const snapshot = readySnapshot();
    const model = snapshot.state.model.model!;
    const withoutWorkbench: WorkbenchSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        l1: { ...snapshot.state.l1, selectedMachineId: "flowMachine", machineQuery: "audit" },
        model: { status: "ready", diagnostics: [], model: { ...model, workbenchMachines: {} } },
      },
    };

    const machineFiltered = selectSystemPanel(withoutWorkbench);
    expect(machineFiltered.detail).toMatchObject({ kind: "empty" });
    expect(machineFiltered.machines[0]?.sourceAction.available).toBe(true);

    const topicFiltered: WorkbenchSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        l1: { ...snapshot.state.l1, selectedTopic: "DONE", topicQuery: "PING" },
      },
    };
    expect(selectSystemPanel(topicFiltered).detail).toMatchObject({ kind: "empty" });
  });

  it("покрывает hover topic в L1 и отсутствующие entries relation index", () => {
    const snapshot = readySnapshot();
    const model = snapshot.state.model.model!;
    const missingRelations: GraphVisualizerModel = {
      ...model,
      relations: { machineIdsByTopicType: {}, topicTypesByMachineId: {} },
    };
    const hoveredTopic: WorkbenchSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        l1: { ...snapshot.state.l1, hoveredTopic: "PING" },
      },
    };

    expect(selectSystemPanel(hoveredTopic).detail).toMatchObject({ kind: "topic", topic: { eventType: "PING" } });
    expect(selectSystemPanel(hoveredTopic).machineScope).toBeUndefined();
    expect(selectSystemPanel(hoveredTopic).machines.map((machine) => machine.machineId)).toEqual(["flowMachine", "workerMachine", "auditMachine"]);

    const hoveredTopicWithoutRelations: WorkbenchSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        l1: { ...snapshot.state.l1, hoveredTopic: "DONE" },
        model: { status: "ready", diagnostics: [], model: missingRelations },
      },
    };
    expect(selectSystemPanel(hoveredTopicWithoutRelations).machines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ machineId: "flowMachine", related: false, dimmed: true }),
        expect.objectContaining({ machineId: "workerMachine", related: false, dimmed: true }),
      ]),
    );

    const hoveredMachineWithoutRelations: WorkbenchSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        l1: { ...snapshot.state.l1, hoveredMachineId: "flowMachine" },
        model: { status: "ready", diagnostics: [], model: missingRelations },
      },
    };
    expect(selectSystemPanel(hoveredMachineWithoutRelations).topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "DONE", related: false, dimmed: true }),
        expect.objectContaining({ eventType: "DYNAMIC", related: false, dimmed: true }),
      ]),
    );

    const selectedMachineWithoutRelations: WorkbenchSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        l1: { ...snapshot.state.l1, selectedMachineId: "flowMachine" },
        model: { status: "ready", diagnostics: [], model: missingRelations },
      },
    };
    expect(selectSystemPanel(selectedMachineWithoutRelations).detail).toMatchObject({
      kind: "machine",
      consumedTopics: [],
      producedTopics: [],
    });
    expect(selectSystemPanel(selectedMachineWithoutRelations).topics).toEqual([]);

    const selectedTopicWithoutRelations: WorkbenchSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        l1: { ...snapshot.state.l1, selectedTopic: "DONE" },
        model: { status: "ready", diagnostics: [], model: missingRelations },
      },
    };
    expect(selectSystemPanel(selectedTopicWithoutRelations).detail).toMatchObject({
      kind: "topic",
      producers: [],
      consumers: [],
    });
    expect(selectSystemPanel(selectedTopicWithoutRelations).machines).toEqual([]);
  });

  it("форматирует все routing target variants в L2", () => {
    const snapshot = readySnapshot();
    const baseModel = snapshot.state.model.model!;
    const model: GraphVisualizerModel = {
      ...baseModel,
      topics: [
        {
          eventType: "ROUTE",
          producerCount: 5,
          consumerCount: 0,
          routingKinds: ["actor", "default", "tag", "unknown", "unscoped"],
          routingValues: [],
          diagnosticIds: [],
          consumers: [],
          producers: [
            {
              machineId: "flowMachine",
              emissionId: "emit:default",
              sourceStateKey: "loading",
              routing: { kind: "default" },
              confidence: "exact",
              sourceAnchors: [],
            },
            {
              machineId: "flowMachine",
              emissionId: "emit:unscoped",
              sourceStateKey: "loading",
              routing: { kind: "unscoped" },
              confidence: "exact",
              sourceAnchors: [],
            },
            {
              machineId: "flowMachine",
              emissionId: "emit:self",
              sourceStateKey: "loading",
              routing: { kind: "actor", target: { kind: "selfField", field: "actorId" } },
              confidence: "exact",
              sourceAnchors: [],
            },
            {
              machineId: "flowMachine",
              emissionId: "emit:array",
              sourceStateKey: "loading",
              routing: {
                kind: "tag",
                target: { kind: "array", items: [{ kind: "literal", value: "jobs" }, { kind: "dynamic" }] },
              },
              confidence: "partial",
              sourceAnchors: [],
            },
            {
              machineId: "flowMachine",
              emissionId: "emit:unknown",
              sourceStateKey: "loading",
              routing: { kind: "unknown" },
              confidence: "unknown",
              sourceAnchors: [],
            },
          ],
        },
      ],
    };
    const routeSnapshot: WorkbenchSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        l2: { selectedTopic: "ROUTE", query: "self.actorId" },
        model: { status: "ready", diagnostics: [], model },
      },
    };
    const view = selectEventCatalogPanel(routeSnapshot);

    expect(view.topics.map((topic) => topic.eventType)).toEqual(["ROUTE"]);
    expect(view.detail).toMatchObject({
      kind: "topic",
      producers: [
        { routingLabel: "default", sourceAction: { available: false } },
        { routingLabel: "unscoped" },
        { routingLabel: "actor:self.actorId" },
        { routingLabel: "tag:[jobs, dynamic]" },
        { routingLabel: "unknown" },
      ],
    });
  });

  it("фильтрует L1/L2 по всем видимым labels и показывает пустой detail L2 без совпадений", () => {
    const store = createWorkbenchStore(readySnapshot());

    store.dispatch({ type: "l1.machine-query.changed", query: "  REVIEWERS  " });
    expect(selectSystemPanel(store.getSnapshot()).machines.map((machine) => machine.machineId)).toEqual(["workerMachine"]);

    store.dispatch({ type: "l1.machine-query.changed", query: "idle" });
    expect(selectSystemPanel(store.getSnapshot()).machines.map((machine) => machine.machineId)).toEqual([
      "flowMachine",
      "workerMachine",
      "auditMachine",
    ]);

    store.dispatch({ type: "l1.topic-query.changed", query: "tag:reviewers" });
    expect(selectSystemPanel(store.getSnapshot()).topics.map((topic) => topic.eventType)).toEqual(["DONE"]);

    store.dispatch({ type: "l1.topic-query.changed", query: "workerMachine" });
    expect(selectSystemPanel(store.getSnapshot()).topics.map((topic) => topic.eventType)).toEqual(["DONE", "DYNAMIC"]);

    store.dispatch({ type: "l2.topic.selected", eventType: "DONE" });
    store.dispatch({ type: "l2.query.changed", query: "start" });
    const startOnly = selectEventCatalogPanel(store.getSnapshot());
    expect(startOnly.topics.map((topic) => [topic.eventType, topic.selected])).toEqual([["START", true]]);
    expect(startOnly.detail).toMatchObject({ kind: "topic", eventType: "START" });

    store.dispatch({ type: "l2.query.changed", query: "tag:reviewers" });
    expect(selectEventCatalogPanel(store.getSnapshot()).topics.map((topic) => topic.eventType)).toEqual(["DONE"]);

    store.dispatch({ type: "l2.query.changed", query: "missing label" });
    expect(selectEventCatalogPanel(store.getSnapshot())).toMatchObject({
      status: "ready",
      topics: [],
      detail: { kind: "empty", title: "No matching events" },
    });
  });

  it("строит пустые states для отсутствующей модели и пустого каталога", () => {
    const empty = createInitialWorkbenchSnapshot();
    expect(selectSystemPanel(empty)).toMatchObject({ status: "empty", totalMachines: 0, detail: { kind: "empty" } });
    expect(selectEventCatalogPanel(empty)).toMatchObject({ status: "empty", totalTopics: 0, detail: { kind: "empty" } });

    const snapshot = readySnapshot();
    const noTopics: WorkbenchSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        model: {
          status: "ready",
          diagnostics: [],
          model: {
            ...snapshot.state.model.model!,
            topics: [],
            relations: { machineIdsByTopicType: {}, topicTypesByMachineId: {} },
          },
        },
      },
    };

    expect(selectEventCatalogPanel(noTopics).detail).toMatchObject({ kind: "empty" });
  });
});

const buildModelSnapshotModel = (snapshot: WorkbenchSnapshot): GraphVisualizerModel | undefined => snapshot.state.model.model;
