import { describe, expect, it } from "vitest";
import { createGraphSimulator } from "@lite-fsm/graph/simulator";
import { actorTemplateRef, configTransition, documentFromMachines, domainRef, machine, state, stateId } from "./simulator-test-utils";

describe("GraphSimulator: routing actorTemplate", () => {
  it("покрывает actor template wildcard suppression, group routing и unscoped routing", () => {
    const actor = machine({
      id: "worker",
      kind: "actorTemplate",
      initialState: "__INIT",
      groupTag: "workers",
      states: [state("worker", "__INIT", "init"), state("worker", "running")],
      transitions: [
        configTransition("worker", "*", "WILDCARD", { kind: "state", stateId: stateId("worker", "running") }),
        configTransition("worker", "__INIT", "START", { kind: "state", stateId: stateId("worker", "running") }),
      ],
    });
    const domain = machine({
      id: "domain",
      initialState: "idle",
      states: [state("domain", "idle"), state("domain", "seen")],
      transitions: [configTransition("domain", "idle", "WILDCARD", { kind: "state", stateId: stateId("domain", "seen") })],
    });
    const simulator = createGraphSimulator(documentFromMachines([actor, domain]));
    expect(simulator.start()).toMatchObject({ ok: true });

    expect(simulator.getAvailableTransitions({ slice: actorTemplateRef("worker"), eventType: "WILDCARD" })).toEqual([]);
    expect(simulator.send({ event: { type: "WILDCARD", meta: { groupId: "g1" } } })).toMatchObject({
      ok: true,
      snapshot: { slices: { "domain:domain": expect.objectContaining({ stateKey: "seen" }) } },
    });

    const simulator2 = createGraphSimulator(documentFromMachines([actor]));
    expect(simulator2.start()).toMatchObject({ ok: true });
    expect(simulator2.send({ event: { type: "START", meta: { groupTag: ["workers"] } } })).toMatchObject({
      ok: true,
      snapshot: { slices: { "actorTemplate:worker": expect.objectContaining({ stateKey: "running" }) } },
    });

    const simulator3 = createGraphSimulator(documentFromMachines([actor]));
    expect(simulator3.start()).toMatchObject({ ok: true });
    expect(simulator3.send({ event: { type: "START" } })).toMatchObject({
      ok: true,
      snapshot: { slices: { "actorTemplate:worker": expect.objectContaining({ stateKey: "running" }) } },
    });

    const untaggedActor = machine({
      id: "untagged",
      kind: "actorTemplate",
      initialState: "__INIT",
      states: [state("untagged", "__INIT", "init"), state("untagged", "running")],
      transitions: [configTransition("untagged", "__INIT", "START", { kind: "state", stateId: stateId("untagged", "running") })],
    });
    const simulator4 = createGraphSimulator(documentFromMachines([untaggedActor]));
    expect(simulator4.start()).toMatchObject({ ok: true });
    expect(simulator4.send({ event: { type: "START", meta: { groupTag: "workers" } } })).toMatchObject({
      ok: true,
      step: { consumed: [] },
    });
  });

  it("покрывает selfField routing для actor template emissions и dynamic actor/group routing", () => {
    const actor = machine({
      id: "worker",
      kind: "actorTemplate",
      initialState: "__INIT",
      groupTag: "workers",
      states: [state("worker", "__INIT", "init"), state("worker", "running")],
      transitions: [configTransition("worker", "__INIT", "START", { kind: "state", stateId: stateId("worker", "running") })],
      emissions: [
        {
          id: "worker:emission:running:TAG",
          machineId: "worker",
          sourceState: { kind: "state", stateId: stateId("worker", "running") },
          event: { type: "TAG", source: "effect" },
          routing: { kind: "tag", target: { kind: "selfField", field: "groupTag" } },
          origin: "effect",
          confidence: "exact",
        },
        {
          id: "worker:emission:running:ACTOR",
          machineId: "worker",
          sourceState: { kind: "state", stateId: stateId("worker", "running") },
          event: { type: "ACTOR", source: "effect" },
          routing: { kind: "actor", target: { kind: "selfField", field: "actorId" } },
          origin: "effect",
          confidence: "partial",
        },
      ],
    });
    const consumer = machine({
      id: "consumer",
      initialState: "idle",
      states: [state("consumer", "idle"), state("consumer", "seen")],
      transitions: [
        configTransition("consumer", "idle", "TAG", { kind: "state", stateId: stateId("consumer", "seen") }),
        configTransition("consumer", "idle", "ACTOR", { kind: "state", stateId: stateId("consumer", "seen") }),
      ],
    });
    const simulator = createGraphSimulator(documentFromMachines([actor, consumer]));
    expect(simulator.start()).toMatchObject({ ok: true });
    expect(simulator.send({ event: { type: "START" } })).toMatchObject({ ok: true });
    expect(simulator.getSuggestedEmissions().map((item) => [item.emissionId, item.canDispatch, item.blockedReason])).toEqual([
      ["worker:emission:running:TAG", true, undefined],
      ["worker:emission:running:ACTOR", false, "unknown-routing"],
    ]);
    expect(simulator.sendFromEmission({ slice: actorTemplateRef("worker"), emissionId: "worker:emission:running:TAG" })).toMatchObject({
      ok: true,
      snapshot: { slices: { "domain:consumer": expect.objectContaining({ stateKey: "seen" }) } },
    });

    const actorGroup = createGraphSimulator(documentFromMachines([actor, consumer]));
    expect(actorGroup.start()).toMatchObject({ ok: true });
    expect(actorGroup.send({ event: { type: "START", meta: { actorId: ["a1"] } } })).toMatchObject({ ok: true });
    expect(actorGroup.send({ event: { type: "ACTOR", meta: { actorId: ["a1"] } } })).toMatchObject({
      ok: true,
      snapshot: { slices: { "domain:consumer": expect.objectContaining({ stateKey: "seen" }) } },
    });
  });

  it("покрывает tag routing array с dynamic item как unknown routing", () => {
    const origin = machine({
      id: "origin",
      initialState: "idle",
      states: [state("origin", "idle"), state("origin", "ready")],
      transitions: [configTransition("origin", "idle", "GO", { kind: "state", stateId: stateId("origin", "ready") })],
      emissions: [
        {
          id: "origin:emission:ready:TAG",
          machineId: "origin",
          sourceState: { kind: "state", stateId: stateId("origin", "ready") },
          event: { type: "TAG", source: "effect" },
          routing: {
            kind: "tag",
            target: { kind: "array", items: [{ kind: "literal", value: "workers" }, { kind: "dynamic", label: "tagExpr" }] },
          },
          origin: "effect",
          confidence: "partial",
        },
      ],
    });
    const simulator = createGraphSimulator(documentFromMachines([origin]));
    expect(simulator.start()).toMatchObject({ ok: true });
    expect(simulator.send({ event: { type: "GO" } })).toMatchObject({ ok: true });
    expect(simulator.getSuggestedEmissions()).toEqual([
      expect.objectContaining({ canDispatch: false, blockedReason: "unknown-routing" }),
    ]);
  });

  it("покрывает pending choice от manual effect source", () => {
    const origin = machine({
      id: "origin",
      initialState: "idle",
      states: [state("origin", "idle"), state("origin", "ready")],
      transitions: [configTransition("origin", "idle", "GO", { kind: "state", stateId: stateId("origin", "ready") })],
      emissions: [
        {
          id: "origin:emission:ready:AMBIG",
          machineId: "origin",
          sourceState: { kind: "state", stateId: stateId("origin", "ready") },
          event: { type: "AMBIG", source: "effect" },
          routing: { kind: "default" },
          origin: "effect",
          confidence: "exact",
        },
      ],
    });
    const consumer = machine({
      id: "consumer",
      initialState: "idle",
      states: [state("consumer", "idle"), state("consumer", "left"), state("consumer", "right")],
      transitions: [
        configTransition("consumer", "idle", "AMBIG", { kind: "state", stateId: stateId("consumer", "left") }, 0),
        configTransition("consumer", "idle", "AMBIG", { kind: "state", stateId: stateId("consumer", "right") }, 1),
      ],
    });
    const simulator = createGraphSimulator(documentFromMachines([origin, consumer]), { branchPolicy: { kind: "manual" } });
    expect(simulator.start()).toMatchObject({ ok: true });
    expect(simulator.send({ event: { type: "GO" } })).toMatchObject({ ok: true });
    const pending = simulator.sendFromEmission({
      slice: domainRef("origin"),
      emissionId: "origin:emission:ready:AMBIG",
    });
    expect(pending).toMatchObject({ ok: false, reason: "choice-required" });
    if (pending.ok) return;

    const choice = pending.pendingChoice?.candidatesBySliceId["domain:consumer"]?.[1];
    expect(
      simulator.choose({
        pendingChoiceId: pending.pendingChoice?.pendingChoiceId ?? "",
        choices: [{ slice: domainRef("consumer"), transitionId: choice?.transitionId ?? "" }],
      }),
    ).toMatchObject({
      ok: true,
      snapshot: { slices: { "domain:consumer": expect.objectContaining({ stateKey: "right" }) } },
    });
  });
});
