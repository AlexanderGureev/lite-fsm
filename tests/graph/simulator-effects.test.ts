import { describe, expect, it } from "vitest";
import type { GraphEmission } from "@lite-fsm/graph";
import { createGraphSimulator } from "@lite-fsm/graph/simulator";
import { configTransition, documentFromMachines, domainRef, machine, state, stateId } from "./simulator-test-utils";

describe("GraphSimulator: targets, terminal states и emissions", () => {
  it("покрывает self fallback, terminal targets, blocked targets и missing target state", () => {
    const doc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle"), state("flow", "__RESOLVED", "terminal")],
        transitions: [
          configTransition("flow", "idle", "SELF", { kind: "self" }, 0),
          configTransition("flow", "idle", "TERMINAL", { kind: "terminal", terminal: "__RESOLVED" }, 1),
          configTransition("flow", "idle", "BLOCKED", { kind: "blocked", reason: "manual-block" }, 2),
          configTransition("flow", "idle", "MISSING", { kind: "state", stateId: "missing-state" }, 3),
        ],
      }),
    ]);

    const self = createGraphSimulator(doc);
    expect(self.start()).toMatchObject({ ok: true });
    expect(self.send({ event: { type: "SELF" } })).toMatchObject({
      ok: true,
      snapshot: { slices: { "domain:flow": expect.objectContaining({ stateKey: "idle", status: "active" }) } },
    });

    const terminal = createGraphSimulator(doc);
    expect(terminal.start()).toMatchObject({ ok: true });
    expect(terminal.send({ event: { type: "TERMINAL" } })).toMatchObject({
      ok: true,
      snapshot: { slices: { "domain:flow": expect.objectContaining({ stateKey: "__RESOLVED", status: "terminal" }) } },
    });
    expect(terminal.getAvailableTransitions()).toEqual([]);

    const blocked = createGraphSimulator(doc);
    expect(blocked.start()).toMatchObject({ ok: true });
    expect(blocked.getAvailableTransitions({ eventType: "BLOCKED" })[0]).toMatchObject({
      canApply: false,
      blockedReason: "blocked-target",
    });
    expect(blocked.send({ event: { type: "BLOCKED" } })).toMatchObject({ ok: false, reason: "blocked-target" });

    const missing = createGraphSimulator(doc);
    expect(missing.start()).toMatchObject({ ok: true });
    expect(missing.send({ event: { type: "MISSING" } })).toMatchObject({ ok: false, reason: "target-not-resolved" });
  });

  it("покрывает evaluator candidate с blocked/unknown target, когда canApply принудительно true", () => {
    const doc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle")],
        transitions: [configTransition("flow", "idle", "GO", { kind: "self" })],
      }),
    ]);

    const blocked = createGraphSimulator(doc, {
      evaluationPolicy: {
        evaluateTransition(input) {
          return {
            kind: "resolved",
            candidate: { ...input.candidates[0]!, target: { kind: "blocked", reason: "forced" }, canApply: true },
          };
        },
      },
    });
    expect(blocked.start()).toMatchObject({ ok: true });
    expect(blocked.send({ event: { type: "GO" } })).toMatchObject({ ok: false, reason: "blocked-target" });

    const unknown = createGraphSimulator(doc, {
      evaluationPolicy: {
        evaluateTransition(input) {
          return {
            kind: "resolved",
            candidate: { ...input.candidates[0]!, target: { kind: "unknown", label: "forced" }, canApply: true },
          };
        },
      },
    });
    expect(unknown.start()).toMatchObject({ ok: true });
    expect(unknown.send({ event: { type: "GO" } })).toMatchObject({ ok: false, reason: "target-not-resolved" });

    const selfMissingDoc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle")],
        transitions: [configTransition("flow", "idle", "GO", { kind: "self" })],
      }),
    ]);
    const selfMissing = createGraphSimulator(selfMissingDoc, {
      evaluationPolicy: {
        evaluateTransition(input) {
          selfMissingDoc.machines[0]!.states = [];
          return { kind: "resolved", candidate: { ...input.candidates[0]!, target: { kind: "self" }, canApply: true } };
        },
      },
    });
    expect(selfMissing.start()).toMatchObject({ ok: true });
    expect(selfMissing.send({ event: { type: "GO" } })).toMatchObject({ ok: false, reason: "target-not-resolved" });
  });

  it("покрывает unknown/manual effect routing failures и invalid emission payload", () => {
    const unknownEmission: GraphEmission = {
      id: "flow:emission:idle:UNKNOWN",
      machineId: "flow",
      sourceState: { kind: "state", stateId: stateId("flow", "ready") },
      event: { type: "UNKNOWN", source: "effect" },
      routing: { kind: "unknown", label: "dynamic" },
      origin: "effect",
      confidence: "unknown",
    };
    const doc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle"), state("flow", "ready"), state("flow", "__RESOLVED", "terminal")],
        transitions: [
          configTransition("flow", "idle", "GO", { kind: "state", stateId: stateId("flow", "ready") }),
          configTransition("flow", "ready", "DONE", { kind: "terminal", terminal: "__RESOLVED" }),
        ],
        emissions: [
          unknownEmission,
          {
            id: "flow:emission:ready:DYNAMIC",
            machineId: "flow",
            sourceState: { kind: "state", stateId: stateId("flow", "ready") },
            event: { type: "DYNAMIC", source: "effect" },
            routing: { kind: "tag", target: { kind: "dynamic", label: "tagExpr" } },
            origin: "effect",
            confidence: "partial",
          },
        ],
      }),
    ]);

    const simulator = createGraphSimulator(doc);
    expect(simulator.start()).toMatchObject({ ok: true });
    expect(simulator.send({ event: { type: "GO" } })).toMatchObject({ ok: true });
    expect(simulator.getSuggestedEmissions().map((item) => [item.emissionId, item.canDispatch, item.blockedReason])).toEqual([
      ["flow:emission:idle:UNKNOWN", false, "unknown-routing"],
      ["flow:emission:ready:DYNAMIC", false, "unknown-routing"],
    ]);
    expect(simulator.sendFromEmission({ slice: domainRef("flow"), emissionId: "missing" })).toMatchObject({
      ok: false,
      reason: "unknown-emission",
    });
    expect(simulator.sendFromEmission({ slice: domainRef("flow"), emissionId: "flow:emission:idle:UNKNOWN" })).toMatchObject({
      ok: false,
      reason: "event-not-accepted",
    });

    const activeEmission: GraphEmission = {
      id: "flow:emission:ready:DEFAULT",
      machineId: "flow",
      sourceState: { kind: "state", stateId: stateId("flow", "ready") },
      event: { type: "NOOP", source: "effect" },
      routing: { kind: "default" },
      origin: "effect",
      confidence: "exact",
    };
    const validDoc = documentFromMachines([{ ...doc.machines[0]!, emissions: [activeEmission] }]);
    const valid = createGraphSimulator(validDoc);
    expect(valid.start()).toMatchObject({ ok: true });
    expect(valid.send({ event: { type: "GO" } })).toMatchObject({ ok: true });
    expect(
      valid.sendFromEmission({
        slice: domainRef("flow"),
        emissionId: activeEmission.id,
        payload: { invalid: undefined } as never,
      }),
    ).toMatchObject({ ok: false, reason: "invalid-payload" });
    expect(valid.send({ event: { type: "DONE" } })).toMatchObject({ ok: true });
    expect(valid.getSuggestedEmissions().map((item) => item.blockedReason)).toEqual([]);

    const terminalEffectDoc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle"), state("flow", "__RESOLVED", "terminal")],
        transitions: [configTransition("flow", "idle", "DONE", { kind: "terminal", terminal: "__RESOLVED" })],
        emissions: [
          {
            id: "flow:emission:terminal:AFTER",
            machineId: "flow",
            sourceState: { kind: "state", stateId: stateId("flow", "__RESOLVED") },
            event: { type: "AFTER", source: "effect" },
            routing: { kind: "default" },
            origin: "effect",
            confidence: "exact",
          },
        ],
      }),
    ]);
    const terminalEffect = createGraphSimulator(terminalEffectDoc);
    expect(terminalEffect.start()).toMatchObject({ ok: true });
    expect(terminalEffect.send({ event: { type: "DONE" } })).toMatchObject({ ok: true });
    expect(terminalEffect.getSuggestedEmissions()).toEqual([
      expect.objectContaining({ canDispatch: false, blockedReason: "terminal-slice" }),
    ]);

    const terminalFallbackDoc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle")],
        transitions: [configTransition("flow", "idle", "CANCEL", { kind: "terminal", terminal: "__CANCELLED" })],
      }),
    ]);
    const terminalFallback = createGraphSimulator(terminalFallbackDoc);
    expect(terminalFallback.start()).toMatchObject({ ok: true });
    expect(terminalFallback.send({ event: { type: "CANCEL" } })).toMatchObject({
      ok: true,
      snapshot: { slices: { "domain:flow": expect.objectContaining({ stateKey: "__CANCELLED", status: "terminal" }) } },
    });

    const stateTerminalDoc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle"), state("flow", "done", "terminal")],
        transitions: [configTransition("flow", "idle", "DONE", { kind: "state", stateId: stateId("flow", "done") })],
      }),
    ]);
    const stateTerminal = createGraphSimulator(stateTerminalDoc);
    expect(stateTerminal.start()).toMatchObject({ ok: true });
    expect(stateTerminal.send({ event: { type: "DONE" } })).toMatchObject({
      ok: true,
      snapshot: { slices: { "domain:flow": expect.objectContaining({ stateKey: "done", status: "terminal" }) } },
    });
  });

});
