import type { LiteFsmGraphDocument } from "@lite-fsm/graph";
import { describe, expect, it, vi } from "vitest";
import { createLocalSimulationService } from "./local-simulation-service";

const documentFixture = { source: { filename: "sample.ts", language: "ts" }, diagnostics: [], machines: [], managers: [] } as unknown as LiteFsmGraphDocument;

describe("локальный сервис симуляции", () => {
  it("оборачивает методы сессии graph simulator", () => {
    const simulator = {
      start: vi.fn(() => ({ ok: true as const, snapshot: "start" })),
      reset: vi.fn(() => ({ ok: true as const, snapshot: "reset" })),
      getSnapshot: vi.fn(() => "snapshot"),
      getAvailableTransitions: vi.fn(() => ["available"]),
      getSuggestedEmissions: vi.fn(() => ["emission"]),
      send: vi.fn(() => ({ ok: true as const, snapshot: "send", step: "step" })),
      sendFromTransition: vi.fn(() => ({ ok: true as const, snapshot: "transition", step: "step" })),
      sendFromEmission: vi.fn(() => ({ ok: true as const, snapshot: "emission", step: "step" })),
      choose: vi.fn(() => ({ ok: true as const, snapshot: "choice", step: "step" })),
    };
    const createSimulator = vi.fn(() => simulator);
    const service = createLocalSimulationService({ createSimulator: createSimulator as never });
    const session = service.createSession({
      document: documentFixture,
      sourceVersion: 3,
      scope: { kind: "machines", machineIds: ["player"] },
      initialStateOverrides: [{ slice: { kind: "domain", machineId: "player" }, stateKey: "idle" }],
      initialContextOverrides: [{ slice: { kind: "domain", machineId: "player" }, context: {} }],
    });

    expect(createSimulator).toHaveBeenCalledWith(documentFixture, {
      scope: { kind: "machines", machineIds: ["player"] },
      initialStateOverrides: [{ slice: { kind: "domain", machineId: "player" }, stateKey: "idle" }],
      initialContextOverrides: [{ slice: { kind: "domain", machineId: "player" }, context: {} }],
    });
    expect(session.sourceVersion).toBe(3);
    expect(session.scope).toEqual({ kind: "machines", machineIds: ["player"] });
    expect(session.start()).toEqual({ ok: true, snapshot: "start" });
    expect(session.reset({})).toEqual({ ok: true, snapshot: "reset" });
    expect(session.getSnapshot()).toBe("snapshot");
    expect(session.getAvailableTransitions()).toEqual(["available"]);
    expect(session.getSuggestedEmissions()).toEqual(["emission"]);
    expect(session.send({ event: { type: "PLAY" } })).toEqual({ ok: true, snapshot: "send", step: "step" });
    expect(session.sendFromTransition({ slice: { kind: "domain", machineId: "player" }, transitionId: "t" })).toEqual({
      ok: true,
      snapshot: "transition",
      step: "step",
    });
    expect(session.sendFromEmission({ slice: { kind: "domain", machineId: "player" }, emissionId: "e" })).toEqual({
      ok: true,
      snapshot: "emission",
      step: "step",
    });
    expect(session.choose({ pendingChoiceId: "choice", choices: [] })).toEqual({ ok: true, snapshot: "choice", step: "step" });
    expect(session.dispose()).toBeUndefined();
  });

  it("сохраняет simulatorOptions и пробрасывает optional inputs методов сессии", () => {
    const availableInput = { slice: { kind: "domain", machineId: "player" } };
    const emissionInput = { slice: { kind: "domain", machineId: "player" } };
    const resetInput = { initialStateOverrides: [{ slice: { kind: "domain", machineId: "player" }, stateKey: "done" }] };
    const simulator = {
      start: vi.fn(),
      reset: vi.fn((input) => input),
      getSnapshot: vi.fn(),
      getAvailableTransitions: vi.fn((input) => input),
      getSuggestedEmissions: vi.fn((input) => input),
      send: vi.fn(),
      sendFromTransition: vi.fn(),
      sendFromEmission: vi.fn(),
      choose: vi.fn(),
    };
    const createSimulator = vi.fn(() => simulator);
    const service = createLocalSimulationService({ createSimulator: createSimulator as never });
    const session = service.createSession({
      document: documentFixture,
      sourceVersion: 5,
      scope: { kind: "machines", machineIds: ["player"] },
      simulatorOptions: {
        actorMode: "template-approximation",
        effectMode: "manual",
      },
    });

    expect(createSimulator).toHaveBeenCalledWith(documentFixture, {
      actorMode: "template-approximation",
      effectMode: "manual",
      scope: { kind: "machines", machineIds: ["player"] },
      initialStateOverrides: undefined,
      initialContextOverrides: undefined,
    });
    expect(session.reset(resetInput as never)).toBe(resetInput);
    expect(session.getAvailableTransitions(availableInput as never)).toBe(availableInput);
    expect(session.getSuggestedEmissions(emissionInput as never)).toBe(emissionInput);
  });

  it("использует зависимость graph simulator по умолчанию", () => {
    const session = createLocalSimulationService().createSession({
      document: documentFixture,
      sourceVersion: 1,
      scope: { kind: "machines", machineIds: [] },
    });

    expect(session.start()).toMatchObject({ ok: false, reason: "empty-scope" });
  });
});
