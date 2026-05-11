import type { GraphDiagnostic, LiteFsmGraphDocument } from "@lite-fsm/graph";
import type { GraphSourceAnchor, GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import type { ConsoleEntry } from "../console";
import { describe, expect, it, vi } from "vitest";
import { createInitialWorkbenchSnapshot } from "./state";
import { createWorkbenchStore } from "./store";
import {
  selectActiveTab,
  selectConsolePanel,
  selectCurrentEmptyPanel,
  selectSourcePanel,
  selectTabItems,
  shallowEqualObject,
} from "./selectors";
import type { WorkbenchSnapshot } from "./types";

const documentFixture = { source: { filename: "sample.ts", language: "ts" }, diagnostics: [], machines: [], managers: [] } as unknown as LiteFsmGraphDocument;
const modelFixture = { version: "lite-fsm.visualizer/v1", machines: [], managers: [], topics: [], diagnostics: [], workbenchMachines: {} } as unknown as GraphVisualizerModel;
const modelWithDiagnosticsFixture = {
  ...modelFixture,
  diagnostics: [
    {
      diagnosticId: "analyzer:player:warn:0",
      origin: "analyzer" as const,
      diagnostic: { code: "warn", severity: "warning" as const, message: "Analyzer warning" },
      graphItemRef: { kind: "machine" as const, machineId: "player" },
    },
  ],
} as unknown as GraphVisualizerModel;
const countedModelFixture = {
  ...modelFixture,
  machines: [{ machineId: "one" }, { machineId: "two" }],
  topics: [{ eventType: "PLAY" }, { eventType: "STOP" }, { eventType: "PAUSE" }],
} as unknown as GraphVisualizerModel;
const analysisDiagnostics: readonly GraphDiagnostic[] = [{ code: "info", severity: "info", message: "ready" }];
const diagnostic = {
  diagnosticId: "compiler:1:bad",
  sourceVersion: 1,
  origin: "compiler" as const,
  diagnostic: { code: "bad", severity: "error" as const, message: "Bad source" },
  sourceAnchors: [],
  primaryTarget: { kind: "console" as const },
};

describe("store workbench визуализатора", () => {
  it("не уведомляет subscribers для no-op command", () => {
    const store = createWorkbenchStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();

    const output = store.dispatch({ type: "tab.selected", tab: "source" });

    expect(output).toEqual({ result: { ok: true }, effects: [] });
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("сохраняет refs несвязанных slices при выборе вкладки", () => {
    const store = createWorkbenchStore();
    const before = store.getSnapshot();

    store.dispatch({ type: "tab.selected", tab: "events" });
    const after = store.getSnapshot();

    expect(after).not.toBe(before);
    expect(selectActiveTab(after)).toBe("events");
    expect(after.state.source).toBe(before.state.source);
    expect(after.state.model).toBe(before.state.model);
    expect(after.revisions.activeTab).toBe(before.revisions.activeTab + 1);
    expect(after.revisions.panels).toBe(before.revisions.panels);
    expect(after.revisions.model).toBe(before.revisions.model);
  });

  it("возвращает стабильные refs selectors для неизменных inputs", () => {
    const store = createWorkbenchStore();
    const firstTabs = selectTabItems(store.getSnapshot());
    const secondTabs = selectTabItems(store.getSnapshot());
    const firstConsole = selectConsolePanel(store.getSnapshot());
    const secondConsole = selectConsolePanel(store.getSnapshot());
    const firstSource = selectSourcePanel(store.getSnapshot());
    const secondSource = selectSourcePanel(store.getSnapshot());

    expect(secondTabs).toBe(firstTabs);
    expect(secondConsole).toBe(firstConsole);
    expect(secondSource).toBe(firstSource);
    expect(selectCurrentEmptyPanel(store.getSnapshot())).toBe(selectCurrentEmptyPanel(store.getSnapshot()));
  });

  it("сравнивает selector inputs без stale совпадений при изменении формы объекта", () => {
    expect(shallowEqualObject({ activeTab: "source" }, { activeTab: "source" })).toBe(true);
    expect(shallowEqualObject("source", "source")).toBe(true);
    expect(shallowEqualObject("source", "system")).toBe(false);
    expect(shallowEqualObject(null, {})).toBe(false);
    expect(shallowEqualObject({ activeTab: "source" }, { activeTab: "source", extra: true })).toBe(false);
    expect(shallowEqualObject({ activeTab: "source" }, { activeTab: "system" })).toBe(false);
  });

  it("возвращает пустой panel view для каждой вкладки", () => {
    const store = createWorkbenchStore();

    expect(selectCurrentEmptyPanel(store.getSnapshot()).title).toBe("Source pipeline");
    store.dispatch({ type: "tab.selected", tab: "system" });
    expect(selectCurrentEmptyPanel(store.getSnapshot()).title).toBe("System inventory");
    store.dispatch({ type: "tab.selected", tab: "events" });
    expect(selectCurrentEmptyPanel(store.getSnapshot()).title).toBe("Event catalog");
    store.dispatch({ type: "tab.selected", tab: "machines" });
    expect(selectCurrentEmptyPanel(store.getSnapshot()).title).toBe("Machine workbench");

    const snapshot = createInitialWorkbenchSnapshot();
    const readyStore = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        model: { status: "ready", model: countedModelFixture, diagnostics: [] },
      },
    });
    readyStore.dispatch({ type: "tab.selected", tab: "system" });
    expect(selectCurrentEmptyPanel(readyStore.getSnapshot()).body).toContain("2 machines");
    readyStore.dispatch({ type: "tab.selected", tab: "events" });
    expect(selectCurrentEmptyPanel(readyStore.getSnapshot()).body).toContain("3 topics");
    readyStore.dispatch({ type: "tab.selected", tab: "machines" });
    expect(selectCurrentEmptyPanel(readyStore.getSnapshot()).body).toContain("2 machines");
  });

  it("строит tab counters для ready model и выбранных L3 машин", () => {
    const snapshot = createInitialWorkbenchSnapshot();
    const store = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        model: { status: "ready", model: countedModelFixture, diagnostics: [] },
        l3: { selectedMachineIds: ["one"] },
      },
    });

    expect(selectTabItems(store.getSnapshot())).toEqual([
      { tab: "source", label: "Source", count: "", selected: true },
      { tab: "system", label: "System", count: "2", selected: false },
      { tab: "events", label: "Events", count: "3", selected: false },
      { tab: "machines", label: "Machines", count: "1/2", selected: false },
    ]);
  });

  it("строит source и console selectors для pipeline state", () => {
    const store = createWorkbenchStore();
    expect(selectSourcePanel(store.getSnapshot())).toMatchObject({
      filename: "sample.ts",
      compileStatus: "idle",
      modelStatus: "idle",
      canOpen: true,
      running: false,
    });

    store.dispatch({ type: "source.open-visualizer" });
    expect(selectSourcePanel(store.getSnapshot())).toMatchObject({
      compileStatus: "running",
      canOpen: false,
      running: true,
    });
    expect(selectConsolePanel(store.getSnapshot()).channels).toEqual([
      { channel: "all", label: "All", count: 1, selected: true },
      { channel: "system", label: "System", count: 1, selected: false },
      { channel: "diagnostics", label: "Diagnostics", count: 0, selected: false },
      { channel: "debug", label: "Debug", count: 0, selected: false },
    ]);

    store.dispatch({ type: "compile.failed", requestId: "compile:1:1", sourceVersion: 1, diagnostics: [diagnostic] });
    store.dispatch({ type: "console.channel.selected", channel: "diagnostics" });

    expect(selectConsolePanel(store.getSnapshot())).toMatchObject({
      selectedChannel: "diagnostics",
      totalEntries: 2,
      entries: [{ channel: "diagnostics", message: "Bad source" }],
    });
  });

  it("блокирует Open visualizer для пустого source и для running стадий", () => {
    const snapshot = createInitialWorkbenchSnapshot();
    const emptySource = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        source: { ...snapshot.state.source, source: "   ", hash: "lfg1:blank" },
      },
    });
    const runningAnalysis = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        analysis: { status: "running", requestId: "analyze:1:1", diagnostics: [], appDiagnostics: [] },
      },
    });
    const runningModel = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        model: { status: "running", requestId: "model:1:1", diagnostics: [] },
      },
    });
    const runningValidation = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        validation: { status: "running", requestId: "validation:1:1", providers: [], diagnostics: [] },
      },
    });

    expect(selectSourcePanel(emptySource.getSnapshot())).toMatchObject({ canOpen: false, running: false });
    expect(selectSourcePanel(runningAnalysis.getSnapshot())).toMatchObject({ canOpen: false, running: true });
    expect(selectSourcePanel(runningModel.getSnapshot())).toMatchObject({ canOpen: false, running: true });
    expect(selectSourcePanel(runningValidation.getSnapshot())).toMatchObject({ canOpen: false, running: true });
  });

  it("использует fallback source filename в selectors и system console entry", () => {
    const snapshot = createInitialWorkbenchSnapshot();
    const store = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        source: { source: "export const value = 1;", language: "ts", version: 1, hash: "lfg1:none" },
      },
    });

    store.dispatch({ type: "source.open-visualizer" });

    expect(selectSourcePanel(store.getSnapshot()).filename).toBe("source");
    expect(store.getSnapshot().state.console.entries[0]?.message).toBe("Compiling source at version 1.");
  });

  it("создает compile descriptor вместо прямого async вызова", () => {
    const store = createWorkbenchStore();
    const output = store.dispatch({ type: "source.open-visualizer" });

    expect(output.effects).toEqual([
      {
        kind: "compile",
        requestId: "compile:1:1",
        source: store.getSnapshot().state.source,
      },
    ]);
    expect(store.getSnapshot().state.compile.status).toBe("running");
    expect(store.getSnapshot().state.console.entries[0]).toMatchObject({ channel: "system", title: "Source pipeline started" });
  });

  it("открытие visualizer очищает старые diagnostics/console и увеличивает sequence", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });
    store.dispatch({ type: "compile.failed", requestId: "compile:1:1", sourceVersion: 1, diagnostics: [diagnostic] });
    store.dispatch({ type: "console.channel.selected", channel: "diagnostics" });
    store.dispatch({ type: "console.entry.selected", entryId: "diagnostic:compiler:1:bad" });

    const output = store.dispatch({ type: "source.open-visualizer" });

    expect(output.effects).toEqual([
      {
        kind: "compile",
        requestId: "compile:1:2",
        source: store.getSnapshot().state.source,
      },
    ]);
    expect(store.getSnapshot().state.compile.sequence).toBe(2);
    expect(store.getSnapshot().state.diagnostics).toEqual([]);
    expect(store.getSnapshot().state.console.selectedChannel).toBe("diagnostics");
    expect(store.getSnapshot().state.console.entries).toEqual([
      expect.objectContaining({ entryId: "system:1:open:2", channel: "system" }),
    ]);
    expect(store.getSnapshot().state.panels.console.selectedEntryId).toBeUndefined();
  });

  it("игнорирует stale async response без уведомления", () => {
    const store = createWorkbenchStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();

    const output = store.dispatch({
      type: "compile.succeeded",
      requestId: "compile:old",
      sourceVersion: 0,
      document: documentFixture,
    });

    expect(output.result).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("игнорирует responses с правильной sourceVersion, но устаревшим requestId", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });
    const beforeCompile = store.getSnapshot();

    expect(
      store.dispatch({
        type: "compile.failed",
        requestId: "compile:1:old",
        sourceVersion: 1,
        diagnostics: [diagnostic],
      }).result,
    ).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(beforeCompile);

    store.dispatch({ type: "compile.succeeded", requestId: "compile:1:1", sourceVersion: 1, document: documentFixture });
    const beforeAnalysis = store.getSnapshot();
    expect(
      store.dispatch({
        type: "analysis.failed",
        requestId: "analyze:1:old",
        sourceVersion: 1,
        diagnostics: [diagnostic],
      }).result,
    ).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(beforeAnalysis);

    store.dispatch({ type: "analysis.succeeded", requestId: "analyze:1:1", sourceVersion: 1, diagnostics: [] });
    const beforeModel = store.getSnapshot();
    expect(
      store.dispatch({
        type: "model.failed",
        requestId: "model:1:old",
        sourceVersion: 1,
        diagnostics: [diagnostic],
      }).result,
    ).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(beforeModel);
  });

  it("ведет successful compile к analysis descriptor", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });

    const output = store.dispatch({
      type: "compile.succeeded",
      requestId: "compile:1:1",
      sourceVersion: 1,
      document: documentFixture,
    });

    expect(store.getSnapshot().state.compile.status).toBe("ready");
    expect(store.getSnapshot().state.analysis.status).toBe("running");
    expect(output.effects).toEqual([
      {
        kind: "analyze",
        requestId: "analyze:1:1",
        sourceVersion: 1,
        document: documentFixture,
      },
    ]);
  });

  it("ведет analysis к model descriptor и model к validation descriptor", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });
    store.dispatch({ type: "compile.succeeded", requestId: "compile:1:1", sourceVersion: 1, document: documentFixture });

    const analysisOutput = store.dispatch({
      type: "analysis.succeeded",
      requestId: "analyze:1:1",
      sourceVersion: 1,
      diagnostics: analysisDiagnostics,
    });

    expect(analysisOutput.effects[0]).toEqual({
      kind: "build-model",
      requestId: "model:1:1",
      purpose: "pipeline",
      sourceVersion: 1,
      document: documentFixture,
      analysisDiagnostics,
    });

    const modelOutput = store.dispatch({
      type: "model.succeeded",
      requestId: "model:1:1",
      sourceVersion: 1,
      model: modelFixture,
    });

    expect(store.getSnapshot().state.activeTab).toBe("system");
    expect(modelOutput.effects[0]).toEqual({
      kind: "run-validation",
      requestId: "validation:1:1",
      sourceVersion: 1,
      document: documentFixture,
      model: modelFixture,
    });
  });

  it("нормализует model diagnostics как неблокирующее состояние", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });
    store.dispatch({ type: "compile.succeeded", requestId: "compile:1:1", sourceVersion: 1, document: documentFixture });
    store.dispatch({ type: "analysis.succeeded", requestId: "analyze:1:1", sourceVersion: 1, diagnostics: analysisDiagnostics });

    store.dispatch({
      type: "model.succeeded",
      requestId: "model:1:1",
      sourceVersion: 1,
      model: modelWithDiagnosticsFixture,
    });

    expect(store.getSnapshot().state.model.status).toBe("ready");
    expect(store.getSnapshot().state.model.diagnostics).toMatchObject([
      {
        diagnosticId: "analyzer:player:warn:0",
        sourceVersion: 1,
        origin: "analyzer",
        graphItemRef: { kind: "machine", machineId: "player" },
        primaryTarget: { kind: "graph", ref: { kind: "machine", machineId: "player" } },
      },
    ]);
    expect(store.getSnapshot().state.console.entries.some((entry) => entry.message === "Analyzer warning")).toBe(true);
  });

  it("пишет diagnostics и entries консоли для failed responses", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });

    store.dispatch({ type: "compile.failed", requestId: "compile:1:1", sourceVersion: 1, diagnostics: [diagnostic] });

    expect(store.getSnapshot().state.diagnostics).toEqual([diagnostic]);
    expect(store.getSnapshot().state.console.entries.map((entry) => entry.message)).toContain("Bad source");
  });

  it("failed responses завершают текущую стадию без последующих effects", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });

    expect(
      store.dispatch({ type: "compile.failed", requestId: "compile:1:1", sourceVersion: 1, diagnostics: [diagnostic] }),
    ).toMatchObject({ result: { ok: true }, effects: [] });

    store.dispatch({ type: "source.open-visualizer" });
    store.dispatch({ type: "compile.succeeded", requestId: "compile:1:2", sourceVersion: 1, document: documentFixture });
    expect(
      store.dispatch({ type: "analysis.failed", requestId: "analyze:1:1", sourceVersion: 1, diagnostics: [diagnostic] }),
    ).toMatchObject({ result: { ok: true }, effects: [] });

    store.dispatch({ type: "source.open-visualizer" });
    store.dispatch({ type: "compile.succeeded", requestId: "compile:1:3", sourceVersion: 1, document: documentFixture });
    store.dispatch({ type: "analysis.succeeded", requestId: "analyze:1:1", sourceVersion: 1, diagnostics: [] });
    expect(
      store.dispatch({ type: "model.failed", requestId: "model:1:1", sourceVersion: 1, diagnostics: [diagnostic] }),
    ).toMatchObject({ result: { ok: true }, effects: [] });
  });

  it("применяет failed responses для analysis, model и validation", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });
    store.dispatch({ type: "compile.succeeded", requestId: "compile:1:1", sourceVersion: 1, document: documentFixture });
    store.dispatch({ type: "analysis.failed", requestId: "analyze:1:1", sourceVersion: 1, diagnostics: [diagnostic] });
    expect(store.getSnapshot().state.analysis.status).toBe("failed");

    store.dispatch({ type: "source.open-visualizer" });
    store.dispatch({ type: "compile.succeeded", requestId: "compile:1:2", sourceVersion: 1, document: documentFixture });
    store.dispatch({ type: "analysis.succeeded", requestId: "analyze:1:1", sourceVersion: 1, diagnostics: [] });
    store.dispatch({ type: "model.failed", requestId: "model:1:1", sourceVersion: 1, diagnostics: [diagnostic] });
    expect(store.getSnapshot().state.model.status).toBe("failed");

    store.dispatch({ type: "source.open-visualizer" });
    store.dispatch({ type: "compile.succeeded", requestId: "compile:1:3", sourceVersion: 1, document: documentFixture });
    store.dispatch({ type: "analysis.succeeded", requestId: "analyze:1:1", sourceVersion: 1, diagnostics: [] });
    store.dispatch({ type: "model.succeeded", requestId: "model:1:1", sourceVersion: 1, model: modelFixture });
    store.dispatch({ type: "validation.failed", requestId: "validation:1:1", sourceVersion: 1, diagnostics: [diagnostic] });
    expect(store.getSnapshot().state.validation.status).toBe("blocked");
  });

  it("обрабатывает validation succeeded без diagnostics", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });
    store.dispatch({ type: "compile.succeeded", requestId: "compile:1:1", sourceVersion: 1, document: documentFixture });
    store.dispatch({ type: "analysis.succeeded", requestId: "analyze:1:1", sourceVersion: 1, diagnostics: [] });
    store.dispatch({ type: "model.succeeded", requestId: "model:1:1", sourceVersion: 1, model: modelFixture });

    store.dispatch({ type: "validation.succeeded", requestId: "validation:1:1", sourceVersion: 1, diagnostics: [] });

    expect(store.getSnapshot().state.validation.status).toBe("ready");
    expect(store.getSnapshot().state.console.entries).toHaveLength(1);
    expect(store.getSnapshot().state.console.entries[0]?.channel).toBe("system");
  });

  it("добавляет validation diagnostics в validation/global diagnostics/console", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });
    store.dispatch({ type: "compile.succeeded", requestId: "compile:1:1", sourceVersion: 1, document: documentFixture });
    store.dispatch({ type: "analysis.succeeded", requestId: "analyze:1:1", sourceVersion: 1, diagnostics: [] });
    store.dispatch({ type: "model.succeeded", requestId: "model:1:1", sourceVersion: 1, model: modelFixture });

    store.dispatch({ type: "validation.succeeded", requestId: "validation:1:1", sourceVersion: 1, diagnostics: [diagnostic] });

    expect(store.getSnapshot().state.validation).toMatchObject({ status: "ready", diagnostics: [diagnostic] });
    expect(store.getSnapshot().state.diagnostics).toContain(diagnostic);
    expect(store.getSnapshot().state.console.entries.map((entry) => entry.message)).toContain("Bad source");
  });

  it("запускает no-op codegen через descriptor и применяет diagnostic response", () => {
    const store = createWorkbenchStore();
    const output = store.dispatch({
      type: "codegen.intent.created",
      intent: { kind: "add-machine", template: "domain" },
    });

    expect(output.effects[0]).toMatchObject({ kind: "codegen.plan", requestId: "codegen:1:1" });

    const diagnostic = {
      diagnosticId: "codegen:1:not-implemented",
      sourceVersion: 1,
      origin: "codegen" as const,
      diagnostic: { code: "codegen-not-implemented", severity: "warning" as const, message: "Later" },
      sourceAnchors: [],
      primaryTarget: { kind: "console" as const },
    };

    const completed = store.dispatch({
      type: "codegen.plan.completed",
      requestId: "codegen:1:1",
      sourceVersion: 1,
      result: {
        plan: {
          sourceVersion: 1,
          sourceHash: store.getSnapshot().state.source.hash,
          edits: [],
          expectedGraphChange: { kind: "not-evaluated" },
          diagnostics: [diagnostic.diagnostic],
        },
        diagnostics: [diagnostic],
      },
    });

    expect(completed.result).toEqual({ ok: false, reason: "codegen-not-implemented", diagnostics: [diagnostic] });
    expect(store.getSnapshot().state.codegen.status).toBe("not-implemented");
  });

  it("сбрасывает derived state при изменении source", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });
    store.dispatch({ type: "l3.machine.toggled", machineId: "player" });
    store.dispatch({ type: "l1.machine.selected", machineId: "player" });
    store.dispatch({ type: "l1.topic.selected", eventType: "PLAY" });
    store.dispatch({ type: "l2.topic.selected", eventType: "STOP" });
    store.dispatch({ type: "source.overlay.opened", title: "player", anchors: [] });
    store.dispatch({ type: "console.entry.selected", entryId: "diagnostic:old" });

    store.dispatch({ type: "source.changed", source: "export const next = 1;" });

    expect(store.getSnapshot().state.source.version).toBe(2);
    expect(store.getSnapshot().state.l1).toEqual({ machineQuery: "", topicQuery: "" });
    expect(store.getSnapshot().state.l2).toEqual({ query: "" });
    expect(store.getSnapshot().state.l3.selectedMachineIds).toEqual([]);
    expect(store.getSnapshot().state.simulation.snapshot).toBeUndefined();
    expect(store.getSnapshot().state.panels.sourceOverlay).toBeUndefined();
    expect(store.getSnapshot().state.panels.console.selectedEntryId).toBeUndefined();
    expect(store.getSnapshot().state.console.entries).toEqual([]);
  });

  it("source edit и recompile dispose-ят активную session симуляции", () => {
    const snapshot = createInitialWorkbenchSnapshot();
    const activeSnapshot: WorkbenchSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        l3: { selectedMachineIds: ["player"] },
        simulation: {
          ...snapshot.state.simulation,
          status: "running",
          selectedMachineIds: ["player"],
          scope: { kind: "machines" as const, machineIds: ["player"] },
          snapshot: { timeline: { currentStepId: "step:old" } } as never,
          overlay: { currentStateIdsByMachineId: { player: "player:idle" } },
          inspectedStepId: "step:old",
          pendingChoice: { pendingChoiceId: "choice:old" } as never,
          diagnostics: [diagnostic],
        },
      },
    };

    const sourceChanged = createWorkbenchStore(activeSnapshot).dispatch({ type: "source.changed", source: "export const next = 1;" });
    expect(sourceChanged.effects).toEqual([{ kind: "simulation.dispose", sourceVersion: 1 }]);

    const openVisualizerStore = createWorkbenchStore(activeSnapshot);
    const openVisualizer = openVisualizerStore.dispatch({ type: "source.open-visualizer" });
    expect(openVisualizer.effects).toEqual([
      { kind: "simulation.dispose", sourceVersion: 1 },
      { kind: "compile", requestId: "compile:1:1", source: openVisualizerStore.getSnapshot().state.source },
    ]);
    expect(openVisualizerStore.getSnapshot().state.simulation.snapshot).toBeUndefined();
    expect(openVisualizerStore.getSnapshot().state.simulation.inspectedStepId).toBeUndefined();
  });

  it("оставляет snapshot прежним при source.changed с тем же текстом", () => {
    const store = createWorkbenchStore();
    const before = store.getSnapshot();

    store.dispatch({ type: "source.changed", source: before.state.source.source });

    expect(store.getSnapshot()).toBe(before);
  });

  it("reset to sample возвращает исходник и инвалидирует derived state", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.changed", source: "export const changed = 1;" });
    store.dispatch({ type: "source.reset-to-sample" });

    expect(store.getSnapshot().state.source.source).toContain("playerMachine");
    expect(store.getSnapshot().state.source.version).toBe(3);
  });

  it("reset to sample остается no-op если исходник уже sample", () => {
    const store = createWorkbenchStore();
    const before = store.getSnapshot();

    const output = store.dispatch({ type: "source.reset-to-sample" });

    expect(output).toEqual({ result: { ok: true }, effects: [] });
    expect(store.getSnapshot()).toBe(before);
  });

  it("покрывает selection, overlay и panel commands", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "l1.machine.selected", machineId: "player" });
    const beforeSameMachineSelection = store.getSnapshot();
    store.dispatch({ type: "l1.machine.selected", machineId: "player" });
    expect(store.getSnapshot()).toBe(beforeSameMachineSelection);
    store.dispatch({ type: "l1.topic.selected", eventType: "PLAY" });
    const beforeSameTopicSelection = store.getSnapshot();
    store.dispatch({ type: "l1.topic.selected", eventType: "PLAY" });
    expect(store.getSnapshot()).toBe(beforeSameTopicSelection);
    store.dispatch({ type: "l1.machine.selected", machineId: "player" });
    store.dispatch({ type: "l2.topic.selected", eventType: "PAUSE" });
    store.dispatch({ type: "l3.machine.toggled", machineId: "player" });
    store.dispatch({ type: "l3.machine.toggled", machineId: "player" });
    store.dispatch({ type: "l3.machine.toggled", machineId: "player" });
    store.dispatch({ type: "l3.selection.cleared" });
    store.dispatch({ type: "l3.timeline.step.selected", stepId: "step:1" });
    store.dispatch({ type: "source.overlay.opened", title: "player", anchors: [] });
    store.dispatch({ type: "source.overlay.closed" });
    const beforeClosedOverlay = store.getSnapshot();
    store.dispatch({ type: "source.overlay.closed" });
    expect(store.getSnapshot()).toBe(beforeClosedOverlay);
    const beforeClosedConsole = store.getSnapshot();
    store.dispatch({ type: "panel.console.toggled", open: false });
    expect(store.getSnapshot()).toBe(beforeClosedConsole);
    store.dispatch({ type: "panel.console.toggled", open: true });
    store.dispatch({ type: "panel.console.toggled" });
    store.dispatch({ type: "console.channel.selected", channel: "diagnostics" });
    store.dispatch({ type: "console.channel.selected", channel: "diagnostics" });
    store.dispatch({ type: "console.entry.selected", entryId: "diagnostic:1" });
    const beforeSameEntry = store.getSnapshot();
    store.dispatch({ type: "console.entry.selected", entryId: "diagnostic:1" });

    const state = store.getSnapshot().state;
    expect(state.l1.selectedMachineId).toBe("player");
    expect(state.l1.selectedTopic).toBeUndefined();
    expect(state.l2.selectedTopic).toBe("PAUSE");
    expect(state.l3.selectedMachineIds).toEqual([]);
    expect(state.simulation.inspectedStepId).toBe("step:1");
    expect(state.panels.console.open).toBe(false);
    expect(state.console.selectedChannel).toBe("diagnostics");
    expect(state.panels.console.selectedEntryId).toBe("diagnostic:1");
    expect(store.getSnapshot()).toBe(beforeSameEntry);
  });

  it("обрабатывает 12d L1/L2 navigation, hover и console targets", () => {
    const sourceAnchor: GraphSourceAnchor = {
      kind: "machine",
      editable: false,
      loc: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 7, offset: 6 },
      },
    };
    const entries: readonly ConsoleEntry[] = [
      {
        entryId: "source-entry",
        sourceVersion: 1,
        channel: "diagnostics",
        title: "source diagnostic",
        message: "source",
        target: { kind: "source", anchor: sourceAnchor },
      },
      {
        entryId: "topic-entry",
        sourceVersion: 1,
        channel: "diagnostics",
        title: "topic diagnostic",
        message: "topic",
        target: { kind: "graph", ref: { kind: "topic", eventType: "DONE" } },
      },
      {
        entryId: "machine-entry",
        sourceVersion: 1,
        channel: "diagnostics",
        title: "machine diagnostic",
        message: "machine",
        target: { kind: "graph", ref: { kind: "machine", machineId: "root" } },
      },
      {
        entryId: "state-entry",
        sourceVersion: 1,
        channel: "diagnostics",
        title: "state diagnostic",
        message: "state",
        target: { kind: "graph", ref: { kind: "state", machineId: "flow", stateId: "idle" } },
      },
      {
        entryId: "transition-entry",
        sourceVersion: 1,
        channel: "diagnostics",
        title: "transition diagnostic",
        message: "transition",
        target: { kind: "graph", ref: { kind: "transition", machineId: "flow", transitionId: "t1" } },
      },
      {
        entryId: "emission-entry",
        sourceVersion: 1,
        channel: "diagnostics",
        title: "emission diagnostic",
        message: "emission",
        target: { kind: "graph", ref: { kind: "emission", machineId: "effects", emissionId: "e1" } },
      },
      {
        entryId: "reducer-entry",
        sourceVersion: 1,
        channel: "diagnostics",
        title: "reducer diagnostic",
        message: "reducer",
        target: { kind: "graph", ref: { kind: "reducerCase", machineId: "reducers", reducerCaseId: "r1" } },
      },
      {
        entryId: "manager-entry",
        sourceVersion: 1,
        channel: "diagnostics",
        title: "manager diagnostic",
        message: "manager",
        target: { kind: "graph", ref: { kind: "manager", managerId: "manager" } },
      },
      {
        entryId: "none-entry",
        sourceVersion: 1,
        channel: "diagnostics",
        title: "none diagnostic",
        message: "none",
        target: { kind: "none", reason: "no-anchor" },
      },
    ];
    const snapshot = createInitialWorkbenchSnapshot();
    const store = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        console: { ...snapshot.state.console, entries },
      },
    });

    store.dispatch({ type: "l1.machine-query.changed", query: "flow" });
    const sameMachineQuery = store.getSnapshot();
    store.dispatch({ type: "l1.machine-query.changed", query: "flow" });
    expect(store.getSnapshot()).toBe(sameMachineQuery);
    store.dispatch({ type: "l1.topic-query.changed", query: "done" });
    const sameTopicQuery = store.getSnapshot();
    store.dispatch({ type: "l1.topic-query.changed", query: "done" });
    expect(store.getSnapshot()).toBe(sameTopicQuery);
    store.dispatch({ type: "l2.query.changed", query: "route" });
    const sameL2Query = store.getSnapshot();
    store.dispatch({ type: "l2.query.changed", query: "route" });
    expect(store.getSnapshot()).toBe(sameL2Query);
    store.dispatch({ type: "l1.machine.hovered", machineId: "flow" });
    const sameMachineHover = store.getSnapshot();
    store.dispatch({ type: "l1.machine.hovered", machineId: "flow" });
    expect(store.getSnapshot()).toBe(sameMachineHover);
    store.dispatch({ type: "l1.topic.hovered", eventType: "DONE" });
    const sameTopicHover = store.getSnapshot();
    store.dispatch({ type: "l1.topic.hovered", eventType: "DONE" });
    expect(store.getSnapshot()).toBe(sameTopicHover);
    store.dispatch({ type: "l1.hover.cleared" });
    const sameClear = store.getSnapshot();
    store.dispatch({ type: "l1.hover.cleared" });
    expect(store.getSnapshot()).toBe(sameClear);

    store.dispatch({ type: "l1.topic.opened-in-event-catalog", eventType: "DONE" });
    expect(store.getSnapshot().state.activeTab).toBe("events");
    expect(store.getSnapshot().state.l1.selectedMachineId).toBeUndefined();
    expect(store.getSnapshot().state.l1.selectedTopic).toBe("DONE");
    expect(store.getSnapshot().state.l2.selectedTopic).toBe("DONE");

    store.dispatch({ type: "l1.machine.opened-in-workbench", machineId: "flow" });
    expect(store.getSnapshot().state.activeTab).toBe("machines");
    expect(store.getSnapshot().state.l3.selectedMachineIds).toEqual(["flow"]);
    expect(store.getSnapshot().state.simulation.scope).toEqual({ kind: "machines", machineIds: ["flow"] });

    store.dispatch({ type: "console.entry.selected", entryId: "source-entry" });
    expect(store.getSnapshot().state.panels.sourceOverlay).toEqual({
      sourceVersion: 1,
      title: "source diagnostic",
      anchors: [sourceAnchor],
    });

    store.dispatch({ type: "console.entry.selected", entryId: "topic-entry" });
    expect(store.getSnapshot().state.activeTab).toBe("events");
    expect(store.getSnapshot().state.l1.selectedMachineId).toBeUndefined();
    expect(store.getSnapshot().state.l1.selectedTopic).toBe("DONE");
    expect(store.getSnapshot().state.l2.selectedTopic).toBe("DONE");

    store.dispatch({ type: "console.entry.selected", entryId: "machine-entry" });
    expect(store.getSnapshot().state.activeTab).toBe("system");
    expect(store.getSnapshot().state.l1.selectedMachineId).toBe("root");
    expect(store.getSnapshot().state.l1.selectedTopic).toBeUndefined();

    store.dispatch({ type: "console.entry.selected", entryId: "state-entry" });
    expect(store.getSnapshot().state.l1.selectedMachineId).toBe("flow");

    store.dispatch({ type: "console.entry.selected", entryId: "transition-entry" });
    expect(store.getSnapshot().state.l1.selectedMachineId).toBe("flow");

    store.dispatch({ type: "console.entry.selected", entryId: "emission-entry" });
    expect(store.getSnapshot().state.l1.selectedMachineId).toBe("effects");

    store.dispatch({ type: "console.entry.selected", entryId: "reducer-entry" });
    expect(store.getSnapshot().state.l1.selectedMachineId).toBe("reducers");

    store.dispatch({ type: "console.entry.selected", entryId: "manager-entry" });
    expect(store.getSnapshot().state.panels.console.selectedEntryId).toBe("manager-entry");

    store.dispatch({ type: "console.entry.selected", entryId: "none-entry" });
    const beforeSameNone = store.getSnapshot();
    store.dispatch({ type: "console.entry.selected", entryId: "none-entry" });
    expect(store.getSnapshot()).toBe(beforeSameNone);
  });

  it("отклоняет пользовательские команды симуляции до появления session", () => {
    const store = createWorkbenchStore();

    expect(store.dispatch({ type: "l3.event.sent", event: { type: "PLAY" } }).result).toMatchObject({
      ok: false,
      reason: "missing-simulation-session",
    });
    expect(
      store.dispatch({
        type: "l3.transition-row.sent",
        target: {
          kind: "transition",
          machineId: "player",
          rowId: "row",
          transitionId: "transition",
          slice: { kind: "domain", machineId: "player" },
        },
      }).result,
    ).toMatchObject({ ok: false, reason: "missing-simulation-session" });
    expect(
      store.dispatch({
        type: "l3.effect-row.followed",
        target: {
          kind: "emission",
          machineId: "player",
          rowId: "row",
          emissionId: "emission",
          slice: { kind: "domain", machineId: "player" },
        },
      }).result,
    ).toMatchObject({ ok: false, reason: "missing-simulation-session" });
    expect(store.dispatch({ type: "l3.simulation.reset" }).result).toMatchObject({
      ok: false,
      reason: "missing-simulation-session",
    });
  });

  it("открывает L3 из L2 topic и пересобирает scope симуляции", () => {
    const snapshot = createInitialWorkbenchSnapshot();
    const modelWithRelations = {
      ...modelFixture,
      relations: {
        machineIdsByTopicType: {
          PLAY: {
            producers: ["producer", "producer"],
            consumers: ["consumer", "producer"],
            related: ["producer", "consumer"],
          },
        },
        topicTypesByMachineId: {},
      },
    } as unknown as GraphVisualizerModel;
    const store = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        compile: { ...snapshot.state.compile, status: "ready", document: documentFixture, diagnostics: [] },
        model: { status: "ready", model: modelWithRelations, diagnostics: [] },
        simulation: {
          ...snapshot.state.simulation,
          status: "running",
          snapshot: { timeline: { currentStepId: "root" } } as never,
        },
      },
    });

    const output = store.dispatch({ type: "l2.topic.opened-in-workbench", eventType: "PLAY" });

    expect(output.result).toEqual({ ok: true });
    expect(store.getSnapshot().state.activeTab).toBe("machines");
    expect(store.getSnapshot().state.l2.selectedTopic).toBe("PLAY");
    expect(store.getSnapshot().state.l3.selectedMachineIds).toEqual(["producer", "consumer"]);
    expect(store.getSnapshot().state.simulation.scope).toEqual({ kind: "machines", machineIds: ["producer", "consumer"] });
    expect(store.getSnapshot().state.simulation.snapshot).toBeUndefined();
    expect(output.effects).toEqual([
      { kind: "simulation.dispose", sourceVersion: 1 },
      {
        kind: "create-simulation-session",
        sourceVersion: 1,
        document: documentFixture,
        scope: { kind: "machines", machineIds: ["producer", "consumer"] },
      },
    ]);
  });

  it("возвращает controlled error если L2 topic не связан с машинами", () => {
    const snapshot = createInitialWorkbenchSnapshot();
    const modelWithRelations = {
      ...modelFixture,
      relations: { machineIdsByTopicType: {}, topicTypesByMachineId: {} },
    } as unknown as GraphVisualizerModel;
    const store = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        model: { status: "ready", model: modelWithRelations, diagnostics: [] },
      },
    });
    const before = store.getSnapshot();

    const output = store.dispatch({ type: "l2.topic.opened-in-workbench", eventType: "UNKNOWN" });

    expect(output.result).toEqual({ ok: false, reason: "missing-model", diagnostics: [] });
    expect(store.getSnapshot()).toBe(before);
  });

  it("обрабатывает snapshot симуляции и stale snapshot", () => {
    const store = createWorkbenchStore();
    const before = store.getSnapshot();
    const stale = store.dispatch({ type: "simulation.snapshot.changed", sourceVersion: 0 });
    expect(stale.result).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(before);

    store.dispatch({ type: "simulation.snapshot.changed", sourceVersion: 1 });
    expect(store.getSnapshot().state.simulation.snapshot).toBeUndefined();
    expect(store.getSnapshot()).not.toBe(before);
  });

  it("пересобирает model как simulation overlay без переключения вкладки", () => {
    const snapshot = createInitialWorkbenchSnapshot();
    const overlay = { currentStateIdsByMachineId: { player: "player:idle" } };
    const store = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        activeTab: "machines",
        compile: { ...snapshot.state.compile, status: "ready", document: documentFixture, diagnostics: [] },
        analysis: { status: "ready", diagnostics: analysisDiagnostics, appDiagnostics: [] },
        model: { status: "ready", model: modelFixture, diagnostics: [] },
      },
    });

    const snapshotChanged = store.dispatch({
      type: "simulation.snapshot.changed",
      sourceVersion: 1,
      snapshot: { timeline: { currentStepId: "root" } } as never,
      overlay,
      status: "running",
    });

    expect(snapshotChanged.effects).toEqual([
      {
        kind: "build-model",
        requestId: "model:1:simulation:root",
        purpose: "simulation-overlay",
        sourceVersion: 1,
        document: documentFixture,
        analysisDiagnostics,
        simulation: overlay,
      },
    ]);

    const modelChanged = store.dispatch({
      type: "model.succeeded",
      requestId: "model:1:simulation:root",
      sourceVersion: 1,
      purpose: "simulation-overlay",
      model: modelWithDiagnosticsFixture,
    });

    expect(modelChanged.effects).toEqual([]);
    expect(store.getSnapshot().state.activeTab).toBe("machines");
    expect(store.getSnapshot().state.validation.status).toBe("idle");
    expect(store.getSnapshot().state.model.model).toBe(modelWithDiagnosticsFixture);

    const beforeStaleOverlay = store.getSnapshot();
    const staleOverlay = store.dispatch({
      type: "model.succeeded",
      requestId: "model:1:simulation:old",
      sourceVersion: 1,
      purpose: "simulation-overlay",
      model: modelFixture,
    });

    expect(staleOverlay.result).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(beforeStaleOverlay);
  });

  it("строит request id simulation overlay для inspect и fallback без snapshot", () => {
    const snapshot = createInitialWorkbenchSnapshot();
    const overlay = { currentStateIdsByMachineId: { player: "player:idle" } };
    const store = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        compile: { ...snapshot.state.compile, status: "ready", document: documentFixture, diagnostics: [] },
        analysis: { status: "ready", diagnostics: analysisDiagnostics, appDiagnostics: [] },
        model: { status: "ready", model: modelFixture, diagnostics: [] },
        simulation: {
          ...snapshot.state.simulation,
          overlay,
          snapshot: {
            timeline: {
              currentStepId: "root",
              stepsById: {
                "step:1": { rowRefs: [] },
              },
            },
          } as never,
        },
      },
    });

    const inspected = store.dispatch({ type: "l3.timeline.step.selected", stepId: "step:1" });
    expect(inspected.effects).toEqual([
      {
        kind: "build-model",
        requestId: "model:1:simulation:step:1",
        purpose: "simulation-overlay",
        sourceVersion: 1,
        document: documentFixture,
        analysisDiagnostics,
        simulation: { ...overlay, inspectedRefs: [] },
      },
    ]);

    const fallbackStore = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        compile: { ...snapshot.state.compile, status: "ready", document: documentFixture, diagnostics: [] },
        analysis: { status: "ready", diagnostics: analysisDiagnostics, appDiagnostics: [] },
        model: { status: "ready", model: modelFixture, diagnostics: [] },
      },
    });

    expect(
      fallbackStore.dispatch({
        type: "simulation.snapshot.changed",
        sourceVersion: 1,
        overlay,
      }).effects,
    ).toEqual([
      {
        kind: "build-model",
        requestId: "model:1:simulation:none",
        purpose: "simulation-overlay",
        sourceVersion: 1,
        document: documentFixture,
        analysisDiagnostics,
        simulation: overlay,
      },
    ]);
  });

  it("мапит simulation diagnostics в controlled result и console", () => {
    const store = createWorkbenchStore();

    expect(
      store.dispatch({
        type: "simulation.snapshot.changed",
        sourceVersion: 1,
        diagnostics: [],
      }).result,
    ).toEqual({ ok: true });

    const output = store.dispatch({
      type: "simulation.snapshot.changed",
      sourceVersion: 1,
      status: "blocked",
      diagnostics: [diagnostic],
    });

    expect(output.result).toEqual({ ok: false, reason: "simulator-rejected", diagnostics: [diagnostic] });
    expect(store.getSnapshot().state.simulation.status).toBe("blocked");
    expect(store.getSnapshot().state.diagnostics).toEqual([diagnostic]);
    expect(store.getSnapshot().state.console.entries[0]?.message).toBe("Bad source");
  });

  it("создает новые simulation sessions для L1/L3 selection и очищает старые timeline/inspect", () => {
    const snapshot = createInitialWorkbenchSnapshot();
    const activeReadySnapshot: WorkbenchSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        compile: { ...snapshot.state.compile, status: "ready", document: documentFixture, diagnostics: [] },
        model: { status: "ready", model: modelFixture, diagnostics: [] },
        l3: { selectedMachineIds: ["old"] },
        simulation: {
          ...snapshot.state.simulation,
          status: "running",
          selectedMachineIds: ["old"],
          scope: { kind: "machines" as const, machineIds: ["old"] },
          snapshot: { timeline: { currentStepId: "step:old" } } as never,
          overlay: { currentStateIdsByMachineId: { old: "old:idle" } },
          inspectedStepId: "step:old",
          pendingChoice: { pendingChoiceId: "choice:old" } as never,
          diagnostics: [diagnostic],
        },
      },
    };

    const l1Store = createWorkbenchStore(activeReadySnapshot);
    const l1Output = l1Store.dispatch({ type: "l1.machine.opened-in-workbench", machineId: "player" });
    expect(l1Store.getSnapshot().state.activeTab).toBe("machines");
    expect(l1Store.getSnapshot().state.l3.selectedMachineIds).toEqual(["player"]);
    expect(l1Store.getSnapshot().state.simulation.snapshot).toBeUndefined();
    expect(l1Store.getSnapshot().state.simulation.inspectedStepId).toBeUndefined();
    expect(l1Store.getSnapshot().state.simulation.diagnostics).toEqual([]);
    expect(l1Output.effects).toEqual([
      { kind: "simulation.dispose", sourceVersion: 1 },
      {
        kind: "create-simulation-session",
        sourceVersion: 1,
        document: documentFixture,
        scope: { kind: "machines", machineIds: ["player"] },
      },
    ]);

    const l3Store = createWorkbenchStore(activeReadySnapshot);
    const l3Output = l3Store.dispatch({ type: "l3.machine.toggled", machineId: "worker" });
    expect(l3Store.getSnapshot().state.l3.selectedMachineIds).toEqual(["old", "worker"]);
    expect(l3Store.getSnapshot().state.simulation.scope).toEqual({ kind: "machines", machineIds: ["old", "worker"] });
    expect(l3Store.getSnapshot().state.simulation.pendingChoice).toBeUndefined();
    expect(l3Output.effects).toEqual([
      { kind: "simulation.dispose", sourceVersion: 1 },
      {
        kind: "create-simulation-session",
        sourceVersion: 1,
        document: documentFixture,
        scope: { kind: "machines", machineIds: ["old", "worker"] },
      },
    ]);

    const clearStore = createWorkbenchStore(activeReadySnapshot);
    const clearOutput = clearStore.dispatch({ type: "l3.selection.cleared" });
    expect(clearStore.getSnapshot().state.l3.selectedMachineIds).toEqual([]);
    expect(clearStore.getSnapshot().state.simulation.snapshot).toBeUndefined();
    expect(clearOutput.effects).toEqual([{ kind: "simulation.dispose", sourceVersion: 1 }]);
  });

  it("создает descriptors команд симуляции при активном snapshot", () => {
    const snapshot = createInitialWorkbenchSnapshot();
    const store = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        simulation: {
          ...snapshot.state.simulation,
          status: "running",
          snapshot: { timeline: { currentStepId: "root" } } as never,
        },
      },
    });

    expect(store.dispatch({ type: "l3.event.sent", event: { type: "PLAY" } }).effects).toEqual([
      { kind: "simulation.send", sourceVersion: 1, event: { type: "PLAY" } },
    ]);
    expect(
      store.dispatch({
        type: "l3.transition-row.sent",
        target: {
          kind: "transition",
          machineId: "player",
          rowId: "row",
          transitionId: "transition",
          slice: { kind: "domain", machineId: "player" },
        },
      }).effects,
    ).toEqual([
      {
        kind: "simulation.send-from-transition",
        sourceVersion: 1,
        target: {
          kind: "transition",
          machineId: "player",
          rowId: "row",
          transitionId: "transition",
          slice: { kind: "domain", machineId: "player" },
        },
        payload: undefined,
      },
    ]);
    expect(
      store.dispatch({
        type: "l3.effect-row.followed",
        target: {
          kind: "emission",
          machineId: "player",
          rowId: "row",
          emissionId: "emission",
          slice: { kind: "domain", machineId: "player" },
        },
      }).effects,
    ).toEqual([
      {
        kind: "simulation.send-from-emission",
        sourceVersion: 1,
        target: {
          kind: "emission",
          machineId: "player",
          rowId: "row",
          emissionId: "emission",
          slice: { kind: "domain", machineId: "player" },
        },
        payload: undefined,
      },
    ]);
    expect(store.dispatch({ type: "l3.simulation.reset" }).effects).toEqual([
      {
        kind: "simulation.reset",
        sourceVersion: 1,
        initialStateOverrides: undefined,
        initialContextOverrides: undefined,
      },
    ]);
  });

  it("возвращает missing-document если response анализа пришел без document", () => {
    const snapshot = createInitialWorkbenchSnapshot();
    const store = createWorkbenchStore({
      ...snapshot,
      state: {
        ...snapshot.state,
        analysis: { ...snapshot.state.analysis, status: "running", requestId: "analyze:1:1" },
      },
    });

    const output = store.dispatch({
      type: "analysis.succeeded",
      requestId: "analyze:1:1",
      sourceVersion: 1,
      diagnostics: [],
    });

    expect(output.result).toEqual({ ok: false, reason: "missing-document", diagnostics: [] });
  });

  it("применяет failed response codegen", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "codegen.intent.created", intent: { kind: "add-machine", template: "domain" } });

    const output = store.dispatch({
      type: "codegen.plan.failed",
      requestId: "codegen:1:1",
      sourceVersion: 1,
      diagnostics: [diagnostic],
    });

    expect(output.result).toEqual({ ok: false, reason: "codegen-not-implemented", diagnostics: [diagnostic] });
    expect(store.getSnapshot().state.codegen.diagnostics).toEqual([diagnostic]);
  });

  it("игнорирует completed response codegen с устаревшим requestId текущей sourceVersion", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "codegen.intent.created", intent: { kind: "add-machine", template: "domain" } });
    const before = store.getSnapshot();

    expect(
      store.dispatch({
        type: "codegen.plan.completed",
        requestId: "codegen:1:old",
        sourceVersion: 1,
        result: {
          plan: {
            sourceVersion: 1,
            sourceHash: before.state.source.hash,
            edits: [],
            expectedGraphChange: { kind: "not-evaluated" },
            diagnostics: [diagnostic.diagnostic],
          },
          diagnostics: [diagnostic],
        },
      }).result,
    ).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(before);
  });

  it("игнорирует stale model, validation и codegen responses", () => {
    const store = createWorkbenchStore();
    const beforeCompile = store.getSnapshot();
    expect(
      store.dispatch({ type: "compile.failed", requestId: "compile:old", sourceVersion: 0, diagnostics: [diagnostic] }).result,
    ).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(beforeCompile);

    const beforeAnalysisSucceeded = store.getSnapshot();
    expect(
      store.dispatch({ type: "analysis.succeeded", requestId: "analyze:old", sourceVersion: 0, diagnostics: [] }).result,
    ).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(beforeAnalysisSucceeded);

    const beforeAnalysisFailed = store.getSnapshot();
    expect(
      store.dispatch({ type: "analysis.failed", requestId: "analyze:old", sourceVersion: 0, diagnostics: [diagnostic] }).result,
    ).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(beforeAnalysisFailed);

    const beforeModelSucceeded = store.getSnapshot();
    expect(
      store.dispatch({ type: "model.succeeded", requestId: "model:old", sourceVersion: 0, model: modelFixture }).result,
    ).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(beforeModelSucceeded);

    const beforeModel = store.getSnapshot();
    expect(
      store.dispatch({ type: "model.failed", requestId: "model:old", sourceVersion: 0, diagnostics: [diagnostic] }).result,
    ).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(beforeModel);

    const beforeValidation = store.getSnapshot();
    expect(
      store.dispatch({ type: "validation.succeeded", requestId: "validation:old", sourceVersion: 0, diagnostics: [] }).result,
    ).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(beforeValidation);

    const beforeCodegen = store.getSnapshot();
    expect(
      store.dispatch({ type: "codegen.plan.failed", requestId: "codegen:old", sourceVersion: 0, diagnostics: [diagnostic] }).result,
    ).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(beforeCodegen);
  });
});
