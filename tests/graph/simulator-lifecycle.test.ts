import { describe, expect, it } from "vitest";
import { createGraphSimulator } from "@lite-fsm/graph/simulator";
import { configTransition, documentFromMachines, domainRef, machine, state, stateId } from "./simulator-test-utils";

describe("GraphSimulator: отказы lifecycle", () => {
  it("покрывает empty document scope, empty manager scope и unsupported modes", () => {
    expect(createGraphSimulator(documentFromMachines([])).start()).toMatchObject({
      ok: false,
      reason: "empty-scope",
    });

    expect(
      createGraphSimulator(
        documentFromMachines(
          [
            machine({
              id: "lonely",
              initialState: "idle",
              states: [state("lonely", "idle")],
            }),
          ],
          [{ id: "emptyManager", machineRefs: [] }],
        ),
        { scope: { kind: "manager", managerId: "emptyManager" } },
      ).start(),
    ).toMatchObject({ ok: false, reason: "empty-scope" });

    expect(
      createGraphSimulator(documentFromMachines([]), {
        actorMode: "exact" as never,
      }).start(),
    ).toMatchObject({ ok: false, reason: "unsupported-mode" });
    expect(
      createGraphSimulator(documentFromMachines([]), {
        effectMode: "auto" as never,
      }).start(),
    ).toMatchObject({ ok: false, reason: "unsupported-mode" });
  });

  it("покрывает unknown machine, unknown override slice, missing/unknown start state и reset", () => {
    const noInitial = documentFromMachines([
      machine({ id: "noInitial", states: [state("noInitial", "idle")] }),
    ]);
    expect(createGraphSimulator(noInitial).start()).toMatchObject({ ok: false, reason: "unknown-start-state" });

    const doc = documentFromMachines([
      machine({ id: "flow", initialState: "idle", states: [state("flow", "idle"), state("flow", "ready")] }),
    ]);
    expect(createGraphSimulator(doc, { scope: { kind: "machines", machineIds: ["missing"] } }).start()).toMatchObject({
      ok: false,
      reason: "unknown-machine",
    });
    expect(createGraphSimulator(doc, { scope: { kind: "machines", machineIds: [] } }).start()).toMatchObject({
      ok: false,
      reason: "empty-scope",
    });
    expect(
      createGraphSimulator(doc, {
        initialStateOverrides: [{ slice: domainRef("flow"), stateKey: "missing" }],
      }).start(),
    ).toMatchObject({ ok: false, reason: "unknown-start-state" });
    expect(
      createGraphSimulator(doc, {
        initialStateOverrides: [{ slice: { kind: "actor", machineId: "flow", actorId: "a" }, stateKey: "ready" }],
      }).start(),
    ).toMatchObject({ ok: false, reason: "unknown-machine" });

    const simulator = createGraphSimulator(doc);
    expect(simulator.start()).toMatchObject({ ok: true });
    expect(simulator.start()).toMatchObject({ ok: true });
    expect(simulator.reset({ initialStateOverrides: [{ slice: domainRef("flow"), stateKey: "ready" }] })).toMatchObject({
      ok: true,
      snapshot: { slices: { "domain:flow": expect.objectContaining({ stateKey: "ready" }) } },
    });
    expect(simulator.reset({ initialStateOverrides: [{ slice: domainRef("flow"), stateKey: "missing" }] })).toMatchObject({
      ok: false,
      reason: "unknown-start-state",
    });

    const terminalStart = createGraphSimulator(
      documentFromMachines([
        machine({
          id: "terminalStart",
          initialState: "__RESOLVED",
          states: [state("terminalStart", "__RESOLVED", "terminal")],
        }),
      ]),
    ).start();
    expect(terminalStart).toMatchObject({ ok: true });
    if (terminalStart.ok) expect(terminalStart.snapshot.slices["domain:terminalStart"]?.status).toBe("terminal");
  });

  it("покрывает summary/unknown context fallback и invalid initialContextJson", () => {
    const summaryDoc = documentFromMachines([
      machine({
        id: "summary",
        initialState: "idle",
        initialContextSummary: { kind: "external", text: "externalContext" },
        states: [state("summary", "idle"), state("summary", "ready")],
        transitions: [configTransition("summary", "idle", "GO", { kind: "state", stateId: stateId("summary", "ready") })],
      }),
      machine({
        id: "unknown",
        initialState: "idle",
        states: [state("unknown", "idle")],
      }),
    ]);
    const started = createGraphSimulator(summaryDoc).start();
    expect(started).toMatchObject({ ok: true });
    if (started.ok) {
      expect(started.snapshot.slices["domain:summary"]?.context).toEqual({
        kind: "summary",
        summary: { kind: "external", text: "externalContext" },
      });
      expect(started.snapshot.slices["domain:unknown"]?.context).toEqual({
        kind: "unknown",
        reason: "initialContext is not represented in graph IR.",
      });
    }
    const summarySimulator = createGraphSimulator(summaryDoc, { scope: { kind: "machines", machineIds: ["summary"] } });
    expect(summarySimulator.start()).toMatchObject({ ok: true });
    const summaryTransition = summarySimulator.send({ event: { type: "GO" } });
    expect(summaryTransition).toMatchObject({ ok: true });
    if (summaryTransition.ok) {
      expect(summaryTransition.step.consumed[0]?.contextBefore).toEqual({
        kind: "summary",
        summary: { kind: "external", text: "externalContext" },
      });
    }

    const invalidDoc = documentFromMachines([
      machine({
        id: "bad",
        initialState: "idle",
        initialContextJson: { value: undefined } as never,
        states: [state("bad", "idle")],
      }),
    ]);
    expect(createGraphSimulator(invalidDoc).start()).toMatchObject({
      ok: false,
      reason: "invalid-initial-context",
    });
  });
});
