import type { GraphDiagnostic, LiteFsmGraphDocument } from "@lite-fsm/graph";
import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { describe, expect, it, vi } from "vitest";
import { createInitialWorkbenchSnapshot } from "./state";
import { createWorkbenchStore } from "./store";
import { selectConsolePanel, selectCurrentEmptyPanel, selectTabItems } from "./selectors";

const documentFixture = { source: { filename: "sample.ts", language: "ts" }, diagnostics: [], machines: [], managers: [] } as unknown as LiteFsmGraphDocument;
const modelFixture = { version: "lite-fsm.visualizer/v1", machines: [], managers: [], topics: [], diagnostics: [], workbenchMachines: {} } as unknown as GraphVisualizerModel;
const analysisDiagnostics: readonly GraphDiagnostic[] = [{ code: "info", severity: "info", message: "ready" }];
const diagnostic = {
  diagnosticId: "compiler:1:bad",
  sourceVersion: 1,
  origin: "compiler" as const,
  diagnostic: { code: "bad", severity: "error" as const, message: "Bad source" },
  sourceAnchors: [],
  primaryTarget: { kind: "console" as const },
};

describe("workbench store", () => {
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

  it("сохраняет refs unrelated slices при выборе вкладки", () => {
    const store = createWorkbenchStore();
    const before = store.getSnapshot();

    store.dispatch({ type: "tab.selected", tab: "events" });
    const after = store.getSnapshot();

    expect(after).not.toBe(before);
    expect(after.state.activeTab).toBe("events");
    expect(after.state.source).toBe(before.state.source);
    expect(after.state.model).toBe(before.state.model);
    expect(after.revisions.panels).toBe(before.revisions.panels + 1);
    expect(after.revisions.model).toBe(before.revisions.model);
  });

  it("возвращает stable selector refs для неизменных inputs", () => {
    const store = createWorkbenchStore();
    const firstTabs = selectTabItems(store.getSnapshot());
    const secondTabs = selectTabItems(store.getSnapshot());
    const firstConsole = selectConsolePanel(store.getSnapshot());
    const secondConsole = selectConsolePanel(store.getSnapshot());

    expect(secondTabs).toBe(firstTabs);
    expect(secondConsole).toBe(firstConsole);
    expect(selectCurrentEmptyPanel(store.getSnapshot())).toBe(selectCurrentEmptyPanel(store.getSnapshot()));
  });

  it("возвращает empty panel view для каждой вкладки", () => {
    const store = createWorkbenchStore();

    expect(selectCurrentEmptyPanel(store.getSnapshot()).title).toBe("Source session");
    store.dispatch({ type: "tab.selected", tab: "system" });
    expect(selectCurrentEmptyPanel(store.getSnapshot()).title).toBe("System inventory");
    store.dispatch({ type: "tab.selected", tab: "events" });
    expect(selectCurrentEmptyPanel(store.getSnapshot()).title).toBe("Event catalog");
    store.dispatch({ type: "tab.selected", tab: "machines" });
    expect(selectCurrentEmptyPanel(store.getSnapshot()).title).toBe("Machine workbench");
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

  it("пишет diagnostics и console entries для failed responses", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.open-visualizer" });

    store.dispatch({ type: "compile.failed", requestId: "compile:1:1", sourceVersion: 1, diagnostics: [diagnostic] });

    expect(store.getSnapshot().state.diagnostics).toEqual([diagnostic]);
    expect(store.getSnapshot().state.console.entries[0]?.message).toBe("Bad source");
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
    expect(store.getSnapshot().state.console.entries).toEqual([]);
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
    store.dispatch({ type: "l3.machine.toggled", machineId: "player" });

    store.dispatch({ type: "source.changed", source: "export const next = 1;" });

    expect(store.getSnapshot().state.source.version).toBe(2);
    expect(store.getSnapshot().state.l3.selectedMachineIds).toEqual([]);
    expect(store.getSnapshot().state.simulation.snapshot).toBeUndefined();
  });

  it("оставляет snapshot прежним при source.changed с тем же текстом", () => {
    const store = createWorkbenchStore();
    const before = store.getSnapshot();

    store.dispatch({ type: "source.changed", source: before.state.source.source });

    expect(store.getSnapshot()).toBe(before);
  });

  it("reset to sample возвращает source и инвалидирует derived state", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "source.changed", source: "export const changed = 1;" });
    store.dispatch({ type: "source.reset-to-sample" });

    expect(store.getSnapshot().state.source.source).toContain("playerMachine");
    expect(store.getSnapshot().state.source.version).toBe(3);
  });

  it("покрывает selection, overlay и panel commands", () => {
    const store = createWorkbenchStore();
    store.dispatch({ type: "l1.machine.selected", machineId: "player" });
    store.dispatch({ type: "l1.topic.selected", eventType: "PLAY" });
    store.dispatch({ type: "l2.topic.selected", eventType: "PAUSE" });
    store.dispatch({ type: "l3.machine.toggled", machineId: "player" });
    store.dispatch({ type: "l3.machine.toggled", machineId: "player" });
    store.dispatch({ type: "l3.machine.toggled", machineId: "player" });
    store.dispatch({ type: "l3.selection.cleared" });
    store.dispatch({ type: "l3.timeline.step.selected", stepId: "step:1" });
    store.dispatch({ type: "source.overlay.opened", machineId: "player" });
    store.dispatch({ type: "source.overlay.closed" });
    store.dispatch({ type: "panel.console.toggled", open: true });
    store.dispatch({ type: "panel.console.toggled" });
    store.dispatch({ type: "console.entry.selected", entryId: "diagnostic:1" });

    const state = store.getSnapshot().state;
    expect(state.l1.selectedMachineId).toBe("player");
    expect(state.l1.selectedTopic).toBe("PLAY");
    expect(state.l2.selectedTopic).toBe("PAUSE");
    expect(state.l3.selectedMachineIds).toEqual([]);
    expect(state.simulation.inspectedStepId).toBe("step:1");
    expect(state.panels.console.open).toBe(false);
    expect(state.panels.console.selectedEntryId).toBe("diagnostic:1");
  });

  it("отклоняет simulation user commands до появления session", () => {
    const store = createWorkbenchStore();

    expect(store.dispatch({ type: "l3.event.sent", event: { type: "PLAY" } }).result).toMatchObject({
      ok: false,
      reason: "missing-simulation-session",
    });
    expect(
      store.dispatch({
        type: "l3.transition-row.sent",
        target: { machineId: "player", rowId: "row", slice: { kind: "domain", machineId: "player" } },
      }).result,
    ).toMatchObject({ ok: false, reason: "missing-simulation-session" });
    expect(
      store.dispatch({
        type: "l3.effect-row.followed",
        target: { machineId: "player", rowId: "row", slice: { kind: "domain", machineId: "player" } },
      }).result,
    ).toMatchObject({ ok: false, reason: "missing-simulation-session" });
    expect(store.dispatch({ type: "l3.simulation.reset" }).result).toMatchObject({
      ok: false,
      reason: "missing-simulation-session",
    });
  });

  it("обрабатывает simulation snapshot и stale snapshot", () => {
    const store = createWorkbenchStore();
    const before = store.getSnapshot();
    const stale = store.dispatch({ type: "simulation.snapshot.changed", sourceVersion: 0 });
    expect(stale.result).toEqual({ ok: false, reason: "stale-source-version", diagnostics: [] });
    expect(store.getSnapshot()).toBe(before);

    store.dispatch({ type: "simulation.snapshot.changed", sourceVersion: 1 });
    expect(store.getSnapshot().state.simulation.snapshot).toBeUndefined();
    expect(store.getSnapshot()).not.toBe(before);
  });

  it("возвращает missing-document если analysis response пришел без document", () => {
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

  it("применяет codegen failed response", () => {
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
