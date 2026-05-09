import { describe, expect, it } from "vitest";
import {
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
  type SourceLocation,
} from "@lite-fsm/graph";
import { buildGraphVisualizerModel, buildMachineWorkbenchModel } from "@lite-fsm/graph/view-model";
import { indexDiagnostics, type DiagnosticIndex } from "../../packages/graph/src/view-model/diagnostics";
import { createGraphVisualizerIndexes, sourceRefKey, sourceStateId, sourceStateKey, targetKey } from "../../packages/graph/src/view-model/indexes";
import { sourceAnchor, sourceAnchors } from "../../packages/graph/src/view-model/source-anchors";
import { targetView } from "../../packages/graph/src/view-model/targets";
import type { GraphDiagnosticAnchor } from "../../packages/graph/src/view-model/types";
import { buildMachineWorkbenchModelFromDiagnostics } from "../../packages/graph/src/view-model/workbench";

const loc = (offset: number): SourceLocation => ({
  start: { line: 1, column: offset + 1, offset },
  end: { line: 1, column: offset + 2, offset: offset + 1 },
});

const stateId = (machineId: string, key: string): string => `${machineId}:state:${key}`;

const state = (machineId: string, key: string, offset?: number, kind: GraphState["kind"] = "normal"): GraphState => ({
  id: stateId(machineId, key),
  key,
  kind,
  isInitial: key === "idle",
  isPublicActorState: !key.startsWith("__"),
  loc: offset === undefined ? undefined : loc(offset),
});

const sourceRef = (machineId: string, source: string | GraphStateRef): GraphStateRef => {
  if (typeof source !== "string") return source;
  if (source === "*") return { kind: "wildcard" };

  return { kind: "state", stateId: stateId(machineId, source) };
};

const transition = (input: {
  machineId?: string;
  id?: string;
  source?: string | GraphStateRef;
  event?: string;
  target?: GraphTarget;
  layer?: GraphTransition["layer"];
  order?: number;
  loc?: SourceLocation;
}): GraphTransition => {
  const machineId = input.machineId ?? "flow";
  const source = input.source ?? "idle";
  const layer = input.layer ?? "config";
  const event = input.event ?? "GO";

  return {
    id: input.id ?? `${machineId}:transition:${layer}:${typeof source === "string" ? source : source.kind}:${event}:${input.order ?? 0}`,
    machineId,
    source: sourceRef(machineId, source),
    event: { type: event, source: layer },
    target: input.target ?? { kind: "state", stateId: stateId(machineId, "ready") },
    layer,
    order: input.order ?? 0,
    confidence: "exact",
    loc: input.loc,
  };
};

const emission = (input: {
  machineId?: string;
  source?: string | GraphStateRef | "*";
  event?: string;
  routing?: GraphRouting;
  loc?: SourceLocation;
}): GraphEmission => {
  const machineId = input.machineId ?? "flow";
  const source = input.source ?? "ready";

  return {
    id: `${machineId}:emission:${typeof source === "string" ? source : source.kind}:${input.event ?? "DONE"}`,
    machineId,
    sourceState: source === "*" ? "*" : sourceRef(machineId, source),
    event: { type: input.event ?? "DONE", source: "effect" },
    routing: input.routing ?? { kind: "default" },
    origin: "effect",
    confidence: "exact",
    loc: input.loc,
  };
};

const reducerCase = (machineId: string, event = "GO", offset?: number): GraphReducerCase => ({
  id: `${machineId}:reducer-case:${event}`,
  event: { type: event, source: "reducer" },
  writesState: true,
  targets: [{ kind: "state", stateId: stateId(machineId, "ready") }],
  confidence: "exact",
  loc: offset === undefined ? undefined : loc(offset),
});

const machine = (input: Partial<LiteFsmGraphMachine> & { id?: string } = {}): LiteFsmGraphMachine => {
  const id = input.id ?? "flow";

  return {
    id,
    index: input.index ?? 0,
    variableName: input.variableName,
    exportName: input.exportName,
    managerKeys: input.managerKeys ?? [],
    kind: input.kind ?? "domain",
    initialState: input.initialState ?? "idle",
    initialContextSummary: input.initialContextSummary,
    initialContextJson: input.initialContextJson,
    groupTag: input.groupTag,
    persistence: input.persistence,
    states: input.states ?? [state(id, "idle", 1), state(id, "ready", 2), state(id, "done", 3)],
    transitions: input.transitions ?? [transition({ machineId: id, loc: loc(10) })],
    emissions: input.emissions ?? [emission({ machineId: id, loc: loc(20) })],
    reducerCases: input.reducerCases ?? [reducerCase(id, "GO", 30)],
    diagnostics: input.diagnostics ?? [],
    loc: input.loc,
  };
};

const documentOf = (machines: LiteFsmGraphMachine[], diagnostics: GraphDiagnostic[] = []): LiteFsmGraphDocument => ({
  version: "lite-fsm.graph/v1",
  source: { language: "ts" },
  machines: machines.map((item, index) => ({ ...item, index })),
  managers: [{ id: "manager", variableName: "manager", machineRefs: [], loc: loc(100) }],
  diagnostics,
});

const diagnostic = (code: string, offset?: number, machineId?: string): GraphDiagnostic => ({
  code,
  severity: "warning",
  message: code,
  machineId,
  loc: offset === undefined ? undefined : loc(offset),
});

describe("@lite-fsm/graph/view-model edge cases", () => {
  it("покрывает title fallback, source refs, target views и read-only empty anchors", () => {
    const exportOnly = machine({ id: "exportOnly", variableName: undefined, exportName: "ExportedMachine" });
    const idOnly = machine({ id: "idOnly", variableName: undefined, exportName: undefined });
    const noWildcard = machine({ states: [state("flow", "idle"), state("flow", "ready")] });
    const unknownSource = { kind: "unknown", label: "external" } satisfies GraphStateRef;
    const unknownSourceNoLabel = { kind: "unknown" } satisfies GraphStateRef;

    expect(buildGraphVisualizerModel(documentOf([exportOnly, idOnly])).machines.map((item) => item.title)).toEqual([
      "ExportedMachine",
      "idOnly",
    ]);
    expect(sourceAnchor("machine", undefined)).toBeUndefined();
    expect(sourceAnchors("state", undefined)).toEqual([]);
    expect(sourceStateId(noWildcard, "*")).toBeUndefined();
    expect(sourceStateId(noWildcard, { kind: "wildcard" })).toBeUndefined();
    expect(sourceStateKey(noWildcard, { kind: "state", stateId: "missing-state" })).toBe("missing-state");
    expect(sourceStateKey(noWildcard, unknownSource)).toBe("external");
    expect(sourceStateKey(noWildcard, unknownSourceNoLabel)).toBe("unknown");
    expect(sourceRefKey(unknownSourceNoLabel)).toBe("unknown:");

    expect(
      [
        { kind: "state", stateId: "missing-state" },
        { kind: "self" },
        { kind: "terminal", terminal: "__REJECTED" },
        { kind: "blocked", reason: "invalid" },
        { kind: "dynamic" },
        { kind: "unknown" },
      ].map((target) => targetView(noWildcard, target as GraphTarget)),
    ).toEqual([
      { kind: "state", label: "missing-state", stateId: "missing-state" },
      { kind: "self", label: "self" },
      { kind: "terminal", label: "__REJECTED", terminal: "__REJECTED" },
      { kind: "blocked", label: "invalid", blockedReason: "invalid" },
      { kind: "dynamic", label: "dynamic" },
      { kind: "unknown", label: "unknown" },
    ]);
    expect(
      [
        { kind: "state", stateId: "s" },
        { kind: "self" },
        { kind: "terminal", terminal: "__CANCELLED" },
        { kind: "blocked", reason: "blocked" },
        { kind: "dynamic" },
        { kind: "unknown" },
      ].map((target) => targetKey(target as GraphTarget)),
    ).toEqual(["state:s", "self", "terminal:__CANCELLED", "blocked:blocked", "dynamic:", "unknown:"]);
  });

  it("покрывает diagnostics binding без machineId для manager, machine, state, transition, emission и reducer case", () => {
    const flow = machine({ loc: loc(5) });
    const model = buildGraphVisualizerModel(
      documentOf(flow ? [flow] : [], [
        diagnostic("MANAGER", 100),
        diagnostic("MACHINE", 5),
        diagnostic("STATE", 1),
        diagnostic("TRANSITION", 10),
        diagnostic("EMISSION", 20),
        diagnostic("REDUCER_CASE", 30),
        diagnostic("MACHINE_EMISSION", 20, "flow"),
        diagnostic("MACHINE_REDUCER_CASE", 30, "flow"),
        diagnostic("MISSING_MACHINE", undefined, "missing"),
        diagnostic("NO_MATCH", 999),
      ]),
    );

    expect(model.diagnostics.map((item) => [item.diagnostic.code, item.graphItemRef])).toEqual([
      ["MANAGER", { kind: "manager", managerId: "manager" }],
      ["MACHINE", { kind: "machine", machineId: "flow" }],
      ["STATE", { kind: "state", machineId: "flow", stateId: "flow:state:idle" }],
      ["TRANSITION", { kind: "transition", machineId: "flow", transitionId: "flow:transition:config:idle:GO:0" }],
      ["EMISSION", { kind: "emission", machineId: "flow", emissionId: "flow:emission:ready:DONE" }],
      ["REDUCER_CASE", { kind: "reducerCase", machineId: "flow", reducerCaseId: "flow:reducer-case:GO" }],
      ["MACHINE_EMISSION", { kind: "emission", machineId: "flow", emissionId: "flow:emission:ready:DONE" }],
      ["MACHINE_REDUCER_CASE", { kind: "reducerCase", machineId: "flow", reducerCaseId: "flow:reducer-case:GO" }],
      ["MISSING_MACHINE", undefined],
      ["NO_MATCH", undefined],
    ]);
    expect(model.topics.find((topic) => topic.eventType === "DONE")?.diagnosticIds).toHaveLength(2);
    expect(model.topics.find((topic) => topic.eventType === "GO")?.diagnosticIds).toHaveLength(3);
  });

  it("покрывает defensive diagnostic indexing для topic refs и missing graph machines", () => {
    const doc = documentOf([machine()]);
    doc.managers[0] = { id: "fallbackManager", machineRefs: [] };
    const indexes = createGraphVisualizerIndexes(doc);
    const anchors: GraphDiagnosticAnchor[] = [
      {
        diagnosticId: "topic",
        origin: "compiler",
        diagnostic: diagnostic("TOPIC"),
        graphItemRef: { kind: "topic", eventType: "TOPIC" },
      },
      {
        diagnosticId: "missing-machine",
        origin: "compiler",
        diagnostic: diagnostic("MISSING"),
        graphItemRef: { kind: "transition", machineId: "missing", transitionId: "transition" },
      },
    ];
    const indexed: DiagnosticIndex = indexDiagnostics(doc, anchors, indexes);

    expect(indexed.idsByTopicType.get("TOPIC")).toEqual(["topic"]);
    expect(indexed.idsByTopicType.has("transition")).toBe(false);
    expect(buildGraphVisualizerModel(doc).managers[0]?.title).toBe("fallbackManager");
  });

  it("покрывает routing variants, unknown sources и global rows", () => {
    const unknownSource = { kind: "unknown", label: "external-source" } satisfies GraphStateRef;
    const flow = machine({
      transitions: [
        transition({ event: "SELF", target: { kind: "self" } }),
        transition({ event: "TERMINAL", target: { kind: "terminal", terminal: "__RESOLVED" } }),
        transition({ event: "BLOCKED", target: { kind: "blocked", reason: "unsupported" } }),
        transition({ event: "DYNAMIC", target: { kind: "dynamic", label: "expr" } }),
        transition({ event: "UNKNOWN", target: { kind: "unknown", label: "mystery" } }),
        transition({ source: unknownSource, event: "EXTERNAL", target: { kind: "self" } }),
        transition({ source: { kind: "state", stateId: "missing-state" }, event: "MISSING_SOURCE", target: { kind: "self" } }),
        transition({ source: "*", event: "WILDCARD_WITHOUT_STATE", target: { kind: "self" } }),
        transition({ source: unknownSource, event: "ONLY_REDUCER", target: { kind: "self" }, layer: "reducer" }),
      ],
      emissions: [
        emission({ event: "UNSCOPED", routing: { kind: "unscoped" } }),
        emission({ event: "UNKNOWN_ROUTING", routing: { kind: "unknown" } }),
        emission({ event: "ACTOR", routing: { kind: "actor", target: { kind: "literal", value: "actor-1" } } }),
        emission({ event: "GROUP", routing: { kind: "group", target: { kind: "selfField", field: "groupTag" } } }),
        emission({
          event: "TAG",
          routing: {
            kind: "tag",
            target: { kind: "array", items: [{ kind: "literal", value: "workers" }, { kind: "dynamic" }] },
          },
        }),
        emission({
          event: "TAG_DUP",
          routing: {
            kind: "tag",
            target: { kind: "array", items: [{ kind: "literal", value: "workers" }, { kind: "literal", value: "workers" }] },
          },
        }),
      ],
    });
    const model = buildGraphVisualizerModel(documentOf([flow]));

    expect(model.workbenchMachines.flow?.globalBehavior.map((row) => [row.kind, "eventType" in row ? row.eventType : ""])).toEqual([
      ["config", "EXTERNAL"],
      ["config", "MISSING_SOURCE"],
      ["config", "WILDCARD_WITHOUT_STATE"],
      ["reducer", "ONLY_REDUCER"],
    ]);
    expect(
      model.topics
        .filter((topic) => topic.producerCount > 0)
        .map((topic) => [topic.eventType, topic.routingKinds, topic.routingValues]),
    ).toMatchInlineSnapshot(`
      [
        [
          "ACTOR",
          [
            "actor",
          ],
          [
            {
              "confidence": "exact",
              "kind": "actor",
              "label": "actor:actor-1",
              "value": "actor-1",
            },
          ],
        ],
        [
          "GROUP",
          [
            "group",
          ],
          [
            {
              "confidence": "partial",
              "kind": "group",
              "label": "group:self.groupTag",
              "value": "groupTag",
            },
          ],
        ],
        [
          "TAG",
          [
            "tag",
          ],
          [
            {
              "confidence": "unknown",
              "kind": "tag",
              "label": "tag:dynamic",
            },
            {
              "confidence": "exact",
              "kind": "tag",
              "label": "tag:workers",
              "value": "workers",
            },
          ],
        ],
        [
          "TAG_DUP",
          [
            "tag",
          ],
          [
            {
              "confidence": "exact",
              "kind": "tag",
              "label": "tag:workers",
              "value": "workers",
            },
          ],
        ],
        [
          "UNKNOWN_ROUTING",
          [
            "unknown",
          ],
          [
            {
              "confidence": "unknown",
              "kind": "unknown",
              "label": "unknown",
            },
          ],
        ],
        [
          "UNSCOPED",
          [
            "unscoped",
          ],
          [
            {
              "confidence": "exact",
              "kind": "unscoped",
              "label": "unscoped",
            },
          ],
        ],
      ]
    `);
  });

  it("покрывает simulation dispatchability variants, single current state и collapse policy", () => {
    const flow = machine({
      states: [state("flow", "idle"), state("flow", "ready"), state("flow", "__RESOLVED", undefined, "terminal")],
      transitions: [transition({}), transition({ event: "NEXT", target: { kind: "state", stateId: stateId("flow", "__RESOLVED") } })],
      emissions: [
        emission({ source: "idle", event: "FROM_IDLE" }),
        emission({ source: "ready", event: "FROM_READY" }),
        emission({ source: "ready", event: "UNKNOWN_ROUTING", routing: { kind: "unknown", label: "dynamic route" } }),
        emission({ source: "__RESOLVED", event: "TERMINAL_EFFECT" }),
      ],
    });
    const machineLevel = buildGraphVisualizerModel(documentOf([flow]), {
      simulation: {
        currentStateIdsByMachineId: { flow: stateId("flow", "ready") },
        availableTransitionIdsByMachineId: { flow: ["flow:transition:config:idle:GO:0"] },
        suggestedEmissionIdsByMachineId: {
          flow: ["flow:emission:idle:FROM_IDLE", "flow:emission:ready:FROM_READY", "flow:emission:ready:UNKNOWN_ROUTING"],
        },
      },
    }).workbenchMachines.flow;
    const currentOnly = buildMachineWorkbenchModel(flow, {
      simulation: {
        currentStateId: stateId("flow", "idle"),
        availableTransitionIds: ["flow:transition:config:idle:GO:0"],
      },
    });
    const terminal = buildMachineWorkbenchModel(flow, {
      simulation: {
        currentStateId: stateId("flow", "__RESOLVED"),
        suggestedEmissionIds: ["flow:emission:__RESOLVED:TERMINAL_EFFECT"],
      },
      collapse: { kind: "collapse-non-current-long-states", rowThreshold: 0 },
    });

    expect(machineLevel?.currentStateId).toBe(stateId("flow", "ready"));
    expect(
      machineLevel?.states.flatMap((stateBlock) =>
        stateBlock.rows.filter((row) => row.kind === "effect").map((row) => [row.eventType, row.dispatchability]),
      ),
    ).toEqual([
      ["FROM_IDLE", "not-current-state"],
      ["FROM_READY", "can-dispatch"],
      ["UNKNOWN_ROUTING", "unknown-routing"],
      ["TERMINAL_EFFECT", undefined],
    ]);
    expect(
      terminal.states.map((stateBlock) => ({
        stateKey: stateBlock.stateKey,
        current: stateBlock.current,
        collapsed: stateBlock.collapsed,
        dispatchability: stateBlock.rows.find((row) => row.kind === "effect")?.dispatchability,
      })),
    ).toEqual([
      { stateKey: "idle", current: false, collapsed: true, dispatchability: undefined },
      { stateKey: "ready", current: false, collapsed: true, dispatchability: undefined },
      { stateKey: "__RESOLVED", current: true, collapsed: false, dispatchability: "terminal-slice" },
    ]);
    const currentRow = currentOnly.states[0]?.rows[0];
    expect(currentRow && "simulation" in currentRow ? currentRow.simulation : undefined).toEqual({ available: true });
  });

  it("покрывает machine workbench diagnostics без graph ref", () => {
    const flow = machine();
    const workbench = buildMachineWorkbenchModelFromDiagnostics(flow, [
      {
        diagnosticId: "manual",
        origin: "compiler",
        diagnostic: { code: "MANUAL", severity: "warning", message: "manual", machineId: "flow" },
      },
    ]);

    expect(workbench.globalBehavior).toMatchObject([
      {
        kind: "diagnostic",
        diagnosticId: "manual",
      },
    ]);
  });
});
