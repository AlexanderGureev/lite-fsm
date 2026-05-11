import { describe, expect, it } from "vitest";
import type { GraphTransition } from "@lite-fsm/graph";
import { createGraphSimulator } from "@lite-fsm/graph/simulator";
import { configTransition, documentFromMachines, domainRef, machine, state, stateId } from "./simulator-test-utils";

describe("GraphSimulator: проверка команд", () => {
  const doc = documentFromMachines([
    machine({
      id: "flow",
      initialState: "idle",
      states: [state("flow", "idle"), state("flow", "ready")],
      transitions: [configTransition("flow", "idle", "GO", { kind: "state", stateId: stateId("flow", "ready") })],
    }),
  ]);

  it("покрывает invalid event/meta/payload и unknown slices для commands", () => {
    const simulator = createGraphSimulator(doc);
    expect(createGraphSimulator(doc).sendFromTransition({ slice: domainRef("flow"), transitionId: "x" })).toMatchObject({
      ok: false,
      reason: "not-started",
    });
    expect(createGraphSimulator(doc).sendFromEmission({ slice: domainRef("flow"), emissionId: "x" })).toMatchObject({
      ok: false,
      reason: "not-started",
    });
    expect(simulator.start()).toMatchObject({ ok: true });

    expect(simulator.send({ event: { type: "" } })).toMatchObject({ ok: false, reason: "invalid-event" });
    expect(simulator.send({ event: null as never })).toMatchObject({ ok: false, reason: "invalid-event" });
    expect(simulator.send({ event: { type: "GO", payload: Number.NaN as never } })).toMatchObject({
      ok: false,
      reason: "invalid-payload",
    });
    expect(simulator.send({ event: { type: "GO", payload: [undefined] as never } })).toMatchObject({
      ok: false,
      reason: "invalid-payload",
    });
    const nullPrototypePayload = Object.create(null) as Record<string, unknown>;
    nullPrototypePayload.ok = true;
    expect(simulator.send({ event: { type: "IGNORED", payload: nullPrototypePayload as never } })).toMatchObject({
      ok: true,
    });
    expect(simulator.send({ event: { type: "GO", meta: { actorId: [1] } as never } })).toMatchObject({
      ok: false,
      reason: "invalid-event",
    });
    expect(simulator.send({ event: { type: "GO", meta: { groupId: "group" } } })).toMatchObject({ ok: true });
    expect(simulator.send({ event: { type: "IGNORED", meta: { senderGroupTag: "workers" } } })).toMatchObject({
      ok: true,
    });

    expect(simulator.sendFromTransition({ slice: domainRef("missing"), transitionId: "x" })).toMatchObject({
      ok: false,
      reason: "unknown-slice",
    });
    expect(simulator.sendFromEmission({ slice: domainRef("missing"), emissionId: "x" })).toMatchObject({
      ok: false,
      reason: "unknown-slice",
    });
    expect(createGraphSimulator(doc).choose({ pendingChoiceId: "x", choices: [] })).toMatchObject({
      ok: false,
      reason: "not-started",
    });
  });

  it("не меняет snapshot и timeline при validation failures", () => {
    const simulator = createGraphSimulator(doc);
    expect(simulator.start()).toMatchObject({ ok: true });
    const before = simulator.getSnapshot();
    if (!before) throw new Error("start failed");

    expect(simulator.getAvailableTransitions({ slice: domainRef("missing") })).toEqual([]);
    expect(simulator.getSuggestedEmissions({ slice: domainRef("missing") })).toEqual([]);

    const invalidMeta = simulator.send({ event: { type: "GO", meta: { actorId: [1] } as never } });
    expect(invalidMeta).toMatchObject({ ok: false, reason: "invalid-event" });
    if (!invalidMeta.ok) expect(invalidMeta.snapshot).toBe(before);
    expect(simulator.getSnapshot()).toBe(before);
    expect(simulator.getSnapshot()?.timeline.linearStepIds).toEqual(["step:0"]);

    const invalidPayload = simulator.send({ event: { type: "GO", payload: { bad: undefined } as never } });
    expect(invalidPayload).toMatchObject({ ok: false, reason: "invalid-payload" });
    if (!invalidPayload.ok) expect(invalidPayload.snapshot).toBe(before);
    expect(simulator.getSnapshot()).toBe(before);
    expect(simulator.getSnapshot()?.slices["domain:flow"]?.stateKey).toBe("idle");
  });

  it("покрывает array initial context override как invalid context", () => {
    const invalidContext = createGraphSimulator(doc, {
      initialContextOverrides: [{ slice: domainRef("flow"), context: [] as never }],
    });

    expect(invalidContext.start()).toMatchObject({ ok: false, reason: "invalid-initial-context" });
  });

  it("покрывает sendFromTransition unavailable и invalid payload", () => {
    const simulator = createGraphSimulator(doc);
    expect(simulator.start()).toMatchObject({ ok: true });
    const transition = simulator.getAvailableTransitions({ eventType: "GO" })[0];

    expect(
      simulator.sendFromTransition({
        slice: domainRef("flow"),
        transitionId: transition?.transitionId ?? "",
        payload: { invalid: undefined } as never,
      }),
    ).toMatchObject({ ok: false, reason: "invalid-payload" });

    expect(simulator.send({ event: { type: "GO" } })).toMatchObject({ ok: true });
    expect(simulator.sendFromTransition({ slice: domainRef("flow"), transitionId: transition?.transitionId ?? "" })).toMatchObject({
      ok: false,
      reason: "event-not-accepted",
    });

    const mutatedDoc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle")],
        transitions: [configTransition("flow", "idle", "GO", { kind: "self" })],
      }),
    ]);
    const mutated = createGraphSimulator(mutatedDoc);
    expect(mutated.start()).toMatchObject({ ok: true });
    const knownId = mutatedDoc.machines[0]?.transitions[0]?.id ?? "";
    mutatedDoc.machines = [];
    expect(mutated.sendFromTransition({ slice: domainRef("flow"), transitionId: knownId })).toMatchObject({
      ok: false,
      reason: "unknown-transition",
    });
  });

  it("sendFromTransition принимает accepted config id для свернутого reducer transition", () => {
    const accepted = configTransition("flow", "idle", "GO", { kind: "state", stateId: stateId("flow", "ready") });
    const reducer: GraphTransition = {
      id: "flow:transition:reducer:idle:GO:ready:0",
      machineId: "flow",
      source: accepted.source,
      event: { type: "GO", source: "reducer" },
      target: { kind: "state", stateId: stateId("flow", "ready") },
      layer: "reducer",
      reducerCaseId: "flow:reducer:GO:0",
      order: 1,
      confidence: "exact",
    };
    const foldedDoc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle"), state("flow", "ready")],
        transitions: [accepted, reducer],
      }),
    ]);
    const simulator = createGraphSimulator(foldedDoc);
    expect(simulator.start()).toMatchObject({ ok: true });
    expect(simulator.getAvailableTransitions({ slice: domainRef("flow"), eventType: "GO" }).map((transition) => transition.transitionId)).toEqual([
      reducer.id,
    ]);

    const result = simulator.sendFromTransition({ slice: domainRef("flow"), transitionId: accepted.id });

    expect(result).toMatchObject({
      ok: true,
      snapshot: { slices: { "domain:flow": expect.objectContaining({ stateKey: "ready" }) } },
      step: {
        source: { kind: "manual-config", transitionId: accepted.id },
        choices: [expect.objectContaining({ selectedTransitionId: reducer.id })],
        rowRefs: [expect.objectContaining({ transitionId: reducer.id })],
      },
    });
  });
});
