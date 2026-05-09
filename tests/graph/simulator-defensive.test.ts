import { describe, expect, it } from "vitest";
import { createGraphSimulator } from "@lite-fsm/graph/simulator";
import { configTransition, documentFromMachines, domainRef, machine, state, stateId } from "./simulator-test-utils";

describe("GraphSimulator: защитная обработка мутации document", () => {
  it("покрывает missing machine после start в available, dispatch и effect collection", () => {
    const doc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle"), state("flow", "ready")],
        transitions: [configTransition("flow", "idle", "GO", { kind: "state", stateId: stateId("flow", "ready") })],
        emissions: [
          {
            id: "flow:emission:ready:AFTER",
            machineId: "flow",
            sourceState: { kind: "state", stateId: stateId("flow", "ready") },
            event: { type: "AFTER", source: "effect" },
            routing: { kind: "default" },
            origin: "effect",
            confidence: "exact",
          },
        ],
      }),
    ]);
    const available = createGraphSimulator(doc);
    expect(available.start()).toMatchObject({ ok: true });
    doc.machines = [];
    expect(available.getAvailableTransitions()).toEqual([]);

    const dispatchDoc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle")],
        transitions: [configTransition("flow", "idle", "GO", { kind: "self" })],
      }),
    ]);
    const dispatch = createGraphSimulator(dispatchDoc, {
      evaluationPolicy: {
        evaluateTransition(input) {
          dispatchDoc.machines = [];
          return { kind: "resolved", candidate: input.candidates[0]! };
        },
      },
    });
    expect(dispatch.start()).toMatchObject({ ok: true });
    expect(dispatch.send({ event: { type: "GO" } })).toMatchObject({ ok: false, reason: "unknown-slice" });

    const effectsDoc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle"), state("flow", "ready")],
        transitions: [configTransition("flow", "idle", "GO", { kind: "state", stateId: stateId("flow", "ready") })],
        emissions: [
          {
            id: "flow:emission:ready:AFTER",
            machineId: "flow",
            sourceState: { kind: "state", stateId: stateId("flow", "ready") },
            event: { type: "AFTER", source: "effect" },
            routing: { kind: "default" },
            origin: "effect",
            confidence: "exact",
          },
        ],
      }),
    ]);
    const effects = createGraphSimulator(effectsDoc, {
      evaluationPolicy: {
        reduceContext(input) {
          effectsDoc.machines[0]!.states = [];
          return { kind: "unchanged", context: input.previousContext };
        },
      },
    });
    expect(effects.start()).toMatchObject({ ok: true });
    const result = effects.send({ event: { type: "GO" } });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.step.emissions[0]?.sourceStateKey).toBe("*");

    const missingMachineEffectsDoc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle"), state("flow", "ready")],
        transitions: [configTransition("flow", "idle", "GO", { kind: "state", stateId: stateId("flow", "ready") })],
      }),
    ]);
    const missingMachineEffects = createGraphSimulator(missingMachineEffectsDoc, {
      evaluationPolicy: {
        reduceContext(input) {
          missingMachineEffectsDoc.machines = [];
          return { kind: "unchanged", context: input.previousContext };
        },
      },
    });
    expect(missingMachineEffects.start()).toMatchObject({ ok: true });
    const missingMachineResult = missingMachineEffects.send({ event: { type: "GO" } });
    expect(missingMachineResult).toMatchObject({ ok: true });
    if (missingMachineResult.ok) expect(missingMachineResult.step.emissions).toEqual([]);
  });

  it("покрывает stale pending choice после изменения IR", () => {
    const doc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle"), state("flow", "left"), state("flow", "right")],
        transitions: [
          configTransition("flow", "idle", "PICK", { kind: "state", stateId: stateId("flow", "left") }, 0),
          configTransition("flow", "idle", "PICK", { kind: "state", stateId: stateId("flow", "right") }, 1),
        ],
      }),
    ]);
    const simulator = createGraphSimulator(doc, { branchPolicy: { kind: "manual" } });
    expect(simulator.start()).toMatchObject({ ok: true });
    const pending = simulator.send({ event: { type: "PICK" } });
    expect(pending).toMatchObject({ ok: false, reason: "choice-required" });
    if (pending.ok) return;

    doc.machines[0]!.transitions.pop();
    expect(
      simulator.choose({
        pendingChoiceId: pending.pendingChoice?.pendingChoiceId ?? "",
        choices: [{ slice: domainRef("flow"), transitionId: pending.pendingChoice?.candidatesBySliceId["domain:flow"]?.[0]?.transitionId ?? "" }],
      }),
    ).toMatchObject({ ok: false, reason: "stale-choice" });
  });
});
