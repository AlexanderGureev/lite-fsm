import { describe, expect, it } from "vitest";
import type { GraphTransition } from "@lite-fsm/graph";
import { createGraphSimulator } from "@lite-fsm/graph/simulator";
import { configTransition, documentFromMachines, domainRef, machine, state, stateId } from "./simulator-test-utils";

describe("GraphSimulator: resolver и политики evaluator", () => {
  it("покрывает evaluator resolved/blocked, changed context, patches и invalid reduced context", () => {
    const doc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        initialContextJson: { count: 0 },
        states: [state("flow", "idle"), state("flow", "left"), state("flow", "right")],
        transitions: [
          configTransition("flow", "idle", "PICK", { kind: "state", stateId: stateId("flow", "left") }, 0),
          configTransition("flow", "idle", "PICK", { kind: "state", stateId: stateId("flow", "right") }, 1),
        ],
      }),
    ]);
    const simulator = createGraphSimulator(doc, {
      evaluationPolicy: {
        evaluateTransition(input) {
          if (input.event.type === "BLOCK") return { kind: "blocked", diagnostics: [{ code: "X", severity: "warning", message: "blocked" }] };

          const candidate = input.candidates.find((item) => item.target.kind === "state" && item.target.stateId.endsWith("right"));
          return { kind: "resolved", candidate: candidate ?? input.candidates[0] };
        },
        reduceContext(input) {
          if (input.event.payload === "bad-context") {
            return { kind: "changed", context: { kind: "json", value: { value: undefined } as never } };
          }

          return {
            kind: "changed",
            context: { kind: "json", value: { count: 1 } },
            patches: [{ slice: input.slice.ref, op: "set", path: ["count"], value: 1 }],
          };
        },
      },
    });
    expect(simulator.start()).toMatchObject({ ok: true });
    const result = simulator.send({ event: { type: "PICK" } });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.step.choices[0]).toMatchObject({ resolvedBy: "evaluator" });
      expect(result.step.contextPatches).toEqual([{ slice: domainRef("flow"), op: "set", path: ["count"], value: 1 }]);
      expect(result.snapshot.slices["domain:flow"]?.context).toEqual({ kind: "json", value: { count: 1 } });
    }

    const blocked = createGraphSimulator(doc, {
      evaluationPolicy: {
        evaluateTransition() {
          return { kind: "blocked", diagnostics: [{ code: "X", severity: "warning", message: "blocked" }] };
        },
      },
    });
    expect(blocked.start()).toMatchObject({ ok: true });
    expect(blocked.send({ event: { type: "PICK" } })).toMatchObject({ ok: false, reason: "evaluation-blocked" });

    const invalidContext = createGraphSimulator(doc, {
      evaluationPolicy: {
        reduceContext() {
          return { kind: "changed", context: { kind: "json", value: { value: undefined } as never } };
        },
      },
    });
    expect(invalidContext.start()).toMatchObject({ ok: true });
    expect(invalidContext.send({ event: { type: "PICK" }, choices: [{ slice: domainRef("flow"), transitionId: doc.machines[0]?.transitions[0]?.id ?? "" }] })).toMatchObject({
      ok: false,
      reason: "invalid-context",
    });

    const blockedContext = createGraphSimulator(doc, {
      evaluationPolicy: {
        reduceContext() {
          return { kind: "blocked", diagnostics: [{ code: "X", severity: "warning", message: "blocked context" }] };
        },
      },
    });
    expect(blockedContext.start()).toMatchObject({ ok: true });
    expect(
      blockedContext.send({
        event: { type: "PICK" },
        choices: [{ slice: domainRef("flow"), transitionId: doc.machines[0]?.transitions[0]?.id ?? "" }],
      }),
    ).toMatchObject({ ok: false, reason: "evaluation-blocked" });

    const changedWithoutPatches = createGraphSimulator(doc, {
      evaluationPolicy: {
        reduceContext() {
          return { kind: "changed", context: { kind: "json", value: { count: 2 } } };
        },
      },
    });
    expect(changedWithoutPatches.start()).toMatchObject({ ok: true });
    const changed = changedWithoutPatches.send({
      event: { type: "PICK" },
      choices: [{ slice: domainRef("flow"), transitionId: doc.machines[0]?.transitions[0]?.id ?? "" }],
    });
    expect(changed).toMatchObject({ ok: true });
    if (changed.ok) expect(changed.step.contextPatches).toEqual([]);
  });

  it("покрывает explicit invalid choices, deterministic-first и origin choice-required", () => {
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
    const deterministic = createGraphSimulator(doc, { branchPolicy: { kind: "deterministic-first" } });
    expect(deterministic.start()).toMatchObject({ ok: true });
    expect(deterministic.send({ event: { type: "PICK" } })).toMatchObject({
      ok: true,
      snapshot: { slices: { "domain:flow": expect.objectContaining({ stateKey: "left" }) } },
    });

    const invalidChoice = createGraphSimulator(doc);
    expect(invalidChoice.start()).toMatchObject({ ok: true });
    expect(
      invalidChoice.send({
        event: { type: "PICK" },
        choices: [{ slice: domainRef("flow"), transitionId: "missing-transition" }],
      }),
    ).toMatchObject({ ok: false, reason: "unknown-transition" });

    const origin = createGraphSimulator(doc);
    expect(origin.start()).toMatchObject({ ok: true });
    const transition = origin.getAvailableTransitions({ eventType: "PICK" })[0];
    expect(origin.sendFromTransition({ slice: domainRef("flow"), transitionId: transition?.transitionId ?? "" })).toMatchObject({
      ok: true,
    });
  });

  it("атомарно откатывает multi-slice dispatch при failed reduce context", () => {
    const doc = documentFromMachines([
      machine({
        id: "first",
        initialState: "idle",
        initialContextJson: { count: 0 },
        states: [state("first", "idle"), state("first", "ready")],
        transitions: [configTransition("first", "idle", "GO", { kind: "state", stateId: stateId("first", "ready") })],
      }),
      machine({
        id: "second",
        initialState: "idle",
        initialContextJson: { count: 0 },
        states: [state("second", "idle"), state("second", "ready")],
        transitions: [configTransition("second", "idle", "GO", { kind: "state", stateId: stateId("second", "ready") })],
      }),
    ]);
    const simulator = createGraphSimulator(doc, {
      evaluationPolicy: {
        reduceContext(input) {
          if (input.slice.machineId === "second") {
            return { kind: "changed", context: { kind: "json", value: { bad: undefined } as never } };
          }

          return { kind: "changed", context: { kind: "json", value: { count: 1 } } };
        },
      },
    });
    expect(simulator.start()).toMatchObject({ ok: true });
    const before = simulator.getSnapshot();
    if (!before) throw new Error("start failed");

    const result = simulator.send({ event: { type: "GO" } });

    expect(result).toMatchObject({ ok: false, reason: "invalid-context" });
    if (!result.ok) expect(result.snapshot).toBe(before);
    expect(simulator.getSnapshot()).toBe(before);
    expect(simulator.getSnapshot()?.slices["domain:first"]?.stateKey).toBe("idle");
    expect(simulator.getSnapshot()?.slices["domain:second"]?.stateKey).toBe("idle");
    expect(simulator.getSnapshot()?.timeline.linearStepIds).toEqual(["step:0"]);
  });

  it("покрывает reducer source mismatch без создания candidate", () => {
    const reducerTransition: GraphTransition = {
      id: "flow:transition:reducer:*:GO:0",
      machineId: "flow",
      source: { kind: "wildcard" },
      event: { type: "GO", source: "reducer" },
      target: { kind: "state", stateId: stateId("flow", "right") },
      layer: "reducer",
      order: 1,
      confidence: "exact",
    };
    const doc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle"), state("flow", "left"), state("flow", "right")],
        transitions: [
          configTransition("flow", "idle", "GO", { kind: "state", stateId: stateId("flow", "left") }),
          reducerTransition,
        ],
      }),
    ]);
    const simulator = createGraphSimulator(doc);
    expect(simulator.start()).toMatchObject({ ok: true });
    expect(simulator.getAvailableTransitions({ eventType: "GO" }).map((transition) => transition.transitionId)).toEqual([
      "flow:transition:config:idle:GO:0",
    ]);

    const wildcardReducer: GraphTransition = {
      id: "flow:transition:reducer:*:RESET:0",
      machineId: "flow",
      source: { kind: "wildcard" },
      event: { type: "RESET", source: "reducer" },
      target: { kind: "state", stateId: stateId("flow", "right") },
      layer: "reducer",
      order: 1,
      confidence: "exact",
    };
    const wildcardDoc = documentFromMachines([
      machine({
        id: "flow",
        initialState: "idle",
        states: [state("flow", "idle"), state("flow", "left"), state("flow", "right")],
        transitions: [
          configTransition("flow", "*", "RESET", { kind: "state", stateId: stateId("flow", "left") }),
          wildcardReducer,
        ],
      }),
    ]);
    const wildcard = createGraphSimulator(wildcardDoc);
    expect(wildcard.start()).toMatchObject({ ok: true });
    expect(wildcard.getAvailableTransitions({ eventType: "RESET" }).map((transition) => transition.transitionId)).toEqual([
      wildcardReducer.id,
    ]);
  });
});
