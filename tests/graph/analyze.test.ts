import { describe, expect, it } from "vitest";
import {
  analyzeLiteFsmGraph,
  compileLiteFsmGraph,
  type GraphAnalysisRuleId,
  type GraphDiagnostic,
  type GraphEmission,
  type GraphReducerCase,
  type GraphRouting,
  type GraphState,
  type GraphStateRef,
  type GraphTarget,
  type GraphTransition,
  type LiteFsmGraphDocument,
  type LiteFsmGraphMachine,
  type LiteFsmGraphManager,
  type SourceLocation,
} from "@lite-fsm/graph";
import { createGraphAnalysisIndex } from "../../packages/graph/src/analyzer/indexes";
import { fullAssemblerFilename, fullAssemblerSource } from "./fixtures/graph-sources";

const loc = (offset: number): SourceLocation => ({
  start: { line: 1, column: offset + 1, offset },
  end: { line: 1, column: offset + 2, offset: offset + 1 },
});

const stateId = (machineId: string, key: string): string => `${machineId}:state:${key}`;

const state = (
  machineId: string,
  key: string,
  options: Partial<Omit<GraphState, "id" | "key">> = {},
): GraphState => ({
  id: stateId(machineId, key),
  key,
  kind: options.kind ?? "normal",
  isInitial: options.isInitial ?? false,
  isPublicActorState: options.isPublicActorState ?? true,
  loc: options.loc,
});

const sourceRef = (machineId: string, source: string | GraphStateRef): GraphStateRef => {
  if (typeof source !== "string") return source;
  if (source === "*") return { kind: "wildcard" };

  return { kind: "state", stateId: stateId(machineId, source) };
};

const targetState = (machineId: string, key: string): GraphTarget => ({ kind: "state", stateId: stateId(machineId, key) });
const targetUnknown = (label?: string): GraphTarget => ({ kind: "unknown", label });
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
  order?: number;
  loc?: SourceLocation;
}): GraphTransition => {
  const layer = input.layer ?? "config";

  return {
    id: `${input.machineId}:transition:${layer}:${input.event}:${input.order ?? 0}`,
    machineId: input.machineId,
    source: sourceRef(input.machineId, input.source),
    event: { type: input.event, source: layer },
    target: input.target,
    layer,
    order: input.order ?? 0,
    confidence: "exact",
    loc: input.loc,
  };
};

const reducerCase = (input: {
  event: string;
  targets: GraphTarget[];
  writesState?: boolean;
  loc?: SourceLocation;
}): GraphReducerCase => ({
  id: `reducer:${input.event}`,
  event: { type: input.event, source: "reducer" },
  writesState: input.writesState ?? true,
  targets: input.targets,
  confidence: "exact",
  loc: input.loc,
});

const emission = (input: {
  machineId: string;
  source: string | "*";
  event: string;
  routing?: GraphRouting;
  loc?: SourceLocation;
}): GraphEmission => ({
  id: `${input.machineId}:emission:${input.source}:${input.event}`,
  machineId: input.machineId,
  sourceState: input.source === "*" ? "*" : sourceRef(input.machineId, input.source),
  event: { type: input.event, source: "effect" },
  routing: input.routing ?? { kind: "default" },
  origin: "effect",
  confidence: "exact",
  loc: input.loc,
});

const machine = (input: {
  id: string;
  initialState?: string;
  kind?: LiteFsmGraphMachine["kind"];
  managerKeys?: string[];
  states: GraphState[];
  transitions?: GraphTransition[];
  reducerCases?: GraphReducerCase[];
  emissions?: GraphEmission[];
  loc?: SourceLocation;
}): LiteFsmGraphMachine => ({
  id: input.id,
  index: 0,
  managerKeys: input.managerKeys ?? [],
  kind: input.kind ?? "domain",
  initialState: input.initialState,
  states: input.states,
  transitions: input.transitions ?? [],
  reducerCases: input.reducerCases ?? [],
  emissions: input.emissions ?? [],
  diagnostics: [],
  loc: input.loc,
});

const documentOf = (
  machines: LiteFsmGraphMachine[],
  managers: LiteFsmGraphManager[] = [],
  diagnostics: GraphDiagnostic[] = [],
): LiteFsmGraphDocument => ({
  version: "lite-fsm.graph/v1",
  source: { language: "ts" },
  machines: machines.map((item, index) => ({ ...item, index })),
  managers,
  diagnostics,
});

const diagnosticRows = (diagnostics: readonly GraphDiagnostic[]): Array<[string, GraphDiagnostic["severity"], string | undefined]> => {
  return diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.severity, diagnostic.machineId]);
};

const codes = (diagnostics: readonly GraphDiagnostic[]): string[] => diagnostics.map((diagnostic) => diagnostic.code);

const defaultRules: GraphAnalysisRuleId[] = [
  "unknown-target",
  "unreachable-state",
  "dead-end-state",
  "actor-template-shape",
  "reducer-config-consistency",
  "effect-event-acceptance",
  "wildcard-shadowing",
];

const semanticFixture = (): LiteFsmGraphDocument => {
  const flow = machine({
    id: "flow",
    initialState: "IDLE",
    states: [
      state("flow", "IDLE", { isInitial: true, loc: loc(1) }),
      state("flow", "READY", { loc: loc(2) }),
      state("flow", "UNUSED", { loc: loc(3) }),
    ],
    transitions: [
      transition({ machineId: "flow", source: "IDLE", event: "START", target: targetState("flow", "READY"), loc: loc(10) }),
      transition({ machineId: "flow", source: "READY", event: "BROKEN", target: targetUnknown("MISSING"), loc: loc(11) }),
      transition({ machineId: "flow", source: "*", event: "RESET", target: targetState("flow", "IDLE"), loc: loc(12) }),
      transition({ machineId: "flow", source: "IDLE", event: "RESET", target: targetState("flow", "READY"), loc: loc(13) }),
      transition({ machineId: "flow", source: "IDLE", event: "TRACE", target: { kind: "self" }, layer: "reducer", loc: loc(14) }),
    ],
    reducerCases: [
      reducerCase({ event: "UNDECLARED", targets: [targetState("flow", "READY")], loc: loc(20) }),
      reducerCase({ event: "START", targets: [targetUnknown("NOWHERE")], loc: loc(21) }),
      reducerCase({ event: "IGNORED", targets: [targetUnknown("IGNORED")], writesState: false, loc: loc(22) }),
    ],
    emissions: [emission({ machineId: "flow", source: "READY", event: "UNHANDLED", loc: loc(30) })],
  });
  const dead = machine({
    id: "dead",
    initialState: "IDLE",
    states: [
      state("dead", "IDLE", { isInitial: true, loc: loc(40) }),
      state("dead", "DONE", { loc: loc(41) }),
      state("dead", "LOST", { loc: loc(42) }),
    ],
    transitions: [
      transition({ machineId: "dead", source: "IDLE", event: "FINISH", target: targetState("dead", "DONE"), loc: loc(43) }),
    ],
  });
  const actorMissingInit = machine({
    id: "actorMissingInit",
    kind: "actorTemplate",
    initialState: "RUNNING",
    loc: loc(50),
    states: [
      state("actorMissingInit", "RUNNING", { isInitial: true, loc: loc(51) }),
      state("actorMissingInit", "__RESOLVED", {
        kind: "terminal",
        isPublicActorState: true,
        loc: loc(52),
      }),
    ],
    transitions: [
      transition({
        machineId: "actorMissingInit",
        source: "__RESOLVED",
        event: "AGAIN",
        target: targetState("actorMissingInit", "RUNNING"),
        loc: loc(53),
      }),
    ],
  });
  const actorNoExit = machine({
    id: "actorNoExit",
    kind: "actorTemplate",
    initialState: "__INIT",
    states: [state("actorNoExit", "__INIT", { kind: "init", isPublicActorState: false, loc: loc(60) })],
  });

  return documentOf([flow, dead, actorMissingInit, actorNoExit]);
};

describe("analyzeLiteFsmGraph", () => {
  it("запускает все v1 rules поверх IR и не мутирует document", () => {
    const document = semanticFixture();
    const before = JSON.stringify(document);
    const result = analyzeLiteFsmGraph(document);

    expect(JSON.stringify(document)).toBe(before);
    expect(diagnosticRows(result.diagnostics)).toEqual(
      expect.arrayContaining([
        ["LFG_ANALYZER_UNKNOWN_TARGET", "warning", "flow"],
        ["LFG_ANALYZER_UNREACHABLE_STATE", "warning", "flow"],
        ["LFG_ANALYZER_DEAD_END_STATE", "info", "dead"],
        ["LFG_ANALYZER_ACTOR_TEMPLATE_SHAPE", "error", "actorMissingInit"],
        ["LFG_ANALYZER_ACTOR_TEMPLATE_SHAPE", "warning", "actorMissingInit"],
        ["LFG_ANALYZER_ACTOR_TEMPLATE_SHAPE", "warning", "actorNoExit"],
        ["LFG_ANALYZER_REDUCER_CONFIG_CONSISTENCY", "warning", "flow"],
        ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "info", "flow"],
        ["LFG_ANALYZER_WILDCARD_SHADOWING", "info", "flow"],
      ]),
    );
    expect(result.diagnostics.every((diagnostic) => diagnostic.code.startsWith("LFG_ANALYZER_"))).toBe(true);
    expect(result.diagnostics[0]?.loc?.start.offset).toBe(3);
  });

  it("уважает allow-list rules и explicit document scope", () => {
    const result = analyzeLiteFsmGraph(semanticFixture(), {
      rules: ["wildcard-shadowing"],
      scope: { kind: "document" },
    });
    const disabled = analyzeLiteFsmGraph(semanticFixture(), { rules: [] });

    expect(codes(result.diagnostics)).toEqual(["LFG_ANALYZER_WILDCARD_SHADOWING"]);
    expect(result.diagnostics[0]?.message).toBe("State 'IDLE' overrides wildcard event 'RESET'.");
    expect(disabled.diagnostics).toEqual([]);
  });

  it("поддерживает strict severity и missing scopes без throw", () => {
    const strict = analyzeLiteFsmGraph(semanticFixture(), {
      strict: true,
      rules: ["dead-end-state", "effect-event-acceptance"],
    });
    const missingMachine = analyzeLiteFsmGraph(semanticFixture(), { scope: { kind: "machine", machineId: "missing" } });
    const missingManager = analyzeLiteFsmGraph(semanticFixture(), { scope: { kind: "manager", managerId: "missing" } });

    expect(diagnosticRows(strict.diagnostics)).toEqual(
      expect.arrayContaining([
        ["LFG_ANALYZER_DEAD_END_STATE", "warning", "dead"],
        ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "warning", "flow"],
      ]),
    );
    expect(missingMachine.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_ANALYZER_SCOPE_NOT_FOUND",
        message: "No machine matches analyzer scope 'missing'.",
      }),
    ]);
    expect(missingManager.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_ANALYZER_SCOPE_NOT_FOUND",
        message: "No manager matches analyzer scope 'missing'.",
      }),
    ]);
  });

  it("ограничивает effect acceptance по machine и manager scope", () => {
    const sender = machine({
      id: "sender",
      initialState: "IDLE",
      states: [state("sender", "IDLE", { isInitial: true })],
      emissions: [
        emission({ machineId: "sender", source: "IDLE", event: "REMOTE" }),
        emission({
          machineId: "sender",
          source: "IDLE",
          event: "ROUTED",
          routing: { kind: "actor", target: { kind: "literal", value: "receiver-1" } },
        }),
        emission({
          machineId: "sender",
          source: "IDLE",
          event: "GROUPED",
          routing: {
            kind: "group",
            target: { kind: "array", items: [{ kind: "literal", value: "a" }, { kind: "literal", value: "b" }] },
          },
        }),
        emission({
          machineId: "sender",
          source: "IDLE",
          event: "TAGGED",
          routing: { kind: "tag", target: { kind: "selfField", field: "groupTag" } },
        }),
        emission({ machineId: "sender", source: "IDLE", event: "ANYWHERE", routing: { kind: "unscoped" } }),
      ],
    });
    const receiver = machine({
      id: "receiver",
      initialState: "IDLE",
      states: [state("receiver", "IDLE", { isInitial: true }), state("receiver", "READY")],
      transitions: [
        transition({ machineId: "receiver", source: "IDLE", event: "REMOTE", target: targetState("receiver", "READY") }),
        transition({ machineId: "receiver", source: "IDLE", event: "ROUTED", target: targetState("receiver", "READY") }),
        transition({ machineId: "receiver", source: "IDLE", event: "GROUPED", target: targetState("receiver", "READY") }),
        transition({ machineId: "receiver", source: "IDLE", event: "TAGGED", target: targetState("receiver", "READY") }),
        transition({ machineId: "receiver", source: "IDLE", event: "ANYWHERE", target: targetState("receiver", "READY") }),
      ],
    });
    const document = documentOf(
      [sender, receiver],
      [
        { id: "both", machineRefs: [{ key: "sender", machineId: "sender" }, { key: "receiver", machineId: "receiver" }] },
        { id: "senderOnly", machineRefs: [{ key: "sender", machineId: "sender" }] },
      ],
    );

    expect(codes(analyzeLiteFsmGraph(document, { rules: ["effect-event-acceptance"] }).diagnostics)).toEqual([
      "LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE",
    ]);
    expect(
      codes(
        analyzeLiteFsmGraph(document, {
          rules: ["effect-event-acceptance"],
          scope: { kind: "manager", managerId: "both" },
        }).diagnostics,
      ),
    ).toEqual(["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE"]);
    expect(
      diagnosticRows(
        analyzeLiteFsmGraph(document, {
          rules: ["effect-event-acceptance"],
          scope: { kind: "machine", machineId: "sender" },
        }).diagnostics,
      ),
    ).toEqual([
      ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "info", "sender"],
      ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "info", "sender"],
      ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "info", "sender"],
      ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "info", "sender"],
      ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "info", "sender"],
    ]);
    expect(
      diagnosticRows(
        analyzeLiteFsmGraph(document, {
          rules: ["effect-event-acceptance"],
          scope: { kind: "manager", managerId: "senderOnly" },
        }).diagnostics,
      ),
    ).toEqual([
      ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "warning", "sender"],
      ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "warning", "sender"],
      ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "warning", "sender"],
      ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "warning", "sender"],
      ["LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE", "warning", "sender"],
    ]);
  });

  it("строит общий GraphAnalysisIndex для rule lookup-ов", () => {
    const indexed = machine({
      id: "indexed",
      initialState: "IDLE",
      states: [state("indexed", "IDLE", { isInitial: true }), state("indexed", "READY")],
      transitions: [
        transition({ machineId: "indexed", source: "IDLE", event: "GO", target: targetState("indexed", "READY") }),
        transition({ machineId: "indexed", source: "*", event: "RESET", target: targetState("indexed", "IDLE") }),
        transition({ machineId: "indexed", source: { kind: "unknown", label: "external" }, event: "IGNORED", target: { kind: "self" } }),
        transition({
          machineId: "indexed",
          source: "READY",
          event: "REDUCER_ONLY",
          target: targetState("indexed", "IDLE"),
          layer: "reducer",
        }),
      ],
    });
    const document = documentOf(
      [indexed],
      [{ id: "manager", machineRefs: [{ key: "indexed", machineId: "indexed", loc: loc(90) }], loc: loc(91) }],
    );
    const index = createGraphAnalysisIndex(document, new Set(["indexed"]));

    expect(index.machinesById.get("indexed")?.id).toBe("indexed");
    expect(index.managersById.get("manager")?.machineRefs).toHaveLength(1);
    expect(index.statesByMachineId.get("indexed")?.get(stateId("indexed", "IDLE"))?.key).toBe("IDLE");
    expect(index.stateKeysByMachineId.get("indexed")?.get("READY")?.id).toBe(stateId("indexed", "READY"));
    expect([...index.acceptedEventsByMachineId.get("indexed") ?? []].sort()).toEqual(["GO", "IGNORED", "RESET"]);
    expect([...index.acceptedEventsByStateId.get(stateId("indexed", "IDLE")) ?? []]).toEqual(["GO"]);
    expect(index.acceptedEventsByStateId.has(stateId("indexed", "READY"))).toBe(false);
    expect(index.wildcardTransitionsByMachineId.get("indexed")?.map((item) => item.event.type)).toEqual(["RESET"]);
    expect([...index.scopedMachineIds]).toEqual(["indexed"]);
  });

  it("проверяет reachability через wildcard target, но не считает wildcard source достижимостью всех states", () => {
    const wildcardReachability = machine({
      id: "wildcardReachability",
      initialState: "IDLE",
      states: [
        state("wildcardReachability", "IDLE", { isInitial: true }),
        state("wildcardReachability", "CATCH"),
        state("wildcardReachability", "UNUSED"),
      ],
      transitions: [
        transition({
          machineId: "wildcardReachability",
          source: "*",
          event: "ANY",
          target: targetState("wildcardReachability", "CATCH"),
        }),
      ],
    });
    const missingInitial = machine({
      id: "missingInitial",
      initialState: "MISSING",
      states: [state("missingInitial", "IDLE")],
    });
    const result = analyzeLiteFsmGraph(documentOf([wildcardReachability, missingInitial]), {
      rules: ["unreachable-state", "dead-end-state"],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_ANALYZER_UNREACHABLE_STATE",
        machineId: "wildcardReachability",
        message: "State 'UNUSED' is not reachable from initialState 'IDLE'.",
      }),
    ]);
  });

  it("не помечает terminal/init/wildcard states как dead-end и не ругается на валидный actor template", () => {
    const terminalOnly = machine({
      id: "terminalOnly",
      initialState: "__INIT",
      states: [
        state("terminalOnly", "__INIT", { kind: "init", isInitial: true, isPublicActorState: false }),
        state("terminalOnly", "*", { kind: "wildcard" }),
        state("terminalOnly", "__RESOLVED", { kind: "terminal", isPublicActorState: false }),
      ],
      transitions: [
        transition({ machineId: "terminalOnly", source: "__INIT", event: "DONE", target: targetTerminal("__RESOLVED") }),
      ],
    });
    const validActor = machine({
      id: "validActor",
      kind: "actorTemplate",
      initialState: "__INIT",
      states: [
        state("validActor", "__INIT", { kind: "init", isInitial: true, isPublicActorState: false }),
        state("validActor", "RUNNING"),
        state("validActor", "__REJECTED", { kind: "terminal", isPublicActorState: false }),
      ],
      transitions: [
        transition({ machineId: "validActor", source: "__INIT", event: "SPAWN", target: targetState("validActor", "RUNNING") }),
        transition({ machineId: "validActor", source: "RUNNING", event: "FAIL", target: targetTerminal("__REJECTED") }),
      ],
    });
    const domainWithReserved = machine({
      id: "domainWithReserved",
      initialState: "IDLE",
      states: [state("domainWithReserved", "IDLE", { isInitial: true }), state("domainWithReserved", "__INIT", { kind: "init" })],
    });
    const result = analyzeLiteFsmGraph(documentOf([terminalOnly, validActor, domainWithReserved]), {
      rules: ["dead-end-state", "actor-template-shape"],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_ANALYZER_DEAD_END_STATE",
        machineId: "domainWithReserved",
        message: "State 'IDLE' has no outgoing config transitions.",
      }),
    ]);
  });

  it("не создает diagnostics для корректных known targets, wildcard reducer acceptance и non-shadowing wildcard", () => {
    const accepted = machine({
      id: "accepted",
      initialState: "IDLE",
      states: [state("accepted", "IDLE", { isInitial: true }), state("accepted", "READY")],
      transitions: [
        transition({ machineId: "accepted", source: "*", event: "RESET", target: targetState("accepted", "IDLE") }),
        transition({ machineId: "accepted", source: "IDLE", event: "GO", target: targetState("accepted", "READY") }),
        transition({ machineId: "accepted", source: "READY", event: "DONE", target: targetTerminal("__RESOLVED") }),
        transition({ machineId: "accepted", source: "READY", event: "STAY", target: { kind: "self" } }),
      ],
      reducerCases: [
        reducerCase({ event: "RESET", targets: [targetState("accepted", "IDLE")] }),
        reducerCase({ event: "GO", targets: [{ kind: "self" }, targetTerminal("__RESOLVED")] }),
      ],
      emissions: [emission({ machineId: "accepted", source: "IDLE", event: "GO" })],
    });
    const result = analyzeLiteFsmGraph(documentOf([accepted]), {
      rules: ["unknown-target", "reducer-config-consistency", "effect-event-acceptance", "wildcard-shadowing"],
    });

    expect(result.diagnostics).toEqual([]);
  });

  it("оставляет stateId в wildcard-shadowing message, если state ref не найден в IR", () => {
    const brokenRef = machine({
      id: "brokenRef",
      initialState: "IDLE",
      states: [state("brokenRef", "IDLE", { isInitial: true })],
      transitions: [
        transition({ machineId: "brokenRef", source: "*", event: "RESET", target: targetState("brokenRef", "IDLE") }),
        transition({
          machineId: "brokenRef",
          source: { kind: "state", stateId: "external:state:IDLE" },
          event: "RESET",
          target: { kind: "self" },
        }),
      ],
    });
    const result = analyzeLiteFsmGraph(documentOf([brokenRef]), { rules: ["wildcard-shadowing"] });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_ANALYZER_WILDCARD_SHADOWING",
        message: "State 'external:state:IDLE' overrides wildcard event 'RESET'.",
      }),
    ]);
  });

  it("пропускает dynamic, unknown routing и compiler-incomplete target фрагменты", () => {
    const partial = machine({
      id: "partial",
      initialState: "IDLE",
      states: [state("partial", "IDLE", { isInitial: true })],
      transitions: [
        transition({ machineId: "partial", source: "IDLE", event: "DYNAMIC", target: { kind: "dynamic", label: "runtime()" } }),
        transition({ machineId: "partial", source: "IDLE", event: "BLOCKED", target: { kind: "blocked", reason: "unsupported" } }),
        transition({ machineId: "partial", source: "IDLE", event: "UNSUPPORTED", target: targetUnknown("LFG_UNSUPPORTED_EXPRESSION") }),
        transition({ machineId: "partial", source: "IDLE", event: "PRIMITIVE", target: targetUnknown("number") }),
        transition({ machineId: "partial", source: { kind: "unknown", label: "mystery" }, event: "UNKNOWN_SOURCE", target: { kind: "self" } }),
        transition({ machineId: "partial", source: "IDLE", event: "UNKNOWN", target: targetUnknown() }),
      ],
      reducerCases: [
        reducerCase({ event: "DYNAMIC", targets: [{ kind: "dynamic", label: "choose()" }] }),
        reducerCase({ event: "UNSUPPORTED", targets: [targetUnknown("LFG_UNSUPPORTED_EXPRESSION")] }),
        reducerCase({ event: "PRIMITIVE", targets: [targetUnknown("number")] }),
        reducerCase({ event: "UNKNOWN", targets: [targetUnknown()] }),
      ],
      emissions: [
        emission({ machineId: "partial", source: "IDLE", event: "UNKNOWN_ROUTING", routing: { kind: "unknown", label: "meta" } }),
        emission({
          machineId: "partial",
          source: "IDLE",
          event: "DYNAMIC_ACTOR",
          routing: { kind: "actor", target: { kind: "dynamic", label: "actorId" } },
        }),
        emission({
          machineId: "partial",
          source: "IDLE",
          event: "DYNAMIC_GROUP",
          routing: {
            kind: "group",
            target: { kind: "array", items: [{ kind: "literal", value: "known" }, { kind: "dynamic", label: "groupId" }] },
          },
        }),
      ],
    });
    const result = analyzeLiteFsmGraph(documentOf([partial]), {
      rules: ["unknown-target", "reducer-config-consistency", "effect-event-acceptance"],
    });

    expect(diagnosticRows(result.diagnostics)).toEqual([
      ["LFG_ANALYZER_REDUCER_CONFIG_CONSISTENCY", "warning", "partial"],
      ["LFG_ANALYZER_UNKNOWN_TARGET", "warning", "partial"],
      ["LFG_ANALYZER_UNKNOWN_TARGET", "warning", "partial"],
    ]);
  });

  it("работает на compiler fixture, но не добавляет analyzer diagnostics в document", () => {
    const compiled = compileLiteFsmGraph(fullAssemblerSource, { filename: fullAssemblerFilename });
    const analyzed = analyzeLiteFsmGraph(compiled.document, { rules: defaultRules });
    const patched = documentOf([
      {
        ...compiled.document.machines[0]!,
        emissions: [emission({ machineId: compiled.document.machines[0]!.id, source: "IDLE", event: "MANUAL_ONLY" })],
      },
    ]);
    const patchedAnalysis = analyzeLiteFsmGraph(patched, { rules: ["effect-event-acceptance"] });

    expect(compiled.document.diagnostics.some((diagnostic) => diagnostic.code.startsWith("LFG_ANALYZER_"))).toBe(false);
    expect(analyzed.diagnostics.every((diagnostic) => diagnostic.code.startsWith("LFG_ANALYZER_"))).toBe(true);
    expect(patchedAnalysis.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_ANALYZER_EFFECT_EVENT_ACCEPTANCE",
        machineId: compiled.document.machines[0]!.id,
      }),
    ]);
  });
});
