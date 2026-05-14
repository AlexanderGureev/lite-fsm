import type { ConsoleEntry } from "../../console";
import { WorkbenchProvider } from "../../app/workbench-context";
import { createNoopCodegenPlanner } from "../../codegen";
import { createLocalSimulationService, type EffectRunnerServices } from "../../services";
import { VISUALIZER_TEST_IDS } from "../../test-ids";
import { createInitialWorkbenchSnapshot } from "../../workbench/state";
import { createWorkbenchStore } from "../../workbench/store";
import type { WorkbenchSnapshot } from "../../workbench/types";
import { createNoopValidationRegistry } from "../../validation";
import { openMachineBoard } from "../../canvas";
import { TooltipProvider } from "@/ui/tooltip";
import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
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

const emptyAnchors = [] as const;

const projectExportDocument = {
  version: "lite-fsm.project-graph-export/v1",
  createdBy: { package: "@lite-fsm/cli", version: "0.0.0" },
  entry: { path: "store/index.ts" },
  graph: {
    version: "lite-fsm.graph/v1",
    source: { filename: "store/index.ts", language: "ts", kind: "project", entryFileName: "store/index.ts" },
    machines: [],
    managers: [],
    diagnostics: [],
  },
  files: [{ fileName: "store/index.ts", language: "ts", roles: ["entry"], hash: "abc" }],
  diagnostics: [],
};

const machineCanvasModelFixture = (): GraphVisualizerModel =>
  ({
    version: "lite-fsm.visualizer/v1",
    source: { filename: "fixture.ts", language: "ts" },
    machines: [
      {
        machineId: "player",
        title: "player",
        kind: "domain",
        initialState: "idle",
        managerKeys: [],
        counts: {
          states: 2,
          consumedTopics: 1,
          producedTopics: 0,
          configTransitions: 1,
          reducerBranches: 0,
          effectEmissions: 0,
          diagnostics: 0,
        },
        consumedTopicTypes: ["PLAY"],
        producedTopicTypes: [],
        sourceAnchors: emptyAnchors,
        diagnosticIds: [],
      },
    ],
    managers: [],
    topics: [{ eventType: "PLAY", producerCount: 0, consumerCount: 1, routingKinds: [], routingValues: [], producers: [], consumers: [], diagnosticIds: [] }],
    relations: { machineIdsByTopicType: {} },
    diagnostics: [],
    rowMappings: {},
    workbenchMachines: {
      player: {
        machineId: "player",
        title: "player",
        kind: "domain",
        initialState: "idle",
        sourceAnchors: emptyAnchors,
        diagnostics: [],
        globalBehavior: [],
        states: [
          {
            stateId: "player:state:idle",
            stateKey: "idle",
            kind: "normal",
            current: false,
            collapsed: false,
            badges: [{ kind: "initial", label: "initial" }],
            sourceAnchors: emptyAnchors,
            diagnosticIds: [],
            rows: [
              {
                kind: "config",
                rowId: "player:row:play",
                machineId: "player",
                sourceStateId: "player:state:idle",
                eventType: "PLAY",
                acceptedTransitionId: "player:accepted:play",
                transitionId: "player:transition:play",
                foldedReducerTransitionIds: [],
                target: { kind: "state", stateId: "player:state:playing", label: "playing" },
                confidence: "exact",
                capabilities: [],
                sourceAnchors: emptyAnchors,
              },
            ],
          },
          {
            stateId: "player:state:playing",
            stateKey: "playing",
            kind: "normal",
            current: false,
            collapsed: false,
            badges: [],
            sourceAnchors: emptyAnchors,
            diagnosticIds: [],
            rows: [],
          },
        ],
      },
    },
  }) as unknown as GraphVisualizerModel;

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

    fireEvent.click(screen.getByLabelText("Go to Source"));
    expect(store.getSnapshot().state.activeTab).toBe("source");

    fireEvent.mouseDown(screen.getByTestId(ids.tabs.trigger.events), { button: 0, ctrlKey: false });
    expect(store.getSnapshot().state.activeTab).toBe("events");

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

  it("читает CLI JSON export через file input и запускает document pipeline", async () => {
    const services: EffectRunnerServices = {
      compiler: {
        compile: vi.fn(async (input) => ({ ok: true as const, sourceVersion: input.sourceVersion, document: projectExportDocument.graph as never, diagnostics: [] })),
      },
      analyzer: {
        analyze: vi.fn(async (input) => ({ ok: true as const, sourceVersion: input.sourceVersion, diagnostics: [] })),
      },
      visualizerModel: {
        build: vi.fn(async (input) => ({ ok: true as const, sourceVersion: input.sourceVersion, model: machineCanvasModelFixture() })),
      },
      simulation: createLocalSimulationService(),
      validation: createNoopValidationRegistry(),
      codegen: createNoopCodegenPlanner(),
    };
    const store = renderShell(createInitialWorkbenchSnapshot(), services);
    const sourceBefore = store.getSnapshot().state.source;

    fireEvent.change(screen.getByTestId(ids.source.projectExportFile), {
      target: {
        files: [new File([JSON.stringify(projectExportDocument)], "graph.json", { type: "application/json" })],
      },
    });

    await waitFor(() => expect(store.getSnapshot().state.model.status).toBe("ready"));

    expect(services.compiler.compile).not.toHaveBeenCalled();
    expect(services.analyzer.analyze).toHaveBeenCalledWith({
      requestId: "analyze:2:1",
      sourceVersion: 2,
      document: projectExportDocument.graph,
    });
    expect(store.getSnapshot().state.inputMode).toMatchObject({
      kind: "project-export",
      entryPath: "store/index.ts",
      files: projectExportDocument.files,
    });
    expect(store.getSnapshot().state.host.capabilities).toEqual({
      mode: "static",
      canReadFiles: false,
      canWriteFiles: false,
      canApplyPatch: false,
    });
    expect(store.getSnapshot().state.source).toBe(sourceBefore);
  });

  it("рендерит file input только для JSON export файлов", () => {
    renderShell();

    const input = screen.getByTestId(ids.source.projectExportFile);

    expect(input.getAttribute("type")).toBe("file");
    expect(input.getAttribute("accept")).toBe(".json,application/json");
  });

  it("показывает diagnostic для invalid project export file без смены source", async () => {
    const store = renderShell();
    const sourceBefore = store.getSnapshot().state.source;

    fireEvent.change(screen.getByTestId(ids.source.projectExportFile), {
      target: {
        files: [new File(["{}"], "bad.json", { type: "application/json" })],
      },
    });

    await waitFor(() => expect(store.getSnapshot().state.diagnostics).toHaveLength(1));

    expect(store.getSnapshot().state.source).toBe(sourceBefore);
    expect(store.getSnapshot().state.inputMode.kind).toBe("pasted-source");
    expect(store.getSnapshot().state.diagnostics[0]?.diagnostic.code).toBe("project-export-invalid-version");
    expect(store.getSnapshot().state.console.entries[0]?.message).toContain("bad.json");
  });

  it("показывает diagnostic для синтаксически invalid JSON без смены model/source", async () => {
    const store = renderShell();
    const sourceBefore = store.getSnapshot().state.source;
    const modelBefore = store.getSnapshot().state.model;

    fireEvent.change(screen.getByTestId(ids.source.projectExportFile), {
      target: {
        files: [new File(["{"], "broken-json.json", { type: "application/json" })],
      },
    });

    await waitFor(() => expect(store.getSnapshot().state.diagnostics).toHaveLength(1));

    expect(store.getSnapshot().state.source).toBe(sourceBefore);
    expect(store.getSnapshot().state.model).toBe(modelBefore);
    expect(store.getSnapshot().state.inputMode.kind).toBe("pasted-source");
    expect(store.getSnapshot().state.diagnostics[0]?.diagnostic.code).toBe("project-export-invalid-json");
    expect(store.getSnapshot().state.console.entries[0]?.message).toBe("broken-json.json: Project graph export must be valid JSON.");
  });

  it("показывает diagnostic если browser file read отклонен", async () => {
    const store = renderShell();
    const failingFile = {
      name: "broken.json",
      text: async () => {
        throw new Error("read failed");
      },
    };

    fireEvent.change(screen.getByTestId(ids.source.projectExportFile), {
      target: {
        files: [failingFile],
      },
    });

    await waitFor(() => expect(store.getSnapshot().state.diagnostics).toHaveLength(1));

    expect(store.getSnapshot().state.diagnostics[0]?.diagnostic.message).toBe("broken.json: read failed");
  });

  it("игнорирует file input change без выбранного файла", () => {
    const store = renderShell();
    const before = store.getSnapshot();

    fireEvent.change(screen.getByTestId(ids.source.projectExportFile), {
      target: {
        files: [],
      },
    });

    expect(store.getSnapshot()).toBe(before);
  });

  it("показывает fallback diagnostic message для unknown file read rejection", async () => {
    const store = renderShell();
    const failingFile = {
      name: "unknown.json",
      text: async () => {
        throw "read failed";
      },
    };

    fireEvent.change(screen.getByTestId(ids.source.projectExportFile), {
      target: {
        files: [failingFile],
      },
    });

    await waitFor(() => expect(store.getSnapshot().state.diagnostics).toHaveLength(1));

    expect(store.getSnapshot().state.diagnostics[0]?.diagnostic.message).toBe(
      "unknown.json: Could not read project graph export file.",
    );
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

  it("рендерит ready source status и singular diagnostic label", () => {
    const base = createInitialWorkbenchSnapshot();
    const snapshot: WorkbenchSnapshot = {
      ...base,
      state: {
        ...base.state,
        compile: { ...base.state.compile, status: "ready" },
        diagnostics: [
          {
            diagnosticId: "compiler:1:warn",
            sourceVersion: 1,
            origin: "compiler",
            diagnostic: { code: "warn", severity: "warning", message: "One warning" },
            sourceAnchors: [],
            primaryTarget: { kind: "console" },
          },
        ],
      },
    };

    renderShell(snapshot);

    expect(screen.getByTestId(ids.source.status).textContent).toContain("compiled");
    expect(screen.getByTestId(ids.source.status).textContent).toContain("1 issue");
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

  it("открывает и закрывает machine canvas board из Machines tab", () => {
    const base = createInitialWorkbenchSnapshot();
    const snapshot: WorkbenchSnapshot = {
      ...base,
      state: {
        ...base.state,
        activeTab: "machines",
        model: { status: "ready", model: machineCanvasModelFixture(), diagnostics: [] },
        l3: { selectedMachineIds: ["player"] },
        simulation: {
          ...base.state.simulation,
          status: "running",
          selectedMachineIds: ["player"],
          scope: { kind: "machines", machineIds: ["player"] },
        },
      },
    };
    const store = renderShell(snapshot);

    expect(screen.getByTestId(ids.workbench.machineCard).textContent).not.toContain("@ idle");
    fireEvent.click(screen.getByTestId(ids.canvas.openAction));

    expect(store.getSnapshot().state.canvas.machineBoard).toEqual({ sourceVersion: 1, machineId: "player" });
    expect(screen.getByTestId(ids.canvas.board).textContent).toContain("current simulation idle");
    expect(store.getSnapshot().state.l3.selectedMachineIds).toEqual(["player"]);
    expect(store.getSnapshot().state.simulation.status).toBe("running");

    fireEvent.click(screen.getByTestId(ids.canvas.close));
    expect(store.getSnapshot().state.canvas.machineBoard).toBeUndefined();
    expect(screen.queryByTestId(ids.canvas.board)).toBeNull();
    expect(store.getSnapshot().state.l3.selectedMachineIds).toEqual(["player"]);
    expect(store.getSnapshot().state.simulation.status).toBe("running");

    fireEvent.click(screen.getByTestId(ids.canvas.openAction));
    expect(screen.getByTestId(ids.canvas.board)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(store.getSnapshot().state.canvas.machineBoard).toBeUndefined();
    expect(screen.queryByTestId(ids.canvas.board)).toBeNull();
  });

  it("рендерит controlled machine canvas states из Shell selector", () => {
    const base = createInitialWorkbenchSnapshot();
    const missingModelSnapshot: WorkbenchSnapshot = {
      ...base,
      state: {
        ...base.state,
        activeTab: "machines",
        canvas: openMachineBoard(base.state.canvas, base.state.source.version, "player"),
      },
    };
    const store = renderShell(missingModelSnapshot);

    expect(screen.getByTestId(ids.canvas.board).textContent).toContain("Compiled model is not available");
    fireEvent.click(screen.getByTestId(ids.canvas.close));
    expect(store.getSnapshot().state.canvas.machineBoard).toBeUndefined();

    const missingMachineSnapshot: WorkbenchSnapshot = {
      ...base,
      state: {
        ...base.state,
        activeTab: "machines",
        model: { status: "ready", model: machineCanvasModelFixture(), diagnostics: [] },
        canvas: openMachineBoard(base.state.canvas, base.state.source.version, "worker"),
      },
    };
    renderShell(missingMachineSnapshot);

    expect(screen.getByTestId(ids.canvas.board).textContent).toContain("worker");
    expect(screen.getByTestId(ids.canvas.board).textContent).toContain("no longer present");
  });
});
