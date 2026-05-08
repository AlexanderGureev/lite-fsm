import { describe, expect, it } from "vitest";
import * as graphRoot from "@lite-fsm/graph";
import {
  compileLiteFsmGraph,
  type GraphEmission,
  type GraphRouting,
  type GraphState,
  type GraphStateRef,
  type GraphTarget,
  type GraphTransition,
  type LiteFsmGraphMachine,
} from "@lite-fsm/graph";
import { createGraphSimulator } from "@lite-fsm/graph/simulator";
import { fullAssemblerFilename, fullAssemblerSource } from "./fixtures/graph-sources";

const stateId = (machineId: string, key: string): string => `${machineId}:state:${key}`;

const state = (
  machineId: string,
  key: string,
  options: Partial<Omit<GraphState, "id" | "key">> = {},
): GraphState => ({
  id: stateId(machineId, key),
  key,
  kind: options.kind ?? (key === "*" ? "wildcard" : key === "__INIT" ? "init" : "normal"),
  isInitial: options.isInitial ?? false,
  isPublicActorState: options.isPublicActorState ?? (key !== "__INIT" && !key.startsWith("__")),
  loc: options.loc,
});

const sourceRef = (machineId: string, source: string | GraphStateRef): GraphStateRef => {
  if (typeof source !== "string") return source;
  if (source === "*") return { kind: "wildcard" };

  return { kind: "state", stateId: stateId(machineId, source) };
};

const targetState = (machineId: string, key: string): GraphTarget => ({ kind: "state", stateId: stateId(machineId, key) });

const targetTerminal = (terminal: "__RESOLVED" | "__REJECTED" | "__CANCELLED"): GraphTarget => ({
  kind: "terminal",
  terminal,
});

const transition = (input: {
  machineId: string;
  source: string | GraphStateRef;
  event: string;
  target: GraphTarget;
  layer?: GraphTransition["layer"];
  guardText?: string;
  reducerCaseId?: string;
  order?: number;
}): GraphTransition => {
  const layer = input.layer ?? "config";
  const sourceLabel = typeof input.source === "string" ? input.source : input.source.kind;
  const order = input.order ?? 0;

  return {
    id: `${input.machineId}:transition:${layer}:${sourceLabel}:${input.event}:${order}`,
    machineId: input.machineId,
    source: sourceRef(input.machineId, input.source),
    event: { type: input.event, source: layer },
    target: input.target,
    layer,
    order,
    guard: input.guardText ? { text: input.guardText, kind: "if" } : undefined,
    reducerCaseId: input.reducerCaseId,
    confidence: "exact",
  };
};

const emission = (input: {
  machineId: string;
  source: string | "*";
  event: string;
  routing?: GraphRouting;
  guardText?: string;
}): GraphEmission => ({
  id: `${input.machineId}:emission:${input.source}:${input.event}`,
  machineId: input.machineId,
  sourceState: input.source === "*" ? "*" : sourceRef(input.machineId, input.source),
  event: { type: input.event, source: "effect" },
  routing: input.routing ?? { kind: "default" },
  origin: "effect",
  guard: input.guardText ? { text: input.guardText, kind: "if" } : undefined,
  confidence: "exact",
});

const machine = (input: {
  id: string;
  initialState?: string;
  kind?: LiteFsmGraphMachine["kind"];
  states: GraphState[];
  transitions?: GraphTransition[];
  emissions?: GraphEmission[];
}): LiteFsmGraphMachine => ({
  id: input.id,
  index: 0,
  managerKeys: [],
  kind: input.kind ?? "domain",
  initialState: input.initialState,
  states: input.states,
  transitions: input.transitions ?? [],
  emissions: input.emissions ?? [],
  reducerCases: [],
  diagnostics: [],
});

const basicMachine = (): LiteFsmGraphMachine =>
  machine({
    id: "basic",
    initialState: "IDLE",
    states: [state("basic", "IDLE", { isInitial: true }), state("basic", "READY")],
    transitions: [transition({ machineId: "basic", source: "IDLE", event: "START", target: targetState("basic", "READY") })],
  });

const getFixtureMachine = (id: string): LiteFsmGraphMachine => {
  const document = compileLiteFsmGraph(fullAssemblerSource, { filename: fullAssemblerFilename }).document;
  const selected = document.machines.find((candidate) => candidate.id === id);
  if (!selected) throw new Error(`Missing fixture machine ${id}`);

  return selected;
};

describe("GraphSimulator public surface", () => {
  it("экспортирует simulator только из subpath", () => {
    expect(createGraphSimulator).toEqual(expect.any(Function));
    expect("createGraphSimulator" in graphRoot).toBe(false);
  });
});

describe("GraphSimulator lifecycle", () => {
  it("возвращает controlled results до start и не дает мутировать внутренний snapshot", () => {
    const sim = createGraphSimulator(basicMachine());

    expect(sim.getSnapshot()).toBeUndefined();
    expect(sim.getAvailableTransitions()).toEqual([]);
    expect(sim.getSuggestedEmissions()).toEqual([]);
    expect(sim.send({ event: "START" })).toMatchObject({ ok: false, reason: "not-started" });
    expect(sim.choose({ transitionId: "missing" })).toMatchObject({ ok: false, reason: "not-started" });
    expect(sim.followEmission({ emissionId: "missing" })).toMatchObject({ ok: false, reason: "not-started" });

    const started = sim.start();
    expect(started).toMatchObject({ ok: true, snapshot: { stateKey: "IDLE", history: [] } });
    if (!started.ok) throw new Error("Expected simulator to start");

    started.snapshot.history.push({
      event: "MUTATE",
      acceptedTransitionId: "x",
      effectiveTransitionId: "x",
      transitionId: "x",
      cause: "external",
      from: "IDLE",
      to: "IDLE",
    });

    expect(sim.getSnapshot()?.history).toEqual([]);
    expect(sim.start()).toMatchObject({ ok: true, snapshot: { stateKey: "IDLE" } });
    expect(sim.send({ event: "START" })).toMatchObject({
      ok: true,
      snapshot: { stateKey: "READY" },
      step: { from: "IDLE", to: "READY", cause: "external" },
      suggestedEmissions: [],
    });
    expect(sim.start()).toMatchObject({ ok: true, snapshot: { stateKey: "READY" } });
    expect(sim.restart()).toMatchObject({ ok: true, snapshot: { stateKey: "IDLE", history: [] } });
    expect(sim.getSuggestedEmissions()).toEqual([]);
  });

  it("не дает мутировать внутренний snapshot через success или failure result", () => {
    const sim = createGraphSimulator(basicMachine());
    sim.start();

    const failed = sim.send({ event: "MISSING" });
    expect(failed).toMatchObject({ ok: false, reason: "event-not-accepted", snapshot: { stateKey: "IDLE" } });
    if (failed.ok || !failed.snapshot) throw new Error("Expected failed result with snapshot");
    failed.snapshot.history.push({
      event: "MUTATE_FAILED",
      acceptedTransitionId: "x",
      effectiveTransitionId: "x",
      transitionId: "x",
      cause: "external",
      from: "IDLE",
      to: "IDLE",
    });
    expect(sim.getSnapshot()).toMatchObject({ stateKey: "IDLE", history: [] });

    const sent = sim.send({ event: "START" });
    expect(sent).toMatchObject({ ok: true, snapshot: { stateKey: "READY" } });
    if (!sent.ok) throw new Error("Expected successful result");
    sent.step.to = "MUTATED";
    sent.snapshot.history[0]!.to = "MUTATED";

    expect(sim.getSnapshot()).toMatchObject({
      stateKey: "READY",
      history: [{ event: "START", from: "IDLE", to: "READY" }],
    });
  });

  it("возвращает unknown-start-state для отсутствующего initialState", () => {
    const sim = createGraphSimulator(
      machine({
        id: "broken",
        initialState: "MISSING",
        states: [state("broken", "IDLE")],
      }),
    );

    expect(sim.start()).toMatchObject({
      ok: false,
      reason: "unknown-start-state",
      diagnostics: [{ code: "LFG_SIM_UNKNOWN_START_STATE" }],
    });

    expect(createGraphSimulator(machine({ id: "emptyStart", states: [state("emptyStart", "IDLE")] })).start()).toMatchObject({
      ok: false,
      reason: "unknown-start-state",
    });
  });

  it("restart очищает историю и suggested emissions после уже выполненного шага", () => {
    const sim = createGraphSimulator(
      machine({
        id: "restartEffects",
        initialState: "IDLE",
        states: [state("restartEffects", "IDLE", { isInitial: true }), state("restartEffects", "READY")],
        transitions: [
          transition({ machineId: "restartEffects", source: "IDLE", event: "START", target: targetState("restartEffects", "READY") }),
        ],
        emissions: [emission({ machineId: "restartEffects", source: "READY", event: "AUDIT" })],
      }),
    );

    sim.start();
    expect(sim.send({ event: "START" })).toMatchObject({
      ok: true,
      snapshot: { stateKey: "READY", history: [{ event: "START" }] },
      suggestedEmissions: [{ emissionId: "restartEffects:emission:READY:AUDIT" }],
    });
    expect(sim.getSuggestedEmissions()).toMatchObject([{ emissionId: "restartEffects:emission:READY:AUDIT" }]);

    expect(sim.restart()).toMatchObject({ ok: true, snapshot: { stateKey: "IDLE", history: [] } });
    expect(sim.getSnapshot()).toMatchObject({ stateKey: "IDLE", history: [] });
    expect(sim.getSuggestedEmissions()).toEqual([]);
  });
});

describe("GraphSimulator transition resolver", () => {
  it("применяет state-specific transitions раньше wildcard fallback", () => {
    const sim = createGraphSimulator(
      machine({
        id: "wild",
        initialState: "IDLE",
        states: [
          state("wild", "*"),
          state("wild", "IDLE", { isInitial: true }),
          state("wild", "LOCAL"),
          state("wild", "GLOBAL"),
        ],
        transitions: [
          transition({ machineId: "wild", source: "*", event: "RESET", target: targetState("wild", "GLOBAL") }),
          transition({ machineId: "wild", source: "*", event: "LOGOUT", target: targetState("wild", "GLOBAL") }),
          transition({ machineId: "wild", source: "IDLE", event: "RESET", target: targetState("wild", "LOCAL") }),
        ],
      }),
    );

    sim.start();

    expect(sim.getAvailableTransitions().map((candidate) => [candidate.event.type, candidate.target])).toEqual([
      ["RESET", targetState("wild", "LOCAL")],
      ["LOGOUT", targetState("wild", "GLOBAL")],
    ]);
    expect(sim.send({ event: "RESET" })).toMatchObject({ ok: true, snapshot: { stateKey: "LOCAL" } });
  });

  it("не падает на unknown source refs и возвращает ambiguity для нескольких accepted config transitions", () => {
    const goA = transition({ machineId: "duplicates", source: "IDLE", event: "GO", target: targetState("duplicates", "A") });
    const goB = transition({
      machineId: "duplicates",
      source: "IDLE",
      event: "GO",
      target: targetState("duplicates", "B"),
      order: 1,
    });
    const sim = createGraphSimulator(
      machine({
        id: "duplicates",
        initialState: "IDLE",
        states: [state("duplicates", "IDLE", { isInitial: true }), state("duplicates", "A"), state("duplicates", "B")],
        transitions: [
          transition({
            machineId: "duplicates",
            source: { kind: "unknown", label: "runtime-source" },
            event: "GHOST",
            target: targetState("duplicates", "A"),
          }),
          goA,
          goB,
        ],
      }),
    );

    sim.start();

    expect(sim.send({ event: "GHOST" })).toMatchObject({ ok: false, reason: "event-not-accepted" });
    expect(sim.send({ event: "GO" })).toMatchObject({
      ok: false,
      reason: "ambiguous-transition",
      candidates: [{ transitionId: goA.id }, { transitionId: goB.id }],
    });
    expect(sim.choose({ transitionId: goB.id })).toMatchObject({ ok: true, snapshot: { stateKey: "B" } });
  });

  it("не применяет wildcard fallback, если state-specific event существует, даже когда target blocked", () => {
    const sim = createGraphSimulator(
      machine({
        id: "shadowBlocked",
        initialState: "IDLE",
        states: [
          state("shadowBlocked", "*"),
          state("shadowBlocked", "IDLE", { isInitial: true }),
          state("shadowBlocked", "READY"),
        ],
        transitions: [
          transition({ machineId: "shadowBlocked", source: "*", event: "GO", target: targetState("shadowBlocked", "READY") }),
          transition({ machineId: "shadowBlocked", source: "IDLE", event: "GO", target: { kind: "blocked", reason: "local" } }),
        ],
      }),
    );

    sim.start();

    expect(sim.getAvailableTransitions()).toMatchObject([
      { event: { type: "GO" }, target: { kind: "blocked" }, blockedReason: "blocked-target" },
    ]);
    expect(sim.send({ event: "GO" })).toMatchObject({ ok: false, reason: "blocked-target" });
    expect(sim.getSnapshot()).toMatchObject({ stateKey: "IDLE", history: [] });
  });

  it("оставляет unresolved targets видимыми, но не мутирует snapshot", () => {
    const sim = createGraphSimulator(
      machine({
        id: "targets",
        initialState: "IDLE",
        states: [
          state("targets", "*"),
          state("targets", "IDLE", { isInitial: true }),
          state("targets", "__RESOLVED", { kind: "terminal", isPublicActorState: false }),
        ],
        transitions: [
          transition({ machineId: "targets", source: "*", event: "AFTER_TERMINAL", target: { kind: "self" } }),
          transition({ machineId: "targets", source: "IDLE", event: "SELF", target: { kind: "self" } }),
          transition({ machineId: "targets", source: "IDLE", event: "DYNAMIC", target: { kind: "dynamic", label: "runtime" } }),
          transition({ machineId: "targets", source: "IDLE", event: "UNKNOWN", target: { kind: "unknown", label: "mystery" } }),
          transition({ machineId: "targets", source: "IDLE", event: "BLOCKED", target: { kind: "blocked", reason: "not allowed" } }),
          transition({ machineId: "targets", source: "IDLE", event: "MISSING", target: targetState("targets", "MISSING") }),
          transition({ machineId: "targets", source: "IDLE", event: "DONE", target: targetTerminal("__RESOLVED") }),
        ],
      }),
    );

    sim.start();

    expect(sim.getAvailableTransitions().filter((candidate) => !candidate.canApply).map((candidate) => [
      candidate.event.type,
      candidate.blockedReason,
    ])).toEqual([
      ["DYNAMIC", "target-not-resolved"],
      ["UNKNOWN", "target-not-resolved"],
      ["BLOCKED", "blocked-target"],
      ["MISSING", "target-not-resolved"],
    ]);
    expect(sim.send({ event: "DYNAMIC" })).toMatchObject({ ok: false, reason: "target-not-resolved" });
    expect(sim.getSnapshot()).toMatchObject({ stateKey: "IDLE" });
    expect(sim.send({ event: "BLOCKED" })).toMatchObject({ ok: false, reason: "blocked-target" });
    expect(sim.choose({ transitionId: "targets:transition:config:IDLE:BLOCKED:0" })).toMatchObject({
      ok: false,
      reason: "blocked-target",
    });
    expect(sim.send({ event: "UNKNOWN" })).toMatchObject({ ok: false, reason: "target-not-resolved" });
    expect(sim.send({ event: "MISSING" })).toMatchObject({ ok: false, reason: "target-not-resolved" });
    expect(sim.send({ event: "SELF" })).toMatchObject({ ok: true, snapshot: { stateKey: "IDLE" } });
    expect(sim.send({ event: "DONE" })).toMatchObject({ ok: true, snapshot: { stateKey: "__RESOLVED" } });
    expect(sim.getAvailableTransitions()).toEqual([]);
    expect(sim.getSuggestedEmissions()).toEqual([]);
  });

  it("создает absorbing terminal pseudo-state даже без terminal state в IR", () => {
    const sim = createGraphSimulator(
      machine({
        id: "terminalFallback",
        initialState: "IDLE",
        states: [state("terminalFallback", "IDLE", { isInitial: true })],
        transitions: [transition({ machineId: "terminalFallback", source: "IDLE", event: "DONE", target: targetTerminal("__RESOLVED") })],
      }),
    );

    sim.start();

    expect(sim.send({ event: "DONE" })).toMatchObject({
      ok: true,
      snapshot: { stateId: "terminalFallback:state:__RESOLVED", stateKey: "__RESOLVED" },
    });
    expect(sim.getAvailableTransitions()).toEqual([]);
  });

  it("поддерживает все terminal targets как absorbing pseudo-states", () => {
    for (const terminal of ["__RESOLVED", "__REJECTED", "__CANCELLED"] as const) {
      const sim = createGraphSimulator(
        machine({
          id: `terminal${terminal}`,
          initialState: "IDLE",
          states: [state(`terminal${terminal}`, "IDLE", { isInitial: true })],
          transitions: [
            transition({ machineId: `terminal${terminal}`, source: "IDLE", event: "DONE", target: targetTerminal(terminal) }),
          ],
        }),
      );

      sim.start();

      expect(sim.send({ event: "DONE" })).toMatchObject({
        ok: true,
        snapshot: { stateId: `terminal${terminal}:state:${terminal}`, stateKey: terminal },
        step: { from: "IDLE", to: terminal },
      });
      expect(sim.getAvailableTransitions()).toEqual([]);
      expect(sim.getSuggestedEmissions()).toEqual([]);
      expect(sim.send({ event: "DONE" })).toMatchObject({ ok: false, reason: "event-not-accepted" });
    }
  });

  it("не применяет даже явные terminal-state transitions после terminal target", () => {
    const sim = createGraphSimulator(
      machine({
        id: "terminalExplicit",
        initialState: "IDLE",
        states: [
          state("terminalExplicit", "IDLE", { isInitial: true }),
          state("terminalExplicit", "__RESOLVED", { kind: "terminal", isPublicActorState: false }),
          state("terminalExplicit", "READY"),
        ],
        transitions: [
          transition({ machineId: "terminalExplicit", source: "IDLE", event: "DONE", target: targetTerminal("__RESOLVED") }),
          transition({ machineId: "terminalExplicit", source: "__RESOLVED", event: "WAKE", target: targetState("terminalExplicit", "READY") }),
        ],
      }),
    );

    sim.start();
    sim.send({ event: "DONE" });

    expect(sim.getAvailableTransitions()).toEqual([]);
    expect(sim.send({ event: "WAKE" })).toMatchObject({ ok: false, reason: "event-not-accepted" });
    expect(sim.getSnapshot()).toMatchObject({ stateKey: "__RESOLVED" });
  });
});

describe("GraphSimulator reducer branches", () => {
  it("сохраняет config acceptance и требует выбора неоднозначной reducer ветки", () => {
    const submitA = transition({
      machineId: "reducer",
      source: "IDLE",
      event: "SUBMIT",
      target: targetState("reducer", "VALID"),
      layer: "reducer",
      reducerCaseId: "case:valid",
      guardText: "action.payload.ok",
      order: 0,
    });
    const submitB = transition({
      machineId: "reducer",
      source: "IDLE",
      event: "SUBMIT",
      target: targetState("reducer", "INVALID"),
      layer: "reducer",
      reducerCaseId: "case:invalid",
      guardText: "!action.payload.ok",
      order: 1,
    });
    const sim = createGraphSimulator(
      machine({
        id: "reducer",
        initialState: "IDLE",
        states: [
          state("reducer", "IDLE", { isInitial: true }),
          state("reducer", "VALID"),
          state("reducer", "INVALID"),
          state("reducer", "DONE"),
        ],
        transitions: [
          transition({ machineId: "reducer", source: "IDLE", event: "SUBMIT", target: { kind: "self" } }),
          transition({ machineId: "reducer", source: "IDLE", event: "GHOST", target: { kind: "self" }, layer: "reducer" }),
          submitA,
          submitB,
          transition({ machineId: "reducer", source: "VALID", event: "FINISH", target: { kind: "self" } }),
          transition({
            machineId: "reducer",
            source: "VALID",
            event: "FINISH",
            target: targetState("reducer", "DONE"),
            layer: "reducer",
            reducerCaseId: "case:finish",
          }),
        ],
      }),
    );

    sim.start();
    expect(sim.getAvailableTransitions()).toMatchObject([
      {
        transitionId: submitA.id,
        acceptedTransitionId: "reducer:transition:config:IDLE:SUBMIT:0",
        effectiveTransitionId: submitA.id,
        layer: "reducer",
        reducerCaseId: "case:valid",
        guard: { text: "action.payload.ok" },
        canApply: true,
      },
      {
        transitionId: submitB.id,
        acceptedTransitionId: "reducer:transition:config:IDLE:SUBMIT:0",
        effectiveTransitionId: submitB.id,
        layer: "reducer",
        reducerCaseId: "case:invalid",
        guard: { text: "!action.payload.ok" },
        canApply: true,
      },
    ]);

    const sent = sim.send({ event: "SUBMIT" });
    expect(sent).toMatchObject({
      ok: false,
      reason: "ambiguous-transition",
    });
    expect(sent.ok ? [] : sent.candidates?.map((candidate) => candidate.acceptedTransitionId)).toEqual([
      "reducer:transition:config:IDLE:SUBMIT:0",
      "reducer:transition:config:IDLE:SUBMIT:0",
    ]);

    expect(sim.choose({ transitionId: submitA.id })).toMatchObject({
      ok: true,
      snapshot: { stateKey: "VALID" },
      step: {
        acceptedTransitionId: "reducer:transition:config:IDLE:SUBMIT:0",
        effectiveTransitionId: submitA.id,
        guard: "action.payload.ok",
      },
    });
    expect(sim.choose({ transitionId: submitB.id })).toMatchObject({ ok: false, reason: "unknown-transition" });
    expect(sim.send({ event: "FINISH" })).toMatchObject({
      ok: true,
      snapshot: { stateKey: "DONE" },
      step: {
        acceptedTransitionId: "reducer:transition:config:VALID:FINISH:0",
        effectiveTransitionId: "reducer:transition:reducer:VALID:FINISH:0",
      },
    });
  });

  it("применяет reducer branch поверх wildcard acceptance", () => {
    const sim = createGraphSimulator(
      machine({
        id: "wildReducer",
        initialState: "IDLE",
        states: [state("wildReducer", "*"), state("wildReducer", "IDLE", { isInitial: true }), state("wildReducer", "READY")],
        transitions: [
          transition({ machineId: "wildReducer", source: "*", event: "AUDIT", target: { kind: "self" } }),
          transition({
            machineId: "wildReducer",
            source: "*",
            event: "AUDIT",
            target: targetState("wildReducer", "READY"),
            layer: "reducer",
          }),
        ],
      }),
    );

    sim.start();

    expect(sim.send({ event: "AUDIT" })).toMatchObject({
      ok: true,
      snapshot: { stateKey: "READY" },
      step: {
        acceptedTransitionId: "wildReducer:transition:config:*:AUDIT:0",
        effectiveTransitionId: "wildReducer:transition:reducer:*:AUDIT:0",
      },
    });
  });

  it("игнорирует reducer branch с тем же event, но другим acceptance source", () => {
    const sim = createGraphSimulator(
      machine({
        id: "mismatchReducer",
        initialState: "IDLE",
        states: [
          state("mismatchReducer", "IDLE", { isInitial: true }),
          state("mismatchReducer", "READY"),
          state("mismatchReducer", "OTHER"),
        ],
        transitions: [
          transition({ machineId: "mismatchReducer", source: "IDLE", event: "GO", target: targetState("mismatchReducer", "READY") }),
          transition({
            machineId: "mismatchReducer",
            source: "READY",
            event: "GO",
            target: targetState("mismatchReducer", "OTHER"),
            layer: "reducer",
          }),
        ],
      }),
    );

    sim.start();

    expect(sim.getAvailableTransitions().map((candidate) => [candidate.transitionId, candidate.layer])).toEqual([
      ["mismatchReducer:transition:config:IDLE:GO:0", "config"],
    ]);
    expect(sim.send({ event: "GO" })).toMatchObject({
      ok: true,
      snapshot: { stateKey: "READY" },
      step: {
        acceptedTransitionId: "mismatchReducer:transition:config:IDLE:GO:0",
        effectiveTransitionId: "mismatchReducer:transition:config:IDLE:GO:0",
      },
    });
  });
});

describe("GraphSimulator transaction pipeline", () => {
  it("не мутирует snapshot при ambiguity и отклоняет stale choose", () => {
    const goA = transition({ machineId: "txAmbiguous", source: "IDLE", event: "GO", target: targetState("txAmbiguous", "A") });
    const goB = transition({
      machineId: "txAmbiguous",
      source: "IDLE",
      event: "GO",
      target: targetState("txAmbiguous", "B"),
      order: 1,
    });
    const sim = createGraphSimulator(
      machine({
        id: "txAmbiguous",
        initialState: "IDLE",
        states: [
          state("txAmbiguous", "IDLE", { isInitial: true }),
          state("txAmbiguous", "A"),
          state("txAmbiguous", "B"),
        ],
        transitions: [goA, goB],
      }),
    );

    sim.start();

    expect(sim.send({ event: "GO" })).toMatchObject({
      ok: false,
      reason: "ambiguous-transition",
      candidates: [{ transitionId: goA.id }, { transitionId: goB.id }],
    });
    expect(sim.getSnapshot()).toMatchObject({ stateKey: "IDLE", history: [] });
    expect(sim.choose({ transitionId: goA.id })).toMatchObject({ ok: true, snapshot: { stateKey: "A" } });
    expect(sim.choose({ transitionId: goB.id })).toMatchObject({ ok: false, reason: "unknown-transition" });
  });

  it("возвращает одинаковые controlled failures для unresolved и blocked target", () => {
    const sim = createGraphSimulator(
      machine({
        id: "txFailures",
        initialState: "IDLE",
        states: [state("txFailures", "IDLE", { isInitial: true }), state("txFailures", "READY")],
        transitions: [
          transition({ machineId: "txFailures", source: "IDLE", event: "START", target: targetState("txFailures", "READY") }),
          transition({ machineId: "txFailures", source: "READY", event: "DYN", target: { kind: "dynamic", label: "runtime" } }),
          transition({ machineId: "txFailures", source: "READY", event: "STOP", target: { kind: "blocked", reason: "manual" } }),
        ],
        emissions: [
          emission({ machineId: "txFailures", source: "READY", event: "DYN" }),
          emission({ machineId: "txFailures", source: "READY", event: "STOP" }),
        ],
      }),
    );

    sim.start();
    sim.send({ event: "START" });

    expect(sim.send({ event: "DYN" })).toMatchObject({ ok: false, reason: "target-not-resolved" });
    expect(sim.choose({ transitionId: "txFailures:transition:config:READY:DYN:0" })).toMatchObject({
      ok: false,
      reason: "target-not-resolved",
    });
    expect(sim.followEmission({ emissionId: "txFailures:emission:READY:DYN" })).toMatchObject({
      ok: false,
      reason: "target-not-resolved",
      emission: { emissionId: "txFailures:emission:READY:DYN" },
    });
    expect(sim.send({ event: "STOP" })).toMatchObject({ ok: false, reason: "blocked-target" });
    expect(sim.choose({ transitionId: "txFailures:transition:config:READY:STOP:0" })).toMatchObject({
      ok: false,
      reason: "blocked-target",
    });
    expect(sim.followEmission({ emissionId: "txFailures:emission:READY:STOP" })).toMatchObject({
      ok: false,
      reason: "blocked-target",
      emission: { emissionId: "txFailures:emission:READY:STOP" },
    });
    expect(sim.getSnapshot()).toMatchObject({ stateKey: "READY", history: [{ event: "START" }] });
  });

  it("возвращает suggested emissions из committed snapshot для send и follow", () => {
    const sim = createGraphSimulator(
      machine({
        id: "txSuggestions",
        initialState: "IDLE",
        states: [
          state("txSuggestions", "IDLE", { isInitial: true }),
          state("txSuggestions", "READY"),
          state("txSuggestions", "DONE"),
        ],
        transitions: [
          transition({ machineId: "txSuggestions", source: "IDLE", event: "START", target: targetState("txSuggestions", "READY") }),
          transition({ machineId: "txSuggestions", source: "READY", event: "CONTINUE", target: targetState("txSuggestions", "DONE") }),
        ],
        emissions: [
          emission({ machineId: "txSuggestions", source: "READY", event: "CONTINUE" }),
          emission({ machineId: "txSuggestions", source: "DONE", event: "AUDIT" }),
        ],
      }),
    );

    sim.start();

    expect(sim.send({ event: "START" })).toMatchObject({
      ok: true,
      snapshot: { stateKey: "READY" },
      suggestedEmissions: [{ emissionId: "txSuggestions:emission:READY:CONTINUE" }],
    });
    expect(sim.followEmission({ emissionId: "txSuggestions:emission:READY:CONTINUE" })).toMatchObject({
      ok: true,
      snapshot: { stateKey: "DONE" },
      step: { cause: "effect", emissionId: "txSuggestions:emission:READY:CONTINUE" },
      suggestedEmissions: [{ emissionId: "txSuggestions:emission:DONE:AUDIT" }],
    });
  });
});

describe("GraphSimulator emissions", () => {
  it("показывает suggested emissions после transition и follow-ит только local default routing", () => {
    const sim = createGraphSimulator(
      machine({
        id: "effects",
        initialState: "IDLE",
        states: [
          state("effects", "*"),
          state("effects", "IDLE", { isInitial: true }),
          state("effects", "B"),
          state("effects", "C"),
          state("effects", "X"),
        ],
        transitions: [
          transition({ machineId: "effects", source: "*", event: "AUDIT", target: { kind: "self" } }),
          transition({ machineId: "effects", source: "IDLE", event: "START", target: targetState("effects", "B") }),
          transition({ machineId: "effects", source: "B", event: "GO_C", target: targetState("effects", "C") }),
          transition({ machineId: "effects", source: "B", event: "DYN", target: { kind: "dynamic", label: "runtime" } }),
          transition({ machineId: "effects", source: "B", event: "STOP", target: { kind: "blocked", reason: "manual" } }),
          transition({ machineId: "effects", source: "B", event: "DECIDE", target: { kind: "self" } }),
          transition({
            machineId: "effects",
            source: "B",
            event: "DECIDE",
            target: targetState("effects", "C"),
            layer: "reducer",
            order: 0,
          }),
          transition({
            machineId: "effects",
            source: "B",
            event: "DECIDE",
            target: targetState("effects", "X"),
            layer: "reducer",
            order: 1,
          }),
        ],
        emissions: [
          emission({ machineId: "effects", source: "B", event: "GO_C", guardText: "ok" }),
          emission({ machineId: "effects", source: "B", event: "NOPE" }),
          emission({ machineId: "effects", source: "B", event: "DYN" }),
          emission({ machineId: "effects", source: "B", event: "STOP" }),
          emission({
            machineId: "effects",
            source: "B",
            event: "REMOTE",
            routing: { kind: "actor", target: { kind: "literal", value: "actor-1" } },
          }),
          emission({ machineId: "effects", source: "B", event: "DECIDE" }),
          emission({ machineId: "effects", source: "*", event: "AUDIT" }),
        ],
      }),
    );

    sim.start();
    expect(sim.getSuggestedEmissions()).toEqual([]);
    expect(sim.send({ event: "START" })).toMatchObject({ ok: true, snapshot: { stateKey: "B" } });
    expect(sim.getSuggestedEmissions().map((candidate) => [candidate.event.type, candidate.canFollowLocally, candidate.blockedReason])).toEqual([
      ["GO_C", true, undefined],
      ["NOPE", false, "event-not-accepted"],
      ["DYN", true, undefined],
      ["STOP", true, undefined],
      ["REMOTE", false, "non-local-routing"],
      ["DECIDE", true, undefined],
    ]);
    expect(sim.followEmission({ emissionId: "effects:emission:B:NOPE" })).toMatchObject({
      ok: false,
      reason: "event-not-accepted",
      emission: { emissionId: "effects:emission:B:NOPE" },
    });
    expect(sim.followEmission({ emissionId: "effects:emission:B:REMOTE" })).toMatchObject({
      ok: false,
      reason: "non-local-routing",
      emission: { emissionId: "effects:emission:B:REMOTE" },
    });
    expect(sim.followEmission({ emissionId: "effects:emission:B:DYN" })).toMatchObject({
      ok: false,
      reason: "target-not-resolved",
      emission: { emissionId: "effects:emission:B:DYN" },
    });
    expect(sim.followEmission({ emissionId: "effects:emission:B:STOP" })).toMatchObject({
      ok: false,
      reason: "blocked-target",
      emission: { emissionId: "effects:emission:B:STOP" },
    });
    expect(sim.followEmission({ emissionId: "effects:emission:B:DECIDE" })).toMatchObject({
      ok: false,
      reason: "ambiguous-transition",
      emission: { emissionId: "effects:emission:B:DECIDE" },
      candidates: [{ transitionId: "effects:transition:reducer:B:DECIDE:0" }, { transitionId: "effects:transition:reducer:B:DECIDE:1" }],
    });
    expect(sim.getSnapshot()).toMatchObject({ stateKey: "B", history: [{ event: "START" }] });
    expect(sim.followEmission({ emissionId: "effects:emission:B:GO_C" })).toMatchObject({
      ok: true,
      snapshot: { stateKey: "C" },
      step: { cause: "effect", emissionId: "effects:emission:B:GO_C", from: "B", to: "C" },
      suggestedEmissions: [{ emissionId: "effects:emission:*:AUDIT" }],
    });
    expect(sim.followEmission({ emissionId: "effects:emission:B:GO_C" })).toMatchObject({
      ok: false,
      reason: "unknown-emission",
    });
  });

  it("для self transition предлагает wildcard effect вместо state-specific effect", () => {
    const sim = createGraphSimulator(
      machine({
        id: "selfEffects",
        initialState: "IDLE",
        states: [state("selfEffects", "*"), state("selfEffects", "IDLE", { isInitial: true })],
        transitions: [transition({ machineId: "selfEffects", source: "IDLE", event: "PING", target: { kind: "self" } })],
        emissions: [
          emission({ machineId: "selfEffects", source: "IDLE", event: "LOCAL" }),
          emission({ machineId: "selfEffects", source: "*", event: "AUDIT" }),
        ],
      }),
    );

    sim.start();
    sim.send({ event: "PING" });

    expect(sim.getSuggestedEmissions().map((candidate) => candidate.emissionId)).toEqual(["selfEffects:emission:*:AUDIT"]);
  });

  it("поддерживает wildcard source ref в emissions и игнорирует emissions не из текущего state", () => {
    const sim = createGraphSimulator(
      machine({
        id: "emissionSources",
        initialState: "IDLE",
        states: [state("emissionSources", "IDLE", { isInitial: true }), state("emissionSources", "READY")],
        transitions: [transition({ machineId: "emissionSources", source: "IDLE", event: "PING", target: { kind: "self" } })],
        emissions: [
          emission({ machineId: "emissionSources", source: "READY", event: "READY_ONLY" }),
          {
            ...emission({ machineId: "emissionSources", source: "IDLE", event: "UNKNOWN_SOURCE" }),
            sourceState: { kind: "unknown", label: "computed" },
          },
          {
            ...emission({ machineId: "emissionSources", source: "*", event: "AUDIT" }),
            sourceState: { kind: "wildcard" },
          },
        ],
      }),
    );

    sim.start();
    sim.send({ event: "PING" });

    expect(sim.getSuggestedEmissions().map((candidate) => candidate.emissionId)).toEqual([
      "emissionSources:emission:*:AUDIT",
    ]);
  });

  it("маркирует все non-default routing emissions как non-local", () => {
    const routings: GraphRouting[] = [
      { kind: "unscoped" },
      { kind: "group", target: { kind: "literal", value: "group-1" } },
      { kind: "tag", target: { kind: "literal", value: "workers" } },
      { kind: "unknown", label: "runtime" },
    ];
    const sim = createGraphSimulator(
      machine({
        id: "routing",
        initialState: "IDLE",
        states: [state("routing", "IDLE", { isInitial: true }), state("routing", "READY")],
        transitions: [
          transition({ machineId: "routing", source: "IDLE", event: "START", target: targetState("routing", "READY") }),
          transition({ machineId: "routing", source: "READY", event: "LOCAL", target: { kind: "self" } }),
        ],
        emissions: routings.map((routing, index) =>
          emission({ machineId: "routing", source: "READY", event: "LOCAL", routing, guardText: `branch-${index}` }),
        ),
      }),
    );

    sim.start();
    sim.send({ event: "START" });

    expect(sim.getSuggestedEmissions().map((candidate) => [
      candidate.routing.kind,
      candidate.canFollowLocally,
      candidate.blockedReason,
      candidate.guard?.text,
    ])).toEqual([
      ["unscoped", false, "non-local-routing", "branch-0"],
      ["group", false, "non-local-routing", "branch-1"],
      ["tag", false, "non-local-routing", "branch-2"],
      ["unknown", false, "non-local-routing", "branch-3"],
    ]);

    for (const candidate of sim.getSuggestedEmissions()) {
      expect(sim.followEmission({ emissionId: candidate.emissionId })).toMatchObject({
        ok: false,
        reason: "non-local-routing",
        emission: { emissionId: candidate.emissionId },
      });
    }
  });
});

describe("GraphSimulator actor templates", () => {
  it("стартует actor template из __INIT и не применяет wildcard до spawn", () => {
    const sim = createGraphSimulator(
      machine({
        id: "actor",
        kind: "actorTemplate",
        initialState: "__INIT",
        states: [
          state("actor", "*"),
          state("actor", "__INIT", { kind: "init", isInitial: true, isPublicActorState: false }),
          state("actor", "RUNNING"),
          state("actor", "__RESOLVED", { kind: "terminal", isPublicActorState: false }),
        ],
        transitions: [
          transition({ machineId: "actor", source: "*", event: "FORCE_CANCEL", target: targetTerminal("__RESOLVED") }),
          transition({ machineId: "actor", source: "__INIT", event: "SPAWN", target: targetState("actor", "RUNNING") }),
          transition({ machineId: "actor", source: "RUNNING", event: "COMPLETE", target: targetTerminal("__RESOLVED") }),
        ],
        emissions: [emission({ machineId: "actor", source: "*", event: "FORCE_CANCEL" })],
      }),
    );

    expect(sim.start()).toMatchObject({ ok: true, snapshot: { stateKey: "__INIT" } });
    expect(sim.getAvailableTransitions().map((candidate) => candidate.event.type)).toEqual(["SPAWN"]);
    expect(sim.getSuggestedEmissions()).toEqual([]);
    expect(sim.send({ event: "FORCE_CANCEL" })).toMatchObject({ ok: false, reason: "event-not-accepted" });
    expect(sim.send({ event: "SPAWN" })).toMatchObject({ ok: true, snapshot: { stateKey: "RUNNING" } });
    expect(sim.send({ event: "COMPLETE" })).toMatchObject({ ok: true, snapshot: { stateKey: "__RESOLVED" } });
    expect(sim.getAvailableTransitions()).toEqual([]);
  });

  it("не предлагает wildcard emissions после явного self transition в actor __INIT", () => {
    const sim = createGraphSimulator(
      machine({
        id: "initEffect",
        kind: "actorTemplate",
        initialState: "__INIT",
        states: [
          state("initEffect", "*"),
          state("initEffect", "__INIT", { kind: "init", isInitial: true, isPublicActorState: false }),
        ],
        transitions: [transition({ machineId: "initEffect", source: "__INIT", event: "POKE", target: { kind: "self" } })],
        emissions: [emission({ machineId: "initEffect", source: "*", event: "AUDIT" })],
      }),
    );

    sim.start();
    expect(sim.send({ event: "POKE" })).toMatchObject({ ok: true, snapshot: { stateKey: "__INIT" } });
    expect(sim.getSuggestedEmissions()).toEqual([]);
  });

  it("поддерживает activeActor startState и выводит единственный public target из __INIT", () => {
    const actor = machine({
      id: "active",
      kind: "actorTemplate",
      initialState: "__INIT",
      states: [
        state("active", "__INIT", { kind: "init", isInitial: true, isPublicActorState: false }),
        state("active", "RUNNING"),
      ],
      transitions: [transition({ machineId: "active", source: "__INIT", event: "SPAWN", target: targetState("active", "RUNNING") })],
    });

    expect(createGraphSimulator(actor, { actorMode: "activeActor", startState: "RUNNING" }).start()).toMatchObject({
      ok: true,
      snapshot: { stateKey: "RUNNING" },
    });
    expect(createGraphSimulator(actor, { actorMode: "activeActor" }).start()).toMatchObject({
      ok: true,
      snapshot: { stateKey: "RUNNING" },
    });
    expect(createGraphSimulator(actor, { actorMode: "activeActor", startState: "MISSING" }).start()).toMatchObject({
      ok: false,
      reason: "unknown-start-state",
    });
    expect(createGraphSimulator(actor, { actorMode: "spawnLifecycle", startState: "RUNNING" }).start()).toMatchObject({
      ok: true,
      snapshot: { stateKey: "__INIT" },
    });

    const duplicateTarget = machine({
      id: "duplicateTarget",
      kind: "actorTemplate",
      initialState: "__INIT",
      states: [
        state("duplicateTarget", "__INIT", { kind: "init", isInitial: true, isPublicActorState: false }),
        state("duplicateTarget", "RUNNING"),
      ],
      transitions: [
        transition({ machineId: "duplicateTarget", source: "__INIT", event: "SPAWN_A", target: targetState("duplicateTarget", "RUNNING") }),
        transition({ machineId: "duplicateTarget", source: "__INIT", event: "SPAWN_B", target: targetState("duplicateTarget", "RUNNING") }),
      ],
    });

    expect(createGraphSimulator(duplicateTarget, { actorMode: "activeActor" }).start()).toMatchObject({
      ok: true,
      snapshot: { stateKey: "RUNNING" },
    });
  });

  it("отклоняет activeActor startState для init, terminal и private states", () => {
    const actor = machine({
      id: "activeInvalid",
      kind: "actorTemplate",
      initialState: "__INIT",
      states: [
        state("activeInvalid", "*", { kind: "wildcard", isPublicActorState: true }),
        state("activeInvalid", "__INIT", { kind: "init", isInitial: true, isPublicActorState: false }),
        state("activeInvalid", "PRIVATE", { isPublicActorState: false }),
        state("activeInvalid", "__RESOLVED", { kind: "terminal", isPublicActorState: false }),
        state("activeInvalid", "__REJECTED", { isPublicActorState: true }),
        state("activeInvalid", "MYSTERY", { kind: "unknown", isPublicActorState: true }),
        state("activeInvalid", "RUNNING"),
      ],
      transitions: [transition({ machineId: "activeInvalid", source: "__INIT", event: "SPAWN", target: targetState("activeInvalid", "RUNNING") })],
    });

    for (const startState of ["*", "__INIT", "PRIVATE", "__RESOLVED", "__REJECTED", "MYSTERY"]) {
      expect(createGraphSimulator(actor, { actorMode: "activeActor", startState }).start()).toMatchObject({
        ok: false,
        reason: "unknown-start-state",
      });
    }
  });

  it("возвращает controlled failures для ambiguous и missing activeActor start", () => {
    const ambiguous = machine({
      id: "ambiguous",
      kind: "actorTemplate",
      initialState: "__INIT",
      states: [
        state("ambiguous", "__INIT", { kind: "init", isInitial: true, isPublicActorState: false }),
        state("ambiguous", "A"),
        state("ambiguous", "B"),
      ],
      transitions: [
        transition({ machineId: "ambiguous", source: "__INIT", event: "SPAWN_A", target: targetState("ambiguous", "A") }),
        transition({ machineId: "ambiguous", source: "__INIT", event: "SPAWN_B", target: targetState("ambiguous", "B") }),
      ],
    });
    const missing = machine({
      id: "missingActive",
      kind: "actorTemplate",
      initialState: "__INIT",
      states: [state("missingActive", "__INIT", { kind: "init", isInitial: true, isPublicActorState: false })],
      transitions: [
        transition({
          machineId: "missingActive",
          source: "__INIT",
          event: "SPAWN",
          target: targetState("missingActive", "GONE"),
        }),
        transition({
          machineId: "missingActive",
          source: "__INIT",
          event: "SPAWN_DYNAMIC",
          target: { kind: "dynamic", label: "runtime" },
        }),
      ],
    });
    const brokenInit = machine({
      id: "brokenInit",
      kind: "actorTemplate",
      initialState: "__INIT",
      states: [state("brokenInit", "RUNNING")],
    });

    expect(createGraphSimulator(ambiguous, { actorMode: "activeActor" }).start()).toMatchObject({
      ok: false,
      reason: "ambiguous-active-actor-start",
      candidates: [{ key: "A" }, { key: "B" }],
    });
    expect(createGraphSimulator(missing, { actorMode: "activeActor" }).start()).toMatchObject({
      ok: false,
      reason: "missing-active-actor-start",
    });
    expect(createGraphSimulator(brokenInit).start()).toMatchObject({
      ok: false,
      reason: "unknown-start-state",
    });
    expect(createGraphSimulator(brokenInit, { actorMode: "activeActor" }).start()).toMatchObject({
      ok: false,
      reason: "unknown-start-state",
    });
  });

  it("не выводит activeActor start из private, terminal, self и unresolved __INIT targets", () => {
    const actor = machine({
      id: "nonPublicInitTargets",
      kind: "actorTemplate",
      initialState: "__INIT",
      states: [
        state("nonPublicInitTargets", "__INIT", { kind: "init", isInitial: true, isPublicActorState: false }),
        state("nonPublicInitTargets", "PRIVATE", { isPublicActorState: false }),
        state("nonPublicInitTargets", "__RESOLVED", { kind: "terminal", isPublicActorState: false }),
      ],
      transitions: [
        transition({
          machineId: "nonPublicInitTargets",
          source: "__INIT",
          event: "SELF",
          target: { kind: "self" },
        }),
        transition({
          machineId: "nonPublicInitTargets",
          source: "__INIT",
          event: "PRIVATE",
          target: targetState("nonPublicInitTargets", "PRIVATE"),
        }),
        transition({
          machineId: "nonPublicInitTargets",
          source: "__INIT",
          event: "DONE",
          target: targetTerminal("__RESOLVED"),
        }),
        transition({
          machineId: "nonPublicInitTargets",
          source: "__INIT",
          event: "DONE_MISSING",
          target: targetTerminal("__REJECTED"),
        }),
        transition({
          machineId: "nonPublicInitTargets",
          source: "__INIT",
          event: "DYNAMIC",
          target: { kind: "dynamic", label: "runtime" },
        }),
      ],
    });

    expect(createGraphSimulator(actor, { actorMode: "activeActor" }).start()).toMatchObject({
      ok: false,
      reason: "missing-active-actor-start",
      candidates: [],
      diagnostics: [{ code: "LFG_SIM_MISSING_ACTIVE_ACTOR_START" }],
    });
  });
});

describe("GraphSimulator fixture scenarios", () => {
  it("проходит несколько compiled fixture machines", () => {
    const direct = createGraphSimulator(getFixtureMachine("directObjectMachine"));
    direct.start();
    expect(direct.send({ event: "START" })).toMatchObject({ ok: true, snapshot: { stateKey: "READY" } });

    const wildcard = createGraphSimulator(getFixtureMachine("wildcardMachine"));
    wildcard.start();
    expect(wildcard.send({ event: "LOGOUT" })).toMatchObject({ ok: true, snapshot: { stateKey: "SIGNED_OUT" } });

    const switchReducer = createGraphSimulator(getFixtureMachine("switchReducerMachine"));
    switchReducer.start();
    expect(switchReducer.send({ event: "SUBMIT" })).toMatchObject({ ok: false, reason: "ambiguous-transition" });

    const plainEffects = createGraphSimulator(getFixtureMachine("plainEffectsMachine"));
    plainEffects.start();
    plainEffects.send({ event: "START" });
    expect(plainEffects.getSuggestedEmissions().map((candidate) => candidate.event.type)).toEqual(["RESOLVE", "REJECT"]);

    const wildcardEffect = createGraphSimulator(getFixtureMachine("wildcardEffectMachine"));
    wildcardEffect.start();
    wildcardEffect.send({ event: "PING" });
    expect(wildcardEffect.getSuggestedEmissions().map((candidate) => candidate.event.type)).toEqual(["PONG", "AUDIT_RESET"]);

    const actor = createGraphSimulator(getFixtureMachine("actorTemplate"));
    actor.start();
    expect(actor.getAvailableTransitions().map((candidate) => candidate.event.type)).toEqual(["SPAWN_JOB"]);

    const actorWildcard = createGraphSimulator(getFixtureMachine("actorWildcardEffectTemplate"));
    actorWildcard.start();
    actorWildcard.send({ event: "SPAWN_TASK" });
    expect(actorWildcard.getSuggestedEmissions().map((candidate) => candidate.event.type)).toEqual(["HEARTBEAT", "COMPLETE", "ABORT_TASK"]);
  });
});
