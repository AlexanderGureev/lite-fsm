import type { LiteFsmGraphDocument } from "@lite-fsm/graph";
import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import type { GraphSimulationSnapshot } from "@lite-fsm/graph/simulator";
import { describe, expect, it } from "vitest";
import { createWorkbenchDiagnostic } from "../diagnostics";
import { createInitialWorkbenchSnapshot } from "./state";
import { createWorkbenchStore } from "./store";
import { selectMachineWorkbenchPanel } from "./machine-workbench-selectors";
import { buildSimulationOverlayInput } from "./simulation-overlay";
import type { WorkbenchSnapshot } from "./types";

const counts = {
  states: 2,
  consumedTopics: 1,
  producedTopics: 1,
  configTransitions: 1,
  reducerBranches: 1,
  effectEmissions: 1,
  diagnostics: 0,
};

const documentFixture = {
  source: { filename: "sample.ts", language: "ts" },
  diagnostics: [],
  machines: [],
  managers: [],
} as unknown as LiteFsmGraphDocument;
const rowSourceAnchors = [] as const;

const snapshotFixture = (): GraphSimulationSnapshot =>
  ({
    documentVersion: "doc:1",
    machineIds: ["player"],
    domainSlicesByMachineId: { player: "domain:player" },
    actorTemplateSlicesByMachineId: {},
    actorSliceIdsByMachineId: {},
    slices: {
      "domain:player": {
        sliceId: "domain:player",
        ref: { kind: "domain", machineId: "player" },
        machineId: "player",
        kind: "domain",
        stateId: "player:state:idle",
        stateKey: "idle",
        context: { kind: "json", value: {} },
        status: "active",
      },
    },
    timeline: {
      rootStepId: "root",
      currentStepId: "manual-effect",
      linearStepIds: ["root", "external-empty", "manual-config", "manual-effect"],
      childrenByStepId: {},
      stepsById: {
        root: {
          stepId: "root",
          index: 0,
          source: { kind: "initial" },
          consumed: [],
          emissions: [],
          choices: [],
          contextPatches: [],
          rowRefs: [],
          diagnostics: [],
        },
        "external-empty": {
          stepId: "external-empty",
          parentStepId: "root",
          index: 1,
          event: { type: "NOOP" },
          source: { kind: "external" },
          consumed: [],
          emissions: [],
          choices: [],
          contextPatches: [],
          rowRefs: [],
          diagnostics: [],
        },
        "manual-config": {
          stepId: "manual-config",
          parentStepId: "external-empty",
          index: 2,
          event: { type: "PLAY" },
          source: { kind: "manual-config", slice: { kind: "domain", machineId: "player" }, transitionId: "t:play" },
          consumed: [{ status: "committed", machineId: "player" }],
          emissions: [],
          choices: [],
          contextPatches: [],
          rowRefs: [{ kind: "transition", machineId: "player", transitionId: "t:play", sliceId: "domain:player" }],
          diagnostics: [],
        },
        "manual-effect": {
          stepId: "manual-effect",
          parentStepId: "manual-config",
          index: 3,
          event: { type: "DONE" },
          source: {
            kind: "manual-effect",
            slice: { kind: "domain", machineId: "player" },
            emissionId: "e:done",
            routing: { kind: "default" },
          },
          consumed: [{ status: "committed", machineId: "player" }],
          emissions: [],
          choices: [],
          contextPatches: [],
          rowRefs: [{ kind: "emission", machineId: "player", emissionId: "e:done", sliceId: "domain:player" }],
          diagnostics: [],
        },
      },
    },
    diagnostics: [],
  }) as unknown as GraphSimulationSnapshot;

const workbench = (machineId: string, kind: "domain" | "actorTemplate" | "unknown" = "domain") => ({
  machineId,
  title: machineId,
  kind,
  groupTag: kind === "actorTemplate" ? "jobs" : undefined,
  initialState: "idle",
  currentStateId: `${machineId}:state:idle`,
  sourceAnchors: rowSourceAnchors,
  diagnostics: [],
  globalBehavior: [
    {
      kind: "diagnostic",
      rowId: `${machineId}:diag`,
      machineId,
      diagnosticId: "diag",
      severity: "warning",
      message: "Diagnostic",
      capabilities: [],
      sourceAnchors: rowSourceAnchors,
    },
    {
      kind: "unknown",
      rowId: `${machineId}:unknown`,
      machineId,
      label: "unknown",
      reason: "dynamic",
      confidence: "unknown",
      capabilities: [],
      sourceAnchors: rowSourceAnchors,
    },
  ],
  states: [
    {
      stateId: `${machineId}:state:idle`,
      stateKey: "idle",
      kind: "normal",
      current: kind !== "actorTemplate",
      collapsed: false,
      badges: [{ kind: "initial", label: "initial" }],
      sourceAnchors: rowSourceAnchors,
      diagnosticIds: [],
      rows: [
        {
          kind: "config",
          rowId: `${machineId}:config:available`,
          machineId,
          sourceStateId: `${machineId}:state:idle`,
          eventType: "PLAY",
          acceptedTransitionId: "t:play",
          transitionId: "t:play",
          foldedReducerTransitionIds: [],
          target: { kind: "state", label: "playing" },
          confidence: "exact",
          simulation: { available: true },
          capabilities: [],
          sourceAnchors: rowSourceAnchors,
        },
        {
          kind: "config",
          rowId: `${machineId}:config:blocked`,
          machineId,
          sourceStateId: `${machineId}:state:idle`,
          eventType: "BLOCKED",
          acceptedTransitionId: "t:blocked",
          transitionId: "t:blocked",
          foldedReducerTransitionIds: [],
          target: { kind: "dynamic", label: "", blockedReason: "blocked-target" },
          confidence: "partial",
          capabilities: [],
          sourceAnchors: rowSourceAnchors,
        },
        {
          kind: "reducer",
          rowId: `${machineId}:reducer`,
          machineId,
          sourceStateId: `${machineId}:state:idle`,
          eventType: "REDUCE",
          acceptedTransitionId: "t:reduce",
          transitionId: "t:reduce",
          target: { kind: "dynamic", label: "" },
          foldedIntoConfig: true,
          confidence: "unknown",
          simulation: { available: true },
          capabilities: [],
          sourceAnchors: rowSourceAnchors,
        },
        {
          kind: "reducer",
          rowId: `${machineId}:reducer:expanded`,
          machineId,
          sourceStateId: `${machineId}:state:idle`,
          eventType: "REDUCE_EXPANDED",
          acceptedTransitionId: "t:reduce-expanded",
          transitionId: "t:reduce-expanded",
          target: { kind: "dynamic", label: "" },
          foldedIntoConfig: false,
          confidence: "exact",
          capabilities: [],
          sourceAnchors: rowSourceAnchors,
        },
        {
          kind: "effect",
          rowId: `${machineId}:effect:default`,
          machineId,
          sourceStateId: `${machineId}:state:idle`,
          sourceStateKey: "idle",
          emissionId: "e:done",
          eventType: "DONE",
          routing: { kind: "default" },
          confidence: "exact",
          dispatchability: "can-dispatch",
          simulation: { suggested: true, inspected: true },
          capabilities: [],
          sourceAnchors: rowSourceAnchors,
        },
        {
          kind: "effect",
          rowId: `${machineId}:effect:array`,
          machineId,
          sourceStateId: `${machineId}:state:idle`,
          sourceStateKey: "idle",
          emissionId: "e:array",
          eventType: "ARRAY",
          routing: { kind: "tag", target: { kind: "array", items: [{ kind: "literal", value: "jobs" }] } },
          confidence: "exact",
          simulation: { suggested: true },
          capabilities: [],
          sourceAnchors: rowSourceAnchors,
        },
        {
          kind: "effect",
          rowId: `${machineId}:effect:dynamic`,
          machineId,
          sourceStateId: `${machineId}:state:idle`,
          sourceStateKey: "idle",
          emissionId: "e:dynamic",
          eventType: "DYNAMIC",
          routing: { kind: "actor", target: { kind: "dynamic" } },
          confidence: "partial",
          capabilities: [],
          sourceAnchors: rowSourceAnchors,
        },
        {
          kind: "effect",
          rowId: `${machineId}:effect:self`,
          machineId,
          sourceStateId: `${machineId}:state:idle`,
          sourceStateKey: "idle",
          emissionId: "e:self",
          eventType: "SELF",
          routing: { kind: "group", target: { kind: "selfField", field: "groupTag" } },
          confidence: "exact",
          capabilities: [],
          sourceAnchors: rowSourceAnchors,
        },
        {
          kind: "effect",
          rowId: `${machineId}:effect:unknown`,
          machineId,
          sourceStateId: `${machineId}:state:idle`,
          sourceStateKey: "idle",
          emissionId: "e:unknown",
          eventType: "UNKNOWN",
          routing: { kind: "unknown" },
          confidence: "unknown",
          capabilities: [],
          sourceAnchors: rowSourceAnchors,
        },
        {
          kind: "effect",
          rowId: `${machineId}:effect:unscoped`,
          machineId,
          sourceStateId: `${machineId}:state:idle`,
          sourceStateKey: "idle",
          emissionId: "e:unscoped",
          eventType: "UNSCOPED",
          routing: { kind: "unscoped" },
          confidence: "exact",
          capabilities: [],
          sourceAnchors: rowSourceAnchors,
        },
      ],
    },
    {
      stateId: `${machineId}:state:collapsed`,
      stateKey: "collapsed",
      kind: "normal",
      current: false,
      collapsed: true,
      badges: [],
      sourceAnchors: rowSourceAnchors,
      diagnosticIds: [],
      rows: [],
    },
  ],
});

const modelFixture = (): GraphVisualizerModel =>
  ({
    version: "lite-fsm.visualizer/v1",
    source: { filename: "test.ts", language: "ts" },
    managers: [],
    diagnostics: [],
    rowMappings: {
      transitionRowIdsByTransitionId: {},
      emissionRowIdsByEmissionId: {},
      transitionRowIdsByMachineAndTransitionId: {},
      emissionRowIdsByMachineAndEmissionId: {},
      diagnostics: [],
    },
    relations: { machineIdsByTopicType: {}, topicTypesByMachineId: {} },
    topics: ["PLAY", "DONE", "NOOP"].map((eventType) => ({ eventType })),
    machines: [
      { machineId: "player", title: "player", kind: "domain", counts, consumedTopicTypes: [], producedTopicTypes: [], sourceAnchors: [], diagnosticIds: [], managerKeys: [] },
      { machineId: "worker", title: "worker", kind: "actorTemplate", groupTag: "jobs", counts: { ...counts, diagnostics: 1 }, consumedTopicTypes: [], producedTopicTypes: [], sourceAnchors: [], diagnosticIds: [], managerKeys: [] },
    ],
    workbenchMachines: {
      player: workbench("player"),
      worker: workbench("worker", "actorTemplate"),
      ghost: workbench("ghost"),
    },
  }) as unknown as GraphVisualizerModel;

const readySnapshot = (): WorkbenchSnapshot => {
  const snapshot = createInitialWorkbenchSnapshot();
  const simulationSnapshot = snapshotFixture();

  return {
    ...snapshot,
    state: {
      ...snapshot.state,
      compile: { ...snapshot.state.compile, status: "ready", document: documentFixture, diagnostics: [] },
      model: { status: "ready", diagnostics: [], model: modelFixture() },
      l3: { selectedMachineIds: ["player", "worker", "ghost"] },
      simulation: {
        ...snapshot.state.simulation,
        status: "running",
        snapshot: simulationSnapshot,
        overlay: buildSimulationOverlayInput({
          snapshot: simulationSnapshot,
          availableTransitions: [],
          suggestedEmissions: [],
          inspectedStepId: "manual-config",
        }),
        inspectedStepId: "manual-config",
        diagnostics: [
          createWorkbenchDiagnostic({
            diagnosticId: "sim",
            sourceVersion: 1,
            origin: "simulator",
            code: "sim",
            severity: "warning",
            message: "sim",
          }),
        ],
      },
    },
  };
};

describe("selectors machine workbench для L3", () => {
  it("строит пустой L3 view без model", () => {
    expect(selectMachineWorkbenchPanel(createInitialWorkbenchSnapshot())).toMatchObject({
      status: "empty",
      totalMachines: 0,
      cards: [],
      timeline: [],
    });
  });

  it("строит picker, cards, row actions, send groups и timeline", () => {
    const view = selectMachineWorkbenchPanel(readySnapshot());

    expect(view.machineRows.map((row) => [row.machineId, row.selected, row.kind])).toEqual([
      ["player", true, "domain"],
      ["worker", true, "actorTemplate"],
    ]);
    expect(view.actorApproximation).toBe(true);
    expect(view.diagnosticCount).toBe(1);
    expect(view.sendOptions.map((option) => [option.eventType, option.group])).toEqual([
      ["PLAY", "available"],
      ["DONE", "not-accepted"],
      ["NOOP", "not-accepted"],
    ]);
    expect(view.timeline.map((step) => [step.eventType, step.sourceLabel, step.empty, step.selected])).toEqual([
      ["initial", "initial", false, false],
      ["NOOP", "external", true, false],
      ["PLAY", "manual cfg", false, true],
      ["DONE", "manual eff", false, false],
    ]);

    const player = view.cards.find((card) => card.machineId === "player");
    const worker = view.cards.find((card) => card.machineId === "worker");
    const ghost = view.cards.find((card) => card.machineId === "ghost");
    if (!player || !worker || !ghost) throw new Error("Missing selected card.");

    expect(player.currentStateKey).toBe("idle");
    expect(worker.actorApproximation).toBe(true);
    expect(player.card.actions.find((action) => action.kind === "propose-source-edit")).toMatchObject({ enabled: false });
    expect(player.globalRows.map((row) => [row.kind, row.layer])).toEqual([
      ["diagnostic", "simulation"],
      ["unknown", "simulation"],
    ]);
    expect(player.states[0]?.rows.map((row) => [row.eventType, row.targetLabel, row.metaLabel, row.action.enabled])).toContainEqual([
      "PLAY",
      "playing",
      "exact",
      true,
    ]);
    expect(player.states[0]?.rows.map((row) => [row.eventType, row.targetLabel, row.metaLabel, row.action.reason])).toContainEqual([
      "BLOCKED",
      "blocked-target",
      "partial",
      "not-current",
    ]);
    expect(player.states[0]?.rows.map((row) => [row.eventType, row.targetLabel, row.metaLabel])).toContainEqual([
      "REDUCE_EXPANDED",
      "unknown",
      "exact",
    ]);
    expect(player.states[0]?.rows.map((row) => [row.eventType, row.targetLabel, row.action.reason])).toEqual(
      expect.arrayContaining([
        ["DONE", "default", undefined],
        ["ARRAY", "tag:[jobs]", "not-suggested"],
        ["DYNAMIC", "actor:dynamic", "not-suggested"],
        ["SELF", "group:self.groupTag", "not-suggested"],
        ["UNKNOWN", "unknown", "not-suggested"],
        ["UNSCOPED", "unscoped", "not-suggested"],
      ]),
    );
    expect(worker.currentStateKey).toBe("idle");
    expect(ghost.states[0]?.rows.find((row) => row.eventType === "PLAY")?.action.reason).toBe("ambiguous-slice");
  });

  it("строит ready view без timeline если snapshot симуляции отсутствует", () => {
    const snapshot = readySnapshot();
    const view = selectMachineWorkbenchPanel({
      ...snapshot,
      state: {
        ...snapshot.state,
        l3: { selectedMachineIds: ["player"] },
        simulation: { ...snapshot.state.simulation, snapshot: undefined },
      },
    });

    expect(view.status).toBe("ready");
    expect(view.timeline).toEqual([]);
  });

  it("сохраняет ссылку L3 view при toggle консоли и меняет только inspect output при выборе timeline step", () => {
    const store = createWorkbenchStore(readySnapshot());
    const before = selectMachineWorkbenchPanel(store.getSnapshot());
    const snapshotBeforeInspect = store.getSnapshot().state.simulation.snapshot;

    store.dispatch({ type: "panel.console.toggled", open: true });
    expect(selectMachineWorkbenchPanel(store.getSnapshot())).toBe(before);

    const inspectOutput = store.dispatch({ type: "l3.timeline.step.selected", stepId: "manual-effect" });
    const afterInspect = selectMachineWorkbenchPanel(store.getSnapshot());

    expect(afterInspect).not.toBe(before);
    expect(store.getSnapshot().state.simulation.snapshot).toBe(snapshotBeforeInspect);
    expect(afterInspect.timeline.map((step) => [step.stepId, step.selected])).toEqual([
      ["root", false],
      ["external-empty", false],
      ["manual-config", false],
      ["manual-effect", true],
    ]);
    expect(inspectOutput.effects).toEqual([
      expect.objectContaining({
        kind: "build-model",
        purpose: "simulation-overlay",
        requestId: "model:1:simulation:manual-effect",
      }),
    ]);
  });
});
