import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { describe, expect, it } from "vitest";
import { openMachineBoard } from "./noop-adapter";
import { selectMachineCanvasBoard } from "./machine-canvas-selectors";
import { createInitialWorkbenchSnapshot } from "../workbench/state";
import type { WorkbenchSnapshot } from "../workbench/types";

const emptyAnchors = [] as const;

const machineWorkbench = (machineId: string, current = true) => ({
  machineId,
  title: machineId,
  kind: "domain" as const,
  initialState: "idle",
  ...(current ? { currentStateId: `${machineId}:state:playing` } : {}),
  sourceAnchors: emptyAnchors,
  diagnostics: [],
  globalBehavior: [],
  states: [
    {
      stateId: `${machineId}:state:idle`,
      stateKey: "idle",
      kind: "normal" as const,
      current: false,
      collapsed: false,
      badges: [{ kind: "initial" as const, label: "initial" }],
      sourceAnchors: emptyAnchors,
      diagnosticIds: [],
      rows: [
        {
          kind: "config" as const,
          rowId: `${machineId}:row:play`,
          machineId,
          sourceStateId: `${machineId}:state:idle`,
          eventType: "PLAY",
          acceptedTransitionId: `${machineId}:accepted:play`,
          transitionId: `${machineId}:transition:play`,
          foldedReducerTransitionIds: [],
          target: { kind: "state" as const, stateId: `${machineId}:state:playing`, label: "playing" },
          confidence: "exact" as const,
          capabilities: [],
          sourceAnchors: emptyAnchors,
        },
      ],
    },
    {
      stateId: `${machineId}:state:playing`,
      stateKey: "playing",
      kind: "normal" as const,
      current,
      collapsed: false,
      badges: [],
      sourceAnchors: emptyAnchors,
      diagnosticIds: [],
      rows: [],
    },
  ],
});

const modelFixture = (
  machineIds: readonly string[] = ["player"],
  current = true,
): GraphVisualizerModel =>
  ({
    version: "lite-fsm.visualizer/v1",
    machines: machineIds.map((machineId) => ({
      machineId,
      title: machineId,
      kind: "domain",
      counts: {
        states: 2,
        consumedTopics: 1,
        producedTopics: 0,
        configTransitions: 1,
        reducerBranches: 0,
        effectEmissions: 0,
        diagnostics: 0,
      },
    })),
    managers: [],
    topics: [],
    relations: { machineIdsByTopicType: {} },
    diagnostics: [],
    rowMappings: {},
    workbenchMachines: Object.fromEntries(machineIds.map((machineId) => [machineId, machineWorkbench(machineId, current)])),
  }) as unknown as GraphVisualizerModel;

const snapshotWithBoard = (
  model: GraphVisualizerModel | undefined,
  machineId = "player",
): WorkbenchSnapshot => {
  const snapshot = createInitialWorkbenchSnapshot();

  return {
    ...snapshot,
    state: {
      ...snapshot.state,
      canvas: openMachineBoard(snapshot.state.canvas, snapshot.state.source.version, machineId),
      model: model
        ? { status: "ready", model, diagnostics: [] }
        : snapshot.state.model,
    },
  };
};

describe("machine canvas selectors", () => {
  it("возвращает not-opened когда board не открыт", () => {
    expect(selectMachineCanvasBoard(createInitialWorkbenchSnapshot())).toEqual({
      status: "not-opened",
      reason: "not-opened",
    });
  });

  it("возвращает missing-model когда board открыт без model", () => {
    const snapshot = snapshotWithBoard(undefined);

    expect(selectMachineCanvasBoard(snapshot)).toEqual({
      status: "missing-model",
      reason: "missing-model",
      board: { sourceVersion: 1, machineId: "player" },
    });
  });

  it("пробрасывает missing-machine из Machine Flow Model", () => {
    const snapshot = snapshotWithBoard(modelFixture(["other"]));

    expect(selectMachineCanvasBoard(snapshot)).toEqual({
      status: "missing-machine",
      sourceVersion: 1,
      machineId: "player",
    });
  });

  it("пробрасывает ready Machine Flow Model без fallback initial как current", () => {
    const snapshot = snapshotWithBoard(modelFixture(["player"], false));
    const view = selectMachineCanvasBoard(snapshot);

    expect(view.status).toBe("ready");
    if (view.status !== "ready") return;

    expect(view.sourceVersion).toBe(1);
    expect(view.machineId).toBe("player");
    expect(view.flow.machine.initialState).toBe("idle");
    expect(view.flow.machine.currentStateKey).toBeUndefined();
    expect(view.flow.nodes.map((node) => [node.label, node.role])).toEqual([
      ["idle", "initial"],
      ["playing", "normal"],
    ]);
    expect(view.flow.edgeGroups).toHaveLength(1);
  });

  it("пробрасывает ready Machine Flow Model с current state из model", () => {
    const snapshot = snapshotWithBoard(modelFixture(["player"], true));
    const view = selectMachineCanvasBoard(snapshot);

    expect(view.status).toBe("ready");
    if (view.status !== "ready") return;

    expect(view.flow.machine.currentStateKey).toBe("playing");
    expect(view.flow.nodes.map((node) => [node.label, node.role])).toEqual([
      ["idle", "initial"],
      ["playing", "current"],
    ]);
  });

  it("сохраняет selector output ref для неизменных board и model refs", () => {
    const snapshot = snapshotWithBoard(modelFixture());
    const first = selectMachineCanvasBoard(snapshot);
    const second = selectMachineCanvasBoard(snapshot);

    expect(second).toBe(first);
  });
});
