import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchProvider } from "../app/workbench-context";
import { createDefaultEffectRunnerServices } from "../services";
import { createWorkbenchStore } from "../workbench";
import { StartupLoader, resetStartupLoaderForTests } from "./StartupLoader";
import type { LiteFsmProjectGraphExportDocument } from "../project-export";

const exportDocument: LiteFsmProjectGraphExportDocument = {
  version: "lite-fsm.project-graph-export/v1",
  createdBy: { package: "@lite-fsm/cli", version: "0.1.0" },
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

const renderStartup = (url: string) => {
  window.history.pushState({}, "", url);
  const store = createWorkbenchStore();
  render(
    <WorkbenchProvider store={store} services={createDefaultEffectRunnerServices()}>
      <StartupLoader />
    </WorkbenchProvider>,
  );

  return store;
};

afterEach(() => {
  resetStartupLoaderForTests();
  vi.unstubAllGlobals();
  cleanup();
});

describe("StartupLoader", () => {
  it("без query params оставляет pasted-source через startup flow", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const store = renderStartup("/visualizer/");

    await waitFor(() => {
      expect(store.getSnapshot().state.inputMode.kind).toBe("pasted-source");
      expect(store.getSnapshot().state.source.filename).toBe("sample.ts");
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("загружает config через единый startup boundary", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(exportDocument)));
    vi.stubGlobal("fetch", fetch);
    const store = renderStartup("/visualizer/?config=%2Fexports%2Fgraph.json");

    await waitFor(() => expect(store.getSnapshot().state.inputMode.kind).toBe("project-export"));

    expect(fetch).toHaveBeenCalledWith("http://localhost:3000/exports/graph.json", { credentials: "same-origin" });
    expect(store.getSnapshot().state.inputMode).toMatchObject({ kind: "project-export", fileName: "graph.json" });
  });

  it("загружает local session и отдает session приоритет над config", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      sessionId: "session-1",
      capabilities: { mode: "local", canReadFiles: true, canWriteFiles: false, canApplyPatch: false, projectRoot: "/project" },
      entry: { path: "store/index.ts" },
      projectRoot: "/project",
      exportDocument,
    })));
    vi.stubGlobal("fetch", fetch);
    const store = renderStartup("/visualizer/?config=%2Fexports%2Fgraph.json&session=token-1");

    await waitFor(() => expect(store.getSnapshot().state.inputMode.kind).toBe("local-session"));

    expect(fetch).toHaveBeenCalledWith("http://localhost:3000/api/session?token=token-1", { credentials: "same-origin" });
    expect(store.getSnapshot().state.inputMode).toMatchObject({ kind: "local-session", token: "token-1" });
  });

  it("дедуплицирует загрузку одного startup key и dispatch failure", async () => {
    const fetch = vi.fn(async () => new Response("missing", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    const first = renderStartup("/visualizer/?config=%2Fexports%2Fmissing.json");

    await waitFor(() => expect(first.getSnapshot().state.diagnostics).toHaveLength(1));
    cleanup();

    const second = renderStartup("/visualizer/?config=%2Fexports%2Fmissing.json");
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second.getSnapshot().state.diagnostics).toHaveLength(0);
  });

  it("нормализует unknown startup failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw "offline";
    }));
    const store = renderStartup("/visualizer/?config=%2Fexports%2Fboom.json");

    await waitFor(() => expect(store.getSnapshot().state.diagnostics).toHaveLength(1));

    expect(store.getSnapshot().state.diagnostics[0]?.diagnostic).toMatchObject({
      code: "startup-project-export-network-error",
      message: "Could not start visualizer input.",
    });
  });

  it("нормализует Error startup failure и issue path", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const invalid = renderStartup("/visualizer/?config=%2Fexports%2Finvalid.json");

    await waitFor(() => expect(invalid.getSnapshot().state.diagnostics).toHaveLength(1));
    expect(invalid.getSnapshot().state.diagnostics[0]?.diagnostic.code).toBe("startup-project-export-invalid-version");

    resetStartupLoaderForTests();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const failed = renderStartup("/visualizer/?config=%2Fexports%2Foffline.json");

    await waitFor(() => expect(failed.getSnapshot().state.diagnostics).toHaveLength(1));
    expect(failed.getSnapshot().state.diagnostics[0]?.diagnostic.message).toBe("offline");
  });
});
