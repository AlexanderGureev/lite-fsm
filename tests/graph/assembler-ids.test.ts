import { describe, expect, it } from "vitest";
import type { GraphDiagnostic, GraphEmission, GraphTarget } from "../../packages/graph/src/types";
import { assembleGraphDocument } from "../../packages/graph/src/compiler/assembler";
import { createSourceCatalog } from "../../packages/graph/src/compiler/catalog";
import { discoverCandidates } from "../../packages/graph/src/compiler/candidates";
import { createDiagnosticSink, normalizeDiagnostics } from "../../packages/graph/src/compiler/diagnostics";
import {
  createEmissionId,
  createGraphTargetFromLabel,
  createMachineId,
  createReducerCaseId,
  createStableHash,
  targetLabelOf,
} from "../../packages/graph/src/compiler/ids";
import { createSourceAdapter } from "../../packages/graph/src/compiler/source";

const candidatesFrom = (sourceText: string) => {
  const source = createSourceAdapter(sourceText, { filename: "assembly.ts" });
  const catalog = createSourceCatalog(source);

  return discoverCandidates(source, catalog);
};

const emissionSourceLabel = (emission: GraphEmission): string => {
  if (emission.sourceState === "*") return "*";
  if (emission.sourceState.kind === "wildcard") return "*";
  if (emission.sourceState.kind === "unknown") return emission.sourceState.label ?? "unknown";

  return emission.sourceState.stateId;
};

describe("GraphAssembler и stable IDs", () => {
  it("назначает machine IDs по exportName, variableName, default и index fallback", () => {
    const result = candidatesFrom(`
      import { createMachine } from "@lite-fsm/core";
      export const exported = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      const local = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      export default createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      register(createMachine({ config: {}, initialState: "IDLE", initialContext: {} }));
    `);
    const document = assembleGraphDocument({
      source: { language: "ts" },
      candidates: result.machines,
    });

    expect(document.machines.map((machine) => machine.id)).toEqual(["exported", "local", "default", "machine:3"]);
    expect(document.machines[3]?.variableName).toBeUndefined();
  });

  it("использует unique managerKey только когда нет более сильного identity source", () => {
    const result = candidatesFrom(`
      import { createMachine, MachineManager } from "@lite-fsm/core";
      MachineManager({
        uniqueInline: createMachine({ config: {}, initialState: "IDLE", initialContext: {} }),
      });
    `);
    const document = assembleGraphDocument({
      source: { language: "ts" },
      candidates: result.machines,
    });

    expect(document.machines).toEqual([expect.objectContaining({ id: "uniqueInline", managerKeys: ["uniqueInline"] })]);
  });

  it("добавляет suffix для повторяющихся machine и manager IDs", () => {
    const result = candidatesFrom(`
      import { createMachine, MachineManager } from "@lite-fsm/core";
      const duplicated = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      const duplicated = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      const duplicated = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      export const manager = MachineManager({}, {});
      export const manager = MachineManager({}, {});
      export const manager = MachineManager({}, {});
    `);
    const document = assembleGraphDocument({
      source: { language: "ts" },
      candidates: result.machines,
      managers: result.managers,
    });

    expect(document.machines.map((machine) => machine.id)).toEqual(["duplicated", "duplicated:1", "duplicated:2"]);
    expect(document.managers.map((manager) => manager.id)).toEqual(["manager", "manager:1", "manager:2"]);
  });

  it("назначает manager IDs по variableName и index fallback", () => {
    const result = candidatesFrom(`
      import { MachineManager } from "@lite-fsm/core";
      const localManager = MachineManager({}, {});
      MachineManager({}, {});
    `);
    const document = assembleGraphDocument({
      source: { language: "ts" },
      managers: result.managers,
    });

    expect(document.managers.map((manager) => manager.id)).toEqual(["localManager", "manager:1"]);
  });

  it("собирает все state kinds, source refs, target kinds, ordinals и slice metadata", () => {
    const result = candidatesFrom(`
      import { createMachine } from "@lite-fsm/core";
      const actor = createMachine({ config: {}, initialState: "__INIT", initialContext: {} });
    `);
    const candidate = result.machines[0];
    const document = assembleGraphDocument({
      source: { filename: "actor.ts", language: "ts", hash: "hash" },
      machineSlices: [
        {
          candidate,
          managerKeys: ["actorKey"],
          diagnostics: [],
          config: {
            kind: "actorTemplate",
            initialState: "__INIT",
            initialContextSummary: { kind: "object", text: "{}" },
            groupTag: "jobs",
            persistence: "snapshot",
            states: [
              { key: "__INIT" },
              { key: "RUNNING" },
              { key: "*" },
              { key: "__RESOLVED" },
              { key: "CUSTOM", kind: "unknown", isInitial: true, isPublicActorState: false },
            ],
            transitions: [
              { sourceKey: "__INIT", event: { type: "SPAWN" }, targetLabel: "RUNNING" },
              { sourceKey: "RUNNING", event: { type: "TICK" }, targetLabel: null },
              { sourceKey: "RUNNING", event: { type: "DONE" }, targetLabel: "__RESOLVED" },
              { sourceKey: "MISSING", event: { type: "LOST" }, targetLabel: "NOWHERE" },
              { sourceKey: "*", event: { type: "RESET" }, targetLabel: "RUNNING" },
              { sourceKey: "RUNNING", event: { type: "TICK" }, targetLabel: null, confidence: "partial" },
            ],
          },
          effects: {
            emissions: [
              {
                sourceKey: "RUNNING",
                event: { type: "PING", source: "effect" },
                routing: { kind: "default" },
                origin: "effect",
                confidence: "exact",
              },
              {
                sourceKey: "RUNNING",
                event: { type: "PING", source: "effect" },
                routing: { kind: "default" },
                origin: "effect",
                confidence: "exact",
              },
              {
                sourceKey: "*",
                event: { type: "RESET", source: "effect" },
                routing: {
                  kind: "group",
                  target: {
                    kind: "array",
                    items: [
                      { kind: "literal", value: "a" },
                      { kind: "selfField", field: "groupId" },
                    ],
                  },
                },
                origin: "effect",
                confidence: "partial",
              },
              {
                sourceKey: "RUNNING",
                event: { type: "DYNAMIC", source: "effect" },
                routing: { kind: "actor", target: { kind: "dynamic" } },
                origin: "effect",
                confidence: "partial",
              },
              {
                sourceKey: "RUNNING",
                event: { type: "UNKNOWN", source: "effect" },
                routing: { kind: "unknown" },
                origin: "unknown",
                confidence: "unknown",
              },
            ],
          },
        },
      ],
    });
    const machine = document.machines[0];

    expect(machine).toMatchObject({
      id: "actor",
      managerKeys: ["actorKey"],
      kind: "actorTemplate",
      initialContextSummary: { kind: "object", text: "{}" },
      groupTag: "jobs",
      persistence: "snapshot",
    });
    expect(machine?.states.map((state) => [state.key, state.kind, state.isInitial, state.isPublicActorState])).toEqual([
      ["__INIT", "init", true, false],
      ["RUNNING", "normal", false, true],
      ["*", "wildcard", false, true],
      ["__RESOLVED", "terminal", false, false],
      ["CUSTOM", "unknown", true, false],
    ]);
    expect(machine?.transitions.map((transition) => transition.source)).toEqual([
      { kind: "state", stateId: "actor:state:__INIT" },
      { kind: "state", stateId: "actor:state:RUNNING" },
      { kind: "state", stateId: "actor:state:RUNNING" },
      { kind: "unknown", label: "MISSING" },
      { kind: "wildcard" },
      { kind: "state", stateId: "actor:state:RUNNING" },
    ]);
    expect(machine?.transitions.map((transition) => transition.target)).toEqual([
      { kind: "state", stateId: "actor:state:RUNNING" },
      { kind: "self" },
      { kind: "terminal", terminal: "__RESOLVED" },
      { kind: "unknown", label: "NOWHERE" },
      { kind: "state", stateId: "actor:state:RUNNING" },
      { kind: "self" },
    ]);
    expect(machine?.transitions.map((transition) => transition.id)).toContain(
      "actor:transition:config:RUNNING:TICK:self:1",
    );
    expect(machine?.emissions.map((emission) => [emission.id, emissionSourceLabel(emission), emission.confidence])).toEqual([
      ["actor:emission:RUNNING:PING:default:0", "actor:state:RUNNING", "exact"],
      ["actor:emission:RUNNING:PING:default:1", "actor:state:RUNNING", "exact"],
      ["actor:emission:*:RESET:group:[a,self.groupId]:0", "*", "partial"],
      ["actor:emission:RUNNING:DYNAMIC:actor:dynamic:0", "actor:state:RUNNING", "partial"],
      ["actor:emission:RUNNING:UNKNOWN:unknown:0", "actor:state:RUNNING", "unknown"],
    ]);
  });
});

describe("diagnostics и id helpers", () => {
  it("сортирует diagnostics по loc, code и message", () => {
    const diagnostics: GraphDiagnostic[] = [
      { code: "B", severity: "warning", message: "b" },
      { code: "A", severity: "warning", message: "z" },
      {
        code: "C",
        severity: "warning",
        message: "c",
        loc: {
          start: { line: 1, column: 4, offset: 3 },
          end: { line: 1, column: 5, offset: 4 },
        },
      },
      { code: "A", severity: "warning", message: "a" },
    ];
    const sink = createDiagnosticSink([diagnostics[0] as GraphDiagnostic]);
    sink.add(diagnostics[2] as GraphDiagnostic);

    expect(normalizeDiagnostics(diagnostics).map((diagnostic) => diagnostic.message)).toEqual(["c", "a", "z", "b"]);
    expect(sink.all().map((diagnostic) => diagnostic.message)).toEqual(["c", "b"]);
  });

  it("строит hash и вспомогательные ID/target labels", () => {
    const stateIds = new Map([["READY", "machine:state:READY"]]);
    const fallbackDefaultCandidate = candidatesFrom(
      "createMachine({ config: {}, initialState: 'IDLE', initialContext: {} });",
    ).machines[0];
    if (!fallbackDefaultCandidate) throw new Error("Expected fallback default candidate");
    const targets: GraphTarget[] = [
      createGraphTargetFromLabel("READY", stateIds),
      createGraphTargetFromLabel(null, stateIds),
      createGraphTargetFromLabel("__CANCELLED", stateIds),
      createGraphTargetFromLabel("MISSING", stateIds),
      { kind: "dynamic" },
      { kind: "dynamic", label: "expr" },
      { kind: "blocked", reason: "blocked" },
      { kind: "unknown" },
    ];

    expect(createStableHash("abc")).toBe("1a47e90b");
    expect(
      createMachineId({
        ...fallbackDefaultCandidate,
        index: 0,
        isDefaultExport: true,
      }),
    ).toBe("default");
    expect(createReducerCaseId({ machineId: "m", eventType: "GO", ordinal: 2 })).toBe("m:reducer:GO:2");
    expect(createEmissionId({ machineId: "m", sourceState: "READY", eventType: "GO", routingLabel: "default", ordinal: 1 })).toBe(
      "m:emission:READY:GO:default:1",
    );
    expect(targets.map(targetLabelOf)).toEqual([
      "machine:state:READY",
      "self",
      "__CANCELLED",
      "MISSING",
      "dynamic",
      "expr",
      "blocked",
      "unknown",
    ]);
  });
});
