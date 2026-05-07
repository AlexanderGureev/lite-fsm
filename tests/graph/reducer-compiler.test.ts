import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  compileLiteFsmGraph,
  type GraphReducerCase,
  type GraphStateRef,
  type GraphTarget,
  type LiteFsmGraphMachine,
} from "@lite-fsm/graph";

const fixturePath = fileURLToPath(new URL("../../xstate/graph-parser-fixtures.ts", import.meta.url));

const compileFixture = () => compileLiteFsmGraph(readFileSync(fixturePath, "utf8"), { filename: fixturePath });

const getMachine = (machines: readonly LiteFsmGraphMachine[], id: string): LiteFsmGraphMachine => {
  const machine = machines.find((candidate) => candidate.id === id);
  if (!machine) throw new Error(`Missing machine ${id}`);

  return machine;
};

const compileSnippetMachines = (source: string): LiteFsmGraphMachine[] => {
  return compileLiteFsmGraph(source, { filename: "reducer-snippet.ts" }).document.machines;
};

const stateKeyById = (machine: LiteFsmGraphMachine): ReadonlyMap<string, string> => {
  return new Map(machine.states.map((state) => [state.id, state.key]));
};

const sourceLabel = (machine: LiteFsmGraphMachine, source: GraphStateRef): string => {
  if (source.kind === "wildcard") return "*";
  if (source.kind === "unknown") return source.label ?? "unknown";

  return stateKeyById(machine).get(source.stateId) ?? source.stateId;
};

const targetLabel = (machine: LiteFsmGraphMachine, target: GraphTarget): string => {
  if (target.kind === "state") return stateKeyById(machine).get(target.stateId) ?? target.stateId;
  if (target.kind === "terminal") return target.terminal;
  if (target.kind === "self") return "self";
  if (target.kind === "dynamic") return `dynamic:${target.label ?? "dynamic"}`;
  if (target.kind === "blocked") return `blocked:${target.reason}`;

  return `unknown:${target.label ?? "unknown"}`;
};

const reducerCaseRows = (machine: LiteFsmGraphMachine) => {
  return machine.reducerCases.map((reducerCase) => ({
    id: reducerCase.id,
    event: reducerCase.event.type,
    targets: reducerCase.targets.map((target) => targetLabel(machine, target)),
    writesState: reducerCase.writesState,
    guardKind: reducerCase.guard?.kind,
    confidence: reducerCase.confidence,
  }));
};

const reducerTransitionRows = (machine: LiteFsmGraphMachine) => {
  return machine.transitions
    .filter((transition) => transition.layer === "reducer")
    .map((transition) => ({
      id: transition.id,
      source: sourceLabel(machine, transition.source),
      event: transition.event.type,
      eventSource: transition.event.source,
      target: targetLabel(machine, transition.target),
      reducerCaseId: transition.reducerCaseId,
      guardKind: transition.guard?.kind,
      confidence: transition.confidence,
      order: transition.order,
    }));
};

const reducerCaseByEvent = (machine: LiteFsmGraphMachine, event: string): GraphReducerCase[] => {
  return machine.reducerCases.filter((reducerCase) => reducerCase.event.type === event);
};

const diagnosticCodes = (machine: LiteFsmGraphMachine): string[] => {
  return machine.diagnostics.map((diagnostic) => diagnostic.code);
};

describe("ReducerCompiler по fixture", () => {
  it("извлекает switch cases, ternary targets и nextState", () => {
    const machine = getMachine(compileFixture().document.machines, "switchReducerMachine");

    expect(reducerCaseRows(machine)).toEqual([
      {
        id: "switchReducerMachine:reducer:SUBMIT:0",
        event: "SUBMIT",
        targets: ["VALID", "INVALID"],
        writesState: true,
        guardKind: "ternary",
        confidence: "partial",
      },
      {
        id: "switchReducerMachine:reducer:RESET:0",
        event: "RESET",
        targets: ["IDLE"],
        writesState: true,
        guardKind: "switch-case",
        confidence: "exact",
      },
    ]);
    expect(reducerTransitionRows(machine)).toEqual([
      expect.objectContaining({
        id: "switchReducerMachine:transition:reducer:IDLE:SUBMIT:VALID:0",
        source: "IDLE",
        event: "SUBMIT",
        eventSource: "reducer",
        target: "VALID",
        reducerCaseId: "switchReducerMachine:reducer:SUBMIT:0",
        guardKind: "ternary",
        confidence: "partial",
        order: 2,
      }),
      expect.objectContaining({
        id: "switchReducerMachine:transition:reducer:IDLE:SUBMIT:INVALID:0",
        source: "IDLE",
        event: "SUBMIT",
        target: "INVALID",
        reducerCaseId: "switchReducerMachine:reducer:SUBMIT:0",
      }),
      expect.objectContaining({
        id: "switchReducerMachine:transition:reducer:IDLE:RESET:IDLE:0",
        source: "IDLE",
        event: "RESET",
        target: "IDLE",
        reducerCaseId: "switchReducerMachine:reducer:RESET:0",
      }),
    ]);
    expect(machine.transitions.filter((transition) => transition.layer === "config")).toHaveLength(2);
  });

  it("поддерживает alias первого параметра и guarded if branches", () => {
    const machine = getMachine(compileFixture().document.machines, "ifReducerMachine");

    expect(reducerCaseRows(machine)).toEqual([
      {
        id: "ifReducerMachine:reducer:FETCH_RESOLVE:0",
        event: "FETCH_RESOLVE",
        targets: ["PREMIUM"],
        writesState: true,
        guardKind: "if",
        confidence: "exact",
      },
      {
        id: "ifReducerMachine:reducer:FETCH_RESOLVE:1",
        event: "FETCH_RESOLVE",
        targets: ["FREE"],
        writesState: true,
        guardKind: "if",
        confidence: "exact",
      },
      {
        id: "ifReducerMachine:reducer:RESET:0",
        event: "RESET",
        targets: ["IDLE"],
        writesState: true,
        guardKind: "if",
        confidence: "exact",
      },
    ]);
    expect(reducerTransitionRows(machine).map((row) => [row.source, row.event, row.target, row.reducerCaseId])).toEqual([
      ["IDLE", "FETCH_RESOLVE", "PREMIUM", "ifReducerMachine:reducer:FETCH_RESOLVE:0"],
      ["IDLE", "FETCH_RESOLVE", "FREE", "ifReducerMachine:reducer:FETCH_RESOLVE:1"],
      ["IDLE", "RESET", "IDLE", "ifReducerMachine:reducer:RESET:0"],
    ]);
  });

  it("выводит else fallback из оставшихся config events", () => {
    const machine = getMachine(compileFixture().document.machines, "chainedIfReducerMachine");

    expect(reducerCaseRows(machine)).toEqual([
      expect.objectContaining({ event: "DECIDE", targets: ["HIGH"], guardKind: "if" }),
      expect.objectContaining({ event: "DECIDE", targets: ["MEDIUM"], guardKind: "else-if" }),
      expect.objectContaining({ event: "DECIDE", targets: ["LOW"], guardKind: "else-if" }),
      expect.objectContaining({ event: "RESET", targets: ["IDLE"], guardKind: "else" }),
    ]);
    expect(reducerTransitionRows(machine).map((row) => [row.source, row.event, row.target])).toEqual([
      ["IDLE", "DECIDE", "HIGH"],
      ["IDLE", "DECIDE", "MEDIUM"],
      ["IDLE", "DECIDE", "LOW"],
      ["IDLE", "RESET", "IDLE"],
    ]);
  });

  it("раскрывает return object и createReducer wrapper", () => {
    const document = compileFixture().document;
    const returnObjectReducerMachine = getMachine(document.machines, "returnObjectReducerMachine");
    const helperWrappedMachine = getMachine(document.machines, "helperWrappedMachine");

    expect(reducerCaseRows(returnObjectReducerMachine)).toEqual([
      expect.objectContaining({
        id: "returnObjectReducerMachine:reducer:GO:0",
        event: "GO",
        targets: ["READY"],
        guardKind: "if",
      }),
    ]);
    expect(reducerCaseRows(helperWrappedMachine)).toEqual([
      expect.objectContaining({ id: "helperWrappedMachine:reducer:COMPLETE_HELPER:0", event: "COMPLETE_HELPER", targets: ["DONE"] }),
      expect.objectContaining({ id: "helperWrappedMachine:reducer:START_HELPER:0", event: "START_HELPER", targets: ["WORKING"] }),
      expect.objectContaining({ id: "helperWrappedMachine:reducer:RESET_HELPER:0", event: "RESET_HELPER", targets: ["IDLE"] }),
    ]);
    expect(reducerTransitionRows(helperWrappedMachine).map((row) => [row.source, row.event, row.target])).toEqual([
      ["WORKING", "COMPLETE_HELPER", "DONE"],
      ["IDLE", "START_HELPER", "WORKING"],
      ["WORKING", "RESET_HELPER", "IDLE"],
    ]);
  });

  it("сохраняет actor template terminal targets и wildcard reducer transitions", () => {
    const machine = getMachine(compileFixture().document.machines, "actorTemplate");

    expect(reducerCaseByEvent(machine, "TICK").map((reducerCase) => reducerCase.targets.map((target) => targetLabel(machine, target)))).toEqual([
      ["__RESOLVED", "self"],
    ]);
    expect(reducerCaseRows(machine)).toEqual([
      expect.objectContaining({ event: "SPAWN_JOB", targets: ["RUNNING"] }),
      expect.objectContaining({ event: "TICK", targets: ["__RESOLVED", "self"], guardKind: "ternary" }),
      expect.objectContaining({ event: "COMPLETE", targets: ["__RESOLVED"] }),
      expect.objectContaining({ event: "FAIL", targets: ["__REJECTED"] }),
      expect.objectContaining({ event: "CANCEL", targets: ["__CANCELLED"] }),
      expect.objectContaining({ event: "FORCE_CANCEL", targets: ["__CANCELLED"] }),
    ]);
    expect(reducerTransitionRows(machine)).toContainEqual(
      expect.objectContaining({
        source: "*",
        event: "FORCE_CANCEL",
        target: "__CANCELLED",
        reducerCaseId: "actorTemplate:reducer:FORCE_CANCEL:0",
      }),
    );
  });
});

describe("ReducerCompiler join rules", () => {
  it("сохраняет unaccepted reducer case без создания acceptance transition", () => {
    const [machine] = compileSnippetMachines(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: {
            GO: "READY",
          },
          READY: {},
        },
        initialState: "IDLE",
        initialContext: {},
        reducer: (state, action, { nextState }) => {
          if (action.type === "UNDECLARED") {
            state.state = "READY";
            return;
          }

          if (action.type === "GO") {
            state.state = nextState;
          }
        },
      });
    `);
    if (!machine) throw new Error("Expected machine");

    expect(reducerCaseRows(machine)).toEqual([
      expect.objectContaining({ event: "UNDECLARED", targets: ["READY"] }),
      expect.objectContaining({ event: "GO", targets: ["READY"] }),
    ]);
    expect(reducerTransitionRows(machine).map((row) => [row.source, row.event, row.target])).toEqual([
      ["IDLE", "GO", "READY"],
    ]);
    expect(machine.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("reducer-config-consistency");
  });

  it("поддерживает wildcard acceptance, reversed equality, local const events и switch default", () => {
    const [machine] = compileSnippetMachines(`
      import { createMachine } from "@lite-fsm/core";

      const RESET = "RESET";
      const LOAD = "LOAD";

      export const machine = createMachine({
        config: {
          "*": {
            RESET: "IDLE",
          },
          IDLE: {
            LOAD: "LOADED",
            FALLBACK: "IDLE",
          },
          LOADED: {},
        },
        initialState: "IDLE",
        initialContext: {},
        reducer: (state, action, { nextState }) => {
          if (RESET === action.type) {
            state.state = nextState;
            return;
          }

          switch (action.type) {
            case LOAD:
              return {
                state: nextState,
                context: state.context,
              };
            default:
              state.state = nextState;
          }
        },
      });
    `);
    if (!machine) throw new Error("Expected machine");

    expect(reducerTransitionRows(machine).map((row) => [row.source, row.event, row.target, row.guardKind])).toEqual([
      ["*", "RESET", "IDLE", "if"],
      ["IDLE", "LOAD", "LOADED", "switch-case"],
      ["IDLE", "FALLBACK", "IDLE", "else"],
    ]);
  });

  it("выводит eventless expression reducer из всех accepted config events", () => {
    const [machine] = compileSnippetMachines(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: {
            A: "A",
            B: "B",
          },
          A: {},
          B: {},
        },
        initialState: "IDLE",
        initialContext: {},
        reducer: (state, action, { nextState }) => ({
          state: nextState,
          context: state.context,
        }),
      });
    `);
    if (!machine) throw new Error("Expected machine");

    expect(reducerCaseRows(machine)).toEqual([
      expect.objectContaining({ event: "A", targets: ["A"] }),
      expect.objectContaining({ event: "B", targets: ["B"] }),
    ]);
    expect(reducerTransitionRows(machine).map((row) => [row.source, row.event, row.target])).toEqual([
      ["IDLE", "A", "A"],
      ["IDLE", "B", "B"],
    ]);
  });

  it("выводит else branch для единственного event в if-chain", () => {
    const [machine] = compileSnippetMachines(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: {
            DECIDE: null,
          },
          HIGH: {},
          LOW: {},
        },
        initialState: "IDLE",
        initialContext: {},
        reducer: (state, action) => {
          if (action.type === "DECIDE" && action.payload.score > 10) {
            state.state = "HIGH";
          } else {
            state.state = "LOW";
          }
        },
      });
    `);
    if (!machine) throw new Error("Expected machine");

    expect(reducerCaseRows(machine)).toEqual([
      expect.objectContaining({ event: "DECIDE", targets: ["HIGH"], guardKind: "if" }),
      expect.objectContaining({ event: "DECIDE", targets: ["LOW"], guardKind: "else" }),
    ]);
  });

  it("поддерживает function expression, transparent wrappers и string-literal reducer option", () => {
    const machines = compileSnippetMachines(`
      import { createMachine, createReducer } from "@lite-fsm/core";

      export const functionExpressionReducer = createMachine({
        config: {
          IDLE: { GO: "READY" },
          READY: {},
        },
        initialState: "IDLE",
        initialContext: {},
        "reducer": function reducer(state, action, { nextState }) {
          if (action.type === "GO") {
            state.state = nextState;
          }
        },
      });

      export const wrappedReducerExpression = createMachine({
        config: {
          IDLE: { GO: "READY" },
          READY: {},
        },
        initialState: "IDLE",
        initialContext: {},
        reducer: (createReducer(((state, action, { nextState }) => {
          if (action.type === "GO") {
            return {
              state: nextState,
              context: state.context,
            };
          }
        }) as const) satisfies unknown),
      });
    `);
    const functionExpressionReducer = getMachine(machines, "functionExpressionReducer");
    const wrappedReducerExpression = getMachine(machines, "wrappedReducerExpression");

    expect(reducerCaseRows(functionExpressionReducer)).toEqual([
      {
        id: "functionExpressionReducer:reducer:GO:0",
        event: "GO",
        targets: ["READY"],
        writesState: true,
        guardKind: "if",
        confidence: "exact",
      },
    ]);
    expect(reducerTransitionRows(functionExpressionReducer)).toEqual([
      expect.objectContaining({
        id: "functionExpressionReducer:transition:reducer:IDLE:GO:READY:0",
        source: "IDLE",
        event: "GO",
        target: "READY",
        reducerCaseId: "functionExpressionReducer:reducer:GO:0",
      }),
    ]);
    expect(reducerCaseRows(wrappedReducerExpression)).toEqual([
      {
        id: "wrappedReducerExpression:reducer:GO:0",
        event: "GO",
        targets: ["READY"],
        writesState: true,
        guardKind: "if",
        confidence: "exact",
      },
    ]);
    expect(reducerTransitionRows(wrappedReducerExpression)).toEqual([
      expect.objectContaining({
        id: "wrappedReducerExpression:transition:reducer:IDLE:GO:READY:0",
        source: "IDLE",
        event: "GO",
        target: "READY",
        reducerCaseId: "wrappedReducerExpression:reducer:GO:0",
      }),
    ]);
  });

  it("детально покрывает nextState join с self, dynamic config target и duplicate accepted targets", () => {
    const machines = compileSnippetMachines(`
      import { createMachine } from "@lite-fsm/core";

      export const selfNextState = createMachine({
        config: {
          IDLE: { TOUCH: null },
        },
        initialState: "IDLE",
        initialContext: {},
        reducer: (state, action, { nextState }) => {
          if (action.type === "TOUCH") {
            state.state = nextState;
          }
        },
      });

      export const dynamicNextState = createMachine({
        config: {
          IDLE: { GO: getRuntimeTarget() },
        },
        initialState: "IDLE",
        initialContext: {},
        reducer: (state, action, { nextState }) => {
          if (action.type === "GO") {
            state.state = nextState;
          }
        },
      });

      export const duplicateConfigTargets = createMachine({
        config: {
          IDLE: {
            DUPE: "READY",
            DUPE: "DONE",
          },
          READY: {},
          DONE: {},
        },
        initialState: "IDLE",
        initialContext: {},
        reducer: (state, action, { nextState }) => {
          if (action.type === "DUPE") {
            state.state = nextState;
          }
        },
      });
    `);
    const selfNextState = getMachine(machines, "selfNextState");
    const dynamicNextState = getMachine(machines, "dynamicNextState");
    const duplicateConfigTargets = getMachine(machines, "duplicateConfigTargets");

    expect(reducerCaseRows(selfNextState)).toEqual([
      expect.objectContaining({ event: "TOUCH", targets: ["self"], confidence: "exact" }),
    ]);
    expect(reducerTransitionRows(selfNextState)).toEqual([
      expect.objectContaining({ source: "IDLE", event: "TOUCH", target: "self", confidence: "exact" }),
    ]);
    expect(reducerCaseRows(dynamicNextState)).toEqual([
      expect.objectContaining({ event: "GO", targets: ["dynamic:getRuntimeTarget()"], confidence: "exact" }),
    ]);
    expect(reducerTransitionRows(dynamicNextState)).toEqual([
      expect.objectContaining({ source: "IDLE", event: "GO", target: "dynamic:getRuntimeTarget()", confidence: "unknown" }),
    ]);
    expect(diagnosticCodes(dynamicNextState)).toEqual(["LFG_DYNAMIC_TARGET"]);
    expect(reducerCaseRows(duplicateConfigTargets)).toEqual([
      expect.objectContaining({ event: "DUPE", targets: ["READY", "DONE"] }),
    ]);
    expect(reducerTransitionRows(duplicateConfigTargets).map((row) => [row.id, row.source, row.event, row.target])).toEqual([
      ["duplicateConfigTargets:transition:reducer:IDLE:DUPE:READY:0", "IDLE", "DUPE", "READY"],
      ["duplicateConfigTargets:transition:reducer:IDLE:DUPE:DONE:0", "IDLE", "DUPE", "DONE"],
    ]);
  });

  it("детально покрывает switch default-only и несколько writes внутри одной branch", () => {
    const machines = compileSnippetMachines(`
      import { createMachine } from "@lite-fsm/core";

      export const defaultOnlySwitch = createMachine({
        config: {
          IDLE: {
            A: "A",
            B: "B",
          },
          A: {},
          B: {},
        },
        initialState: "IDLE",
        initialContext: {},
        reducer: (state, action, { nextState }) => {
          switch (action.type) {
            default:
              state.state = nextState;
          }
        },
      });

      export const multipleWrites = createMachine({
        config: {
          IDLE: { DECIDE: null },
          FIRST: {},
          SECOND: {},
        },
        initialState: "IDLE",
        initialContext: {},
        reducer: (state, action) => {
          if (action.type === "DECIDE") {
            state.state = "FIRST";
            state.state = "SECOND";
          }
        },
      });
    `);
    const defaultOnlySwitch = getMachine(machines, "defaultOnlySwitch");
    const multipleWrites = getMachine(machines, "multipleWrites");

    expect(reducerCaseRows(defaultOnlySwitch)).toEqual([
      expect.objectContaining({ event: "A", targets: ["A"], guardKind: "else" }),
      expect.objectContaining({ event: "B", targets: ["B"], guardKind: "else" }),
    ]);
    expect(reducerTransitionRows(defaultOnlySwitch).map((row) => [row.source, row.event, row.target, row.guardKind])).toEqual([
      ["IDLE", "A", "A", "else"],
      ["IDLE", "B", "B", "else"],
    ]);
    expect(reducerCaseRows(multipleWrites)).toEqual([
      expect.objectContaining({
        event: "DECIDE",
        targets: ["FIRST", "SECOND"],
        writesState: true,
        guardKind: "if",
        confidence: "exact",
      }),
    ]);
    expect(reducerTransitionRows(multipleWrites).map((row) => [row.source, row.event, row.target, row.reducerCaseId])).toEqual([
      ["IDLE", "DECIDE", "FIRST", "multipleWrites:reducer:DECIDE:0"],
      ["IDLE", "DECIDE", "SECOND", "multipleWrites:reducer:DECIDE:0"],
    ]);
  });
});

describe("ReducerCompiler diagnostics", () => {
  it("возвращает diagnostics для unsupported mutations и targets без падения", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine } from "@lite-fsm/core";

        export const helperMutation = createMachine({
          config: { IDLE: { MUTATE: null }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "MUTATE") {
              setState(state, "READY");
            }
          },
        });

        export const aliasMutation = createMachine({
          config: { IDLE: { ALIAS: null }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "ALIAS") {
              const draft = state;
              draft.state = "READY";
            }
          },
        });

        export const computedMutation = createMachine({
          config: { IDLE: { COMPUTED: null }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "COMPUTED") {
              state["state"] = "READY";
            }
          },
        });

        export const dynamicComputedMutation = createMachine({
          config: { IDLE: { COMPUTED_DYNAMIC: null }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "COMPUTED_DYNAMIC") {
              state[computedKey] = "READY";
            }
          },
        });

        export const nestedAliasMutation = createMachine({
          config: { IDLE: { NESTED_ALIAS: null }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "NESTED_ALIAS") {
              const draft = state;
              {
                draft.state = "READY";
              }
            }
          },
        });

        export const dynamicTarget = createMachine({
          config: { IDLE: { DYNAMIC: null }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "DYNAMIC") {
              state.state = chooseTarget(action);
            }
          },
        });

        export const unsupportedBranch = createMachine({
          config: { IDLE: { GO: null }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.kind === "GO") {
              state.state = "READY";
            }
          },
        });
      `,
      { filename: "diagnostic-reducers.ts" },
    );

    const helperMutation = getMachine(result.document.machines, "helperMutation");
    const aliasMutation = getMachine(result.document.machines, "aliasMutation");
    const computedMutation = getMachine(result.document.machines, "computedMutation");
    const dynamicComputedMutation = getMachine(result.document.machines, "dynamicComputedMutation");
    const nestedAliasMutation = getMachine(result.document.machines, "nestedAliasMutation");
    const dynamicTarget = getMachine(result.document.machines, "dynamicTarget");
    const unsupportedBranch = getMachine(result.document.machines, "unsupportedBranch");

    expect(reducerCaseRows(helperMutation)).toEqual([
      expect.objectContaining({
        event: "MUTATE",
        targets: [],
        writesState: false,
        confidence: "partial",
      }),
    ]);
    expect(helperMutation.reducerCases[0]).toMatchObject({
      writesState: false,
      targets: [],
      confidence: "partial",
    });
    expect(diagnosticCodes(helperMutation)).toEqual(["LFG_UNSUPPORTED_REDUCER_MUTATION"]);
    expect(reducerCaseRows(aliasMutation)).toEqual([
      expect.objectContaining({ event: "ALIAS", targets: [], writesState: false, confidence: "partial" }),
    ]);
    expect(diagnosticCodes(aliasMutation)).toEqual(["LFG_UNSUPPORTED_REDUCER_MUTATION"]);
    expect(reducerCaseRows(computedMutation)).toEqual([
      expect.objectContaining({ event: "COMPUTED", targets: [], writesState: false, confidence: "partial" }),
    ]);
    expect(diagnosticCodes(computedMutation)).toEqual(["LFG_UNSUPPORTED_REDUCER_MUTATION"]);
    expect(reducerCaseRows(dynamicComputedMutation)).toEqual([
      expect.objectContaining({ event: "COMPUTED_DYNAMIC", targets: [], writesState: false, confidence: "partial" }),
    ]);
    expect(diagnosticCodes(dynamicComputedMutation)).toEqual(["LFG_UNSUPPORTED_REDUCER_MUTATION"]);
    expect(reducerCaseRows(nestedAliasMutation)).toEqual([
      expect.objectContaining({ event: "NESTED_ALIAS", targets: [], writesState: false, confidence: "partial" }),
    ]);
    expect(diagnosticCodes(nestedAliasMutation)).toEqual(["LFG_UNSUPPORTED_REDUCER_MUTATION"]);
    expect(reducerCaseRows(dynamicTarget)).toEqual([
      expect.objectContaining({
        event: "DYNAMIC",
        targets: ["dynamic:chooseTarget(action)"],
        confidence: "unknown",
      }),
    ]);
    expect(diagnosticCodes(dynamicTarget)).toEqual(["LFG_UNSUPPORTED_REDUCER_TARGET"]);
    expect(unsupportedBranch.reducerCases).toEqual([]);
    expect(diagnosticCodes(unsupportedBranch)).toEqual(["LFG_UNSUPPORTED_REDUCER_BRANCH"]);
    expect(result.document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "LFG_UNSUPPORTED_REDUCER_MUTATION",
      "LFG_UNSUPPORTED_REDUCER_MUTATION",
      "LFG_UNSUPPORTED_REDUCER_MUTATION",
      "LFG_UNSUPPORTED_REDUCER_MUTATION",
      "LFG_UNSUPPORTED_REDUCER_MUTATION",
      "LFG_UNSUPPORTED_REDUCER_TARGET",
      "LFG_UNSUPPORTED_REDUCER_BRANCH",
    ]);
  });

  it("возвращает diagnostics для неподдержанных reducer option forms", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine } from "@lite-fsm/core";

        export const unresolvedReducer = createMachine({
          config: { IDLE: { GO: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: externalReducer,
        });

        export const dynamicReducer = createMachine({
          config: { IDLE: { GO: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: makeReducer(),
        });

        export const nonFunctionReducer = createMachine({
          config: { IDLE: { GO: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: 1,
        });

        export const badParamsReducer = createMachine({
          config: { IDLE: { GO: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: ({ state }, action) => {
            if (action.type === "GO") {
              state = "READY";
            }
          },
        });

        export const unsupportedSwitchReducer = createMachine({
          config: { IDLE: { GO: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            switch (action.kind) {
              case "GO":
                state.state = "READY";
            }
          },
        });
      `,
      { filename: "bad-reducers.ts" },
    );

    expect(result.document.machines.map((machine) => [machine.id, machine.reducerCases, diagnosticCodes(machine)])).toEqual([
      ["unresolvedReducer", [], ["LFG_UNRESOLVED_REDUCER"]],
      ["dynamicReducer", [], ["LFG_DYNAMIC_REDUCER"]],
      ["nonFunctionReducer", [], ["LFG_UNSUPPORTED_REDUCER"]],
      ["badParamsReducer", [], ["LFG_UNSUPPORTED_REDUCER"]],
      ["unsupportedSwitchReducer", [], ["LFG_UNSUPPORTED_REDUCER_BRANCH"]],
    ]);
    expect(result.document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "LFG_UNRESOLVED_REDUCER",
      "LFG_DYNAMIC_REDUCER",
      "LFG_UNSUPPORTED_REDUCER",
      "LFG_UNSUPPORTED_REDUCER",
      "LFG_UNSUPPORTED_REDUCER_BRANCH",
    ]);
  });

  it("покрывает дополнительные reducer edge cases", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine, createReducer } from "@lite-fsm/core";

        const reducer = (state, action, { nextState }) => {
          if (action.type === "GO") {
            state.state = nextState;
          }
        };

        export const shorthandReducerOption = createMachine({
          config: { IDLE: { GO: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer,
        });

        export const aliasedNextState = createMachine({
          config: { IDLE: { ALIAS_NEXT: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action, { nextState: target }) => {
            if (action.type === "ALIAS_NEXT") {
              state.state = target;
            }
          },
        });

        export const arrayMetaParam = createMachine({
          config: { IDLE: { META: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action, [meta]) => {
            if (action.type === "META") {
              state.state = "READY";
            }
          },
        });

        export const metaIdentifierParam = createMachine({
          config: { IDLE: { META_ID: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action, meta) => {
            if (action.type === "META_ID") {
              state.state = "READY";
            }
          },
        });

        export const objectMetaWithoutNextState = createMachine({
          config: { IDLE: { META_OBJECT: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action, { config }) => {
            if (action.type === "META_OBJECT") {
              state.state = "READY";
            }
          },
        });

        export const blockFallback = createMachine({
          config: { IDLE: { BLOCK: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action, { nextState }) => {
            {
              state.state = nextState;
            }
          },
        });

        export const duplicateAcceptedEvents = createMachine({
          config: { IDLE: { DUPE: "READY", DUPE: "DONE" }, READY: {}, DONE: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action, { nextState }) => {
            if (action.type === "DUPE") {
              state.state = nextState;
            }
          },
        });

        export const duplicateTargets = createMachine({
          config: { IDLE: { DECIDE: null }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "DECIDE") {
              state.state = action.payload.ok ? "READY" : "READY";
            }
          },
        });

        export const dynamicTernaryTarget = createMachine({
          config: { IDLE: { DECIDE: null }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "DECIDE") {
              state.state = action.payload.ok ? chooseTarget(action) : "READY";
            }
          },
        });

        export const nextStateWithoutAcceptance = createMachine({
          config: { IDLE: { GO: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action, { nextState }) => {
            if (action.type === "UNDECLARED") {
              state.state = nextState;
            }
          },
        });

        export const directMetaParamNamedNextState = createMachine({
          config: { IDLE: { DIRECT_NEXT: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action, nextState) => {
            if (action.type === "DIRECT_NEXT") {
              state.state = nextState;
            }
          },
        });

        export const unsupportedTargetKinds = createMachine({
          config: {
            IDLE: {
              NUMBER: null,
              BOOLEAN: null,
              NULL_VALUE: null,
              UNDEFINED_VALUE: null,
              ARRAY: null,
              OBJECT: null,
              FUNCTION: null,
              EXTERNAL: null,
              UNSUPPORTED: null,
            },
          },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "NUMBER") {
              state.state = 1;
            }
            if (action.type === "BOOLEAN") {
              state.state = true;
            }
            if (action.type === "NULL_VALUE") {
              state.state = null;
            }
            if (action.type === "UNDEFINED_VALUE") {
              state.state = undefined;
            }
            if (action.type === "ARRAY") {
              state.state = ["READY"];
            }
            if (action.type === "OBJECT") {
              state.state = {};
            }
            if (action.type === "FUNCTION") {
              state.state = () => "READY";
            }
            if (action.type === "EXTERNAL") {
              state.state = externalTarget;
            }
            if (action.type === "UNSUPPORTED") {
              state.state = action.payload.target + "";
            }
          },
        });

        export const noWriteBranches = createMachine({
          config: {
            IDLE: {
              ASSIGN: "READY",
              OTHER: "READY",
              RETURN_CONTEXT: "READY",
              HELPER_ARG: "READY",
              OTHER_ARG: "READY",
            },
            READY: {},
          },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "ASSIGN") {
              const local = {};
              state = { state: "READY", context: {} };
            }
            if (action.type === "OTHER") {
              other.state = "READY";
            }
            if (action.type === "RETURN_CONTEXT") {
              return { context: state.context };
            }
            if (action.type === "HELPER_ARG") {
              inspect(state.context);
            }
            if (action.type === "OTHER_ARG") {
              inspect(other);
            }
          },
        });

        export const unbracedIf = createMachine({
          config: { IDLE: { SHORT: null }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "SHORT") state.state = "READY";
          },
        });

        export const nonBinaryCondition = createMachine({
          config: { IDLE: { GO: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type) {
              state.state = "READY";
            }
          },
        });

        export const conflictingCondition = createMachine({
          config: { IDLE: { A: "A", B: "B" }, A: {}, B: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "A" && action.type === "B") {
              state.state = "A";
            }
          },
        });

        export const rightSideAndCondition = createMachine({
          config: { IDLE: { RIGHT_AND: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.payload.ok && action.type === "RIGHT_AND") {
              state.state = "READY";
            }
          },
        });

        export const unsupportedIfElseFallback = createMachine({
          config: { IDLE: { A: "A", B: "B" }, A: {}, B: {}, C: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            if (action.type === "A") {
              state.state = "A";
            } else if (action.type === "B") {
              state.state = "B";
            } else {
              state.state = "C";
            }
          },
        });

        export const unsupportedSwitchCase = createMachine({
          config: { IDLE: { A: "A" }, A: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            switch (action.type) {
              case DYNAMIC_CASE:
                state.state = "A";
            }
          },
        });

        export const unsupportedSwitchDefault = createMachine({
          config: { IDLE: { A: "A", B: "B" }, A: {}, B: {}, C: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state, action) => {
            switch (action.type) {
              case "A":
                state.state = "A";
                break;
              case "B":
                state.state = "B";
                break;
              default:
                state.state = "C";
            }
          },
        });

        export const unsupportedWrapperReducer = createMachine({
          config: { IDLE: { GO: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: createReducer(),
        });

        export const noActionParamReducer = createMachine({
          config: { IDLE: { GO: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: (state) => state,
        });

        export const noParamsReducer = createMachine({
          config: { IDLE: { GO: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
          reducer: () => ({ state: "READY", context: {} }),
        });
      `,
      { filename: "reducer-edge-cases.ts" },
    );

    expect(reducerCaseRows(getMachine(result.document.machines, "shorthandReducerOption"))).toEqual([
      expect.objectContaining({ event: "GO", targets: ["READY"] }),
    ]);
    expect(reducerCaseRows(getMachine(result.document.machines, "aliasedNextState"))).toEqual([
      expect.objectContaining({ event: "ALIAS_NEXT", targets: ["READY"] }),
    ]);
    expect(reducerCaseRows(getMachine(result.document.machines, "arrayMetaParam"))).toEqual([
      expect.objectContaining({ event: "META", targets: ["READY"] }),
    ]);
    expect(reducerCaseRows(getMachine(result.document.machines, "metaIdentifierParam"))).toEqual([
      expect.objectContaining({ event: "META_ID", targets: ["READY"] }),
    ]);
    expect(reducerCaseRows(getMachine(result.document.machines, "objectMetaWithoutNextState"))).toEqual([
      expect.objectContaining({ event: "META_OBJECT", targets: ["READY"] }),
    ]);
    expect(reducerCaseRows(getMachine(result.document.machines, "blockFallback"))).toEqual([
      expect.objectContaining({ event: "BLOCK", targets: ["READY"] }),
    ]);
    expect(reducerCaseRows(getMachine(result.document.machines, "duplicateAcceptedEvents"))).toEqual([
      expect.objectContaining({ event: "DUPE", targets: ["READY", "DONE"] }),
    ]);
    expect(reducerCaseRows(getMachine(result.document.machines, "duplicateTargets"))).toEqual([
      expect.objectContaining({ event: "DECIDE", targets: ["READY"] }),
    ]);
    expect(reducerCaseRows(getMachine(result.document.machines, "dynamicTernaryTarget"))).toEqual([
      expect.objectContaining({ event: "DECIDE", targets: ["dynamic:chooseTarget(action)", "READY"], confidence: "unknown" }),
    ]);
    expect(reducerCaseRows(getMachine(result.document.machines, "nextStateWithoutAcceptance"))).toEqual([
      expect.objectContaining({ event: "UNDECLARED", targets: ["dynamic:nextState"] }),
    ]);
    expect(reducerCaseRows(getMachine(result.document.machines, "directMetaParamNamedNextState"))).toEqual([
      expect.objectContaining({
        event: "DIRECT_NEXT",
        targets: ["dynamic:nextState"],
        confidence: "unknown",
      }),
    ]);
    expect(diagnosticCodes(getMachine(result.document.machines, "directMetaParamNamedNextState"))).toEqual([
      "LFG_UNSUPPORTED_REDUCER_TARGET",
    ]);
    expect(getMachine(result.document.machines, "noWriteBranches").reducerCases).toEqual([]);
    expect(reducerCaseRows(getMachine(result.document.machines, "unbracedIf"))).toEqual([
      expect.objectContaining({ event: "SHORT", targets: ["READY"] }),
    ]);
    expect(reducerCaseRows(getMachine(result.document.machines, "rightSideAndCondition"))).toEqual([
      expect.objectContaining({ event: "RIGHT_AND", targets: ["READY"] }),
    ]);
    const unsupportedTargetKinds = getMachine(result.document.machines, "unsupportedTargetKinds");

    expect(reducerCaseRows(unsupportedTargetKinds).map((row) => [row.event, row.targets[0], row.confidence])).toEqual([
      ["NUMBER", "unknown:number", "unknown"],
      ["BOOLEAN", "unknown:boolean", "unknown"],
      ["NULL_VALUE", "unknown:null", "unknown"],
      ["UNDEFINED_VALUE", "unknown:undefined", "unknown"],
      ["ARRAY", "unknown:array", "unknown"],
      ["OBJECT", "unknown:object", "unknown"],
      ["FUNCTION", "unknown:function", "unknown"],
      ["EXTERNAL", "dynamic:externalTarget", "unknown"],
      ["UNSUPPORTED", "unknown:LFG_UNSUPPORTED_EXPRESSION", "unknown"],
    ]);
    expect(reducerTransitionRows(unsupportedTargetKinds).map((row) => [row.event, row.target, row.confidence])).toEqual([
      ["NUMBER", "unknown:number", "unknown"],
      ["BOOLEAN", "unknown:boolean", "unknown"],
      ["NULL_VALUE", "unknown:null", "unknown"],
      ["UNDEFINED_VALUE", "unknown:undefined", "unknown"],
      ["ARRAY", "unknown:array", "unknown"],
      ["OBJECT", "unknown:object", "unknown"],
      ["FUNCTION", "unknown:function", "unknown"],
      ["EXTERNAL", "dynamic:externalTarget", "unknown"],
      ["UNSUPPORTED", "unknown:LFG_UNSUPPORTED_EXPRESSION", "unknown"],
    ]);
    expect(diagnosticCodes(unsupportedTargetKinds)).toEqual([
      "LFG_UNSUPPORTED_REDUCER_TARGET",
      "LFG_UNSUPPORTED_REDUCER_TARGET",
      "LFG_UNSUPPORTED_REDUCER_TARGET",
      "LFG_UNSUPPORTED_REDUCER_TARGET",
      "LFG_UNSUPPORTED_REDUCER_TARGET",
      "LFG_UNSUPPORTED_REDUCER_TARGET",
      "LFG_UNSUPPORTED_REDUCER_TARGET",
      "LFG_UNSUPPORTED_REDUCER_TARGET",
      "LFG_UNSUPPORTED_REDUCER_TARGET",
    ]);
    expect(reducerCaseRows(unsupportedTargetKinds).map((row) => row.targets[0])).toEqual([
      "unknown:number",
      "unknown:boolean",
      "unknown:null",
      "unknown:undefined",
      "unknown:array",
      "unknown:object",
      "unknown:function",
      "dynamic:externalTarget",
      "unknown:LFG_UNSUPPORTED_EXPRESSION",
    ]);
    expect(result.document.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "LFG_UNSUPPORTED_REDUCER_TARGET",
        "LFG_UNSUPPORTED_REDUCER_BRANCH",
        "LFG_UNSUPPORTED_REDUCER",
      ]),
    );
  });
});
