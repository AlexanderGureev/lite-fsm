import { describe, expect, it } from "vitest";
import { compileLiteFsmGraph, type GraphStateRef, type GraphTarget, type LiteFsmGraphMachine } from "@lite-fsm/graph";
import { fullAssemblerFilename, fullAssemblerSource } from "./fixtures/graph-sources";

const compileFixture = () => compileLiteFsmGraph(fullAssemblerSource, { filename: fullAssemblerFilename });

const getMachine = (machines: readonly LiteFsmGraphMachine[], id: string): LiteFsmGraphMachine => {
  const machine = machines.find((candidate) => candidate.id === id);
  if (!machine) throw new Error(`Missing machine ${id}`);

  return machine;
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

const transitionRows = (machine: LiteFsmGraphMachine): Array<[string, string, string]> => {
  return machine.transitions.map((transition) => [
    sourceLabel(machine, transition.source),
    transition.event.type,
    targetLabel(machine, transition.target),
  ]);
};

const configTransitionRows = (machine: LiteFsmGraphMachine): Array<[string, string, string]> => {
  return machine.transitions
    .filter((transition) => transition.layer === "config")
    .map((transition) => [
      sourceLabel(machine, transition.source),
      transition.event.type,
      targetLabel(machine, transition.target),
    ]);
};

const transitionDetails = (machine: LiteFsmGraphMachine) => {
  return machine.transitions.map((transition) => ({
    id: transition.id,
    source: sourceLabel(machine, transition.source),
    event: transition.event,
    target: targetLabel(machine, transition.target),
    layer: transition.layer,
    order: transition.order,
    confidence: transition.confidence,
  }));
};

const compileSnippetMachine = (source: string): LiteFsmGraphMachine => {
  const result = compileLiteFsmGraph(source, { filename: "snippet.ts" });
  const [machine] = result.document.machines;
  if (!machine) throw new Error("Expected snippet machine");

  return machine;
};

describe("ConfigGraphCompiler по fixture", () => {
  it("строит direct object config со states, self transition и metadata", () => {
    const result = compileFixture();
    const machine = getMachine(result.document.machines, "directObjectMachine");

    expect(machine.kind).toBe("domain");
    expect(machine.initialState).toBe("IDLE");
    expect(machine.initialContextSummary).toEqual({ kind: "empty", text: "{}" });
    expect(machine.states.map((state) => [state.key, state.kind, state.isInitial])).toEqual([
      ["IDLE", "normal", true],
      ["READY", "normal", false],
      ["DONE", "normal", false],
    ]);
    expect(transitionRows(machine)).toEqual([
      ["IDLE", "START", "READY"],
      ["IDLE", "PATCH", "self"],
      ["READY", "FINISH", "DONE"],
    ]);
    expect(machine.states[0]?.loc?.start.offset).toEqual(expect.any(Number));
    expect(machine.transitions[0]?.loc?.start.offset).toEqual(expect.any(Number));
  });

  it("раскрывает local const config, spreads и createConfig wrapper", () => {
    const result = compileFixture();
    const localConstConfigMachine = getMachine(result.document.machines, "localConstConfigMachine");
    const helperWrappedMachine = getMachine(result.document.machines, "helperWrappedMachine");

    expect(localConstConfigMachine.states.map((state) => state.key)).toEqual(["IDLE", "WORKING", "FAILED", "DONE"]);
    expect(transitionRows(localConstConfigMachine)).toEqual([
      ["FAILED", "RESET", "IDLE"],
      ["IDLE", "RESET", "IDLE"],
      ["IDLE", "START", "WORKING"],
      ["WORKING", "SUCCESS", "DONE"],
      ["WORKING", "FAIL", "FAILED"],
      ["FAILED", "RETRY", "WORKING"],
    ]);
    expect(configTransitionRows(helperWrappedMachine)).toEqual([
      ["IDLE", "START_HELPER", "WORKING"],
      ["WORKING", "COMPLETE_HELPER", "DONE"],
      ["WORKING", "RESET_HELPER", "IDLE"],
    ]);
    expect(helperWrappedMachine.initialContextSummary).toMatchObject({
      kind: "object",
      text: expect.stringContaining("completed: false"),
    });
  });

  it("поддерживает computed keys, computed target и satisfies config", () => {
    const result = compileFixture();
    const computedKeysMachine = getMachine(result.document.machines, "computedKeysMachine");
    const satisfiesMachine = getMachine(result.document.machines, "satisfiesMachine");

    expect(computedKeysMachine.initialState).toBe("CLOSED");
    expect(transitionRows(computedKeysMachine)).toEqual([
      ["CLOSED", "OPEN", "OPENED"],
      ["OPENED", "CLOSE", "CLOSED"],
    ]);
    expect(transitionRows(satisfiesMachine)).toEqual([
      ["IDLE", "LOAD", "LOADING"],
      ["LOADING", "RESOLVE", "READY"],
      ["LOADING", "REJECT", "FAILED"],
      ["FAILED", "RETRY", "LOADING"],
    ]);
  });

  it("сохраняет wildcard source отдельно от обычных states", () => {
    const result = compileFixture();
    const machine = getMachine(result.document.machines, "wildcardMachine");

    expect(machine.states.map((state) => [state.key, state.kind])).toEqual([
      ["*", "wildcard"],
      ["IDLE", "normal"],
      ["SIGNED_IN", "normal"],
      ["SIGNED_OUT", "normal"],
    ]);
    expect(transitionRows(machine)).toEqual([
      ["*", "RESET", "IDLE"],
      ["*", "LOGOUT", "SIGNED_OUT"],
      ["IDLE", "LOGIN", "SIGNED_IN"],
      ["SIGNED_IN", "REFRESH", "self"],
    ]);
  });

  it("помечает actor template и terminal targets", () => {
    const result = compileFixture();
    const machine = getMachine(result.document.machines, "actorTemplate");

    expect(machine).toMatchObject({
      kind: "actorTemplate",
      initialState: "__INIT",
      groupTag: "jobs",
      persistence: "snapshot",
    });
    expect(machine.states.map((state) => [state.key, state.kind, state.isPublicActorState])).toEqual([
      ["__INIT", "init", false],
      ["RUNNING", "normal", true],
      ["*", "wildcard", true],
      ["__RESOLVED", "terminal", false],
      ["__REJECTED", "terminal", false],
      ["__CANCELLED", "terminal", false],
    ]);
    expect(transitionRows(machine)).toContainEqual(["RUNNING", "COMPLETE", "__RESOLVED"]);
    expect(transitionRows(machine)).toContainEqual(["RUNNING", "FAIL", "__REJECTED"]);
    expect(transitionRows(machine)).toContainEqual(["RUNNING", "CANCEL", "__CANCELLED"]);
    expect(transitionRows(machine)).toContainEqual(["*", "FORCE_CANCEL", "__CANCELLED"]);
  });
});

describe("ConfigGraphCompiler shape contracts", () => {
  it("сохраняет порядок source states, добавляет target-only states и не дублирует states", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: {
            START: "RUNNING",
            SPAWN: "SPAWNED",
            AGAIN: "SPAWNED",
            CANCEL: "__CANCELLED",
          },
          RUNNING: {
            STOP: "IDLE",
          },
        },
        initialState: "RUNNING",
        initialContext: {},
      });
    `);

    expect(machine.states.map((state) => [state.key, state.kind, state.isInitial])).toEqual([
      ["IDLE", "normal", false],
      ["RUNNING", "normal", true],
      ["SPAWNED", "normal", false],
      ["__CANCELLED", "terminal", false],
    ]);
    expect(transitionRows(machine)).toEqual([
      ["IDLE", "START", "RUNNING"],
      ["IDLE", "SPAWN", "SPAWNED"],
      ["IDLE", "AGAIN", "SPAWNED"],
      ["IDLE", "CANCEL", "__CANCELLED"],
      ["RUNNING", "STOP", "IDLE"],
    ]);
  });

  it("назначает stable transition ids, order, layer, source и confidence для duplicate config entries", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: {
            GO: "READY",
            GO: "READY",
            GO: null,
            WAIT: getRuntimeTarget(),
          },
          READY: {},
        },
        initialState: "IDLE",
        initialContext: {},
      });
    `);

    expect(transitionDetails(machine)).toEqual([
      {
        id: "machine:transition:config:IDLE:GO:READY:0",
        source: "IDLE",
        event: { type: "GO", source: "config" },
        target: "READY",
        layer: "config",
        order: 0,
        confidence: "exact",
      },
      {
        id: "machine:transition:config:IDLE:GO:READY:1",
        source: "IDLE",
        event: { type: "GO", source: "config" },
        target: "READY",
        layer: "config",
        order: 1,
        confidence: "exact",
      },
      {
        id: "machine:transition:config:IDLE:GO:self:0",
        source: "IDLE",
        event: { type: "GO", source: "config" },
        target: "self",
        layer: "config",
        order: 2,
        confidence: "exact",
      },
      {
        id: "machine:transition:config:IDLE:WAIT:getRuntimeTarget():0",
        source: "IDLE",
        event: { type: "WAIT", source: "config" },
        target: "dynamic:getRuntimeTarget()",
        layer: "config",
        order: 3,
        confidence: "unknown",
      },
    ]);
  });

  it("раскрывает все transparent wrappers вокруг machine options", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine } from "@lite-fsm/core";

        export const parenthesized = createMachine(({ config: { IDLE: { GO: "READY" }, READY: {} }, initialState: "IDLE", initialContext: {} }));
        export const asWrapped = createMachine(({ config: { IDLE: { GO: "READY" }, READY: {} }, initialState: "IDLE", initialContext: {} } as const));
        export const satisfiesWrapped = createMachine(({ config: { IDLE: { GO: "READY" }, READY: {} }, initialState: "IDLE", initialContext: {} } satisfies Record<string, unknown>));
        export const typeAssertionWrapped = createMachine(<Record<string, unknown>>{ config: { IDLE: { GO: "READY" }, READY: {} }, initialState: "IDLE", initialContext: {} });
      `,
      { filename: "wrapped-options.ts" },
    );

    expect(
      result.document.machines.map((machine) => [
        machine.id,
        machine.initialState,
        machine.initialContextSummary,
        transitionRows(machine),
      ]),
    ).toEqual([
      ["parenthesized", "IDLE", { kind: "empty", text: "{}" }, [["IDLE", "GO", "READY"]]],
      ["asWrapped", "IDLE", { kind: "empty", text: "{}" }, [["IDLE", "GO", "READY"]]],
      ["satisfiesWrapped", "IDLE", { kind: "empty", text: "{}" }, [["IDLE", "GO", "READY"]]],
      ["typeAssertionWrapped", "IDLE", { kind: "empty", text: "{}" }, [["IDLE", "GO", "READY"]]],
    ]);
  });

  it("создает literal initialContextSummary для всех known scalar/function fallback values", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine } from "@lite-fsm/core";

        export const stringContext = createMachine({ config: {}, initialContext: "value" });
        export const numberContext = createMachine({ config: {}, initialContext: 1 });
        export const booleanContext = createMachine({ config: {}, initialContext: false });
        export const nullContext = createMachine({ config: {}, initialContext: null });
        export const functionContext = createMachine({ config: {}, initialContext: () => ({}) });
        export const missingContext = createMachine({ config: {} });
      `,
      { filename: "initial-context.ts" },
    );

    expect(result.document.machines.map((machine) => [machine.id, machine.initialContextSummary])).toEqual([
      ["stringContext", { kind: "literal", text: "\"value\"" }],
      ["numberContext", { kind: "literal", text: "1" }],
      ["booleanContext", { kind: "literal", text: "false" }],
      ["nullContext", { kind: "literal", text: "null" }],
      ["functionContext", { kind: "literal", text: "() => ({})" }],
      ["missingContext", undefined],
    ]);
  });
});

describe("ConfigGraphCompiler diagnostics", () => {
  it("возвращает diagnostic для unresolved config и сохраняет document", () => {
    const result = compileFixture();
    const machine = getMachine(result.document.machines, "unresolvedConfigMachine");

    expect(machine).toMatchObject({
      kind: "unknown",
      initialState: "IDLE",
      states: [],
      transitions: [],
    });
    expect(machine.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_UNRESOLVED_CONFIG",
        severity: "warning",
      }),
    ]);
  });

  it("возвращает dynamic target transition и diagnostic", () => {
    const result = compileFixture();
    const machine = getMachine(result.document.machines, "dynamicTargetMachine");

    expect(transitionRows(machine)).toEqual([["IDLE", "GO", "dynamic:getRuntimeTarget()"]]);
    expect(machine.transitions[0]).toMatchObject({
      target: {
        kind: "dynamic",
        label: "getRuntimeTarget()",
      },
      confidence: "unknown",
    });
    expect(machine.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_DYNAMIC_TARGET",
      }),
    ]);
    expect(result.diagnostics).toBe(result.document.diagnostics);
    expect(result.document.diagnostics.map((diagnostic) => diagnostic.code)).toContain("LFG_DYNAMIC_TARGET");
  });

  it("пробрасывает evaluator diagnostic для dynamic computed config key", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          [getStateKey()]: {
            GO: "DONE",
          },
        },
        initialState: "IDLE",
        initialContext: {},
      });
    `);

    expect(machine.states).toEqual([]);
    expect(machine.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_UNSUPPORTED_DYNAMIC_KEY",
      }),
    ]);
  });

  it("пробрасывает evaluator diagnostic для dynamic computed event key внутри state", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: {
            [getEventKey()]: "DONE",
          },
        },
        initialState: "IDLE",
        initialContext: {},
      });
    `);

    expect(machine.states.map((state) => state.key)).toEqual(["IDLE"]);
    expect(machine.transitions).toEqual([]);
    expect(machine.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_UNSUPPORTED_DYNAMIC_KEY",
        message: "Computed object key must resolve to a local string literal.",
      }),
    ]);
  });

  it("диагностирует non-object state entry", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: "READY",
        },
        initialState: "IDLE",
        initialContext: {},
      });
    `);

    expect(machine.states.map((state) => state.key)).toEqual(["IDLE"]);
    expect(machine.transitions).toEqual([]);
    expect(machine.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_UNSUPPORTED_CONFIG_STATE",
      }),
    ]);
  });

  it("игнорирует explicit undefined target", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: {
            SKIP: undefined,
            GO: "READY",
          },
          READY: {},
        },
        initialState: "IDLE",
        initialContext: {},
      });
    `);

    expect(transitionRows(machine)).toEqual([["IDLE", "GO", "READY"]]);
    expect(machine.diagnostics).toEqual([]);
  });

  it("покрывает unsupported machine options, missing config и unsupported config", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine } from "@lite-fsm/core";

        const options = { config: {}, initialState: "IDLE", initialContext: {} };
        export const noArgs = createMachine();
        export const identifierOptions = createMachine(options);
        export const missingConfig = createMachine({ initialState: "IDLE" });
        export const nonObjectConfig = createMachine({ config: "bad", initialContext: [] });
        export const dynamicConfig = createMachine({ config: getConfig(), initialContext: "literal" });
        export const unsupportedConfig = createMachine({
          config: {
            get IDLE() {
              return {};
            },
          },
        });
      `,
      { filename: "diagnostics.ts" },
    );

    expect(result.document.machines.map((machine) => [machine.id, machine.diagnostics[0]?.code])).toEqual([
      ["noArgs", "LFG_UNSUPPORTED_MACHINE_OPTIONS"],
      ["identifierOptions", "LFG_UNSUPPORTED_MACHINE_OPTIONS"],
      ["missingConfig", "LFG_MISSING_MACHINE_CONFIG"],
      ["nonObjectConfig", "LFG_UNSUPPORTED_CONFIG"],
      ["dynamicConfig", "LFG_DYNAMIC_CONFIG"],
      ["unsupportedConfig", "LFG_UNSUPPORTED_CONFIG"],
    ]);
    expect(getMachine(result.document.machines, "nonObjectConfig").initialContextSummary).toEqual({
      kind: "array",
      text: "[]",
    });
    expect(getMachine(result.document.machines, "dynamicConfig").initialContextSummary).toEqual({
      kind: "literal",
      text: "\"literal\"",
    });
  });

  it("поддерживает wrapped options, string option key и shorthand options", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine } from "@lite-fsm/core";

        const IDLE = {
          GO: "READY",
        };
        const READY = {};
        const config = { IDLE, READY };
        const initialState = "IDLE";
        const initialContext = {};

        export const wrapped = createMachine(({
          [dynamicOption]: "ignored",
          "config": config,
          initialState,
          initialContext,
        } as const));
      `,
      { filename: "wrapped.ts" },
    );
    const machine = getMachine(result.document.machines, "wrapped");

    expect(machine.initialState).toBe("IDLE");
    expect(machine.initialContextSummary).toEqual({ kind: "empty", text: "{}" });
    expect(transitionRows(machine)).toEqual([["IDLE", "GO", "READY"]]);
  });

  it("покрывает target, metadata и initialContext fallback diagnostics", () => {
    const result = compileLiteFsmGraph(
      `
        import { createMachine } from "@lite-fsm/core";

        export const metadata = createMachine({
          groupTag: 1,
          persistence: "invalid",
          config: {
            IDLE: {
              EXTERNAL: externalTarget,
              BOOLEAN: true,
              BINARY: 1 + 2,
            },
          },
          initialState: getInitialState(),
          initialContext: externalContext,
        });

        export const runtimePersistence = createMachine({
          persistence: "runtime",
          config: {},
          initialContext: getContext(),
        });

        export const unsupportedContext = createMachine({
          config: {},
          initialContext: 1 + 2,
        });
      `,
      { filename: "metadata.ts" },
    );
    const metadata = getMachine(result.document.machines, "metadata");

    expect(metadata.persistence).toBe("unknown");
    expect(metadata.initialContextSummary).toEqual({ kind: "external", text: "externalContext" });
    expect(transitionRows(metadata)).toEqual([
      ["IDLE", "EXTERNAL", "dynamic:externalTarget"],
      ["IDLE", "BOOLEAN", "unknown:boolean"],
      ["IDLE", "BINARY", "unknown:LFG_UNSUPPORTED_EXPRESSION"],
    ]);
    expect(metadata.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "LFG_UNSUPPORTED_GROUP_TAG",
      "LFG_UNSUPPORTED_PERSISTENCE",
      "LFG_DYNAMIC_TARGET",
      "LFG_UNSUPPORTED_TARGET",
      "LFG_UNSUPPORTED_TARGET",
      "LFG_UNSUPPORTED_INITIAL_STATE",
    ]);
    expect(getMachine(result.document.machines, "runtimePersistence")).toMatchObject({
      persistence: "runtime",
      initialContextSummary: { kind: "dynamic", text: "getContext()" },
    });
    expect(getMachine(result.document.machines, "unsupportedContext").initialContextSummary).toMatchObject({
      kind: "unknown",
    });
  });

  it("детально покрывает все unsupported target value kinds", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: {
            NUMBER: 1,
            BOOLEAN: false,
            ARRAY: ["READY"],
            OBJECT: { target: "READY" },
            FUNCTION: () => "READY",
            UNSUPPORTED: 1 + 2,
          },
        },
        initialState: "IDLE",
        initialContext: {},
      });
    `);

    expect(transitionRows(machine)).toEqual([
      ["IDLE", "NUMBER", "unknown:number"],
      ["IDLE", "BOOLEAN", "unknown:boolean"],
      ["IDLE", "ARRAY", "unknown:array"],
      ["IDLE", "OBJECT", "unknown:object"],
      ["IDLE", "FUNCTION", "unknown:function"],
      ["IDLE", "UNSUPPORTED", "unknown:LFG_UNSUPPORTED_EXPRESSION"],
    ]);
    expect(machine.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.message])).toEqual([
      ["LFG_UNSUPPORTED_TARGET", "Transition target of kind 'number' is not supported by the config graph compiler."],
      ["LFG_UNSUPPORTED_TARGET", "Transition target of kind 'boolean' is not supported by the config graph compiler."],
      ["LFG_UNSUPPORTED_TARGET", "Transition target of kind 'array' is not supported by the config graph compiler."],
      ["LFG_UNSUPPORTED_TARGET", "Transition target of kind 'object' is not supported by the config graph compiler."],
      ["LFG_UNSUPPORTED_TARGET", "Transition target of kind 'function' is not supported by the config graph compiler."],
      [
        "LFG_UNSUPPORTED_TARGET",
        "Transition target of kind 'unsupported' is not supported by the config graph compiler.",
      ],
    ]);
  });

  it("не разрешает target '*' в wildcard source state", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          "*": {
            RESET: "IDLE",
          },
          IDLE: {
            BAD_TARGET: "*",
          },
        },
        initialState: "IDLE",
        initialContext: {},
      });
    `);

    expect(transitionRows(machine)).toEqual([
      ["*", "RESET", "IDLE"],
      ["IDLE", "BAD_TARGET", "unknown:*"],
    ]);
    expect(machine.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFG_UNSUPPORTED_TARGET",
        message: "Transition target '*' is reserved for wildcard sources and cannot be used as a target.",
      }),
    ]);
  });
});
