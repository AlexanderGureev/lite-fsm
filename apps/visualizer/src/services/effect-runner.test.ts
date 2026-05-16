import type { LiteFsmGraphDocument } from "@lite-fsm/graph";
import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { describe, expect, it, vi } from "vitest";
import { createNoopCodegenPlanner } from "../codegen";
import { createSourceSession } from "../source";
import { createWorkbenchStore, selectMachineWorkbenchPanel } from "../workbench";
import { createNoopValidationRegistry } from "../validation";
import { createDefaultEffectRunnerServices } from "./default-services";
import { runWorkbenchEffect, runWorkbenchEffects } from "./effect-runner";
import { createLocalSimulationService } from "./local-simulation-service";
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
  simulation: createLocalSimulationService(),
  validation: createNoopValidationRegistry(),
  codegen: createNoopCodegenPlanner(),
  sourceAccess: { fetch: vi.fn() },
});

describe("исполнитель эффектов", () => {
  it("вызывает compiler client и возвращает внутреннюю команду", async () => {
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

  it("маршрутизирует эффекты analyze, model, validation и codegen", async () => {
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
    ).resolves.toEqual({
      type: "model.succeeded",
      requestId: "model:1:1",
      sourceVersion: 1,
      purpose: "pipeline",
      model: modelFixture,
    });

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

  it("маршрутизирует source-access fetch success и failure", async () => {
    const services = createServices();
    services.sourceAccess.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        sessionId: "session-1",
        fileName: "store.ts",
        hash: "abc",
        text: "const store = 1;",
      })
      .mockResolvedValueOnce({
        ok: false,
        sessionId: "session-1",
        fileName: "store.ts",
        hash: "abc",
        code: "source-stale",
        message: "Changed",
      });

    await expect(runWorkbenchEffect({
      kind: "source-access.fetch",
      sessionId: "session-1",
      token: "token-1",
      fileName: "store.ts",
      hash: "abc",
    }, services)).resolves.toEqual({
      type: "source-access.fetch.succeeded",
      sessionId: "session-1",
      fileName: "store.ts",
      hash: "abc",
      text: "const store = 1;",
    });
    await expect(runWorkbenchEffect({
      kind: "source-access.fetch",
      sessionId: "session-1",
      token: "token-1",
      fileName: "store.ts",
      hash: "abc",
    }, services)).resolves.toEqual({
      type: "source-access.fetch.failed",
      sessionId: "session-1",
      fileName: "store.ts",
      hash: "abc",
      code: "source-stale",
      message: "Changed",
    });
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

  it("возвращает контролируемый failure при исключении сервиса", async () => {
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

  it("маршрутизирует неуспешные responses от graph clients", async () => {
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

  it("строит контролируемые failures для каждого вида сервиса", async () => {
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
    services.sourceAccess.fetch = vi.fn(async () => {
      throw new Error("source failed");
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
    await expect(
      runWorkbenchEffect({
        kind: "source-access.fetch",
        sessionId: "session-1",
        token: "token-1",
        fileName: "store.ts",
        hash: "abc",
      }, services),
    ).resolves.toEqual({
      type: "source-access.fetch.failed",
      sessionId: "session-1",
      fileName: "store.ts",
      hash: "abc",
      code: "effect-runner-failed",
      message: "source failed",
    });
  });

  it("возвращает контролируемый diagnostic для команды симуляции без session", async () => {
    const services = createServices();

    await expect(
      runWorkbenchEffect({ kind: "simulation.send", sourceVersion: 1, event: { type: "PLAY" } }, services),
    ).resolves.toMatchObject({
      type: "simulation.snapshot.changed",
      status: "blocked",
      diagnostics: [{ diagnostic: { code: "missing-simulation-session" } }],
    });
  });

  it("создает session симуляции, исполняет send/reset и dispose", async () => {
    const services = createServices();
    const snapshot = {
      documentVersion: "doc",
      machineIds: ["player"],
      domainSlicesByMachineId: { player: "slice:player" },
      actorTemplateSlicesByMachineId: {},
      actorSliceIdsByMachineId: {},
      slices: {
        "slice:player": {
          sliceId: "slice:player",
          machineId: "player",
          stateId: "player:state:idle",
        },
      },
      timeline: {
        rootStepId: "root",
        currentStepId: "root",
        linearStepIds: ["root"],
        childrenByStepId: {},
        stepsById: {
          root: { stepId: "root", index: 0, source: { kind: "initial" }, rowRefs: [] },
        },
      },
    };
    const session = {
      sourceVersion: 1,
      scope: { kind: "machines", machineIds: ["player"] },
      start: vi.fn(() => ({ ok: true as const, snapshot })),
      reset: vi.fn(() => ({ ok: true as const, snapshot })),
      getSnapshot: vi.fn(() => snapshot),
      getAvailableTransitions: vi.fn(() => [{ sliceId: "slice:player", machineId: "player", transitionId: "t:play" }]),
      getSuggestedEmissions: vi.fn(() => [{ sliceId: "slice:player", machineId: "player", emissionId: "e:done" }]),
      send: vi.fn(() => ({ ok: true as const, snapshot, step: snapshot.timeline.stepsById.root })),
      sendFromTransition: vi.fn(() => ({ ok: true as const, snapshot, step: snapshot.timeline.stepsById.root })),
      sendFromEmission: vi.fn(() => ({
        ok: false as const,
        reason: "event-not-accepted" as const,
        diagnostics: [{ code: "LFG_SIM_BLOCKED", severity: "warning" as const, message: "Blocked" }],
      })),
      choose: vi.fn(),
      dispose: vi.fn(),
    };
    services.simulation.createSession = vi.fn(() => session as never);

    await expect(
      runWorkbenchEffect(
        {
          kind: "create-simulation-session",
          sourceVersion: 1,
          document: documentFixture,
          scope: { kind: "machines", machineIds: ["player"] },
        },
        services,
      ),
    ).resolves.toMatchObject({
      type: "simulation.snapshot.changed",
      status: "running",
      overlay: {
        currentStateIdsByMachineId: { player: "player:state:idle" },
        availableTransitionIdsByMachineId: { player: ["t:play"] },
        suggestedEmissionIdsByMachineId: { player: ["e:done"] },
      },
    });
    await expect(runWorkbenchEffect({ kind: "simulation.send", sourceVersion: 1, event: { type: "PLAY" } }, services)).resolves.toMatchObject({
      type: "simulation.snapshot.changed",
      status: "running",
    });
    await expect(
      runWorkbenchEffect(
        {
          kind: "simulation.send-from-transition",
          sourceVersion: 1,
          target: {
            kind: "transition",
            machineId: "player",
            rowId: "row",
            transitionId: "t:play",
            slice: { kind: "domain", machineId: "player" },
          },
        },
        services,
      ),
    ).resolves.toMatchObject({ type: "simulation.snapshot.changed", status: "running" });
    expect(session.sendFromTransition).toHaveBeenLastCalledWith({
      slice: { kind: "domain", machineId: "player" },
      transitionId: "t:play",
    });
    await expect(
      runWorkbenchEffect(
        {
          kind: "simulation.send-from-transition",
          sourceVersion: 1,
          target: {
            kind: "transition",
            machineId: "player",
            rowId: "row",
            transitionId: "t:play",
            slice: { kind: "domain", machineId: "player" },
          },
          payload: { source: "test" },
        },
        services,
      ),
    ).resolves.toMatchObject({ type: "simulation.snapshot.changed", status: "running" });
    expect(session.sendFromTransition).toHaveBeenLastCalledWith({
      slice: { kind: "domain", machineId: "player" },
      transitionId: "t:play",
      payload: { source: "test" },
    });
    await expect(
      runWorkbenchEffect(
        {
          kind: "simulation.send-from-emission",
          sourceVersion: 1,
          target: {
            kind: "emission",
            machineId: "player",
            rowId: "row",
            emissionId: "e:done",
            slice: { kind: "domain", machineId: "player" },
          },
        },
        services,
      ),
    ).resolves.toMatchObject({
      type: "simulation.snapshot.changed",
      status: "blocked",
      diagnostics: [{ diagnostic: { code: "LFG_SIM_BLOCKED" } }],
    });
    expect(session.sendFromEmission).toHaveBeenLastCalledWith({
      slice: { kind: "domain", machineId: "player" },
      emissionId: "e:done",
    });
    await expect(
      runWorkbenchEffect(
        {
          kind: "simulation.send-from-emission",
          sourceVersion: 1,
          target: {
            kind: "emission",
            machineId: "player",
            rowId: "row",
            emissionId: "e:done",
            slice: { kind: "domain", machineId: "player" },
          },
          payload: { source: "test" },
        },
        services,
      ),
    ).resolves.toMatchObject({
      type: "simulation.snapshot.changed",
      status: "blocked",
      diagnostics: [{ diagnostic: { code: "LFG_SIM_BLOCKED" } }],
    });
    expect(session.sendFromEmission).toHaveBeenLastCalledWith({
      slice: { kind: "domain", machineId: "player" },
      emissionId: "e:done",
      payload: { source: "test" },
    });
    await expect(runWorkbenchEffect({ kind: "simulation.reset", sourceVersion: 1 }, services)).resolves.toMatchObject({
      type: "simulation.snapshot.changed",
      status: "running",
    });
    session.reset.mockReturnValueOnce({
      ok: false,
      reason: "unknown-start-state",
      diagnostics: [{ code: "LFG_SIM_RESET", severity: "warning", message: "Reset blocked" }],
    } as never);
    await expect(runWorkbenchEffect({ kind: "simulation.reset", sourceVersion: 1 }, services)).resolves.toMatchObject({
      type: "simulation.snapshot.changed",
      status: "blocked",
      diagnostics: [{ diagnostic: { code: "LFG_SIM_RESET" } }],
    });
    await expect(runWorkbenchEffect({ kind: "simulation.dispose", sourceVersion: 1 }, services)).resolves.toBeUndefined();
    expect(session.dispose).toHaveBeenCalled();
  });

  it("возвращает blocked command при неуспешном старте симуляции", async () => {
    const services = createServices();
    services.simulation.createSession = vi.fn(() => ({
      sourceVersion: 1,
      scope: { kind: "machines", machineIds: [] },
      start: () => ({ ok: false as const, reason: "empty-scope" as const, diagnostics: [{ code: "LFG_SIM_EMPTY", severity: "warning" as const, message: "Empty" }] }),
      reset: vi.fn(),
      getSnapshot: () => undefined,
      getAvailableTransitions: () => [],
      getSuggestedEmissions: () => [],
      send: vi.fn(),
      sendFromTransition: vi.fn(),
      sendFromEmission: vi.fn(),
      choose: vi.fn(),
      dispose: vi.fn(),
    } as never));

    await expect(
      runWorkbenchEffect(
        {
          kind: "create-simulation-session",
          sourceVersion: 1,
          document: documentFixture,
          scope: { kind: "machines", machineIds: [] },
        },
        services,
      ),
    ).resolves.toMatchObject({
      type: "simulation.snapshot.changed",
      status: "blocked",
      diagnostics: [{ diagnostic: { code: "LFG_SIM_EMPTY" } }],
    });
  });

  it("заменяет предыдущую session симуляции и сохраняет pending choice в blocked snapshot", async () => {
    const services = createServices();
    const snapshot = {
      documentVersion: "doc",
      machineIds: ["player"],
      domainSlicesByMachineId: { player: "slice:player" },
      actorTemplateSlicesByMachineId: {},
      actorSliceIdsByMachineId: {},
      slices: {
        "slice:player": {
          sliceId: "slice:player",
          machineId: "player",
          stateId: "player:state:idle",
        },
      },
      timeline: {
        rootStepId: "root",
        currentStepId: "root",
        linearStepIds: ["root"],
        childrenByStepId: {},
        stepsById: {
          root: { stepId: "root", index: 0, source: { kind: "initial" }, consumed: [], rowRefs: [] },
        },
      },
    };
    const firstSession = {
      sourceVersion: 1,
      scope: { kind: "machines", machineIds: ["old"] },
      start: vi.fn(() => ({ ok: true as const, snapshot })),
      reset: vi.fn(),
      getSnapshot: vi.fn(() => snapshot),
      getAvailableTransitions: vi.fn(() => []),
      getSuggestedEmissions: vi.fn(() => []),
      send: vi.fn(),
      sendFromTransition: vi.fn(),
      sendFromEmission: vi.fn(),
      choose: vi.fn(),
      dispose: vi.fn(),
    };
    const pendingChoice = { pendingChoiceId: "choice:1", choices: [{ id: "branch:1", label: "Branch 1" }] };
    const secondSession = {
      sourceVersion: 1,
      scope: { kind: "machines", machineIds: ["player"] },
      start: vi.fn(() => ({ ok: true as const, snapshot })),
      reset: vi.fn(),
      getSnapshot: vi.fn(() => snapshot),
      getAvailableTransitions: vi.fn(() => [{ sliceId: "slice:player", machineId: "player", transitionId: "t:play" }]),
      getSuggestedEmissions: vi.fn(() => []),
      send: vi.fn(() => ({
        ok: false as const,
        reason: "choice-required" as const,
        pendingChoice,
        diagnostics: [{ code: "LFG_SIM_CHOICE", severity: "warning" as const, message: "Choice required" }],
      })),
      sendFromTransition: vi.fn(),
      sendFromEmission: vi.fn(),
      choose: vi.fn(),
      dispose: vi.fn(),
    };
    services.simulation.createSession = vi.fn()
      .mockReturnValueOnce(firstSession as never)
      .mockReturnValueOnce(secondSession as never);

    await runWorkbenchEffect(
      {
        kind: "create-simulation-session",
        sourceVersion: 1,
        document: documentFixture,
        scope: { kind: "machines", machineIds: ["old"] },
      },
      services,
    );
    await runWorkbenchEffect(
      {
        kind: "create-simulation-session",
        sourceVersion: 1,
        document: documentFixture,
        scope: { kind: "machines", machineIds: ["player"] },
      },
      services,
    );

    const blocked = await runWorkbenchEffect({ kind: "simulation.send", sourceVersion: 1, event: { type: "PLAY" } }, services);

    expect(firstSession.dispose).toHaveBeenCalledTimes(1);
    expect(blocked).toMatchObject({
      type: "simulation.snapshot.changed",
      status: "blocked",
      pendingChoice,
      overlay: {
        availableTransitionIdsByMachineId: { player: ["t:play"] },
      },
      diagnostics: [{ diagnostic: { code: "LFG_SIM_CHOICE" } }],
    });
  });

  it("вызывает dispose для stale session симуляции при несовпадении sourceVersion", async () => {
    const services = createServices();
    const session = {
      sourceVersion: 1,
      scope: { kind: "machines", machineIds: ["player"] },
      start: vi.fn(() => ({ ok: true as const, snapshot: undefined })),
      reset: vi.fn(),
      getSnapshot: () => undefined,
      getAvailableTransitions: () => [],
      getSuggestedEmissions: () => [],
      send: vi.fn(),
      sendFromTransition: vi.fn(),
      sendFromEmission: vi.fn(),
      choose: vi.fn(),
      dispose: vi.fn(),
    };
    services.simulation.createSession = vi.fn(() => session as never);

    await runWorkbenchEffect(
      {
        kind: "create-simulation-session",
        sourceVersion: 1,
        document: documentFixture,
        scope: { kind: "machines", machineIds: ["player"] },
      },
      services,
    );

    await expect(runWorkbenchEffect({ kind: "simulation.send", sourceVersion: 2, event: { type: "PLAY" } }, services)).resolves.toMatchObject({
      type: "simulation.snapshot.changed",
      sourceVersion: 2,
      status: "blocked",
      diagnostics: [{ diagnostic: { code: "missing-simulation-session" } }],
    });
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it("оборачивает исключения сервиса симуляции в контролируемую команду", async () => {
    const services = createServices();
    services.simulation.createSession = vi.fn(() => {
      throw new Error("simulation exploded");
    });

    await expect(
      runWorkbenchEffect(
        {
          kind: "create-simulation-session",
          sourceVersion: 1,
          document: documentFixture,
          scope: { kind: "machines", machineIds: ["player"] },
        },
        services,
      ),
    ).resolves.toMatchObject({
      type: "simulation.snapshot.changed",
      status: "blocked",
      diagnostics: [{ diagnostic: { code: "effect-runner-failed", message: "simulation exploded" } }],
    });
  });

  it("пропускает неизвестный descriptor без команды", async () => {
    await expect(runWorkbenchEffect({ kind: "unknown", sourceVersion: 1 } as never, createServices())).resolves.toBeUndefined();
  });

  it("исполняет цепочку descriptor через store", async () => {
    const services = createServices();
    const store = createWorkbenchStore();
    const output = store.dispatch({ type: "source.open-visualizer" });

    runWorkbenchEffects(output.effects, services, store);
    await vi.waitFor(() => expect(store.getSnapshot().state.model.status).toBe("ready"));
  });

  it("исполняет полный source pipeline через локальные graph services по умолчанию", async () => {
    const services = createDefaultEffectRunnerServices();
    const store = createWorkbenchStore();
    const output = store.dispatch({ type: "source.open-visualizer" });

    runWorkbenchEffects(output.effects, services, store);

    await vi.waitFor(() => expect(store.getSnapshot().state.validation.status).toBe("ready"));
    expect(store.getSnapshot().state.compile.document?.machines.map((machine) => machine.id)).toEqual([
      "appShell",
      "auth",
      "player",
      "trackInstance",
    ]);
    expect(store.getSnapshot().state.model.model?.topics.map((topic) => topic.eventType)).toEqual([
      "APP_READY",
      "APP_RESET",
      "AUTH_RESPONSE",
      "BUFFER_DONE",
      "BUFFER_ERROR",
      "CANCEL_LOGIN",
      "DISCARD",
      "LOGIN_REQUEST",
      "LOGOUT",
      "NEXT_TRACK",
      "PAUSE",
      "PLAY",
      "QUEUE_EMPTY",
      "RESUME",
      "STOP",
      "THEME_TOGGLE",
      "TRACK_END",
      "TRACK_LOAD",
    ]);
    expect(store.getSnapshot().state.console.entries).toEqual([
      expect.objectContaining({ channel: "system", title: "Source pipeline started" }),
    ]);
  });

  it("исполняет self-routed effect из actor template строки music-app", async () => {
    const services = createDefaultEffectRunnerServices();
    const store = createWorkbenchStore();

    let output = store.dispatch({ type: "source.open-visualizer" });
    runWorkbenchEffects(output.effects, services, store);
    await vi.waitFor(() => expect(store.getSnapshot().state.validation.status).toBe("ready"));

    output = store.dispatch({ type: "l3.machine.toggled", machineId: "trackInstance" });
    runWorkbenchEffects(output.effects, services, store);
    await vi.waitFor(() => expect(store.getSnapshot().state.simulation.status).toBe("running"));

    const trackCard = () =>
      selectMachineWorkbenchPanel(store.getSnapshot()).cards.find((card) => card.machineId === "trackInstance");
    const trackRows = () => trackCard()?.states.flatMap((state) => state.rows) ?? [];

    const trackLoad = trackRows().find((row) => row.kind === "config" && row.eventType === "TRACK_LOAD");
    if (!trackLoad?.action.target || trackLoad.action.target.kind !== "transition") throw new Error("TRACK_LOAD target missing.");

    output = store.dispatch({ type: "l3.transition-row.sent", target: trackLoad.action.target });
    runWorkbenchEffects(output.effects, services, store);
    await vi.waitFor(() => expect(trackCard()?.currentStateKey).toBe("BUFFERING"));

    const bufferDone = trackRows().find((row) => row.kind === "effect" && row.eventType === "BUFFER_DONE");
    expect(bufferDone?.action.enabled).toBe(true);
    if (!bufferDone?.action.target || bufferDone.action.target.kind !== "emission") throw new Error("BUFFER_DONE target missing.");

    output = store.dispatch({ type: "l3.effect-row.followed", target: bufferDone.action.target });
    runWorkbenchEffects(output.effects, services, store);

    await vi.waitFor(() => expect(trackCard()?.currentStateKey).toBe("PLAYING"));
    expect(store.getSnapshot().state.simulation.status).toBe("running");
    expect(store.getSnapshot().state.simulation.diagnostics).toEqual([]);
  });

  it("не применяет async response, если исходник изменился до завершения эффекта", async () => {
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

    runWorkbenchEffects([{ kind: "simulation.dispose", sourceVersion: 1 }], services, store);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getSnapshot()).toBe(before);
  });

  it("возвращает контролируемые diagnostics для неподключенных clients", async () => {
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

  it("сервисы по умолчанию возвращают diagnostics для исходника без machines без падения chain", async () => {
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
