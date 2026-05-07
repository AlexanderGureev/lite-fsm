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

const loc = (offset: number): NonNullable<GraphDiagnostic["loc"]> => ({
  start: { line: 1, column: offset + 1, offset },
  end: { line: 1, column: offset + 2, offset: offset + 1 },
});

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

  it("сортирует candidates и manager shells по source index без готовых slices", () => {
    const result = candidatesFrom(`
      import { createMachine, MachineManager } from "@lite-fsm/core";
      const first = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      const second = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      const firstManager = MachineManager({}, {});
      const secondManager = MachineManager({}, {});
    `);
    const document = assembleGraphDocument({
      source: { language: "ts" },
      candidates: [...result.machines].reverse(),
      managers: [...result.managers].reverse(),
    });

    expect(document.machines.map((machine) => [machine.id, machine.index])).toEqual([
      ["first", 0],
      ["second", 1],
    ]);
    expect(document.managers.map((manager) => manager.id)).toEqual(["firstManager", "secondManager"]);
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
      { kind: "wildcard" },
      { kind: "unknown", label: "MISSING" },
      { kind: "state", stateId: "actor:state:RUNNING" },
      { kind: "state", stateId: "actor:state:RUNNING" },
      { kind: "state", stateId: "actor:state:RUNNING" },
    ]);
    expect(machine?.transitions.map((transition) => transition.target)).toEqual([
      { kind: "state", stateId: "actor:state:RUNNING" },
      { kind: "state", stateId: "actor:state:RUNNING" },
      { kind: "unknown", label: "NOWHERE" },
      { kind: "terminal", terminal: "__RESOLVED" },
      { kind: "self" },
      { kind: "self" },
    ]);
    expect(machine?.transitions.map((transition) => transition.id)).toContain(
      "actor:transition:config:RUNNING:TICK:self:1",
    );
    expect(machine?.emissions.map((emission) => [emission.id, emissionSourceLabel(emission), emission.confidence])).toEqual([
      ["actor:emission:*:RESET:group:[a,self.groupId]:0", "*", "partial"],
      ["actor:emission:RUNNING:DYNAMIC:actor:dynamic:0", "actor:state:RUNNING", "partial"],
      ["actor:emission:RUNNING:PING:default:0", "actor:state:RUNNING", "exact"],
      ["actor:emission:RUNNING:PING:default:1", "actor:state:RUNNING", "exact"],
      ["actor:emission:RUNNING:UNKNOWN:unknown:0", "actor:state:RUNNING", "unknown"],
    ]);
  });

  it("нормализует порядок slices, manager links, graph слоев и diagnostics", () => {
    const result = candidatesFrom(`
      import { createMachine, MachineManager } from "@lite-fsm/core";
      const first = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      const second = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
      const firstManager = MachineManager({}, {});
      const secondManager = MachineManager({}, {});
    `);
    const [first, second] = result.machines;
    const [firstManager, secondManager] = result.managers;
    if (!first || !second || !firstManager || !secondManager) throw new Error("Expected candidates");

    const document = assembleGraphDocument({
      source: { filename: "assembly.ts", language: "ts" },
      machineSlices: [
        {
          candidate: second,
          managerKeys: [],
          diagnostics: [{ code: "Z_MACHINE", severity: "warning", message: "machine" }],
          config: {
            states: [{ key: "IDLE" }, { key: "READY" }, { key: "DONE" }],
            transitions: [
              { sourceKey: "READY", event: { type: "FINISH" }, targetLabel: "DONE", loc: loc(30) },
              {
                sourceKey: "IDLE",
                event: { type: "DYNAMIC" },
                targetLabel: null,
                target: { kind: "dynamic", label: "runtime" },
                loc: loc(20),
              },
              { sourceKey: "IDLE", event: { type: "START" }, targetLabel: "READY", loc: loc(10) },
            ],
            diagnostics: [
              { code: "B_CONFIG", severity: "warning", message: "config b", loc: loc(90) },
              { code: "A_CONFIG", severity: "warning", message: "config a", loc: loc(80) },
            ],
          },
          reducer: {
            reducerCases: [
              {
                event: { type: "RESET" },
                writesState: true,
                targets: [{ targetLabel: "IDLE" }],
                confidence: "exact",
                loc: loc(60),
              },
              {
                event: { type: "GO" },
                guard: { kind: "if", text: "if ok", loc: loc(39) },
                writesState: true,
                targets: [{ targetLabel: null, target: { kind: "dynamic", label: "branch" } }],
                confidence: "partial",
                loc: loc(40),
              },
            ],
            transitions: [
              {
                sourceKey: "READY",
                event: { type: "RESET" },
                targetLabel: "IDLE",
                reducerCaseIndex: 0,
                confidence: "exact",
                loc: loc(70),
              },
              {
                sourceKey: "IDLE",
                event: { type: "GO" },
                targetLabel: null,
                target: { kind: "dynamic", label: "branch" },
                guard: { kind: "if", text: "if ok", loc: loc(49) },
                reducerCaseIndex: 1,
                confidence: "partial",
                loc: loc(50),
              },
            ],
            diagnostics: [{ code: "C_REDUCER", severity: "warning", message: "reducer", loc: loc(70) }],
          },
          effects: {
            emissions: [
              {
                sourceKey: "READY",
                event: { type: "LATE" },
                routing: { kind: "default" },
                origin: "effect",
                confidence: "exact",
                loc: loc(120),
              },
              {
                sourceKey: "IDLE",
                event: { type: "EARLY" },
                routing: { kind: "unknown", label: "routed" },
                origin: "unknown",
                guard: { kind: "else", text: "else", loc: loc(109) },
                confidence: "unknown",
                loc: loc(110),
              },
            ],
            diagnostics: [{ code: "D_EFFECT", severity: "warning", message: "effect", loc: loc(100) }],
          },
        },
        {
          candidate: first,
          managerKeys: [],
          diagnostics: [{ code: "FIRST", severity: "warning", message: "first" }],
          config: {
            states: [{ key: "IDLE" }],
            transitions: [],
          },
        },
      ],
      managerLinks: [
        { manager: secondManager, refs: [{ key: "second", machineCandidate: second }], diagnostics: [] },
        { manager: firstManager, refs: [{ key: "first", machineCandidate: first }], diagnostics: [] },
      ],
    });
    const secondMachine = document.machines[1];
    if (!secondMachine) throw new Error("Expected second machine");

    expect(document.machines.map((machine) => machine.id)).toEqual(["first", "second"]);
    expect(document.managers.map((manager) => manager.id)).toEqual(["firstManager", "secondManager"]);
    expect(document.managers.map((manager) => manager.machineRefs.map((ref) => ref.machineId))).toEqual([
      ["first"],
      ["second"],
    ]);
    expect(secondMachine.transitions.map((transition) => [transition.id, transition.reducerCaseId])).toEqual([
      ["second:transition:config:IDLE:START:READY:0", undefined],
      ["second:transition:config:IDLE:DYNAMIC:runtime:0", undefined],
      ["second:transition:config:READY:FINISH:DONE:0", undefined],
      ["second:transition:reducer:IDLE:GO:branch:0", "second:reducer:GO:0"],
      ["second:transition:reducer:READY:RESET:IDLE:0", "second:reducer:RESET:0"],
    ]);
    expect(secondMachine.reducerCases.map((reducerCase) => reducerCase.id)).toEqual([
      "second:reducer:GO:0",
      "second:reducer:RESET:0",
    ]);
    expect(secondMachine.emissions.map((emission) => emission.id)).toEqual([
      "second:emission:IDLE:EARLY:routed:0",
      "second:emission:READY:LATE:default:0",
    ]);
    expect(secondMachine.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.machineId])).toEqual([
      ["C_REDUCER", "second"],
      ["A_CONFIG", "second"],
      ["B_CONFIG", "second"],
      ["D_EFFECT", "second"],
      ["Z_MACHINE", "second"],
    ]);
  });

  it("строит transition IDs из явного GraphTarget, когда targetLabel не задан", () => {
    const result = candidatesFrom(`
      import { createMachine } from "@lite-fsm/core";
      const graphTargets = createMachine({ config: {}, initialState: "IDLE", initialContext: {} });
    `);
    const candidate = result.machines[0];
    if (!candidate) throw new Error("Expected candidate");

    const explicitTargets: Array<[string, GraphTarget]> = [
      ["STATE", { kind: "state", stateId: "external:state:READY" }],
      ["SELF", { kind: "self" }],
      ["TERMINAL", { kind: "terminal", terminal: "__CANCELLED" }],
      ["DYNAMIC", { kind: "dynamic", label: "runtimeTarget" }],
      ["BLOCKED", { kind: "blocked", reason: "not-allowed" }],
      ["UNKNOWN", { kind: "unknown", label: "mystery" }],
    ];

    const document = assembleGraphDocument({
      source: { language: "ts" },
      machineSlices: [
        {
          candidate,
          managerKeys: [],
          diagnostics: [],
          config: {
            states: [{ key: "IDLE" }, { key: "READY" }],
            transitions: [
              ...explicitTargets.map(([event, target], index) => ({
                sourceKey: "IDLE",
                event: { type: event },
                targetLabel: null,
                target,
                loc: loc(index * 10),
              })),
              {
                sourceKey: "READY",
                event: { type: "LABEL_WINS" },
                targetLabel: "semantic-label",
                target: { kind: "dynamic", label: "ignoredTargetLabel" } satisfies GraphTarget,
                loc: loc(100),
              },
            ],
          },
          reducer: {
            reducerCases: [
              {
                event: { type: "REDUCE_DYNAMIC" },
                writesState: true,
                targets: [{ targetLabel: null, target: { kind: "dynamic", label: "reducerRuntime" } }],
                confidence: "unknown",
                loc: loc(120),
              },
            ],
            transitions: [
              {
                sourceKey: "IDLE",
                event: { type: "REDUCE_DYNAMIC" },
                targetLabel: null,
                target: { kind: "dynamic", label: "reducerRuntime" },
                reducerCaseIndex: 0,
                confidence: "unknown",
                loc: loc(130),
              },
            ],
          },
        },
      ],
    });
    const machine = document.machines[0];

    expect(machine?.transitions.map((transition) => transition.id)).toEqual([
      "graphTargets:transition:config:IDLE:STATE:external:state:READY:0",
      "graphTargets:transition:config:IDLE:SELF:self:0",
      "graphTargets:transition:config:IDLE:TERMINAL:__CANCELLED:0",
      "graphTargets:transition:config:IDLE:DYNAMIC:runtimeTarget:0",
      "graphTargets:transition:config:IDLE:BLOCKED:not-allowed:0",
      "graphTargets:transition:config:IDLE:UNKNOWN:mystery:0",
      "graphTargets:transition:config:READY:LABEL_WINS:semantic-label:0",
      "graphTargets:transition:reducer:IDLE:REDUCE_DYNAMIC:reducerRuntime:0",
    ]);
    expect(machine?.reducerCases[0]).toMatchObject({
      id: "graphTargets:reducer:REDUCE_DYNAMIC:0",
      targets: [{ kind: "dynamic", label: "reducerRuntime" }],
    });
    expect(machine?.transitions[machine.transitions.length - 1]?.reducerCaseId).toBe(
      "graphTargets:reducer:REDUCE_DYNAMIC:0",
    );
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
