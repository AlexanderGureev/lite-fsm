import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { WorkbenchProvider } from "../app/workbench-context";
import { createNoopCodegenPlanner } from "../codegen";
import { createLocalSimulationService, type EffectRunnerServices } from "../services";
import { createWorkbenchStore } from "../workbench";
import { createNoopValidationRegistry } from "../validation";
import {
  ProjectExportConfigLoader,
  projectExportFileNameFromUrl,
  resetProjectExportConfigLoaderForTests,
  resolveProjectExportConfigUrl,
} from "./config-loader";
import type { LiteFsmProjectGraphExportDocument } from "./types";

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

const modelFixture = (): GraphVisualizerModel =>
  ({
    version: "lite-fsm.visualizer/v1",
    source: { filename: "store/index.ts", language: "ts" },
    machines: [],
    managers: [],
    topics: [],
    relations: { machineIdsByTopicType: {}, topicTypesByMachineId: {} },
    diagnostics: [],
    rowMappings: {
      transitionRowIdsByTransitionId: {},
      emissionRowIdsByEmissionId: {},
      transitionRowIdsByMachineAndTransitionId: {},
      emissionRowIdsByMachineAndEmissionId: {},
      diagnostics: [],
    },
    workbenchMachines: {},
  }) as GraphVisualizerModel;

const servicesFixture = (): EffectRunnerServices => ({
  compiler: {
    compile: vi.fn(async (input) => ({
      ok: true as const,
      sourceVersion: input.sourceVersion,
      document: exportDocument.graph,
      diagnostics: [],
    })),
  },
  analyzer: {
    analyze: vi.fn(async (input) => ({ ok: true as const, sourceVersion: input.sourceVersion, diagnostics: [] })),
  },
  visualizerModel: {
    build: vi.fn(async (input) => ({ ok: true as const, sourceVersion: input.sourceVersion, model: modelFixture() })),
  },
  simulation: createLocalSimulationService(),
  validation: createNoopValidationRegistry(),
  codegen: createNoopCodegenPlanner(),
});

const renderLoader = (url: string, services: EffectRunnerServices = servicesFixture()) => {
  window.history.pushState({}, "", url);
  const store = createWorkbenchStore();

  render(
    <WorkbenchProvider store={store} services={services}>
      <ProjectExportConfigLoader />
    </WorkbenchProvider>,
  );

  return { store, services };
};

afterEach(() => {
  resetProjectExportConfigLoaderForTests();
  vi.unstubAllGlobals();
  cleanup();
});

describe("загрузчик project graph export через query config", () => {
  it("разрешает абсолютные http(s) и root-relative URL", () => {
    const absolute = resolveProjectExportConfigUrl("https://example.com/graph.json", "http://localhost:3000");
    const rootRelative = resolveProjectExportConfigUrl("/exports/graph.json", "http://localhost:3000");

    expect(absolute).toMatchObject({ ok: true });
    expect(rootRelative).toMatchObject({ ok: true });
    if (!absolute.ok || !rootRelative.ok) throw new Error("URL resolution failed.");
    expect(absolute.url.href).toBe("https://example.com/graph.json");
    expect(rootRelative.url.href).toBe("http://localhost:3000/exports/graph.json");
  });

  it("отклоняет пустые, relative и unsupported URL", () => {
    expect(resolveProjectExportConfigUrl("", "http://localhost:3000")).toMatchObject({
      ok: false,
      issue: { code: "invalid-document" },
    });
    expect(resolveProjectExportConfigUrl("exports/graph.json", "http://localhost:3000")).toMatchObject({
      ok: false,
      issue: { message: "Project graph export URL must be absolute or root-relative." },
    });
    expect(resolveProjectExportConfigUrl("file:///tmp/graph.json", "http://localhost:3000")).toMatchObject({
      ok: false,
      issue: { message: "Project graph export URL must use http(s) or a root-relative path." },
    });
  });

  it("выводит имя JSON export из URL", () => {
    expect(projectExportFileNameFromUrl(new URL("https://example.com/exports/lamp.json"))).toBe("lamp.json");
    expect(projectExportFileNameFromUrl(new URL("https://example.com/exports/"))).toBe("exports");
    expect(projectExportFileNameFromUrl(new URL("https://example.com/"))).toBe("project-export.json");
  });

  it("загружает root-relative config и запускает document pipeline", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(exportDocument), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { store, services } = renderLoader("/visualizer/?config=%2Fexports%2Flamp.json");

    await waitFor(() => expect(store.getSnapshot().state.inputMode.kind).toBe("project-export"));

    expect(fetch).toHaveBeenCalledWith("http://localhost:3000/exports/lamp.json", { credentials: "same-origin" });
    expect(services.compiler.compile).not.toHaveBeenCalled();
    expect(services.analyzer.analyze).toHaveBeenCalledWith({
      requestId: "analyze:2:1",
      sourceVersion: 2,
      document: exportDocument.graph,
    });
    expect(store.getSnapshot().state.inputMode).toMatchObject({
      kind: "project-export",
      fileName: "lamp.json",
      entryPath: "store/index.ts",
    });
  });

  it("не делает повторный fetch для того же config URL в рамках страницы", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(exportDocument), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const first = renderLoader("/visualizer/?config=%2Fexports%2Flamp.json");
    await waitFor(() => expect(first.store.getSnapshot().state.inputMode.kind).toBe("project-export"));
    cleanup();

    const second = renderLoader("/visualizer/?config=%2Fexports%2Flamp.json");
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second.store.getSnapshot().state.inputMode.kind).toBe("pasted-source");
  });

  it("показывает diagnostic для invalid config URL без fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { store } = renderLoader("/visualizer/?config=exports%2Fgraph.json");

    await waitFor(() => expect(store.getSnapshot().state.diagnostics).toHaveLength(1));

    expect(fetch).not.toHaveBeenCalled();
    expect(store.getSnapshot().state.diagnostics[0]?.diagnostic.message).toContain(
      "Project graph export URL must be absolute or root-relative.",
    );
  });

  it("показывает diagnostic для invalid JSON export", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const { store } = renderLoader("/visualizer/?config=%2Fexports%2Fbad.json");

    await waitFor(() => expect(store.getSnapshot().state.diagnostics).toHaveLength(1));

    expect(store.getSnapshot().state.diagnostics[0]?.diagnostic.message).toContain(
      "Project graph export version must be lite-fsm.project-graph-export/v1.",
    );
  });

  it("показывает diagnostic для fetch failure и игнорирует отсутствие config", async () => {
    const fetch = vi.fn(async () => new Response("Not found", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    const failed = renderLoader("/visualizer/?config=%2Fexports%2Fmissing.json");

    await waitFor(() => expect(failed.store.getSnapshot().state.diagnostics).toHaveLength(1));
    expect(failed.store.getSnapshot().state.diagnostics[0]?.diagnostic.message).toContain("HTTP 404");

    resetProjectExportConfigLoaderForTests();
    cleanup();
    const empty = renderLoader("/visualizer/");
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(empty.store.getSnapshot().state.diagnostics).toHaveLength(0);
  });
});
