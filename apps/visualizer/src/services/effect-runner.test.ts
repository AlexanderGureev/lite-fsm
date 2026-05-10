import type { LiteFsmGraphDocument } from "@lite-fsm/graph";
import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { describe, expect, it, vi } from "vitest";
import { createNoopCodegenPlanner } from "../codegen";
import { createSourceSession } from "../source";
import { createWorkbenchStore } from "../workbench";
import { createNoopValidationRegistry } from "../validation";
import { createDefaultEffectRunnerServices } from "./default-services";
import { runWorkbenchEffect, runWorkbenchEffects } from "./effect-runner";
import {
  createUnimplementedAnalyzerClient,
  createUnimplementedCompilerClient,
  createUnimplementedModelClient,
} from "./unimplemented-clients";
import type { EffectRunnerServices } from "./types";

const documentFixture = { source: { filename: "sample.ts", language: "ts" }, diagnostics: [], machines: [], managers: [] } as unknown as LiteFsmGraphDocument;
const modelFixture = { version: "lite-fsm.visualizer/v1", machines: [], managers: [], topics: [], diagnostics: [], workbenchMachines: {} } as unknown as GraphVisualizerModel;

const createServices = (): EffectRunnerServices => ({
  compiler: {
    compile: vi.fn(async (input) => ({
      ok: true as const,
      sourceVersion: input.source.version,
      document: documentFixture,
      diagnostics: [],
    })),
  },
  analyzer: {
    analyze: vi.fn(async (input) => ({
      ok: true as const,
      sourceVersion: input.sourceVersion,
      diagnostics: [],
    })),
  },
  visualizerModel: {
    build: vi.fn(async (input) => ({
      ok: true as const,
      sourceVersion: input.sourceVersion,
      model: modelFixture,
    })),
  },
  validation: createNoopValidationRegistry(),
  codegen: createNoopCodegenPlanner(),
});

describe("effect runner", () => {
  it("вызывает compiler client и возвращает internal command", async () => {
    const services = createServices();
    const source = { source: "const a = 1;", language: "ts" as const, version: 3, hash: "lfg1:test" };

    await expect(runWorkbenchEffect({ kind: "compile", requestId: "compile:3:1", source }, services)).resolves.toEqual({
      type: "compile.succeeded",
      requestId: "compile:3:1",
      sourceVersion: 3,
      document: documentFixture,
    });
    expect(services.compiler.compile).toHaveBeenCalledWith({
      requestId: "compile:3:1",
      sourceVersion: 3,
      source,
    });
  });

  it("маршрутизирует analyze, model, validation и codegen effects", async () => {
    const services = createServices();

    await expect(
      runWorkbenchEffect({ kind: "analyze", requestId: "analyze:1:1", sourceVersion: 1, document: documentFixture }, services),
    ).resolves.toEqual({ type: "analysis.succeeded", requestId: "analyze:1:1", sourceVersion: 1, diagnostics: [] });

    await expect(
      runWorkbenchEffect(
        {
          kind: "build-model",
          requestId: "model:1:1",
          sourceVersion: 1,
          document: documentFixture,
          analysisDiagnostics: [],
        },
        services,
      ),
    ).resolves.toEqual({ type: "model.succeeded", requestId: "model:1:1", sourceVersion: 1, model: modelFixture });

    await expect(
      runWorkbenchEffect({ kind: "run-validation", requestId: "validation:1:1", sourceVersion: 1 }, services),
    ).resolves.toEqual({ type: "validation.succeeded", requestId: "validation:1:1", sourceVersion: 1, diagnostics: [] });

    const codegen = await runWorkbenchEffect(
      {
        kind: "codegen.plan",
        requestId: "codegen:1:1",
        sourceVersion: 1,
        sourceHash: "lfg1:test",
        intent: { kind: "add-machine", template: "domain" },
      },
      services,
    );

    expect(codegen).toMatchObject({ type: "codegen.plan.completed", requestId: "codegen:1:1", sourceVersion: 1 });
  });

  it("передает document/model в validation registry", async () => {
    const services = createServices();
    services.validation.run = vi.fn(async () => []);

    await expect(
      runWorkbenchEffect(
        {
          kind: "run-validation",
          requestId: "validation:1:1",
          sourceVersion: 1,
          document: documentFixture,
          model: modelFixture,
        },
        services,
      ),
    ).resolves.toEqual({ type: "validation.succeeded", requestId: "validation:1:1", sourceVersion: 1, diagnostics: [] });
    expect(services.validation.run).toHaveBeenCalledWith({
      sourceVersion: 1,
      document: documentFixture,
      model: modelFixture,
    });
  });

  it("возвращает controlled failure при исключении сервиса", async () => {
    const services = createServices();
    services.visualizerModel.build = vi.fn(async () => {
      throw new Error("boom");
    });

    const command = await runWorkbenchEffect(
      {
        kind: "build-model",
        requestId: "model:1:1",
        sourceVersion: 1,
        document: documentFixture,
        analysisDiagnostics: [],
      },
      services,
    );

    expect(command).toMatchObject({
      type: "model.failed",
      requestId: "model:1:1",
      sourceVersion: 1,
      diagnostics: [{ diagnostic: { code: "effect-runner-failed", message: "boom" } }],
    });
  });

  it("маршрутизирует failed responses от graph clients", async () => {
    const diagnostic = {
      diagnosticId: "source:1:bad",
      sourceVersion: 1,
      origin: "source" as const,
      diagnostic: { code: "bad", severity: "error" as const, message: "Bad" },
      sourceAnchors: [],
      primaryTarget: { kind: "console" as const },
    };
    const services = createServices();
    services.compiler.compile = vi.fn(async () => ({ ok: false as const, sourceVersion: 1, diagnostics: [diagnostic] }));
    services.analyzer.analyze = vi.fn(async () => ({ ok: false as const, sourceVersion: 1, diagnostics: [diagnostic] }));
    services.visualizerModel.build = vi.fn(async () => ({ ok: false as const, sourceVersion: 1, diagnostics: [diagnostic] }));

    const source = { source: "const a = 1;", language: "ts" as const, version: 1, hash: "lfg1:test" };

    await expect(runWorkbenchEffect({ kind: "compile", requestId: "compile:1:1", source }, services)).resolves.toEqual({
      type: "compile.failed",
      requestId: "compile:1:1",
      sourceVersion: 1,
      diagnostics: [diagnostic],
    });
    await expect(
      runWorkbenchEffect({ kind: "analyze", requestId: "analyze:1:1", sourceVersion: 1, document: documentFixture }, services),
    ).resolves.toEqual({ type: "analysis.failed", requestId: "analyze:1:1", sourceVersion: 1, diagnostics: [diagnostic] });
    await expect(
      runWorkbenchEffect(
        { kind: "build-model", requestId: "model:1:1", sourceVersion: 1, document: documentFixture, analysisDiagnostics: [] },
        services,
      ),
    ).resolves.toEqual({ type: "model.failed", requestId: "model:1:1", sourceVersion: 1, diagnostics: [diagnostic] });
  });

  it("строит controlled failures для каждого service kind", async () => {
    const services = createServices();
    services.compiler.compile = vi.fn(async () => {
      throw "compile failed";
    });
    services.analyzer.analyze = vi.fn(async () => {
      throw new Error("analyze failed");
    });
    services.validation.run = vi.fn(async () => {
      throw new Error("validation failed");
    });
    services.codegen.plan = vi.fn(async () => {
      throw new Error("codegen failed");
    });
    const source = { source: "const a = 1;", language: "ts" as const, version: 1, hash: "lfg1:test" };

    await expect(runWorkbenchEffect({ kind: "compile", requestId: "compile:1:1", source }, services)).resolves.toMatchObject({
      type: "compile.failed",
      diagnostics: [{ diagnostic: { message: "Unknown visualizer service failure." } }],
    });
    await expect(
      runWorkbenchEffect({ kind: "analyze", requestId: "analyze:1:1", sourceVersion: 1, document: documentFixture }, services),
    ).resolves.toMatchObject({ type: "analysis.failed", diagnostics: [{ diagnostic: { message: "analyze failed" } }] });
    await expect(
      runWorkbenchEffect({ kind: "run-validation", requestId: "validation:1:1", sourceVersion: 1 }, services),
    ).resolves.toMatchObject({ type: "validation.failed", diagnostics: [{ diagnostic: { message: "validation failed" } }] });
    await expect(
      runWorkbenchEffect({
        kind: "codegen.plan",
        requestId: "codegen:1:1",
        sourceVersion: 1,
        sourceHash: "lfg1:test",
        intent: { kind: "add-machine", template: "domain" },
      }, services),
    ).resolves.toEqual({
      type: "codegen.plan.failed",
      requestId: "codegen:1:1",
      sourceVersion: 1,
      diagnostics: [
        {
          diagnosticId: "host:1:effect-runner-failed",
          sourceVersion: 1,
          origin: "host",
          diagnostic: { code: "effect-runner-failed", severity: "warning", message: "codegen failed" },
          sourceAnchors: [],
          primaryTarget: { kind: "console" },
        },
      ],
    });
  });

  it("игнорирует simulation-only descriptors в 12a runner", async () => {
    const services = createServices();

    await expect(
      runWorkbenchEffect({ kind: "simulation.send", sourceVersion: 1, event: { type: "PLAY" } }, services),
    ).resolves.toBeUndefined();
  });

  it("исполняет descriptor chain через store", async () => {
    const services = createServices();
    const store = createWorkbenchStore();
    const output = store.dispatch({ type: "source.open-visualizer" });

    runWorkbenchEffects(output.effects, services, store);
    await vi.waitFor(() => expect(store.getSnapshot().state.model.status).toBe("ready"));
  });

  it("исполняет полный source pipeline через default local graph services", async () => {
    const services = createDefaultEffectRunnerServices();
    const store = createWorkbenchStore();
    const output = store.dispatch({ type: "source.open-visualizer" });

    runWorkbenchEffects(output.effects, services, store);

    await vi.waitFor(() => expect(store.getSnapshot().state.validation.status).toBe("ready"));
    expect(store.getSnapshot().state.compile.document?.machines).toHaveLength(1);
    expect(store.getSnapshot().state.model.model?.topics.map((topic) => topic.eventType)).toEqual(["PAUSE", "PLAY", "STOP"]);
    expect(store.getSnapshot().state.console.entries).toEqual([
      expect.objectContaining({ channel: "system", title: "Source pipeline started" }),
    ]);
  });

  it("не применяет async response, если source изменился до завершения effect", async () => {
    let resolveCompile: (value: Awaited<ReturnType<EffectRunnerServices["compiler"]["compile"]>>) => void = () => {};
    const compilePromise = new Promise<Awaited<ReturnType<EffectRunnerServices["compiler"]["compile"]>>>((resolve) => {
      resolveCompile = resolve;
    });
    const services = createServices();
    services.compiler.compile = vi.fn(() => compilePromise);
    services.analyzer.analyze = vi.fn(async (input) => ({
      ok: true as const,
      sourceVersion: input.sourceVersion,
      diagnostics: [],
    }));
    const store = createWorkbenchStore();
    const output = store.dispatch({ type: "source.open-visualizer" });

    runWorkbenchEffects(output.effects, services, store);
    store.dispatch({ type: "source.changed", source: "export const changed = 1;" });
    resolveCompile({
      ok: true,
      sourceVersion: 1,
      document: documentFixture,
      diagnostics: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getSnapshot().state.source.source).toBe("export const changed = 1;");
    expect(store.getSnapshot().state.compile.status).toBe("idle");
    expect(services.analyzer.analyze).not.toHaveBeenCalled();
  });

  it("пропускает undefined command в async chain", async () => {
    const services = createServices();
    const store = createWorkbenchStore();
    const before = store.getSnapshot();

    runWorkbenchEffects([{ kind: "simulation.send", sourceVersion: 1, event: { type: "PLAY" } }], services, store);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getSnapshot()).toBe(before);
  });

  it("возвращает controlled diagnostics для unimplemented clients", async () => {
    const source = { source: "const a = 1;", language: "ts" as const, version: 1, hash: "lfg1:test" };

    await expect(createUnimplementedCompilerClient().compile({ requestId: "c", sourceVersion: 1, source })).resolves.toMatchObject({
      ok: false,
      diagnostics: [{ diagnostic: { code: "compiler-client-not-connected" } }],
    });
    await expect(
      createUnimplementedAnalyzerClient().analyze({ requestId: "a", sourceVersion: 1, document: documentFixture }),
    ).resolves.toMatchObject({ ok: false, diagnostics: [{ diagnostic: { code: "analyzer-client-not-connected" } }] });
    await expect(
      createUnimplementedModelClient().build({
        requestId: "m",
        sourceVersion: 1,
        document: documentFixture,
        analysisDiagnostics: [],
      }),
    ).resolves.toMatchObject({ ok: false, diagnostics: [{ diagnostic: { code: "model-client-not-connected" } }] });
  });

  it("default services возвращают diagnostics для source без machines без падения chain", async () => {
    const services = createDefaultEffectRunnerServices();
    const source = createSourceSession({ source: "export const value = 1;", filename: "empty.ts" });
    const compile = await services.compiler.compile({ requestId: "compile:1:1", sourceVersion: 1, source });

    expect(compile).toMatchObject({ ok: true, sourceVersion: 1 });
    if (!compile.ok) throw new Error("Compile failed.");
    const analysis = await services.analyzer.analyze({
      requestId: "analyze:1:1",
      sourceVersion: 1,
      document: compile.document,
    });
    expect(analysis).toMatchObject({ ok: true, sourceVersion: 1 });
  });
});
