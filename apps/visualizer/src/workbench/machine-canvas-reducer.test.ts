import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { describe, expect, it } from "vitest";
import { openMachineBoard } from "../canvas";
import { createWorkbenchDiagnostic } from "../diagnostics";
import { createInitialWorkbenchSnapshot } from "./state";
import { createWorkbenchStore } from "./store";
import type { WorkbenchSnapshot } from "./types";

const emptyAnchors = [] as const;

const machineWorkbench = (machineId: string, current = true) => ({
  machineId,
  title: machineId,
  kind: "domain" as const,
  initialState: "idle",
  ...(current ? { currentStateId: `${machineId}:state:idle` } : {}),
  sourceAnchors: emptyAnchors,
  diagnostics: [],
  globalBehavior: [],
  states: [
    {
      stateId: `${machineId}:state:idle`,
      stateKey: "idle",
      kind: "normal" as const,
      current,
      collapsed: false,
      badges: [{ kind: "initial" as const, label: "initial" }],
      sourceAnchors: emptyAnchors,
      diagnosticIds: [],
      rows: [],
    },
  ],
});

const modelFixture = (machineIds: readonly string[] = ["player"]): GraphVisualizerModel =>
  ({
    version: "lite-fsm.visualizer/v1",
    machines: machineIds.map((machineId) => ({
      machineId,
      title: machineId,
      kind: "domain",
      counts: {
        states: 1,
        consumedTopics: 0,
        producedTopics: 0,
        configTransitions: 0,
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
    workbenchMachines: Object.fromEntries(machineIds.map((machineId) => [machineId, machineWorkbench(machineId)])),
  }) as unknown as GraphVisualizerModel;

const readySnapshot = (model: GraphVisualizerModel = modelFixture()): WorkbenchSnapshot => {
  const snapshot = createInitialWorkbenchSnapshot();

  return {
    ...snapshot,
    state: {
      ...snapshot.state,
      model: { status: "ready", model, diagnostics: [] },
    },
  };
};

const snapshotWithOpenedBoard = (overrides: Partial<WorkbenchSnapshot["state"]> = {}): WorkbenchSnapshot => {
  const snapshot = readySnapshot();
  const state = {
    ...snapshot.state,
    canvas: openMachineBoard(snapshot.state.canvas, snapshot.state.source.version, "player"),
    ...overrides,
  };

  return { ...snapshot, state };
};

const expectClosedCanvas = (canvas: WorkbenchSnapshot["state"]["canvas"]): void => {
  expect(canvas).toEqual({ adapter: { kind: "none" }, items: [] });
  expect(canvas).not.toHaveProperty("machineBoard");
};

const diagnostic = createWorkbenchDiagnostic({
  diagnosticId: "compiler:1:error",
  sourceVersion: 1,
  origin: "compiler",
  code: "bad-source",
  severity: "error",
  message: "Bad source",
  sourceAnchors: [],
});

describe("редьюсер machine canvas", () => {
  it("открывает board и сохраняет source version с machine id", () => {
    const store = createWorkbenchStore(readySnapshot());

    const output = store.dispatch({ type: "canvas.machine-board.opened", machineId: "player" });

    expect(output).toEqual({ result: { ok: true }, effects: [] });
    expect(store.getSnapshot().state.canvas).toEqual({
      adapter: { kind: "machine-canvas" },
      items: [],
      machineBoard: { sourceVersion: 1, machineId: "player" },
    });
    expect(store.getSnapshot().revisions.canvas).toBe(1);

    const beforeSameOpen = store.getSnapshot();
    store.dispatch({ type: "canvas.machine-board.opened", machineId: "player" });
    expect(store.getSnapshot()).toBe(beforeSameOpen);
  });

  it("переключает открытую board на другую machine и сохраняет items", () => {
    const model = modelFixture(["player", "queue"]);
    const snapshot = readySnapshot(model);
    const store = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        canvas: {
          ...openMachineBoard(snapshot.state.canvas, snapshot.state.source.version, "player"),
          items: [{ kind: "diagnostic", diagnosticId: "diagnostic:1" }],
        },
      },
    });
    const previousItems = store.getSnapshot().state.canvas.items;

    store.dispatch({ type: "canvas.machine-board.opened", machineId: "queue" });

    expect(store.getSnapshot().state.canvas).toEqual({
      adapter: { kind: "machine-canvas" },
      items: previousItems,
      machineBoard: { sourceVersion: 1, machineId: "queue" },
    });
    expect(store.getSnapshot().state.canvas.items).toBe(previousItems);
  });

  it("не мутирует canvas при missing model или missing machine", () => {
    const missingModelStore = createWorkbenchStore();
    const missingModelSnapshot = missingModelStore.getSnapshot();

    expect(missingModelStore.dispatch({ type: "canvas.machine-board.opened", machineId: "player" }).result).toEqual({
      ok: false,
      reason: "missing-model",
      diagnostics: [],
    });
    expect(missingModelStore.getSnapshot()).toBe(missingModelSnapshot);

    const missingMachineStore = createWorkbenchStore(readySnapshot(modelFixture(["other"])));
    const missingMachineSnapshot = missingMachineStore.getSnapshot();

    expect(missingMachineStore.dispatch({ type: "canvas.machine-board.opened", machineId: "player" }).result).toEqual({
      ok: false,
      reason: "missing-machine",
      diagnostics: [],
    });
    expect(missingMachineStore.getSnapshot()).toBe(missingMachineSnapshot);
  });

  it("закрывает только board state без сброса L3 selection и simulation", () => {
    const simulation = {
      ...createInitialWorkbenchSnapshot().state.simulation,
      status: "running" as const,
      selectedMachineIds: ["player"],
      scope: { kind: "machines" as const, machineIds: ["player"] },
      snapshot: { timeline: { currentStepId: "step:1" } } as never,
    };
    const store = createWorkbenchStore(snapshotWithOpenedBoard({
      l3: { selectedMachineIds: ["player"] },
      simulation,
    }));
    const before = store.getSnapshot();

    store.dispatch({ type: "canvas.machine-board.closed" });

    expectClosedCanvas(store.getSnapshot().state.canvas);
    expect(store.getSnapshot().state.l3).toBe(before.state.l3);
    expect(store.getSnapshot().state.simulation).toBe(before.state.simulation);

    const beforeSecondClose = store.getSnapshot();
    store.dispatch({ type: "canvas.machine-board.closed" });
    expect(store.getSnapshot()).toBe(beforeSecondClose);
  });

  it("очищает board при source edit и compile reset", () => {
    const sourceStore = createWorkbenchStore(snapshotWithOpenedBoard());

    sourceStore.dispatch({ type: "source.changed", source: "export const next = 1;" });

    expectClosedCanvas(sourceStore.getSnapshot().state.canvas);

    const compileStore = createWorkbenchStore(snapshotWithOpenedBoard());
    compileStore.dispatch({ type: "source.open-visualizer" });

    expectClosedCanvas(compileStore.getSnapshot().state.canvas);
  });

  it("очищает board при matching compile failure и model failure", () => {
    const compileStore = createWorkbenchStore(snapshotWithOpenedBoard({
      compile: { status: "running", requestId: "compile:1:1", sequence: 1, diagnostics: [] },
    }));

    compileStore.dispatch({ type: "compile.failed", requestId: "compile:1:1", sourceVersion: 1, diagnostics: [diagnostic] });

    expectClosedCanvas(compileStore.getSnapshot().state.canvas);

    const modelStore = createWorkbenchStore(snapshotWithOpenedBoard({
      model: { status: "running", requestId: "model:1:1", diagnostics: [] },
    }));

    modelStore.dispatch({ type: "model.failed", requestId: "model:1:1", sourceVersion: 1, diagnostics: [diagnostic] });

    expectClosedCanvas(modelStore.getSnapshot().state.canvas);
  });

  it("сохраняет snapshot при stale compile/model responses", () => {
    const staleStore = createWorkbenchStore(snapshotWithOpenedBoard());
    const beforeStale = staleStore.getSnapshot();

    staleStore.dispatch({ type: "compile.failed", requestId: "compile:old", sourceVersion: 0, diagnostics: [diagnostic] });

    expect(staleStore.getSnapshot()).toBe(beforeStale);

    const modelStore = createWorkbenchStore(snapshotWithOpenedBoard({
      model: { status: "running", requestId: "model:1:1", diagnostics: [] },
    }));
    const beforeModelStale = modelStore.getSnapshot();

    modelStore.dispatch({ type: "model.failed", requestId: "model:old", sourceVersion: 1, diagnostics: [diagnostic] });

    expect(modelStore.getSnapshot()).toBe(beforeModelStale);
  });

  it("сохраняет canvas ref для unrelated commands и no-op invalidation без board", () => {
    const emptyStore = createWorkbenchStore(readySnapshot());
    const beforeCompileReset = emptyStore.getSnapshot();

    emptyStore.dispatch({ type: "source.open-visualizer" });

    expect(emptyStore.getSnapshot().state.canvas).toBe(beforeCompileReset.state.canvas);

    const unrelatedStore = createWorkbenchStore(snapshotWithOpenedBoard());
    const beforeUnrelated = unrelatedStore.getSnapshot();

    unrelatedStore.dispatch({ type: "tab.selected", tab: "events" });

    expect(unrelatedStore.getSnapshot()).not.toBe(beforeUnrelated);
    expect(unrelatedStore.getSnapshot().state.canvas).toBe(beforeUnrelated.state.canvas);
  });
});
