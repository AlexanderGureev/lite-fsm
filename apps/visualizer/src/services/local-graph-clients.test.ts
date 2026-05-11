import type { LiteFsmGraphDocument } from "@lite-fsm/graph";
import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_SOURCE, createSourceSession } from "../source";
import {
  createDefaultEffectRunnerServices,
  createLocalAnalyzerClient,
  createLocalCompilerClient,
  createLocalVisualizerModelClient,
} from "./index";

const createSampleDocument = async (): Promise<LiteFsmGraphDocument> => {
  const source = createSourceSession({ source: SAMPLE_SOURCE, filename: "sample.ts" });
  const response = await createLocalCompilerClient().compile({
    requestId: "compile:1:1",
    sourceVersion: source.version,
    source,
  });

  if (!response.ok) throw new Error("Sample source did not compile.");

  return response.document;
};

describe("локальные graph clients", () => {
  it("компилирует, анализирует и строит view-model для примерного исходника", async () => {
    const source = createSourceSession({ source: SAMPLE_SOURCE, filename: "sample.ts" });
    const compile = await createLocalCompilerClient().compile({
      requestId: "compile:1:1",
      sourceVersion: source.version,
      source,
    });

    expect(compile.ok).toBe(true);
    if (!compile.ok) throw new Error("Compile failed.");
    expect(compile.sourceVersion).toBe(1);
    expect(compile.document.machines).toHaveLength(1);

    const analysis = await createLocalAnalyzerClient().analyze({
      requestId: "analyze:1:1",
      sourceVersion: 1,
      document: compile.document,
    });

    expect(analysis.ok).toBe(true);
    if (!analysis.ok) throw new Error("Analysis failed.");

    const model = await createLocalVisualizerModelClient().build({
      requestId: "model:1:1",
      sourceVersion: 1,
      document: compile.document,
      analysisDiagnostics: analysis.diagnostics,
    });

    expect(model.ok).toBe(true);
    if (!model.ok) throw new Error("Model build failed.");
    expect(model.model.machines).toHaveLength(1);
    expect(model.model.topics.map((topic) => topic.eventType)).toEqual(["PAUSE", "PLAY", "STOP"]);
  });

  it("возвращает compile document с контролируемыми diagnostics для невалидного исходника", async () => {
    const source = createSourceSession({ source: "export const broken = ;", filename: "broken.ts" });

    const compile = await createLocalCompilerClient().compile({
      requestId: "compile:1:1",
      sourceVersion: 1,
      source,
    });

    expect(compile.ok).toBe(true);
    if (!compile.ok) throw new Error("Compile failed.");
    expect(compile.document.diagnostics.length).toBeGreaterThan(0);
    expect(compile.document.machines).toEqual([]);
  });

  it("возвращает контролируемые failed responses при исключениях сервисов", async () => {
    const source = createSourceSession({ source: SAMPLE_SOURCE, filename: "sample.ts" });
    const document = await createSampleDocument();

    const compiler = await createLocalCompilerClient({
      compile: () => {
        throw new Error("compile boom");
      },
    }).compile({ requestId: "compile:1:1", sourceVersion: 1, source });

    expect(compiler).toMatchObject({
      ok: false,
      diagnostics: [{ origin: "host", diagnostic: { code: "compiler-client-failed", message: "compile boom" } }],
    });

    const analyzer = await createLocalAnalyzerClient({
      analyze: () => {
        throw "analyze boom";
      },
    }).analyze({ requestId: "analyze:1:1", sourceVersion: 1, document });

    expect(analyzer).toMatchObject({
      ok: false,
      diagnostics: [{ origin: "host", diagnostic: { code: "analyzer-client-failed", message: "Unknown visualizer graph service failure." } }],
    });

    const model = await createLocalVisualizerModelClient({
      buildModel: () => {
        throw new Error("model boom");
      },
    }).build({
      requestId: "model:1:1",
      sourceVersion: 1,
      document,
      analysisDiagnostics: [],
    });

    expect(model).toMatchObject({
      ok: false,
      diagnostics: [{ origin: "host", diagnostic: { code: "model-client-failed", message: "model boom" } }],
    });
  });

  it("передает diagnostics анализа и simulation overlay в построитель модели", async () => {
    const document = await createSampleDocument();
    const modelFixture = {
      version: "lite-fsm.visualizer/v1",
      source: document.source,
      machines: [],
      managers: [],
      topics: [],
      relations: { topicTypesByMachineId: {}, machineIdsByTopicType: {} },
      diagnostics: [],
      rowMappings: {
        transitionRowIdsByTransitionId: {},
        emissionRowIdsByEmissionId: {},
        transitionRowIdsByMachineAndTransitionId: {},
        emissionRowIdsByMachineAndEmissionId: {},
        diagnostics: [],
      },
      workbenchMachines: {},
    } as GraphVisualizerModel;
    const analysisDiagnostics = [{ code: "info", severity: "info" as const, message: "ready" }];
    const model = await createLocalVisualizerModelClient({
      buildModel: (_document, options) => {
        expect(options?.analysisDiagnostics).toEqual(analysisDiagnostics);
        expect(options?.simulation?.recentlyFiredRowIds).toEqual(["row:1"]);
        return modelFixture;
      },
    }).build({
      requestId: "model:1:1",
      sourceVersion: 1,
      document,
      analysisDiagnostics,
      simulation: { recentlyFiredRowIds: ["row:1"] },
    });

    expect(model).toEqual({ ok: true, sourceVersion: 1, model: modelFixture });
  });

  it("подключает локальные clients в сервисы по умолчанию", async () => {
    const services = createDefaultEffectRunnerServices();
    const source = createSourceSession({ source: SAMPLE_SOURCE, filename: "sample.ts" });

    await expect(
      services.compiler.compile({ requestId: "compile:1:1", sourceVersion: 1, source }),
    ).resolves.toMatchObject({ ok: true, sourceVersion: 1 });
  });

  it("передает filename/language в зависимость compiler и document в зависимость analyzer", async () => {
    const document = await createSampleDocument();
    const compile = vi.fn(() => ({ document, diagnostics: document.diagnostics }));
    const analyze = vi.fn(() => ({ diagnostics: [{ code: "info", severity: "info" as const, message: "ok" }] }));
    const source = createSourceSession({ source: SAMPLE_SOURCE, filename: "component.tsx", language: "tsx", version: 7 });

    await expect(
      createLocalCompilerClient({ compile }).compile({ requestId: "compile:7:1", sourceVersion: 7, source }),
    ).resolves.toMatchObject({ ok: true, sourceVersion: 7, document });
    expect(compile).toHaveBeenCalledWith(SAMPLE_SOURCE, { filename: "component.tsx", language: "tsx" });

    await expect(
      createLocalAnalyzerClient({ analyze }).analyze({ requestId: "analyze:7:1", sourceVersion: 7, document }),
    ).resolves.toEqual({
      ok: true,
      sourceVersion: 7,
      diagnostics: [{ code: "info", severity: "info", message: "ok" }],
    });
    expect(analyze).toHaveBeenCalledWith(document);
  });
});
