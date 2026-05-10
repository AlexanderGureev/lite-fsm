import type { ConsoleEntry } from "../../console";
import { WorkbenchProvider } from "../../app/workbench-context";
import { createNoopCodegenPlanner } from "../../codegen";
import type { EffectRunnerServices } from "../../services";
import { createInitialWorkbenchSnapshot } from "../../workbench/state";
import { createWorkbenchStore } from "../../workbench/store";
import type { WorkbenchSnapshot } from "../../workbench/types";
import { createNoopValidationRegistry } from "../../validation";
import { TooltipProvider } from "@/ui/tooltip";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Shell } from "./Shell";

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

describe("Shell", () => {
  it("связывает source controls, tabs, console toggle и empty console state", () => {
    const store = renderShell();

    expect(screen.getByText("Stage 12d read-only graph views")).toBeTruthy();
    expect(screen.getByTestId("visualizer-source-status").textContent).toContain("model idle");
    expect(screen.getByText("No console entries in this channel.")).toBeTruthy();

    fireEvent.click(screen.getByTestId("visualizer-source-open"));
    expect(store.getSnapshot().state.compile.status).toBe("running");

    fireEvent.mouseDown(screen.getByTestId("visualizer-tab-system"), { button: 0, ctrlKey: false });
    expect(store.getSnapshot().state.activeTab).toBe("system");
    expect(screen.getByTestId("visualizer-system-panel")).toBeTruthy();
    expect(screen.queryByTestId("visualizer-source-panel")).toBeNull();

    fireEvent.mouseDown(screen.getByTestId("visualizer-tab-events"), { button: 0, ctrlKey: false });
    expect(store.getSnapshot().state.activeTab).toBe("events");
    expect(screen.getByTestId("visualizer-events-panel")).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId("visualizer-tab-machines"), { button: 0, ctrlKey: false });
    expect(store.getSnapshot().state.activeTab).toBe("machines");
    expect(screen.getByTestId("visualizer-workbench-panel")).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId("visualizer-tab-source"), { button: 0, ctrlKey: false });
    expect(store.getSnapshot().state.activeTab).toBe("source");

    fireEvent.change(screen.getByTestId("visualizer-source-editor"), { target: { value: "" } });
    expect(store.getSnapshot().state.source.source).toBe("");
    expect((screen.getByTestId("visualizer-source-open") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("visualizer-source-reset"));
    expect(store.getSnapshot().state.source.source).toContain("playerMachine");

    expect(store.getSnapshot().state.panels.console.open).toBe(false);
    expect(screen.getByTestId("visualizer-console-panel").className).toContain("hidden");

    fireEvent.click(screen.getByTestId("visualizer-console-toggle"));
    expect(store.getSnapshot().state.panels.console.open).toBe(true);

    fireEvent.click(screen.getByTestId("visualizer-console-backdrop"));
    expect(store.getSnapshot().state.panels.console.open).toBe(false);

    fireEvent.click(screen.getByTestId("visualizer-console-toggle"));
    expect(store.getSnapshot().state.panels.console.open).toBe(true);

    fireEvent.click(screen.getByTestId("visualizer-console-close"));
    expect(store.getSnapshot().state.panels.console.open).toBe(false);
  });

  it("рендерит console entries, channel buttons и status tones для ready/failed states", () => {
    const base = createInitialWorkbenchSnapshot();
    const snapshot: WorkbenchSnapshot = {
      ...base,
      state: {
        ...base.state,
        compile: { ...base.state.compile, status: "failed" },
        model: { ...base.state.model, status: "ready" },
        validation: { ...base.state.validation, status: "blocked" },
        console: { ...base.state.console, entries: consoleEntries },
      },
    };
    const store = renderShell(snapshot);

    expect(screen.getByTestId("visualizer-source-status").textContent).toContain("model ready");
    expect(screen.getAllByText("compile failed").length).toBeGreaterThan(0);
    expect(screen.getByText("validation blocked")).toBeTruthy();
    expect(screen.getByText("system ready")).toBeTruthy();
    expect(screen.getByText("unsupported source shape")).toBeTruthy();

    fireEvent.click(screen.getByTestId("visualizer-console-channel-system"));
    expect(store.getSnapshot().state.console.selectedChannel).toBe("system");
    expect(screen.getByText("pipeline opened")).toBeTruthy();

    fireEvent.click(screen.getByTestId("visualizer-console-channel-diagnostics"));
    expect(store.getSnapshot().state.console.selectedChannel).toBe("diagnostics");
    expect(within(screen.getByTestId("visualizer-console-entries")).getByText("compile failed")).toBeTruthy();

    fireEvent.click(screen.getByTestId("visualizer-console-channel-debug"));
    expect(store.getSnapshot().state.console.selectedChannel).toBe("debug");
    expect(screen.getByText("debug trace")).toBeTruthy();

    fireEvent.click(screen.getByTestId("visualizer-console-channel-all"));
    expect(store.getSnapshot().state.console.selectedChannel).toBe("all");

    fireEvent.click(within(screen.getByTestId("visualizer-console-entries")).getByText("compile failed").closest("button")!);
    expect(store.getSnapshot().state.panels.console.selectedEntryId).toBe("diagnostic-entry");
  });

  it("закрывает source overlay из Shell", () => {
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

    expect(screen.getByTestId("visualizer-source-overlay")).toBeTruthy();
    fireEvent.click(screen.getByTestId("visualizer-source-overlay-close"));

    expect(store.getSnapshot().state.panels.sourceOverlay).toBeUndefined();
  });
});
