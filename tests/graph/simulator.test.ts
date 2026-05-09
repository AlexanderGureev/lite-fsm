import { describe, expect, it } from "vitest";
import * as graphRoot from "@lite-fsm/graph";
import { compileLiteFsmGraph, type LiteFsmGraphDocument } from "@lite-fsm/graph";
import {
  createGraphSimulator,
  createMachineGraphSimulator,
  type GraphSimulationSliceRef,
} from "@lite-fsm/graph/simulator";

const simulatorSource = `
  import { createMachine, MachineManager } from "@lite-fsm/core";

  export const checkout = createMachine({
    config: {
      "*": {
        RESET: "idle",
      },
      idle: {
        START: "review",
        RESET: "review",
        LOOP: null,
        AMBIG: null,
        UNKNOWN: dynamicTarget,
      },
      review: {
        APPROVE: "done",
        EMIT: "notifying",
      },
      notifying: {
        ACK: "done",
      },
      left: {},
      right: {},
      done: {},
    },
    initialState: "idle",
    initialContext: { count: 0, nested: { ok: true }, list: [1, "x", null] },
    reducer: (state, action, { nextState }) => {
      switch (action.type) {
        case "START":
          state.state = nextState;
          return;
        case "AMBIG":
          state.state = action.payload && action.payload.right ? "right" : "left";
          return;
        case "ONLY_REDUCER":
          state.state = "right";
          return;
      }
    },
    effects: {
      idle: ({ transition }) => {
        transition({ type: "IDLE_EFFECT" });
      },
      review: ({ transition }) => {
        transition({ type: "NOTIFY" });
      },
      notifying: ({ transition }) => {
        transition({ type: "WORK", meta: { groupTag: "workers" } });
      },
      "*": ({ action, transition }) => {
        if (action.type === "APPROVE") {
          transition({ type: "AUDIT" });
        }
      },
    },
  });

  export const audit = createMachine({
    config: {
      waiting: {
        START: "started",
        NOTIFY: "notified",
        AUDIT: "audited",
        WORK: "worked",
      },
      started: {},
      notified: {},
      audited: {},
      worked: {},
    },
    initialState: "waiting",
    initialContext: { audit: true },
  });

  export const worker = createMachine({
    groupTag: "workers",
    config: {
      __INIT: {
        WORK: "running",
      },
      running: {
        DONE: "__RESOLVED",
      },
    },
    initialState: "__INIT",
    initialContext: { task: null },
  });

  export const manager = MachineManager({ checkout, audit, worker }, {});
`;

const compileSimulatorDocument = (): LiteFsmGraphDocument =>
  compileLiteFsmGraph(simulatorSource, { filename: "simulator.ts" }).document;

const domainRef = (machineId: string): GraphSimulationSliceRef => ({ kind: "domain", machineId });
const actorTemplateRef = (machineId: string): GraphSimulationSliceRef => ({ kind: "actorTemplate", machineId });

const startSnapshot = (document: LiteFsmGraphDocument) => {
  const simulator = createGraphSimulator(document, {
    scope: { kind: "machines", machineIds: ["checkout", "audit"] },
  });
  const started = simulator.start();
  if (!started.ok) throw new Error(started.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));

  return { simulator, snapshot: started.snapshot };
};

describe("@lite-fsm/graph/simulator: публичная поверхность", () => {
  it("экспортирует simulator только из subpath", () => {
    expect("createGraphSimulator" in graphRoot).toBe(false);
    expect(createGraphSimulator).toBeTypeOf("function");
    expect(createMachineGraphSimulator).toBeTypeOf("function");
  });
});

describe("GraphSimulator: lifecycle и snapshot", () => {
  it("до start возвращает пустые read results и controlled not-started", () => {
    const simulator = createGraphSimulator(compileSimulatorDocument());

    expect(simulator.getSnapshot()).toBeUndefined();
    expect(simulator.getAvailableTransitions()).toEqual([]);
    expect(simulator.getSuggestedEmissions()).toEqual([]);
    expect(simulator.send({ event: { type: "START" } })).toMatchObject({
      ok: false,
      reason: "not-started",
    });
  });

  it("создает одну selected machine как system с одним domain slice", () => {
    const simulator = createMachineGraphSimulator(compileSimulatorDocument(), "checkout");
    const started = simulator.start();

    expect(started).toMatchObject({ ok: true });
    if (!started.ok) return;

    expect(started.snapshot.machineIds).toEqual(["checkout"]);
    expect(Object.keys(started.snapshot.slices)).toEqual(["domain:checkout"]);
    expect(started.snapshot.slices["domain:checkout"]).toMatchObject({
      kind: "domain",
      stateKey: "idle",
      context: {
        kind: "json",
        value: { count: 0, nested: { ok: true }, list: [1, "x", null] },
      },
    });
  });

  it("поддерживает manager scope и возвращает controlled unknown-manager", () => {
    const document = compileSimulatorDocument();
    const simulator = createGraphSimulator(document, { scope: { kind: "manager", managerId: "manager" } });
    const started = simulator.start();

    expect(started).toMatchObject({ ok: true });
    if (started.ok) expect(started.snapshot.machineIds).toEqual(["checkout", "audit", "worker"]);

    expect(createGraphSimulator(document, { scope: { kind: "manager", managerId: "missing" } }).start()).toMatchObject({
      ok: false,
      reason: "unknown-manager",
    });
  });

  it("делает snapshot immutable и хранит timeline graph", () => {
    const { simulator } = startSnapshot(compileSimulatorDocument());
    const result = simulator.send({ event: { type: "START" } });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(Object.isFrozen(result.snapshot.slices)).toBe(true);
    expect(result.snapshot.timeline).toMatchObject({
      rootStepId: "step:0",
      currentStepId: "step:1",
      linearStepIds: ["step:0", "step:1"],
      childrenByStepId: {
        "step:0": ["step:1"],
        "step:1": [],
      },
    });
  });
});

describe("GraphSimulator: dispatch", () => {
  it("отправляет external event всем accepting selected domain machines в одном step", () => {
    const { simulator } = startSnapshot(compileSimulatorDocument());
    const result = simulator.send({ event: { type: "START" } });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(result.step.consumed.map((item) => [item.machineId, item.fromStateKey, item.toStateKey])).toEqual([
      ["checkout", "idle", "review"],
      ["audit", "waiting", "started"],
    ]);
    expect(result.step.rowRefs).toHaveLength(2);
    expect(result.snapshot.slices["domain:checkout"]?.stateKey).toBe("review");
    expect(result.snapshot.slices["domain:audit"]?.stateKey).toBe("started");
  });

  it("успешно добавляет empty-consumption step для события без consumers", () => {
    const { simulator } = startSnapshot(compileSimulatorDocument());
    const result = simulator.send({ event: { type: "NOOP" } });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(result.step.consumed).toEqual([]);
    expect(result.snapshot.timeline.linearStepIds).toEqual(["step:0", "step:1"]);
  });

  it("sendFromTransition фиксирует origin branch, payload и отправляет event другим consumers", () => {
    const { simulator } = startSnapshot(compileSimulatorDocument());
    const origin = simulator.getAvailableTransitions({ slice: domainRef("checkout"), eventType: "START" })[0];
    const result = simulator.sendFromTransition({
      slice: domainRef("checkout"),
      transitionId: origin?.transitionId ?? "",
      payload: { via: "manual" },
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(result.step.source).toMatchObject({ kind: "manual-config", transitionId: origin?.transitionId });
    expect(result.step.event).toEqual({ type: "START", payload: { via: "manual" } });
    expect(result.step.consumed.map((item) => item.machineId)).toEqual(["checkout", "audit"]);
    expect(result.step.consumed[0]?.selection).toBe("explicit");
  });

  it("external default policy выбирает ambiguous non-origin consumers детерминированно", () => {
    const simulator = createMachineGraphSimulator(compileSimulatorDocument(), "checkout");
    expect(simulator.start()).toMatchObject({ ok: true });

    const result = simulator.send({ event: { type: "AMBIG", payload: { right: true } } });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(result.step.choices[0]).toMatchObject({ resolvedBy: "policy" });
    expect(["left", "right"]).toContain(result.step.consumed[0]?.toStateKey);
    expect(result.snapshot.slices["domain:checkout"]?.stateKey).toBe(result.step.consumed[0]?.toStateKey);
    expect(result.step.event?.payload).toEqual({ right: true });
  });

  it("manual branch policy возвращает pending choice без мутации и choose commits выбор", () => {
    const simulator = createMachineGraphSimulator(compileSimulatorDocument(), "checkout", {
      branchPolicy: { kind: "manual" },
    });
    const started = simulator.start();
    if (!started.ok) throw new Error("start failed");
    const result = simulator.send({ event: { type: "AMBIG" } });

    expect(result).toMatchObject({ ok: false, reason: "choice-required" });
    if (result.ok) return;

    expect(simulator.getSnapshot()?.slices["domain:checkout"]?.stateKey).toBe("idle");
    const pending = result.pendingChoice;
    const candidates = pending?.candidatesBySliceId["domain:checkout"] ?? [];
    const right = candidates.find((candidate) => candidate.target.kind === "state" && candidate.target.stateId.endsWith("right"));
    const committed = simulator.choose({
      pendingChoiceId: pending?.pendingChoiceId ?? "",
      choices: [{ slice: domainRef("checkout"), transitionId: right?.transitionId ?? "" }],
    });

    expect(committed).toMatchObject({ ok: true });
    if (!committed.ok) return;

    expect(committed.snapshot.slices["domain:checkout"]?.stateKey).toBe("right");
    expect(simulator.choose({ pendingChoiceId: pending?.pendingChoiceId ?? "", choices: [] })).toMatchObject({
      ok: false,
      reason: "stale-choice",
    });
  });

  it("state-specific acceptance имеет приоритет над wildcard", () => {
    const simulator = createMachineGraphSimulator(compileSimulatorDocument(), "checkout");
    expect(simulator.start()).toMatchObject({ ok: true });

    const reset = simulator.getAvailableTransitions({ eventType: "RESET" });

    expect(reset).toHaveLength(1);
    expect(reset[0]?.target).toMatchObject({ kind: "state" });
    const result = simulator.send({ event: { type: "RESET" } });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.snapshot.slices["domain:checkout"]?.stateKey).toBe("review");
  });

  it("reducer branch не создает acceptance без config edge", () => {
    const simulator = createMachineGraphSimulator(compileSimulatorDocument(), "checkout");
    expect(simulator.start()).toMatchObject({ ok: true });

    expect(simulator.getAvailableTransitions({ eventType: "ONLY_REDUCER" })).toEqual([]);
    expect(simulator.sendFromTransition({ slice: domainRef("checkout"), transitionId: "missing" })).toMatchObject({
      ok: false,
      reason: "unknown-transition",
    });
  });

  it("dynamic targets видимы, но не commit-ятся", () => {
    const simulator = createMachineGraphSimulator(compileSimulatorDocument(), "checkout");
    expect(simulator.start()).toMatchObject({ ok: true });

    const transition = simulator.getAvailableTransitions({ eventType: "UNKNOWN" })[0];
    expect(transition).toMatchObject({ canApply: false, blockedReason: "target-not-resolved" });
    const before = simulator.getSnapshot();
    expect(simulator.send({ event: { type: "UNKNOWN" } })).toMatchObject({
      ok: false,
      reason: "target-not-resolved",
    });
    expect(simulator.getSnapshot()).toBe(before);
  });
});

describe("GraphSimulator: effects и routing", () => {
  it("не предлагает initial effects и предлагает state entry effects после real entry", () => {
    const simulator = createMachineGraphSimulator(compileSimulatorDocument(), "checkout");
    expect(simulator.start()).toMatchObject({ ok: true });
    expect(simulator.getSuggestedEmissions()).toEqual([]);

    const result = simulator.send({ event: { type: "START" } });
    expect(result).toMatchObject({ ok: true });

    expect(simulator.getSuggestedEmissions().map((emission) => [emission.sourceStateKey, emission.event.type])).toEqual([
      ["review", "NOTIFY"],
      ["*", "AUDIT"],
    ]);
  });

  it("self transition не запускает state-specific entry effect", () => {
    const simulator = createMachineGraphSimulator(compileSimulatorDocument(), "checkout");
    expect(simulator.start()).toMatchObject({ ok: true });
    expect(simulator.send({ event: { type: "LOOP" } })).toMatchObject({ ok: true });

    expect(simulator.getSuggestedEmissions().map((emission) => emission.event.type)).not.toContain("IDLE_EFFECT");
  });

  it("sendFromEmission отправляет IR routing и сам не мутирует origin", () => {
    const document = compileSimulatorDocument();
    const simulator = createGraphSimulator(document, {
      scope: { kind: "machines", machineIds: ["checkout", "audit", "worker"] },
    });
    expect(simulator.start()).toMatchObject({ ok: true });
    expect(simulator.send({ event: { type: "START" } })).toMatchObject({ ok: true });
    expect(simulator.send({ event: { type: "EMIT" } })).toMatchObject({ ok: true });
    const emission = simulator.getSuggestedEmissions({ slice: domainRef("checkout") }).find((candidate) => candidate.event.type === "WORK");
    const result = simulator.sendFromEmission({
      slice: domainRef("checkout"),
      emissionId: emission?.emissionId ?? "",
      payload: { job: 1 },
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(result.step.source).toMatchObject({ kind: "manual-effect", emissionId: emission?.emissionId });
    expect(result.step.event).toEqual({ type: "WORK", payload: { job: 1 } });
    expect(result.step.rowRefs[0]).toMatchObject({ kind: "emission", emissionId: emission?.emissionId });
    expect(result.step.rowRefs[1]).toMatchObject({ kind: "transition", machineId: "worker" });
    expect(result.step.consumed.map((item) => [item.machineId, item.toStateKey])).toEqual([
      ["worker", "running"],
    ]);
    expect(result.snapshot.slices["domain:checkout"]?.stateKey).toBe("notifying");
  });

  it("sendFromEmission с valid suggestion и без consumers успешен", () => {
    const { simulator } = startSnapshot(compileSimulatorDocument());
    expect(simulator.send({ event: { type: "START" } })).toMatchObject({ ok: true });
    const emission = simulator.getSuggestedEmissions({ slice: domainRef("checkout") }).find((candidate) => candidate.event.type === "NOTIFY");
    const result = simulator.sendFromEmission({ slice: domainRef("checkout"), emissionId: emission?.emissionId ?? "" });

    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.step.consumed).toEqual([]);
  });

  it("event meta управляет actor template routing, но domain получает event независимо от meta", () => {
    const document = compileSimulatorDocument();
    const simulator = createGraphSimulator(document, {
      scope: { kind: "machines", machineIds: ["audit", "worker"] },
    });
    expect(simulator.start()).toMatchObject({ ok: true });

    const result = simulator.send({ event: { type: "WORK", meta: { groupTag: "workers" } } });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    expect(result.step.event?.meta).toEqual({ groupTag: "workers" });
    expect(result.step.consumed.map((item) => item.machineId)).toEqual(["audit", "worker"]);
    expect(result.snapshot.slices["actorTemplate:worker"]?.stateKey).toBe("running");
    expect(result.snapshot.slices["domain:audit"]?.stateKey).toBe("worked");
  });

  it("actorId routing в template approximation дает partial confidence", () => {
    const simulator = createGraphSimulator(compileSimulatorDocument(), {
      scope: { kind: "machines", machineIds: ["worker"] },
      evaluationPolicy: {
        evaluateTransition(input) {
          expect(input.candidates[0]?.confidence).toBe("partial");
          return { kind: "unchanged", candidates: input.candidates };
        },
      },
    });
    expect(simulator.start()).toMatchObject({ ok: true });

    expect(simulator.send({ event: { type: "WORK", meta: { actorId: "actor-1" } } })).toMatchObject({ ok: true });
  });
});

describe("GraphSimulator: overrides и validation", () => {
  it("применяет initial state/context overrides", () => {
    const simulator = createGraphSimulator(compileSimulatorDocument(), {
      scope: { kind: "machines", machineIds: ["checkout"] },
      initialStateOverrides: [{ slice: domainRef("checkout"), stateKey: "review" }],
      initialContextOverrides: [{ slice: domainRef("checkout"), context: { custom: true } }],
    });
    const started = simulator.start();

    expect(started).toMatchObject({ ok: true });
    if (started.ok) {
      expect(started.snapshot.slices["domain:checkout"]).toMatchObject({
        stateKey: "review",
        context: { kind: "json", value: { custom: true } },
      });
    }
  });

  it("возвращает controlled diagnostics для non-JSON payload/context", () => {
    const simulator = createMachineGraphSimulator(compileSimulatorDocument(), "checkout");
    expect(simulator.start()).toMatchObject({ ok: true });
    const before = simulator.getSnapshot();

    expect(simulator.send({ event: { type: "START", payload: undefined as unknown as never } })).toMatchObject({
      ok: false,
      reason: "invalid-payload",
    });
    expect(simulator.getSnapshot()).toBe(before);

    const invalidContext = createGraphSimulator(compileSimulatorDocument(), {
      scope: { kind: "machines", machineIds: ["checkout"] },
      initialContextOverrides: [{ slice: domainRef("checkout"), context: { bad: undefined } as never }],
    });
    expect(invalidContext.start()).toMatchObject({ ok: false, reason: "invalid-initial-context" });
  });

  it("создает actorTemplate slice из actor template machine", () => {
    const simulator = createGraphSimulator(compileSimulatorDocument(), {
      scope: { kind: "machines", machineIds: ["worker"] },
    });
    const started = simulator.start();

    expect(started).toMatchObject({ ok: true });
    if (started.ok) {
      expect(started.snapshot.domainSlicesByMachineId).toEqual({});
      expect(started.snapshot.actorTemplateSlicesByMachineId).toEqual({ worker: "actorTemplate:worker" });
      expect(started.snapshot.slices["actorTemplate:worker"]?.ref).toEqual(actorTemplateRef("worker"));
    }
  });
});
