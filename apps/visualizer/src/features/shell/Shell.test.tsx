import type { ConsoleEntry } from "../../console";
import { WorkbenchProvider } from "../../app/workbench-context";
import { createNoopCodegenPlanner } from "../../codegen";
import { createLocalSimulationService, type EffectRunnerServices } from "../../services";
import { VISUALIZER_TEST_IDS } from "../../test-ids";
import { createInitialWorkbenchSnapshot } from "../../workbench/state";
import { createWorkbenchStore } from "../../workbench/store";
import type { WorkbenchSnapshot } from "../../workbench/types";
import { createNoopValidationRegistry } from "../../validation";
import { TooltipProvider } from "@/ui/tooltip";
import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Shell } from "./Shell";

const ids = VISUALIZER_TEST_IDS;

const compileFailureServices: EffectRunnerServices = {
  compiler: {
    compile: async (input) => ({ ok: false, sourceVersion: input.sourceVersion, diagnostics: [] }),
  },
  analyzer: {
    analyze: async (input) => ({ ok: true, sourceVersion: input.sourceVersion, diagnostics: [] }),
  },
  visualizerModel: {
    build: async (input) => ({ ok: false, sourceVersion: input.sourceVersion, diagnostics: [] }),
  },
  simulation: createLocalSimulationService(),
  validation: createNoopValidationRegistry(),
  codegen: createNoopCodegenPlanner(),
};

const renderShell = (
  snapshot: WorkbenchSnapshot = createInitialWorkbenchSnapshot(),
  services: EffectRunnerServices = compileFailureServices,
) => {
  const store = createWorkbenchStore(snapshot);

  render(
    <WorkbenchProvider store={store} services={services}>
      <TooltipProvider>
        <Shell />
      </TooltipProvider>
    </WorkbenchProvider>,
  );

  return store;
};

const consoleEntries: readonly ConsoleEntry[] = [
  {
    entryId: "system-entry",
    sourceVersion: 1,
    channel: "system",
    title: "system ready",
    message: "pipeline opened",
  },
  {
    entryId: "diagnostic-entry",
    sourceVersion: 1,
    channel: "diagnostics",
    title: "compile failed",
    message: "unsupported source shape",
    origin: "compiler",
    severity: "error",
    locationLabel: "line 3, column 7",
    target: { kind: "none", reason: "no-anchor" },
  },
  {
    entryId: "debug-entry",
    sourceVersion: 1,
    channel: "debug",
    title: "debug trace",
    message: "request completed",
    severity: "blocked" as unknown as ConsoleEntry["severity"],
  },
];

describe("оболочка Shell", () => {
  it("связывает controls исходника, tabs, toggle консоли и пустое состояние консоли", () => {
    const store = renderShell();

    expect(screen.getByTestId(ids.shell.root)).toBeTruthy();
    expect(screen.getByTestId(ids.source.status).getAttribute("data-status")).toBe("idle");
    expect(screen.getByTestId(ids.console.entries).getAttribute("data-empty")).toBe("true");

    fireEvent.click(screen.getByTestId(ids.source.open));
    expect(store.getSnapshot().state.compile.status).toBe("running");

    fireEvent.mouseDown(screen.getByTestId(ids.tabs.trigger.system), { button: 0, ctrlKey: false });
    expect(store.getSnapshot().state.activeTab).toBe("system");
    expect(screen.getByTestId(ids.system.panel)).toBeTruthy();
    expect(screen.queryByTestId(ids.source.panel)).toBeNull();

    fireEvent.mouseDown(screen.getByTestId(ids.tabs.trigger.events), { button: 0, ctrlKey: false });
    expect(store.getSnapshot().state.activeTab).toBe("events");
    expect(screen.getByTestId(ids.events.panel)).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId(ids.tabs.trigger.machines), { button: 0, ctrlKey: false });
    expect(store.getSnapshot().state.activeTab).toBe("machines");
    expect(screen.getByTestId(ids.workbench.panel)).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId(ids.tabs.trigger.source), { button: 0, ctrlKey: false });
    expect(store.getSnapshot().state.activeTab).toBe("source");
    const sourceEditor = screen.getByTestId(ids.source.editor);
    expect(sourceEditor.querySelector(".cm-lineNumbers")).toBeTruthy();

    const editorView = EditorView.findFromDOM(sourceEditor);
    expect(editorView).toBeTruthy();
    act(() => {
      editorView?.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: "" } });
    });
    expect(store.getSnapshot().state.source.source).toBe("");
    expect((screen.getByTestId(ids.source.open) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId(ids.source.reset));
    expect(store.getSnapshot().state.source.source.length).toBeGreaterThan(0);

    expect(store.getSnapshot().state.panels.console.open).toBe(false);
    expect(screen.getByTestId(ids.console.panel).className).toContain("hidden");

    fireEvent.click(screen.getByTestId(ids.console.toggle));
    expect(store.getSnapshot().state.panels.console.open).toBe(true);

    fireEvent.click(screen.getByTestId(ids.console.backdrop));
    expect(store.getSnapshot().state.panels.console.open).toBe(false);

    fireEvent.click(screen.getByTestId(ids.console.toggle));
    expect(store.getSnapshot().state.panels.console.open).toBe(true);

    fireEvent.click(screen.getByTestId(ids.console.close));
    expect(store.getSnapshot().state.panels.console.open).toBe(false);
  });

  it("рендерит записи консоли, channel buttons и status tones для ready/failed states", () => {
    const base = createInitialWorkbenchSnapshot();
    const snapshot: WorkbenchSnapshot = {
      ...base,
      state: {
        ...base.state,
        compile: { ...base.state.compile, status: "failed" },
        model: { ...base.state.model, status: "ready" },
        validation: { ...base.state.validation, status: "blocked" },
        diagnostics: [
          {
            diagnosticId: "compiler:1:bad",
            sourceVersion: 1,
            origin: "compiler",
            diagnostic: { code: "bad", severity: "error", message: "Bad source" },
            sourceAnchors: [],
            primaryTarget: { kind: "console" },
          },
          {
            diagnosticId: "analyzer:1:warn",
            sourceVersion: 1,
            origin: "analyzer",
            diagnostic: { code: "warn", severity: "warning", message: "Machine warning" },
            graphItemRef: { kind: "machine", machineId: "player" },
            sourceAnchors: [],
            primaryTarget: { kind: "graph", ref: { kind: "machine", machineId: "player" } },
          },
        ],
        console: { ...base.state.console, entries: consoleEntries },
      },
    };
    const store = renderShell(snapshot);

    expect(screen.getByTestId(ids.source.status).getAttribute("data-status")).toBe("ready");
    expect(screen.getByTestId(ids.console.entries).getAttribute("data-entry-count")).toBe("3");

    fireEvent.click(screen.getByTestId(ids.console.channelSystem));
    expect(store.getSnapshot().state.console.selectedChannel).toBe("system");
    expect(screen.getByTestId(ids.console.entries).getAttribute("data-entry-count")).toBe("1");
    expect(screen.getByTestId(ids.console.entry).getAttribute("data-entry-id")).toBe("system-entry");

    fireEvent.click(screen.getByTestId(ids.console.channelDiagnostics));
    expect(store.getSnapshot().state.console.selectedChannel).toBe("diagnostics");
    expect(screen.getByTestId(ids.console.entry).getAttribute("data-entry-id")).toBe("diagnostic-entry");
    expect(screen.getByTestId(ids.console.entry).getAttribute("data-channel")).toBe("diagnostics");
    expect(screen.getByTestId(ids.console.entry).textContent).toContain("line 3, column 7");
    expect(screen.getByTestId(ids.tabs.trigger.source).getAttribute("data-diagnostic-count")).toBe("1");
    expect(screen.getByTestId(ids.tabs.trigger.source).getAttribute("data-has-error")).toBe("true");
    expect(screen.getByTestId(ids.tabs.trigger.system).getAttribute("data-diagnostic-count")).toBe("1");
    expect(screen.getByTestId(ids.tabs.trigger.system).getAttribute("data-has-error")).toBe("false");
    expect(screen.getAllByTestId(ids.tabs.diagnosticBadge).map((badge) => [badge.getAttribute("data-tab"), badge.getAttribute("data-has-error")])).toEqual([
      ["source", "true"],
      ["system", "false"],
    ]);

    fireEvent.click(screen.getByTestId(ids.console.channelDebug));
    expect(store.getSnapshot().state.console.selectedChannel).toBe("debug");
    expect(screen.getByTestId(ids.console.entry).getAttribute("data-entry-id")).toBe("debug-entry");

    fireEvent.click(screen.getByTestId(ids.console.channelAll));
    expect(store.getSnapshot().state.console.selectedChannel).toBe("all");

    fireEvent.click(document.querySelector<HTMLElement>('[data-testid="visualizer-console-entry"][data-entry-id="diagnostic-entry"]')!);
    expect(store.getSnapshot().state.panels.console.selectedEntryId).toBe("diagnostic-entry");
  });

  it("закрывает source overlay из оболочки", () => {
    const base = createInitialWorkbenchSnapshot();
    const snapshot: WorkbenchSnapshot = {
      ...base,
      state: {
        ...base.state,
        panels: {
          ...base.state.panels,
          sourceOverlay: {
            sourceVersion: base.state.source.version,
            title: "missing anchor",
            anchors: [],
          },
        },
      },
    };
    const store = renderShell(snapshot);

    expect(screen.getByTestId(ids.source.overlay)).toBeTruthy();
    fireEvent.click(screen.getByTestId(ids.source.overlayClose));

    expect(store.getSnapshot().state.panels.sourceOverlay).toBeUndefined();
  });
});
