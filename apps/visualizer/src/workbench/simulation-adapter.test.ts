import type { GraphSendResult, GraphSimulationSnapshot } from "@lite-fsm/graph/simulator";
import { describe, expect, it } from "vitest";
import {
  commandResultForMissingTarget,
  commandResultFromSendResult,
  emissionCommandTarget,
  resolveActiveMachineSlice,
  simulatorDiagnostics,
  transitionCommandTarget,
} from "./simulation-adapter";

const snapshot = (overrides: Partial<GraphSimulationSnapshot> = {}): GraphSimulationSnapshot =>
  ({
    domainSlicesByMachineId: { player: "slice:player" },
    actorTemplateSlicesByMachineId: {},
    actorSliceIdsByMachineId: {},
    slices: {
      "slice:player": {
        ref: { kind: "domain", machineId: "player" },
      },
    },
    ...overrides,
  }) as unknown as GraphSimulationSnapshot;

describe("адаптер симуляции", () => {
  it("резолвит active slice и targets команд строк", () => {
    expect(resolveActiveMachineSlice(undefined, "player")).toEqual({ ok: false, reason: "missing-simulation-session" });
    expect(resolveActiveMachineSlice(snapshot(), "player")).toEqual({
      ok: true,
      slice: { kind: "domain", machineId: "player" },
    });
    expect(transitionCommandTarget(snapshot(), "player", "row", "transition")).toEqual({
      kind: "transition",
      machineId: "player",
      rowId: "row",
      transitionId: "transition",
      slice: { kind: "domain", machineId: "player" },
    });
    expect(emissionCommandTarget(snapshot(), "player", "row", "emission")).toEqual({
      kind: "emission",
      machineId: "player",
      rowId: "row",
      emissionId: "emission",
      slice: { kind: "domain", machineId: "player" },
    });
  });

  it("отклоняет missing, ambiguous и dangling slice mappings", () => {
    expect(resolveActiveMachineSlice(snapshot(), "missing")).toEqual({ ok: false, reason: "ambiguous-row-slice" });
    expect(
      resolveActiveMachineSlice(
        snapshot({
          domainSlicesByMachineId: { player: "slice:player" },
          actorTemplateSlicesByMachineId: { player: "actor:player" },
          slices: { "slice:player": { ref: { kind: "domain", machineId: "player" } } },
        } as unknown as Partial<GraphSimulationSnapshot>),
        "player",
      ),
    ).toEqual({ ok: false, reason: "ambiguous-row-slice" });
    expect(
      resolveActiveMachineSlice(
        snapshot({ domainSlicesByMachineId: { player: "missing" }, slices: {} } as unknown as Partial<GraphSimulationSnapshot>),
        "player",
      ),
    ).toEqual({ ok: false, reason: "ambiguous-row-slice" });
    expect(transitionCommandTarget(undefined, "player", "row", "transition")).toBeUndefined();
    expect(emissionCommandTarget(undefined, "player", "row", "emission")).toBeUndefined();
  });

  it("поддерживает actor template и единственный actor slice, но отклоняет несколько actor slices", () => {
    expect(
      resolveActiveMachineSlice(
        snapshot({
          domainSlicesByMachineId: {},
          actorTemplateSlicesByMachineId: { worker: "template:worker" },
          actorSliceIdsByMachineId: {},
          slices: { "template:worker": { ref: { kind: "actorTemplate", machineId: "worker" } } },
        } as unknown as Partial<GraphSimulationSnapshot>),
        "worker",
      ),
    ).toEqual({ ok: true, slice: { kind: "actorTemplate", machineId: "worker" } });

    expect(
      resolveActiveMachineSlice(
        snapshot({
          domainSlicesByMachineId: {},
          actorTemplateSlicesByMachineId: {},
          actorSliceIdsByMachineId: { worker: ["actor:one"] },
          slices: { "actor:one": { ref: { kind: "actor", machineId: "worker", actorId: "one" } } },
        } as unknown as Partial<GraphSimulationSnapshot>),
        "worker",
      ),
    ).toEqual({ ok: true, slice: { kind: "actor", machineId: "worker", actorId: "one" } });

    expect(
      resolveActiveMachineSlice(
        snapshot({
          domainSlicesByMachineId: {},
          actorTemplateSlicesByMachineId: {},
          actorSliceIdsByMachineId: { worker: ["actor:one", "actor:two"] },
          slices: {
            "actor:one": { ref: { kind: "actor", machineId: "worker", actorId: "one" } },
            "actor:two": { ref: { kind: "actor", machineId: "worker", actorId: "two" } },
          },
        } as unknown as Partial<GraphSimulationSnapshot>),
        "worker",
      ),
    ).toEqual({ ok: false, reason: "ambiguous-row-slice" });
  });

  it("строит diagnostics и результаты команд", () => {
    const diagnostic = { code: "LFG_SIM_TEST", severity: "warning" as const, message: "Blocked" };

    expect(simulatorDiagnostics(2, [diagnostic], "blocked")[0]).toMatchObject({
      diagnosticId: "simulator:2:blocked:0:LFG_SIM_TEST",
      origin: "simulator",
      diagnostic,
    });
    expect(commandResultForMissingTarget(2, undefined, { machineId: "player" })).toEqual({
      ok: false,
      reason: "missing-simulation-session",
      diagnostics: [],
    });
    expect(commandResultForMissingTarget(2, snapshot(), { machineId: "missing" })).toMatchObject({
      ok: false,
      reason: "ambiguous-row-slice",
      diagnostics: [{ diagnostic: { code: "ambiguous-row-slice" } }],
    });
    expect(commandResultForMissingTarget(2, snapshot(), { machineId: "player" })).toEqual({ ok: true });
    expect(commandResultFromSendResult(2, { ok: true, snapshot: {} as never, step: {} as never })).toEqual({ ok: true });
    expect(commandResultFromSendResult(2, { ok: false, reason: "event-not-accepted", diagnostics: [diagnostic] } as GraphSendResult)).toMatchObject({
      ok: false,
      reason: "simulator-rejected",
      diagnostics: [{ diagnostic }],
    });
  });
});
