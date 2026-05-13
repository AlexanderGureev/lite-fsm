import { describe, expect, it } from "vitest";
import type {
  GraphCondition,
  GraphRouting,
} from "@lite-fsm/graph";
import { buildMachineFlowModel } from "@lite-fsm/graph/view-model";
import type {
  GraphConfigRow,
  GraphDiagnosticRow,
  GraphEffectRow,
  GraphDiagnosticAnchor,
  GraphReducerRow,
  GraphSourceAnchor,
  GraphTargetView,
  GraphTopicProducer,
  GraphTopicSummary,
  GraphVisualizerModel,
  GraphWorkbenchBadge,
  GraphWorkbenchRow,
  GraphWorkbenchStateBlock,
  GraphUnknownRow,
} from "@lite-fsm/graph/view-model";

const anchor = (kind: GraphSourceAnchor["kind"] = "machine"): GraphSourceAnchor => ({
  kind,
  editable: false,
});

const stateId = (machineId: string, key: string): string => `${machineId}:state:${key}`;

const stateTarget = (machineId: string, key: string): GraphTargetView => ({
  kind: "state",
  label: key,
  stateId: stateId(machineId, key),
});

const missingStateTarget = (label: string): GraphTargetView => ({
  kind: "state",
  label,
  stateId: `missing:${label}`,
});

const terminalTarget = (label: "__RESOLVED" | "__REJECTED" | "__CANCELLED"): GraphTargetView => ({
  kind: "terminal",
  label,
  terminal: label,
});

const condition = (text: string): GraphCondition => ({
  kind: "if",
  text,
});

const badge = (kind: GraphWorkbenchBadge["kind"], label = kind): GraphWorkbenchBadge => ({
  kind,
  label,
});

const configRow = (input: {
  machineId: string;
  source: string;
  event: string;
  target: GraphTargetView;
  rowId?: string;
  guard?: GraphCondition;
  confidence?: "exact" | "partial" | "unknown";
  foldedReducerTransitionIds?: readonly string[];
}): GraphConfigRow => ({
  kind: "config",
  rowId: input.rowId ?? `${input.machineId}:row:config:${input.source}:${input.event}`,
  machineId: input.machineId,
  sourceStateId: input.source === "*" ? stateId(input.machineId, "*") : stateId(input.machineId, input.source),
  eventType: input.event,
  acceptedTransitionId: `${input.machineId}:accepted:${input.event}`,
  transitionId: `${input.machineId}:transition:config:${input.source}:${input.event}`,
  foldedReducerTransitionIds: input.foldedReducerTransitionIds ?? [],
  target: input.target,
  guard: input.guard,
  confidence: input.confidence ?? "exact",
  capabilities: [],
  sourceAnchors: [anchor("config-transition")],
});

const reducerRow = (input: {
  machineId: string;
  source: string;
  event: string;
  target: GraphTargetView;
  rowId?: string;
  foldedIntoConfig?: boolean;
  guard?: GraphCondition;
  confidence?: "exact" | "partial" | "unknown";
}): GraphReducerRow => ({
  kind: "reducer",
  rowId: input.rowId ?? `${input.machineId}:row:reducer:${input.source}:${input.event}`,
  machineId: input.machineId,
  sourceStateId: input.source === "*" ? stateId(input.machineId, "*") : stateId(input.machineId, input.source),
  eventType: input.event,
  acceptedTransitionId: `${input.machineId}:accepted:${input.event}`,
  transitionId: `${input.machineId}:transition:reducer:${input.source}:${input.event}`,
  reducerCaseId: `${input.machineId}:reducer:${input.event}`,
  target: input.target,
  guard: input.guard,
  foldedIntoConfig: input.foldedIntoConfig ?? false,
  confidence: input.confidence ?? "exact",
  capabilities: [],
  sourceAnchors: [anchor("reducer-branch")],
});

const effectRow = (input: {
  machineId: string;
  source: string;
  event: string;
  rowId?: string;
  routing?: GraphRouting;
  guard?: GraphCondition;
  confidence?: "exact" | "partial" | "unknown";
}): GraphEffectRow => ({
  kind: "effect",
  rowId: input.rowId ?? `${input.machineId}:row:effect:${input.source}:${input.event}`,
  machineId: input.machineId,
  ...(input.source === "*" ? {} : { sourceStateId: stateId(input.machineId, input.source) }),
  sourceStateKey: input.source,
  emissionId: `${input.machineId}:emission:${input.source}:${input.event}`,
  eventType: input.event,
  routing: input.routing ?? { kind: "default" },
  guard: input.guard,
  confidence: input.confidence ?? "exact",
  capabilities: [],
  sourceAnchors: [anchor("effect-emission")],
});

const diagnosticRow = (machineId: string, diagnosticId: string): GraphDiagnosticRow => ({
  kind: "diagnostic",
  rowId: `${machineId}:row:diagnostic:${diagnosticId}`,
  machineId,
  diagnosticId,
  severity: "warning",
  message: "diagnostic",
  capabilities: [],
  sourceAnchors: [anchor("diagnostic")],
});

const unknownRow = (machineId: string): GraphUnknownRow => ({
  kind: "unknown",
  rowId: `${machineId}:row:unknown`,
  machineId,
  label: "unknown row",
  reason: "fixture",
  confidence: "unknown",
  capabilities: [],
  sourceAnchors: [anchor("diagnostic")],
});

const stateBlock = (input: {
  machineId: string;
  key: string;
  kind?: GraphWorkbenchStateBlock["kind"];
  rows?: readonly GraphWorkbenchRow[];
  current?: boolean;
  badges?: readonly GraphWorkbenchBadge[];
  diagnosticIds?: readonly string[];
}): GraphWorkbenchStateBlock => ({
  stateId: stateId(input.machineId, input.key),
  stateKey: input.key,
  kind: input.kind ?? (input.key === "*" ? "wildcard" : "normal"),
  badges: input.badges ?? [],
  current: input.current ?? false,
  collapsed: false,
  rows: input.rows ?? [],
  sourceAnchors: [anchor("state")],
  diagnosticIds: input.diagnosticIds ?? [],
});

const producer = (input: {
  machineId: string;
  source: string;
  event: string;
  routing?: GraphRouting;
  guard?: GraphCondition;
  confidence?: "exact" | "partial" | "unknown";
}): GraphTopicProducer => ({
  machineId: input.machineId,
  emissionId: `${input.machineId}:emission:${input.source}:${input.event}`,
  sourceStateKey: input.source,
  routing: input.routing ?? { kind: "default" },
  guard: input.guard,
  confidence: input.confidence ?? "exact",
  sourceAnchors: [anchor("effect-emission")],
});

const topic = (
  eventType: string,
  producers: readonly GraphTopicProducer[] = [],
  diagnosticIds: readonly string[] = [],
): GraphTopicSummary => ({
  eventType,
  producerCount: producers.length,
  consumerCount: 0,
  routingKinds: producers.map((item) => item.routing.kind),
  routingValues: [],
  producers,
  consumers: [],
  diagnosticIds,
});

const diagnostic = (machineId: string, diagnosticId: string): GraphDiagnosticAnchor => ({
  diagnosticId,
  origin: "analyzer",
  diagnostic: {
    code: "FIXTURE",
    severity: "warning",
    message: "fixture",
    machineId,
  },
  sourceAnchor: anchor("diagnostic"),
});

const modelOf = (input: {
  workbenches: readonly GraphVisualizerModel["workbenchMachines"][string][];
  topics?: readonly GraphTopicSummary[];
  summaries?: GraphVisualizerModel["machines"];
}): GraphVisualizerModel => ({
  version: "lite-fsm.visualizer/v1",
  source: { language: "ts", filename: "fixture.ts" },
  machines:
    input.summaries ??
    input.workbenches.map((workbench) => ({
      machineId: workbench.machineId,
      title: workbench.title,
      kind: workbench.kind,
      groupTag: workbench.groupTag,
      initialState: workbench.initialState,
      managerKeys: [],
      counts: {
        states: workbench.states.length,
        consumedTopics: 0,
        producedTopics: 0,
        configTransitions: workbench.states.flatMap((state) => state.rows).filter((row) => row.kind === "config").length,
        reducerBranches: workbench.states.flatMap((state) => state.rows).filter((row) => row.kind === "reducer").length,
        effectEmissions: workbench.states.flatMap((state) => state.rows).filter((row) => row.kind === "effect").length,
        diagnostics: workbench.diagnostics.length,
      },
      consumedTopicTypes: [],
      producedTopicTypes: [],
      sourceAnchors: workbench.sourceAnchors,
      diagnosticIds: workbench.diagnostics.map((item) => item.diagnosticId),
    })),
  managers: [],
  topics: input.topics ?? [],
  relations: { topicTypesByMachineId: {}, machineIdsByTopicType: {} },
  diagnostics: input.workbenches.flatMap((workbench) => workbench.diagnostics),
  rowMappings: {
    transitionRowIdsByTransitionId: {},
    emissionRowIdsByEmissionId: {},
    transitionRowIdsByMachineAndTransitionId: {},
    emissionRowIdsByMachineAndEmissionId: {},
    diagnostics: [],
  },
  workbenchMachines: Object.fromEntries(input.workbenches.map((workbench) => [workbench.machineId, workbench])),
});

const workbenchOf = (input: {
  machineId: string;
  title?: string;
  kind?: "domain" | "actorTemplate" | "unknown";
  groupTag?: string;
  initialState?: string;
  currentStateId?: string;
  states: readonly GraphWorkbenchStateBlock[];
  globalBehavior?: readonly GraphWorkbenchRow[];
  diagnostics?: readonly GraphDiagnosticAnchor[];
}) => ({
  machineId: input.machineId,
  title: input.title ?? input.machineId,
  kind: input.kind ?? "domain",
  groupTag: input.groupTag,
  initialState: input.initialState,
  currentStateId: input.currentStateId,
  states: input.states,
  globalBehavior: input.globalBehavior ?? [],
  diagnostics: input.diagnostics ?? [],
  sourceAnchors: [anchor("machine")],
});

const ready = (model: GraphVisualizerModel, machineId: string) => {
  const result = buildMachineFlowModel({ model, machineId });
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("Expected ready model.");
  return result;
};

const hasEventType = (
  row: GraphWorkbenchRow,
): row is Extract<GraphWorkbenchRow, { eventType: string }> => "eventType" in row;

describe("модель Machine Flow из @lite-fsm/graph/view-model", () => {
  it("возвращает controlled empty state для отсутствующей machine", () => {
    const result = buildMachineFlowModel({ model: modelOf({ workbenches: [] }), machineId: "missing" });

    expect(result).toEqual({ status: "missing-machine", machineId: "missing" });
  });

  it("строит summary, роли nodes и разделяет wildcard state/effect", () => {
    const machineId = "flow";
    const warning = diagnostic(machineId, "d1");
    const wildcardEffect = effectRow({
      machineId,
      source: "*",
      event: "AUDIT",
      routing: { kind: "tag", target: { kind: "literal", value: "workers" } },
      confidence: "partial",
    });
    const secondWildcardEffect = effectRow({ machineId, source: "*", event: "AUDIT_TWO" });
    const start = configRow({ machineId, source: "__INIT", event: "START", target: stateTarget(machineId, "idle") });
    const wildcardAudit = configRow({ machineId, source: "*", event: "AUDIT", target: stateTarget(machineId, "idle") });
    const doneEffect = effectRow({ machineId, source: "idle", event: "DONE" });
    const workbench = workbenchOf({
      machineId,
      title: "Flow",
      kind: "actorTemplate",
      groupTag: "workers",
      initialState: "__INIT",
      currentStateId: stateId(machineId, "idle"),
      diagnostics: [warning],
      states: [
        stateBlock({ machineId, key: "*", rows: [wildcardEffect, secondWildcardEffect, wildcardAudit] }),
        stateBlock({ machineId, key: "__INIT", badges: [badge("initial")], rows: [start] }),
        stateBlock({ machineId, key: "idle", current: true, rows: [doneEffect], diagnosticIds: ["d1"] }),
        stateBlock({ machineId, key: "__RESOLVED", kind: "terminal" }),
        stateBlock({ machineId, key: "ready" }),
        stateBlock({ machineId, key: "fresh", badges: [badge("initial")] }),
      ],
    });
    const result = ready(
      modelOf({
        workbenches: [workbench],
        topics: [
          topic("AUDIT", [producer({ machineId, source: "*", event: "AUDIT", routing: { kind: "tag", target: { kind: "literal", value: "workers" } } })]),
          topic("DONE", [producer({ machineId, source: "idle", event: "DONE" })]),
        ],
      }),
      machineId,
    );

    expect(result.machine).toMatchObject({
      machineId,
      title: "Flow",
      kind: "actorTemplate",
      groupTag: "workers",
      initialState: "__INIT",
      currentStateKey: "idle",
      counters: {
        states: 6,
        transitions: 2,
        reducerBranches: 0,
        emissions: 3,
        diagnostics: 1,
      },
    });
    expect(result.nodes.map((node) => [node.label, node.ref.kind, node.role, node.badges.map((item) => item.kind)])).toEqual([
      ["*", "wildcard-state", "wildcard", ["wildcard", "group-tag"]],
      ["__INIT", "state", "spawn", ["initial", "spawn", "group-tag"]],
      ["idle", "state", "current", ["current", "effect-source", "group-tag", "diagnostic"]],
      ["__RESOLVED", "state", "terminal", ["terminal", "group-tag"]],
      ["ready", "state", "normal", ["group-tag"]],
      ["fresh", "state", "initial", ["initial", "group-tag"]],
      ["*", "wildcard-effect", "effect-source", ["effect-source"]],
    ]);
    expect(new Set(result.nodes.map((node) => node.nodeId)).size).toBe(result.nodes.length);
  });

  it("строит accepted transitions, self loops и synthetic targets", () => {
    const machineId = "targets";
    const rows = [
      configRow({ machineId, source: "idle", event: "SELF", target: { kind: "self", label: "self" }, guard: condition("canSelf") }),
      configRow({ machineId, source: "idle", event: "STAY", target: stateTarget(machineId, "idle") }),
      configRow({ machineId, source: "idle", event: "STATE", target: stateTarget(machineId, "done") }),
      configRow({ machineId, source: "idle", event: "MISSING_STATE", target: missingStateTarget("lost") }),
      configRow({ machineId, source: "idle", event: "STATE_NO_ID", target: { kind: "state", label: "no-id" } }),
      configRow({ machineId, source: "idle", event: "DYNAMIC", target: { kind: "dynamic", label: "runtime" } }),
      configRow({ machineId, source: "idle", event: "DYNAMIC_AGAIN", target: { kind: "dynamic", label: "runtime" } }),
      configRow({ machineId, source: "idle", event: "BLOCKED", target: { kind: "blocked", label: "not static", blockedReason: "not static" } }),
      configRow({ machineId, source: "idle", event: "UNKNOWN", target: { kind: "unknown", label: "mystery" } }),
      configRow({ machineId, source: "idle", event: "TERMINAL", target: terminalTarget("__RESOLVED") }),
      configRow({ machineId, source: "idle", event: "MISSING_TERMINAL", target: terminalTarget("__REJECTED") }),
      configRow({ machineId, source: "idle", event: "TERMINAL_NO_ID", target: { kind: "terminal", label: "terminal" } as GraphTargetView }),
      reducerRow({ machineId, source: "idle", event: "REDUCE", target: stateTarget(machineId, "done") }),
      reducerRow({ machineId, source: "idle", event: "FOLDED", target: stateTarget(machineId, "done"), foldedIntoConfig: true }),
    ];
    const workbench = workbenchOf({
      machineId,
      states: [
        stateBlock({ machineId, key: "idle", rows }),
        stateBlock({ machineId, key: "done" }),
        stateBlock({ machineId, key: "__RESOLVED", kind: "terminal" }),
      ],
    });
    const result = ready(modelOf({ workbenches: [workbench] }), machineId);

    expect(result.edgeGroups.map((edge) => [edge.label, edge.count, edge.direction, edge.kind, edge.layer, edge.targetNodeId ? edge.targetNodeId.includes("synthetic") : false])).toEqual([
      ["MISSING_TERMINAL", 1, "normal", "accepted-transition", "config", true],
      ["TERMINAL", 1, "normal", "accepted-transition", "config", false],
      ["STATE", 2, "normal", "accepted-transition", "mixed", false],
      ["SELF", 2, "self", "accepted-transition", "config", false],
      ["MISSING_STATE", 1, "normal", "accepted-transition", "config", true],
      ["UNKNOWN", 1, "normal", "accepted-transition", "config", true],
      ["STATE_NO_ID", 1, "normal", "accepted-transition", "config", true],
      ["BLOCKED", 1, "normal", "accepted-transition", "config", true],
      ["DYNAMIC", 2, "normal", "accepted-transition", "config", true],
      ["TERMINAL_NO_ID", 1, "normal", "accepted-transition", "config", true],
    ]);
    expect(result.edgeGroups.find((edge) => edge.label === "SELF")?.rows.find((row) => "eventType" in row && row.eventType === "SELF")).toMatchObject({
      guardLabel: "canSelf",
    });
    expect(result.edgeGroups.find((edge) => edge.label === "STATE")?.rows.map((row) => row.rowKind)).toEqual(["config", "reducer"]);
    expect(result.edgeGroups.some((edge) => edge.label === "FOLDED")).toBe(false);
    expect(result.nodes.filter((node) => node.ref.kind === "synthetic-target").map((node) => [node.label, node.ref])).toEqual([
      ["lost", { kind: "synthetic-target", targetKind: "unknown" }],
      ["no-id", { kind: "synthetic-target", targetKind: "unknown" }],
      ["runtime", { kind: "synthetic-target", targetKind: "dynamic" }],
      ["not static", { kind: "synthetic-target", targetKind: "blocked" }],
      ["mystery", { kind: "synthetic-target", targetKind: "unknown" }],
      ["__REJECTED", { kind: "synthetic-target", targetKind: "unknown" }],
      ["terminal", { kind: "synthetic-target", targetKind: "unknown" }],
    ]);
    expect(result.nodes.find((node) => node.label === "idle")?.stats).toMatchObject({
      outgoing: 10,
      selfLoops: 1,
    });
  });

  it("pair-ит local self-emitted lifecycle и оставляет emission-only без target", () => {
    const machineId = "lifecycle";
    const rows = [
      effectRow({ machineId, source: "loading", event: "DONE" }),
      configRow({ machineId, source: "loading", event: "DONE", target: stateTarget(machineId, "done") }),
      effectRow({ machineId, source: "loading", event: "LOOP" }),
      configRow({ machineId, source: "loading", event: "LOOP", target: stateTarget(machineId, "loading") }),
      effectRow({ machineId, source: "loading", event: "RESET" }),
      configRow({ machineId, source: "*", event: "RESET", target: stateTarget(machineId, "idle") }),
      effectRow({ machineId, source: "loading", event: "OTHER_SOURCE" }),
      configRow({ machineId, source: "idle", event: "OTHER_SOURCE", target: stateTarget(machineId, "done") }),
      effectRow({ machineId, source: "loading", event: "ONLY_EMIT" }),
    ];
    const workbench = workbenchOf({
      machineId,
      states: [
        stateBlock({ machineId, key: "*", rows: rows.filter((row) => row.kind === "config" && row.eventType === "RESET") }),
        stateBlock({ machineId, key: "idle", rows: rows.filter((row) => row.kind === "config" && row.eventType === "OTHER_SOURCE") }),
        stateBlock({ machineId, key: "loading", rows: rows.filter((row) => row.kind === "effect" || (hasEventType(row) && (row.eventType === "DONE" || row.eventType === "LOOP"))) }),
        stateBlock({ machineId, key: "done" }),
      ],
    });
    const result = ready(
      modelOf({
        workbenches: [workbench],
        topics: [
          topic("DONE", [producer({ machineId, source: "loading", event: "DONE" })]),
          topic("LOOP", [producer({ machineId, source: "loading", event: "LOOP" })]),
          topic("RESET", [producer({ machineId, source: "loading", event: "RESET" })]),
          topic("OTHER_SOURCE", [producer({ machineId, source: "loading", event: "OTHER_SOURCE" })]),
          topic("ONLY_EMIT", [producer({ machineId, source: "loading", event: "ONLY_EMIT" })]),
        ],
      }),
      machineId,
    );

    expect(result.edgeGroups.map((edge) => [edge.label, edge.count, edge.kind, edge.producerCategory, edge.targetNodeId ? "targeted" : "source-only"])).toEqual([
      ["OTHER_SOURCE", 1, "accepted-transition", "self-emitted", "targeted"],
      ["DONE", 1, "self-emitted-transition", "self-emitted", "targeted"],
      ["OTHER_SOURCE", 2, "emission-only", "self-emitted", "source-only"],
      ["RESET", 1, "self-emitted-transition", "self-emitted", "targeted"],
      ["LOOP", 1, "self-emitted-transition", "self-emitted", "targeted"],
    ]);
    expect(result.edgeGroups.find((edge) => edge.label === "LOOP")?.direction).toBe("self");
    expect(result.edgeGroups.find((edge) => edge.label === "DONE")?.rows.map((row) => row.rowKind)).toEqual(["effect", "config"]);
    expect(result.nodes.find((node) => node.label === "loading")?.stats.emissions).toBe(2);
  });

  it("pair-ит wildcard effect с concrete local consumer того же event", () => {
    const machineId = "wildcard-lifecycle";
    const wildcardEffect = effectRow({ machineId, source: "*", event: "PONG" });
    const concreteConsumer = configRow({ machineId, source: "idle", event: "PONG", target: stateTarget(machineId, "ready") });
    const workbench = workbenchOf({
      machineId,
      states: [
        stateBlock({ machineId, key: "idle", rows: [concreteConsumer] }),
        stateBlock({ machineId, key: "ready" }),
      ],
      globalBehavior: [wildcardEffect],
    });
    const result = ready(
      modelOf({
        workbenches: [workbench],
        topics: [topic("PONG", [producer({ machineId, source: "*", event: "PONG" })])],
      }),
      machineId,
    );
    const wildcardEffectNode = result.nodes.find((node) => node.ref.kind === "wildcard-effect");
    const readyNode = result.nodes.find((node) => node.label === "ready");

    expect(result.edgeGroups).toHaveLength(1);
    expect(result.edgeGroups[0]).toMatchObject({
      label: "PONG",
      kind: "self-emitted-transition",
      producerCategory: "self-emitted",
      sourceNodeId: wildcardEffectNode?.nodeId,
      targetNodeId: readyNode?.nodeId,
    });
    expect(result.edgeGroups[0]?.rows).toEqual([
      expect.objectContaining({ rowKind: "config", eventType: "PONG", sourceStateKey: "idle" }),
      expect.objectContaining({ rowKind: "effect", eventType: "PONG" }),
    ]);
  });

  it("классифицирует producers from-other, mixed, same-machine non-local и external", () => {
    const machineId = "consumer";
    const other = workbenchOf({
      machineId: "producer",
      title: "Producer",
      states: [stateBlock({ machineId: "producer", key: "idle" })],
    });
    const workbench = workbenchOf({
      machineId,
      states: [
        stateBlock({
          machineId,
          key: "idle",
          rows: [
            configRow({ machineId, source: "idle", event: "OTHER", target: stateTarget(machineId, "done") }),
            configRow({ machineId, source: "idle", event: "MIXED", target: stateTarget(machineId, "done") }),
            configRow({ machineId, source: "idle", event: "SELF_NON_LOCAL", target: stateTarget(machineId, "done") }),
            configRow({ machineId, source: "idle", event: "SELF_NON_LOCAL", target: stateTarget(machineId, "done"), rowId: "self-non-local-duplicate" }),
            configRow({ machineId, source: "idle", event: "EXTERNAL", target: stateTarget(machineId, "done") }),
          ],
        }),
        stateBlock({ machineId, key: "busy", rows: [effectRow({ machineId, source: "busy", event: "SELF_NON_LOCAL" })] }),
        stateBlock({ machineId, key: "done" }),
      ],
    });
    const result = ready(
      modelOf({
        workbenches: [workbench, other],
        topics: [
          topic("OTHER", [producer({ machineId: "producer", source: "idle", event: "OTHER" })]),
          topic("MIXED", [
            producer({ machineId, source: "busy", event: "MIXED" }),
            producer({ machineId: "producer", source: "idle", event: "MIXED" }),
          ]),
          topic("SELF_NON_LOCAL", [producer({ machineId, source: "busy", event: "SELF_NON_LOCAL" })]),
        ],
      }),
      machineId,
    );

    expect(result.edgeGroups.map((edge) => [edge.label, edge.count, edge.kind, edge.producerCategory, edge.producers.map((item) => item.machineTitle)])).toEqual([
      ["SELF_NON_LOCAL", 1, "emission-only", "self-emitted", ["consumer"]],
      ["MIXED", 2, "accepted-transition", "external", ["consumer", "Producer"]],
      ["SELF_NON_LOCAL", 1, "accepted-transition", "self-emitted", ["consumer"]],
      ["OTHER", 1, "from-other-transition", "from-other", ["Producer"]],
    ]);
    expect(result.edgeGroups.find((edge) => edge.label === "MIXED")?.rows.map((row) => ("eventType" in row ? row.eventType : row.label))).toEqual(["MIXED", "EXTERNAL"]);
    expect(result.edgeGroups.find((edge) => edge.label === "SELF_NON_LOCAL" && edge.kind === "accepted-transition")?.rows).toHaveLength(2);
  });

  it("группирует labels, сохраняет row order и не включает row ids в groupId", () => {
    const machineId = "grouped";
    const rows = [
      configRow({ machineId, source: "idle", event: "A", target: stateTarget(machineId, "done"), rowId: "row-a" }),
      configRow({ machineId, source: "idle", event: "B", target: stateTarget(machineId, "done"), rowId: "row-b" }),
      configRow({ machineId, source: "idle", event: "C", target: stateTarget(machineId, "done"), rowId: "row-c" }),
      configRow({ machineId, source: "idle", event: "D", target: stateTarget(machineId, "done"), rowId: "row-d" }),
      configRow({ machineId, source: "idle", event: "E", target: stateTarget(machineId, "done"), rowId: "row-e" }),
      configRow({ machineId, source: "idle", event: "F", target: stateTarget(machineId, "done"), rowId: "row-f" }),
    ];
    const workbench = workbenchOf({
      machineId,
      states: [stateBlock({ machineId, key: "idle", rows }), stateBlock({ machineId, key: "done" })],
    });
    const result = ready(modelOf({ workbenches: [workbench] }), machineId);
    const grouped = result.edgeGroups[0];

    expect(grouped).toMatchObject({
      label: "A",
      count: 6,
    });
    expect(grouped?.rows.map((row) => row.rowId)).toEqual(["row-a", "row-b", "row-c", "row-d", "row-e", "row-f"]);
    expect(grouped?.groupId).not.toContain("row-a");
    expect(grouped?.groupId).not.toContain("row-f");
  });

  it("фиксирует current fallback, role priority и отсутствие initial fallback для current", () => {
    const machineId = "priority";
    const currentTerminal = stateBlock({
      machineId,
      key: "__CANCELLED",
      kind: "normal",
      current: true,
      badges: [badge("initial")],
    });
    const workbench = workbenchOf({
      machineId,
      initialState: "idle",
      currentStateId: "missing-current-state",
      states: [
        stateBlock({ machineId, key: "idle", badges: [badge("initial")] }),
        stateBlock({ machineId, key: "__INIT", badges: [badge("initial")] }),
        currentTerminal,
      ],
    });
    const result = ready(modelOf({ workbenches: [workbench] }), machineId);

    expect(result.machine.currentStateKey).toBe("__CANCELLED");
    expect(result.nodes.map((node) => [node.label, node.role, node.badges.map((item) => item.kind)])).toEqual([
      ["idle", "initial", ["initial"]],
      ["__INIT", "spawn", ["initial", "spawn"]],
      ["__CANCELLED", "current", ["initial", "current", "terminal"]],
    ]);

    const noCurrent = ready(
      modelOf({
        workbenches: [
          workbenchOf({
            machineId: "no-current",
            initialState: "idle",
            states: [stateBlock({ machineId: "no-current", key: "idle", badges: [badge("initial")] })],
          }),
        ],
      }),
      "no-current",
    );

    expect(noCurrent.machine.currentStateKey).toBeUndefined();
    expect(noCurrent.nodes[0]).toMatchObject({ label: "idle", role: "initial" });
  });

  it("покрывает reducer-only layer, empty topics и producer metadata fallbacks", () => {
    const machineId = "metadata";
    const topicProducer = producer({
      machineId: "orphan-producer",
      source: "ghost",
      event: "FROM_ORPHAN",
      routing: { kind: "group", target: { kind: "dynamic", label: "runtimeGroup" } },
      guard: condition("canRoute"),
      confidence: "partial",
    });
    const workbench = workbenchOf({
      machineId,
      states: [
        stateBlock({
          machineId,
          key: "idle",
          rows: [
            reducerRow({ machineId, source: "idle", event: "REDUCE_ONLY", target: stateTarget(machineId, "review") }),
            configRow({ machineId, source: "idle", event: "EMPTY_TOPIC", target: stateTarget(machineId, "done") }),
            configRow({ machineId, source: "idle", event: "FROM_ORPHAN", target: stateTarget(machineId, "done") }),
          ],
        }),
        stateBlock({ machineId, key: "review" }),
        stateBlock({ machineId, key: "done" }),
      ],
    });
    const result = ready(
      modelOf({
        workbenches: [workbench],
        topics: [topic("EMPTY_TOPIC", []), topic("FROM_ORPHAN", [topicProducer])],
      }),
      machineId,
    );

    expect(result.edgeGroups.map((edge) => [edge.label, edge.layer, edge.kind, edge.producerCategory, edge.producers.length])).toEqual([
      ["EMPTY_TOPIC", "config", "accepted-transition", "external", 0],
      ["FROM_ORPHAN", "config", "from-other-transition", "from-other", 1],
      ["REDUCE_ONLY", "reducer", "accepted-transition", "external", 0],
    ]);
    expect(result.edgeGroups.find((edge) => edge.label === "FROM_ORPHAN")?.producers[0]).toMatchObject({
      machineId: "orphan-producer",
      machineTitle: "orphan-producer",
      eventType: "FROM_ORPHAN",
      sourceStateKey: "ghost",
      routingLabel: "group:runtimeGroup",
      guardLabel: "canRoute",
      confidence: "partial",
    });
  });

  it("сохраняет semantic ids детерминированными и кодирует небезопасные сегменты", () => {
    const machineId = "machine/with star*";
    const rows = [
      configRow({ machineId, source: "idle", event: "GO", target: stateTarget(machineId, "done"), rowId: "semantic-row-a" }),
      configRow({ machineId, source: "idle", event: "AGAIN", target: stateTarget(machineId, "done"), rowId: "semantic-row-b" }),
    ];
    const model = modelOf({
      workbenches: [
        workbenchOf({
          machineId,
          states: [stateBlock({ machineId, key: "idle", rows }), stateBlock({ machineId, key: "done" })],
        }),
      ],
    });
    const first = ready(model, machineId);
    const second = ready(model, machineId);

    expect(first.nodes.map((node) => node.nodeId)).toEqual(second.nodes.map((node) => node.nodeId));
    expect(first.edgeGroups.map((edge) => edge.groupId)).toEqual(second.edgeGroups.map((edge) => edge.groupId));
    expect(first.nodes[0]?.nodeId).toContain("machine%2Fwith%20star%2A");
    expect(first.edgeGroups[0]?.groupId).toContain("machine%2Fwith%20star%2A");
    expect(first.edgeGroups[0]?.groupId).not.toContain("semantic-row-a");
    expect(first.edgeGroups[0]?.groupId).not.toContain("semantic-row-b");
  });

  it("прикрепляет topic diagnostics к edge groups и не превращает diagnostic/unknown rows в edges", () => {
    const machineId = "diagnostics";
    const rows = [
      configRow({ machineId, source: "idle", event: "WARN", target: stateTarget(machineId, "done") }),
      effectRow({ machineId, source: "idle", event: "EMIT_ONLY" }),
      effectRow({ machineId, source: "idle", event: "PAIR" }),
      configRow({ machineId, source: "idle", event: "PAIR", target: stateTarget(machineId, "done") }),
      diagnosticRow(machineId, "state-warning"),
      unknownRow(machineId),
    ];
    const result = ready(
      modelOf({
        workbenches: [
          workbenchOf({
            machineId,
            states: [stateBlock({ machineId, key: "idle", rows }), stateBlock({ machineId, key: "done" })],
          }),
        ],
        topics: [
          topic("WARN", [], ["topic-warn"]),
          topic("EMIT_ONLY", [producer({ machineId, source: "idle", event: "EMIT_ONLY" })], ["topic-emit"]),
          topic("PAIR", [producer({ machineId, source: "idle", event: "PAIR" })], ["topic-pair"]),
        ],
      }),
      machineId,
    );
    const byLabel = Object.fromEntries(result.edgeGroups.map((edge) => [edge.label, edge]));

    expect(byLabel.WARN?.diagnostics).toEqual(["topic-warn"]);
    expect(byLabel.EMIT_ONLY?.diagnostics).toEqual(["topic-emit"]);
    expect(byLabel.PAIR?.diagnostics).toEqual(["topic-pair"]);
    expect(result.edgeGroups.flatMap((edge) => edge.rows.map((row) => row.rowKind))).not.toContain("diagnostic");
    expect(result.edgeGroups.flatMap((edge) => edge.rows.map((row) => row.rowKind))).not.toContain("unknown");
  });

  it("обрабатывает fallback counters, global rows, unknown source и routing variants", () => {
    const machineId = "fallback";
    const globalEffect = effectRow({
      machineId,
      source: "idle",
      event: "GLOBAL_EFFECT",
      routing: { kind: "actor", target: { kind: "array", items: [{ kind: "selfField", field: "actorId" }, { kind: "dynamic" }] } },
    });
    const wildcardConfig = {
      ...configRow({ machineId, source: "*", event: "ANY", target: stateTarget(machineId, "idle") }),
      sourceStateId: "wildcard",
    } satisfies GraphConfigRow;
    const secondWildcardConfig = {
      ...configRow({ machineId, source: "*", event: "ANY_AGAIN", target: stateTarget(machineId, "idle") }),
      sourceStateId: "wildcard",
    } satisfies GraphConfigRow;
    const unknownSourceConfig = {
      ...configRow({ machineId, source: "external", event: "UNKNOWN_SOURCE", target: { kind: "self", label: "self" } }),
      sourceStateId: "external-source",
    } satisfies GraphConfigRow;
    const unsupportedTarget = {
      ...configRow({ machineId, source: "idle", event: "UNSUPPORTED", target: stateTarget(machineId, "idle") }),
      target: { kind: "unsupported", label: "unsupported" } as unknown as GraphTargetView,
    } satisfies GraphConfigRow;
    const effectWithSourceId = effectRow({
      machineId,
      source: "ghost",
      event: "NO_SOURCE",
      routing: { kind: "unscoped" },
      guard: condition("hasGhost"),
    }) as GraphEffectRow & { sourceStateId: string };
    const { sourceStateId: _sourceStateId, ...effectWithoutSourceId } = effectWithSourceId;
    void _sourceStateId;
    const workbench = workbenchOf({
      machineId,
      states: [
        stateBlock({ machineId, key: "idle", rows: [unsupportedTarget, diagnosticRow(machineId, "d2"), unknownRow(machineId)] }),
      ],
      globalBehavior: [globalEffect, wildcardConfig, secondWildcardConfig, unknownSourceConfig, effectWithoutSourceId],
    });
    const result = ready(
      modelOf({
        workbenches: [workbench],
        summaries: [],
        topics: [
          topic("GLOBAL_EFFECT", [
            producer({
              machineId,
              source: "idle",
              event: "GLOBAL_EFFECT",
              routing: { kind: "unknown" },
              guard: condition("canRun"),
              confidence: "unknown",
            }),
          ]),
        ],
      }),
      machineId,
    );

    expect(result.machine.counters).toEqual({
      states: 1,
      transitions: 4,
      reducerBranches: 0,
      emissions: 2,
      diagnostics: 0,
    });
    expect(result.nodes.map((node) => [node.label, node.role])).toEqual([
      ["idle", "effect-source"],
      ["*", "wildcard"],
      ["unsupported", "synthetic"],
      ["external-source", "synthetic"],
      ["ghost", "synthetic"],
    ]);
    expect(result.edgeGroups.map((edge) => [edge.label, edge.kind, edge.rows.map((row) => row.rowKind), edge.producers[0]?.routingLabel])).toEqual([
      ["ANY", "accepted-transition", ["config", "config"], undefined],
      ["UNKNOWN_SOURCE", "accepted-transition", ["config"], undefined],
      ["NO_SOURCE", "emission-only", ["effect"], "unscoped"],
      ["GLOBAL_EFFECT", "emission-only", ["effect"], "unknown"],
      ["UNSUPPORTED", "accepted-transition", ["config"], undefined],
    ]);
    expect(result.edgeGroups.find((edge) => edge.label === "NO_SOURCE")?.rows[0]).toMatchObject({
      guardLabel: "hasGhost",
    });
  });
});
