import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as graphRoot from "@lite-fsm/graph";
import {
  compileLiteFsmGraph,
  type GraphCondition,
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
  kind: options.kind ?? (key === "*" ? "wildcard" : "normal"),
  isInitial: options.isInitial ?? false,
  isPublicActorState: options.isPublicActorState ?? !key.startsWith("__"),
  loc: options.loc,
});

const sourceRef = (machineId: string, source: string | GraphStateRef): GraphStateRef => {
  if (typeof source !== "string") return source;
  if (source === "*") return { kind: "wildcard" };

  return { kind: "state", stateId: stateId(machineId, source) };
};

const targetState = (machineId: string, key: string): GraphTarget => ({ kind: "state", stateId: stateId(machineId, key) });

const transition = (input: {
  machineId: string;
  source: string | GraphStateRef;
  event: string;
  target: GraphTarget;
  layer?: GraphTransition["layer"];
  order?: number;
  guard?: GraphCondition;
  reducerCaseId?: string;
  confidence?: GraphTransition["confidence"];
  id?: string;
  loc?: SourceLocation;
}): GraphTransition => {
  const layer = input.layer ?? "config";

  return {
    id: input.id ?? `${input.machineId}:transition:${layer}:${input.source}:${input.event}:${input.order ?? 0}`,
    machineId: input.machineId,
    source: sourceRef(input.machineId, input.source),
    event: { type: input.event, source: layer },
    target: input.target,
    layer,
    order: input.order ?? 0,
    guard: input.guard,
    reducerCaseId: input.reducerCaseId,
    confidence: input.confidence ?? "exact",
    loc: input.loc,
  };
};

const reducerCase = (input: { machineId: string; event: string; targets?: GraphTarget[]; loc?: SourceLocation }): GraphReducerCase => ({
  id: `${input.machineId}:reducer-case:${input.event}`,
  event: { type: input.event, source: "reducer" },
  writesState: true,
  targets: input.targets ?? [],
  confidence: "exact",
  loc: input.loc,
});

const emission = (input: {
  machineId: string;
  source: string | "*";
  event: string;
  routing?: GraphRouting;
  confidence?: GraphEmission["confidence"];
  loc?: SourceLocation;
}): GraphEmission => ({
  id: `${input.machineId}:emission:${input.source}:${input.event}`,
  machineId: input.machineId,
  sourceState: input.source === "*" ? "*" : sourceRef(input.machineId, input.source),
  event: { type: input.event, source: "effect" },
  routing: input.routing ?? { kind: "default" },
  origin: "effect",
  confidence: input.confidence ?? "exact",
  loc: input.loc,
});

const machine = (input: {
  id: string;
  kind?: LiteFsmGraphMachine["kind"];
  initialState?: string;
  managerKeys?: string[];
  states: GraphState[];
  transitions?: GraphTransition[];
  reducerCases?: GraphReducerCase[];
  emissions?: GraphEmission[];
  diagnostics?: GraphDiagnostic[];
  groupTag?: string;
  loc?: SourceLocation;
}): LiteFsmGraphMachine => ({
  id: input.id,
  index: 0,
  variableName: input.id,
  managerKeys: input.managerKeys ?? [],
  kind: input.kind ?? "domain",
  initialState: input.initialState,
  groupTag: input.groupTag,
  states: input.states,
  transitions: input.transitions ?? [],
  reducerCases: input.reducerCases ?? [],
  emissions: input.emissions ?? [],
  diagnostics: input.diagnostics ?? [],
  loc: input.loc,
});

const documentOf = (
  machines: LiteFsmGraphMachine[],
  diagnostics: GraphDiagnostic[] = [],
): LiteFsmGraphDocument => ({
  version: "lite-fsm.graph/v1",
  source: { language: "ts", filename: "fixture.ts" },
  machines: machines.map((item, index) => ({ ...item, index })),
  managers: [
    {
      id: "manager",
      variableName: "manager",
      machineRefs: machines.map((item, index) => ({ key: item.id, machineId: item.id, loc: loc(200 + index) })),
      loc: loc(190),
    },
  ],
  diagnostics,
});

const createProjectionDocument = (): LiteFsmGraphDocument => {
  const flow = machine({
    id: "flow",
    initialState: "idle",
    managerKeys: ["flow"],
    loc: loc(1),
    states: [
      state("flow", "*", { loc: loc(2) }),
      state("flow", "idle", { isInitial: true, loc: loc(3) }),
      state("flow", "loading", { loc: loc(4) }),
      state("flow", "done", { loc: loc(5) }),
    ],
    transitions: [
      transition({ machineId: "flow", source: "idle", event: "START", target: targetState("flow", "loading"), loc: loc(10) }),
      transition({
        machineId: "flow",
        source: "idle",
        event: "START",
        target: targetState("flow", "loading"),
        layer: "reducer",
        reducerCaseId: "flow:reducer-case:START",
        loc: loc(11),
      }),
      transition({
        machineId: "flow",
        source: "idle",
        event: "START",
        target: targetState("flow", "done"),
        layer: "reducer",
        order: 1,
        guard: { kind: "if", text: "payload.done", loc: loc(12) },
        reducerCaseId: "flow:reducer-case:START",
        loc: loc(13),
      }),
      transition({ machineId: "flow", source: "*", event: "RESET", target: targetState("flow", "idle"), loc: loc(14) }),
    ],
    reducerCases: [reducerCase({ machineId: "flow", event: "START", loc: loc(15) })],
    emissions: [
      emission({ machineId: "flow", source: "loading", event: "DONE", loc: loc(16) }),
      emission({
        machineId: "flow",
        source: "*",
        event: "AUDIT",
        routing: { kind: "tag", target: { kind: "literal", value: "workers" } },
        confidence: "partial",
        loc: loc(17),
      }),
    ],
  });
  const worker = machine({
    id: "worker",
    kind: "actorTemplate",
    initialState: "__INIT",
    groupTag: "workers",
    managerKeys: ["worker"],
    loc: loc(30),
    states: [
      state("worker", "__INIT", { isInitial: true, loc: loc(31) }),
      state("worker", "running", { loc: loc(32) }),
      state("worker", "__RESOLVED", { kind: "terminal", isPublicActorState: false, loc: loc(33) }),
    ],
    transitions: [
      transition({ machineId: "worker", source: "__INIT", event: "WORK", target: targetState("worker", "running"), loc: loc(34) }),
      transition({ machineId: "worker", source: "running", event: "DONE", target: { kind: "terminal", terminal: "__RESOLVED" }, loc: loc(35) }),
    ],
  });

  return documentOf([flow, worker]);
};

const topicDigest = (document: LiteFsmGraphDocument) => {
  const model = buildGraphVisualizerModel(document);

  return model.topics.map((topic) => ({
    eventType: topic.eventType,
    producerCount: topic.producerCount,
    consumerCount: topic.consumerCount,
    routingKinds: topic.routingKinds,
    routingValues: topic.routingValues,
    consumers: topic.consumers.map((consumer) => ({
      machineId: consumer.machineId,
      sourceStateKey: consumer.sourceStateKey,
      acceptedTransitionId: consumer.acceptedTransitionId,
      branches: consumer.branches.map((branch) => [branch.layer, branch.transitionId, branch.target.label]),
    })),
    producers: topic.producers.map((producer) => [producer.machineId, producer.sourceStateKey, producer.emissionId]),
  }));
};

const rowDigest = (document: LiteFsmGraphDocument, machineId: string) => {
  const model = buildGraphVisualizerModel(document);
  const workbench = model.workbenchMachines[machineId];
  if (!workbench) throw new Error(`Missing workbench ${machineId}`);

  return {
    states: workbench.states.map((stateBlock) => ({
      stateKey: stateBlock.stateKey,
      badges: stateBlock.badges.map((badge) => badge.kind),
      rows: stateBlock.rows.map((row) => {
        if (row.kind === "config") return [row.kind, row.eventType, row.target.label, row.foldedReducerTransitionIds];
        if (row.kind === "reducer") return [row.kind, row.eventType, row.target.label, row.foldedIntoConfig];
        if (row.kind === "effect") return [row.kind, row.eventType, row.sourceStateKey, row.routing.kind, row.confidence];
        if (row.kind === "diagnostic") return [row.kind, row.severity, row.message];
        return [row.kind, row.label, row.reason];
      }),
    })),
    global: workbench.globalBehavior.map((row) => row.kind),
  };
};

const readSourceFiles = (directory: string): string[] => {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readSourceFiles(path);
    if (!entry.name.endsWith(".ts")) return [];

    return [path];
  });
};

describe("@lite-fsm/graph/view-model: public surface", () => {
  it("экспортирует view-model только из subpath", () => {
    expect("buildGraphVisualizerModel" in graphRoot).toBe(false);
    expect(buildGraphVisualizerModel(documentOf([]))).toMatchObject({
      version: "lite-fsm.visualizer/v1",
      machines: [],
      managers: [
        {
          managerId: "manager",
          machineRefs: [],
        },
      ],
      topics: [],
      workbenchMachines: {},
    });
  });

  it("не импортирует UI, app и simulator runtime зависимости", () => {
    const viewModelDir = fileURLToPath(new URL("../../packages/graph/src/view-model", import.meta.url));
    const contents = readSourceFiles(viewModelDir).map((path) => readFileSync(path, "utf8")).join("\n");

    expect(contents).not.toMatch(/from\s+["']react["']/);
    expect(contents).not.toMatch(/from\s+["']@codemirror\//);
    expect(contents).not.toMatch(/react-flow|reactflow|elkjs|apps\//);
    expect(contents).not.toMatch(/from\s+["']\.\.\/simulator/);
  });
});

describe("@lite-fsm/graph/view-model: L1/L2 и workbench", () => {
  it("строит системный инвентарь, менеджеры, топики и relation index", () => {
    const model = buildGraphVisualizerModel(createProjectionDocument());

    expect(model.machines.map((item) => [item.machineId, item.kind, item.counts])).toMatchInlineSnapshot(`
      [
        [
          "flow",
          "domain",
          {
            "configTransitions": 2,
            "consumedTopics": 2,
            "diagnostics": 0,
            "effectEmissions": 2,
            "producedTopics": 2,
            "reducerBranches": 2,
            "states": 4,
          },
        ],
        [
          "worker",
          "actorTemplate",
          {
            "configTransitions": 2,
            "consumedTopics": 2,
            "diagnostics": 0,
            "effectEmissions": 0,
            "producedTopics": 0,
            "reducerBranches": 0,
            "states": 3,
          },
        ],
      ]
    `);
    expect(model.managers).toMatchObject([
      {
        managerId: "manager",
        machineRefs: [
          { key: "flow", machineId: "flow" },
          { key: "worker", machineId: "worker" },
        ],
      },
    ]);
    expect(topicDigest(createProjectionDocument())).toMatchInlineSnapshot(`
      [
        {
          "consumerCount": 0,
          "consumers": [],
          "eventType": "AUDIT",
          "producerCount": 1,
          "producers": [
            [
              "flow",
              "*",
              "flow:emission:*:AUDIT",
            ],
          ],
          "routingKinds": [
            "tag",
          ],
          "routingValues": [
            {
              "confidence": "exact",
              "kind": "tag",
              "label": "tag:workers",
              "value": "workers",
            },
          ],
        },
        {
          "consumerCount": 1,
          "consumers": [
            {
              "acceptedTransitionId": "worker:transition:config:running:DONE:0",
              "branches": [
                [
                  "config",
                  "worker:transition:config:running:DONE:0",
                  "__RESOLVED",
                ],
              ],
              "machineId": "worker",
              "sourceStateKey": "running",
            },
          ],
          "eventType": "DONE",
          "producerCount": 1,
          "producers": [
            [
              "flow",
              "loading",
              "flow:emission:loading:DONE",
            ],
          ],
          "routingKinds": [
            "default",
          ],
          "routingValues": [
            {
              "confidence": "exact",
              "kind": "default",
              "label": "default",
            },
          ],
        },
        {
          "consumerCount": 1,
          "consumers": [
            {
              "acceptedTransitionId": "flow:transition:config:*:RESET:0",
              "branches": [
                [
                  "config",
                  "flow:transition:config:*:RESET:0",
                  "idle",
                ],
              ],
              "machineId": "flow",
              "sourceStateKey": "*",
            },
          ],
          "eventType": "RESET",
          "producerCount": 0,
          "producers": [],
          "routingKinds": [],
          "routingValues": [],
        },
        {
          "consumerCount": 1,
          "consumers": [
            {
              "acceptedTransitionId": "flow:transition:config:idle:START:0",
              "branches": [
                [
                  "config",
                  "flow:transition:config:idle:START:0",
                  "loading",
                ],
                [
                  "reducer",
                  "flow:transition:reducer:idle:START:0",
                  "loading",
                ],
                [
                  "reducer",
                  "flow:transition:reducer:idle:START:1",
                  "done",
                ],
              ],
              "machineId": "flow",
              "sourceStateKey": "idle",
            },
          ],
          "eventType": "START",
          "producerCount": 0,
          "producers": [],
          "routingKinds": [],
          "routingValues": [],
        },
        {
          "consumerCount": 1,
          "consumers": [
            {
              "acceptedTransitionId": "worker:transition:config:__INIT:WORK:0",
              "branches": [
                [
                  "config",
                  "worker:transition:config:__INIT:WORK:0",
                  "running",
                ],
              ],
              "machineId": "worker",
              "sourceStateKey": "__INIT",
            },
          ],
          "eventType": "WORK",
          "producerCount": 0,
          "producers": [],
          "routingKinds": [],
          "routingValues": [],
        },
      ]
    `);
    expect(model.relations).toMatchInlineSnapshot(`
      {
        "machineIdsByTopicType": {
          "AUDIT": {
            "consumers": [],
            "producers": [
              "flow",
            ],
            "related": [
              "flow",
            ],
          },
          "DONE": {
            "consumers": [
              "worker",
            ],
            "producers": [
              "flow",
            ],
            "related": [
              "flow",
              "worker",
            ],
          },
          "RESET": {
            "consumers": [
              "flow",
            ],
            "producers": [],
            "related": [
              "flow",
            ],
          },
          "START": {
            "consumers": [
              "flow",
            ],
            "producers": [],
            "related": [
              "flow",
            ],
          },
          "WORK": {
            "consumers": [
              "worker",
            ],
            "producers": [],
            "related": [
              "worker",
            ],
          },
        },
        "topicTypesByMachineId": {
          "flow": {
            "consumed": [
              "RESET",
              "START",
            ],
            "produced": [
              "AUDIT",
              "DONE",
            ],
          },
          "worker": {
            "consumed": [
              "DONE",
              "WORK",
            ],
            "produced": [],
          },
        },
      }
    `);
  });

  it("строит machine workbench, folded reducer rows, wildcard и actor lifecycle", () => {
    const document = createProjectionDocument();

    expect(rowDigest(document, "flow")).toMatchInlineSnapshot(`
      {
        "global": [],
        "states": [
          {
            "badges": [
              "domain",
              "wildcard",
              "config",
              "effect",
              "routing",
              "confidence",
            ],
            "rows": [
              [
                "config",
                "RESET",
                "idle",
                [],
              ],
              [
                "effect",
                "AUDIT",
                "*",
                "tag",
                "partial",
              ],
            ],
            "stateKey": "*",
          },
          {
            "badges": [
              "domain",
              "initial",
              "config",
              "reducer",
            ],
            "rows": [
              [
                "config",
                "START",
                "loading",
                [
                  "flow:transition:reducer:idle:START:0",
                ],
              ],
              [
                "reducer",
                "START",
                "done",
                false,
              ],
            ],
            "stateKey": "idle",
          },
          {
            "badges": [
              "domain",
              "effect",
            ],
            "rows": [
              [
                "effect",
                "DONE",
                "loading",
                "default",
                "exact",
              ],
            ],
            "stateKey": "loading",
          },
          {
            "badges": [
              "domain",
            ],
            "rows": [],
            "stateKey": "done",
          },
        ],
      }
    `);
    expect(rowDigest(document, "worker")).toMatchInlineSnapshot(`
      {
        "global": [],
        "states": [
          {
            "badges": [
              "actor-template",
              "group-tag",
              "initial",
              "spawn",
              "config",
            ],
            "rows": [
              [
                "config",
                "WORK",
                "running",
                [],
              ],
            ],
            "stateKey": "__INIT",
          },
          {
            "badges": [
              "actor-template",
              "group-tag",
              "config",
            ],
            "rows": [
              [
                "config",
                "DONE",
                "__RESOLVED",
                [],
              ],
            ],
            "stateKey": "running",
          },
          {
            "badges": [
              "actor-template",
              "group-tag",
              "terminal",
            ],
            "rows": [],
            "stateKey": "__RESOLVED",
          },
        ],
      }
    `);
  });

  it("строит projection для полного compiler fixture без selectMachineGraph", () => {
    const document = compileLiteFsmGraph(fullAssemblerSource, { filename: fullAssemblerFilename }).document;
    const model = buildGraphVisualizerModel(document);

    expect(model.machines).toHaveLength(document.machines.length);
    expect(Object.keys(model.workbenchMachines)).toHaveLength(document.machines.length);
    expect(model.topics.length).toBeGreaterThan(0);
  });

  it("использует общий workbench builder для isolated previews", () => {
    const document = createProjectionDocument();
    const flow = document.machines[0] as LiteFsmGraphMachine;

    expect(buildMachineWorkbenchModel(flow).states.map((stateBlock) => stateBlock.rows.length)).toEqual(
      buildGraphVisualizerModel(document).workbenchMachines.flow?.states.map((stateBlock) => stateBlock.rows.length),
    );
  });
});
