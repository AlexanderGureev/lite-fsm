import { describe, expect, it } from "vitest";
import {
  compileLiteFsmGraph,
  type GraphEmission,
  type GraphRouting,
  type GraphRoutingTarget,
  type GraphStateRef,
  type LiteFsmGraphMachine,
} from "@lite-fsm/graph";
import { fullAssemblerFilename, fullAssemblerSource } from "./fixtures/graph-sources";

const compileFixture = () => compileLiteFsmGraph(fullAssemblerSource, { filename: fullAssemblerFilename });

const getMachine = (machines: readonly LiteFsmGraphMachine[], id: string): LiteFsmGraphMachine => {
  const machine = machines.find((candidate) => candidate.id === id);
  if (!machine) throw new Error(`Missing machine ${id}`);

  return machine;
};

const compileSnippetMachine = (source: string): LiteFsmGraphMachine => {
  const result = compileLiteFsmGraph(source, { filename: "effects-snippet.ts" });
  const [machine] = result.document.machines;
  if (!machine) throw new Error("Expected snippet machine");

  return machine;
};

const compileSnippetMachines = (source: string): LiteFsmGraphMachine[] => {
  return compileLiteFsmGraph(source, { filename: "effects-snippet.ts" }).document.machines;
};

const stateKeyById = (machine: LiteFsmGraphMachine): ReadonlyMap<string, string> => {
  return new Map(machine.states.map((state) => [state.id, state.key]));
};

const sourceLabel = (machine: LiteFsmGraphMachine, source: GraphEmission["sourceState"]): string => {
  if (source === "*") return "*";
  if (source.kind === "wildcard") return "*";
  if (source.kind === "unknown") return source.label ?? "unknown";

  return stateKeyById(machine).get(source.stateId) ?? source.stateId;
};

const targetLabel = (target: GraphRoutingTarget): string => {
  if (target.kind === "literal") return target.value;
  if (target.kind === "selfField") return `self.${target.field}`;
  if (target.kind === "dynamic") return `dynamic:${target.label ?? "dynamic"}`;

  return `[${target.items.map(targetLabel).join(",")}]`;
};

const routingLabel = (routing: GraphRouting): string => {
  if (routing.kind === "default" || routing.kind === "unscoped") return routing.kind;
  if (routing.kind === "unknown") return `unknown:${routing.label ?? "unknown"}`;

  return `${routing.kind}:${targetLabel(routing.target)}`;
};

const emissionRows = (machine: LiteFsmGraphMachine) => {
  return machine.emissions.map((emission) => ({
    id: emission.id,
    source: sourceLabel(machine, emission.sourceState),
    event: emission.event.type,
    eventSource: emission.event.source,
    routing: routingLabel(emission.routing),
    guardKind: emission.guard?.kind,
    confidence: emission.confidence,
  }));
};

const diagnosticCodes = (machine: LiteFsmGraphMachine): string[] => {
  return machine.diagnostics.map((diagnostic) => diagnostic.code);
};

const graphSourceLabels = (source: GraphStateRef | "*", machine: LiteFsmGraphMachine): string => {
  return sourceLabel(machine, source);
};

describe("EffectsCompiler по fixture", () => {
  it("извлекает plain effect emissions без превращения их в transitions", () => {
    const machine = getMachine(compileFixture().document.machines, "plainEffectsMachine");

    expect(emissionRows(machine)).toEqual([
      {
        id: "plainEffectsMachine:emission:LOADING:RESOLVE:default:0",
        source: "LOADING",
        event: "RESOLVE",
        eventSource: "effect",
        routing: "default",
        guardKind: undefined,
        confidence: "exact",
      },
      {
        id: "plainEffectsMachine:emission:LOADING:REJECT:default:0",
        source: "LOADING",
        event: "REJECT",
        eventSource: "effect",
        routing: "default",
        guardKind: undefined,
        confidence: "exact",
      },
    ]);
    expect(machine.transitions.map((transition) => transition.event.type)).toEqual([
      "START",
      "RESOLVE",
      "REJECT",
      "RETRY",
    ]);
  });

  it("раскрывает createEffect wrapper и renamed createEffect import", () => {
    const document = compileFixture().document;
    const createEffectMachine = getMachine(document.machines, "createEffectMachine");
    const renamedCreateEffectMachine = getMachine(document.machines, "renamedCreateEffectMachine");

    expect(emissionRows(createEffectMachine)).toEqual([
      expect.objectContaining({
        id: "createEffectMachine:emission:PENDING:DONE:default:0",
        source: "PENDING",
        event: "DONE",
        routing: "default",
      }),
    ]);
    expect(emissionRows(renamedCreateEffectMachine)).toEqual([
      expect.objectContaining({
        id: "renamedCreateEffectMachine:emission:PENDING:DONE:default:0",
        source: "PENDING",
        event: "DONE",
        routing: "default",
      }),
    ]);
  });

  it("поддерживает local effects, computed keys, local const events и ignored cancelFn", () => {
    const machine = getMachine(compileFixture().document.machines, "localEffectsMachine");

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({
        id: "localEffectsMachine:emission:WATCHING:WATCH_TICK:default:0",
        source: "WATCHING",
        event: "WATCH_TICK",
        guardKind: "if",
      }),
      expect.objectContaining({
        id: "localEffectsMachine:emission:WATCHING:WATCH_DONE:default:0",
        source: "WATCHING",
        event: "WATCH_DONE",
        guardKind: "if",
      }),
      expect.objectContaining({
        id: "localEffectsMachine:emission:LOCAL_PENDING:EFFECT_READY:default:0",
        source: "LOCAL_PENDING",
        event: "EFFECT_READY",
        guardKind: "switch-case",
      }),
      expect.objectContaining({
        id: "localEffectsMachine:emission:LOCAL_PENDING:EFFECT_FAILURE:default:0",
        source: "LOCAL_PENDING",
        event: "EFFECT_FAILURE",
        guardKind: "switch-case",
      }),
    ]);
    expect(diagnosticCodes(machine)).not.toContain("LFG_UNSUPPORTED_CREATE_EFFECT");
  });

  it("раскрывает local effects object и fallback emission", () => {
    const machine = getMachine(compileFixture().document.machines, "localEffectsObjectMachine");

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({
        id: "localEffectsObjectMachine:emission:REVIEW:APPROVE_REVIEW:default:0",
        event: "APPROVE_REVIEW",
        guardKind: "if",
      }),
      expect.objectContaining({
        id: "localEffectsObjectMachine:emission:REVIEW:REJECT_REVIEW:default:0",
        event: "REJECT_REVIEW",
        guardKind: undefined,
      }),
    ]);
  });

  it("сохраняет if labels и unguarded fallback", () => {
    const machine = getMachine(compileFixture().document.machines, "ifEffectMachine");

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({ source: "CHECKING", event: "CHECK_RESOLVE", guardKind: "if" }),
      expect.objectContaining({ source: "CHECKING", event: "CHECK_REJECT", guardKind: "if" }),
      expect.objectContaining({ source: "CHECKING", event: "CHECK_TIMEOUT", guardKind: undefined }),
    ]);
  });

  it("сохраняет switch-case и default labels", () => {
    const machine = getMachine(compileFixture().document.machines, "switchEffectMachine");

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({ source: "FLOW", event: "FLOW_STEP", guardKind: "switch-case" }),
      expect.objectContaining({ source: "FLOW", event: "FLOW_DONE", guardKind: "switch-case" }),
      expect.objectContaining({ source: "FLOW", event: "FLOW_FAIL", guardKind: "else" }),
    ]);
  });

  it("сохраняет wildcard source для plain и computed createEffect entries", () => {
    const document = compileFixture().document;
    const wildcardEffectMachine = getMachine(document.machines, "wildcardEffectMachine");
    const computedWildcardCreateEffectMachine = getMachine(document.machines, "computedWildcardCreateEffectMachine");

    expect(emissionRows(wildcardEffectMachine)).toEqual([
      expect.objectContaining({
        id: "wildcardEffectMachine:emission:*:PONG:default:0",
        source: "*",
        event: "PONG",
        guardKind: "if",
      }),
      expect.objectContaining({
        id: "wildcardEffectMachine:emission:*:AUDIT_RESET:default:0",
        source: "*",
        event: "AUDIT_RESET",
        guardKind: "if",
      }),
    ]);
    expect(emissionRows(computedWildcardCreateEffectMachine)).toEqual([
      expect.objectContaining({
        id: "computedWildcardCreateEffectMachine:emission:*:TIMER_READY:default:0",
        source: "*",
        event: "TIMER_READY",
        guardKind: "if",
      }),
    ]);
  });

  it("распознает domain routing через action.meta", () => {
    const machine = getMachine(compileFixture().document.machines, "domainWithMetaTransitionMachine");

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({ source: "ACTIVE", event: "LOCAL_DONE", routing: "default" }),
      expect.objectContaining({ source: "ACTIVE", event: "ACTOR_DONE", routing: "actor:actor-1" }),
      expect.objectContaining({ source: "ACTIVE", event: "GROUP_DONE", routing: "group:group-1" }),
      expect.objectContaining({ source: "ACTIVE", event: "GROUP_ARRAY_DONE", routing: "group:[group-1,group-2]" }),
      expect.objectContaining({ source: "ACTIVE", event: "TAG_DONE", routing: "tag:workers" }),
      expect.objectContaining({ source: "ACTIVE", event: "TAG_ARRAY_DONE", routing: "tag:[workers,admins]" }),
    ]);
  });

  it("распознает actor routing sugar, self fields и arrays", () => {
    const machine = getMachine(compileFixture().document.machines, "actorTemplate");

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({ source: "RUNNING", event: "TICK", routing: "default" }),
      expect.objectContaining({ source: "RUNNING", event: "FORCE_CANCEL", routing: "unscoped" }),
      expect.objectContaining({ source: "RUNNING", event: "COMPLETE", routing: "actor:job-1" }),
      expect.objectContaining({ source: "RUNNING", event: "COMPLETE", routing: "actor:[self.actorId]" }),
      expect.objectContaining({ source: "RUNNING", event: "COMPLETE", routing: "group:self.groupId" }),
      expect.objectContaining({ source: "RUNNING", event: "FAIL", routing: "group:[self.groupId]" }),
      expect.objectContaining({ source: "RUNNING", event: "FORCE_CANCEL", routing: "tag:self.groupTag" }),
      expect.objectContaining({ source: "RUNNING", event: "FORCE_CANCEL", routing: "tag:[jobs,urgent]" }),
    ]);
  });

  it("распознает actor wildcard createEffect routing", () => {
    const machine = getMachine(compileFixture().document.machines, "actorWildcardEffectTemplate");

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({ source: "*", event: "HEARTBEAT", routing: "default", guardKind: "switch-case" }),
      expect.objectContaining({ source: "*", event: "COMPLETE", routing: "actor:self.actorId", guardKind: "switch-case" }),
      expect.objectContaining({ source: "*", event: "ABORT_TASK", routing: "tag:self.groupTag", guardKind: "else" }),
    ]);
  });

  it("возвращает diagnostic для escaped transition без падения", () => {
    const machine = getMachine(compileFixture().document.machines, "escapedTransitionMachine");

    expect(machine.emissions).toEqual([]);
    expect(diagnosticCodes(machine)).toContain("LFG_EFFECT_TRANSITION_ESCAPED");
  });
});

describe("EffectsCompiler diagnostics и partial routing", () => {
  it("запрещает actor routing sugar в domain effects", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: { START: "ACTIVE" },
          ACTIVE: { DONE: "IDLE" },
        },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          ACTIVE: ({ transition }) => {
            transition.actor("actor-1", { type: "DONE" });
          },
        },
      });
    `);

    expect(machine.emissions).toEqual([]);
    expect(diagnosticCodes(machine)).toContain("LFG_EFFECT_ACTOR_ROUTING_ON_DOMAIN");
  });

  it("возвращает diagnostic для dynamic event type", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: { START: "ACTIVE" },
          ACTIVE: { DONE: "IDLE" },
        },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          ACTIVE: ({ action, transition }) => {
            transition({ type: action.type });
          },
        },
      });
    `);

    expect(machine.emissions).toEqual([]);
    expect(diagnosticCodes(machine)).toContain("LFG_EFFECT_DYNAMIC_EVENT_TYPE");
  });

  it("сохраняет partial emission для dynamic routing target", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      const actorId = getActorId();

      export const machine = createMachine({
        config: {
          IDLE: { START: "ACTIVE" },
          ACTIVE: { DONE: "IDLE" },
        },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          ACTIVE: ({ transition }) => {
            transition({ type: "DONE", meta: { actorId } });
          },
        },
      });
    `);

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({
        source: "ACTIVE",
        event: "DONE",
        routing: "actor:dynamic:getActorId()",
        confidence: "partial",
      }),
    ]);
    expect(diagnosticCodes(machine)).toContain("LFG_EFFECT_DYNAMIC_ROUTING_TARGET");
  });

  it("возвращает controlled diagnostic для unsupported effects value", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      const effects = externalEffects;

      export const machine = createMachine({
        config: {
          IDLE: {},
        },
        initialState: "IDLE",
        initialContext: {},
        effects,
      });
    `);

    expect(machine.emissions).toEqual([]);
    expect(diagnosticCodes(machine)).toContain("LFG_UNRESOLVED_EFFECTS");
  });

  it("не превращает emitted events в state transitions", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: { START: "WORKING" },
          WORKING: {},
        },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          WORKING: ({ transition }) => {
            transition({ type: "DONE" });
          },
        },
      });
    `);

    expect(machine.transitions.map((transition) => transition.event.type)).toEqual(["START"]);
    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({
        source: "WORKING",
        event: "DONE",
        routing: "default",
      }),
    ]);
  });

  it("не извлекает emissions из вложенных функций и deferred callbacks", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: { START: "WORKING" },
          WORKING: {},
        },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          WORKING: ({ transition }) => {
            transition({ type: "DIRECT" });

            const later = () => transition({ type: "NESTED_CONST" });
            setTimeout(() => transition({ type: "TIMEOUT" }), 10);
            function nested() {
              transition({ type: "NESTED_FUNCTION" });
            }

            console.log(later, nested);
          },
        },
      });
    `);

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({ source: "WORKING", event: "DIRECT", routing: "default" }),
    ]);
    expect(diagnosticCodes(machine)).toEqual([
      "LFG_EFFECT_TRANSITION_ESCAPED",
      "LFG_EFFECT_TRANSITION_ESCAPED",
      "LFG_EFFECT_TRANSITION_ESCAPED",
    ]);
  });

  it("помечает expression-bodied nested functions как escaped transition без emission", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          IDLE: ({ transition }) => () => transition({ type: "LATER" }),
        },
      });
    `);

    expect(machine.emissions).toEqual([]);
    expect(diagnosticCodes(machine)).toEqual(["LFG_EFFECT_TRANSITION_ESCAPED"]);
  });

  it("сохраняет sourceState shape для wildcard emissions", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          "*": { RESET: "IDLE" },
          IDLE: {},
        },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          "*": ({ transition }) => transition({ type: "RESET" }),
        },
      });
    `);

    expect(graphSourceLabels(machine.emissions[0]?.sourceState ?? "*", machine)).toBe("*");
  });

  it("покрывает поддержанные формы effect function и control-flow", () => {
    const machines = compileSnippetMachines(`
      import { createMachine } from "@lite-fsm/core";

      export const methodEffect = createMachine({
        config: { IDLE: { GO: "IDLE" } },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          "IDLE"({ "transition": send, "action": act }) {
            if (act.type === "A") send({ type: "A" });
            else if (act.type === "B") {
              send({ type: "B" });
            } else {
              send({ type: "C" });
            }
          },
        },
      });

      export const identifierParam = createMachine({
        config: { IDLE: { GO: "IDLE" } },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          IDLE: async (transition) => {
            await transition({ type: "AWAITED" });
            {
              transition({ type: "BLOCKED" });
            }
            return;
          },
        },
      });

      export const variableEscape = createMachine({
        config: { IDLE: { GO: "IDLE" } },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          IDLE: ({ transition }) => {
            const send = transition;
            const value = transition({ type: "DECLARED" });
            transition.later({ type: "LATER" });
            console.log(value);
          },
        },
      });
    `);
    const methodEffect = getMachine(machines, "methodEffect");
    const identifierParam = getMachine(machines, "identifierParam");
    const variableEscape = getMachine(machines, "variableEscape");

    expect(emissionRows(methodEffect).map((row) => [row.event, row.guardKind])).toEqual([
      ["A", "if"],
      ["B", "else-if"],
      ["C", "else"],
    ]);
    expect(emissionRows(identifierParam).map((row) => row.event)).toEqual(["AWAITED", "BLOCKED"]);
    expect(emissionRows(variableEscape).map((row) => row.event)).toEqual(["DECLARED"]);
    expect(diagnosticCodes(variableEscape)).toContain("LFG_EFFECT_TRANSITION_ESCAPED");
  });

  it("раскрывает effects shorthand, string-key option, local spreads и transparent entry wrappers", () => {
    const machines = compileSnippetMachines(`
      import { createEffect, createMachine } from "@lite-fsm/core";

      const baseEffects = {
        IDLE: ({ transition }) => transition({ type: "BASE" }),
      } as const;

      const localEffects = ({
        ...baseEffects,
        READY: ((createEffect({
          type: "latest",
          effect: (({ transition }) => transition({ type: "WRAPPED" })) as const,
          cancelFn: () => false,
        }) as const) satisfies unknown),
      } as const) satisfies unknown;

      const effects = {
        IDLE: ({ transition }) => transition({ type: "SHORT" }),
      } as const;

      export const stringKeyEffectsOption = createMachine({
        config: { IDLE: {}, READY: {} },
        initialState: "IDLE",
        initialContext: {},
        "effects": localEffects,
      });

      export const shorthandEffectsOption = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects,
      });
    `);
    const stringKeyEffectsOption = getMachine(machines, "stringKeyEffectsOption");
    const shorthandEffectsOption = getMachine(machines, "shorthandEffectsOption");

    expect(emissionRows(stringKeyEffectsOption)).toEqual([
      expect.objectContaining({ source: "IDLE", event: "BASE", routing: "default" }),
      expect.objectContaining({ source: "READY", event: "WRAPPED", routing: "default" }),
    ]);
    expect(emissionRows(shorthandEffectsOption)).toEqual([
      expect.objectContaining({ source: "IDLE", event: "SHORT", routing: "default" }),
    ]);
  });

  it("сохраняет guard text, loc и source location metadata для emissions", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          IDLE: ({ action, transition }) => {
            if (action.type === "A" && action.payload.ok) {
              transition({ type: "A_DONE" });
            }

            switch (action.type) {
              case "B":
                transition({ type: "B_DONE" });
            }
          },
        },
      });
    `);

    expect(machine.emissions).toHaveLength(2);
    expect(machine.emissions[0]).toMatchObject({
      event: { type: "A_DONE", source: "effect" },
      guard: {
        text: 'action.type === "A" && action.payload.ok',
        kind: "if",
      },
    });
    expect(machine.emissions[1]).toMatchObject({
      event: { type: "B_DONE", source: "effect" },
      guard: {
        text: 'case "B"',
        kind: "switch-case",
      },
    });
    expect(machine.emissions[0]?.loc?.start.offset).toEqual(expect.any(Number));
    expect(machine.emissions[0]?.guard?.loc?.start.offset).toEqual(expect.any(Number));
  });

  it("возвращает diagnostics для unsupported effects и effect entries", () => {
    const machines = compileSnippetMachines(`
      import { createEffect, createMachine } from "@lite-fsm/core";

      const dynamicEffects = getEffects();
      const externalEffects = unresolvedEffects;
      const dynamicEffect = getEffect();

      export const effectsString = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: "bad",
      });

      export const effectsDynamic = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: dynamicEffects,
      });

      export const effectsExternal = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: externalEffects,
      });

      export const effectsUnsupportedSpread = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { ...externalEffects },
      });

      export const entryNumber = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: 1 },
      });

      export const entryDynamic = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: dynamicEffect },
      });

      export const entryExternal = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: externalEffect },
      });

      export const entryUnsupportedWrapper = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: createEffect({ type: "latest" }) },
      });

      const dynamicKey = getEffectKey();
      export const dynamicComputedEffectKey = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          [dynamicKey]: ({ transition }) => transition({ type: "GO" }),
        },
      });
    `);

    expect(diagnosticCodes(getMachine(machines, "effectsString"))).toContain("LFG_UNSUPPORTED_EFFECTS");
    expect(diagnosticCodes(getMachine(machines, "effectsDynamic"))).toContain("LFG_DYNAMIC_EFFECTS");
    expect(diagnosticCodes(getMachine(machines, "effectsExternal"))).toContain("LFG_UNRESOLVED_EFFECTS");
    expect(diagnosticCodes(getMachine(machines, "effectsUnsupportedSpread"))).toContain("LFG_UNSUPPORTED_EFFECTS");
    expect(diagnosticCodes(getMachine(machines, "entryNumber"))).toContain("LFG_UNSUPPORTED_EFFECT");
    expect(diagnosticCodes(getMachine(machines, "entryDynamic"))).toContain("LFG_DYNAMIC_EFFECT");
    expect(diagnosticCodes(getMachine(machines, "entryExternal"))).toContain("LFG_UNRESOLVED_EFFECT");
    expect(diagnosticCodes(getMachine(machines, "entryUnsupportedWrapper"))).toContain("LFG_UNSUPPORTED_EFFECT");
    expect(diagnosticCodes(getMachine(machines, "dynamicComputedEffectKey"))).toContain("LFG_UNSUPPORTED_EFFECTS");
  });

  it("возвращает diagnostics для unsupported effect parameters", () => {
    const machines = compileSnippetMachines(`
      import { createMachine } from "@lite-fsm/core";

      export const noParam = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: () => {} },
      });

      export const nonObjectParam = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: (args) => args.transition({ type: "GO" }) },
      });

      export const missingTransition = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: ({ action }) => action.type },
      });

      export const nestedTransitionBinding = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: ({ transition: { send } }) => send },
      });

      export const stringLiteralBinding = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: ({ "transition-name": send }) => send },
      });

      const key = "transition";
      export const computedBinding = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: ({ [key]: transition }) => transition({ type: "GO" }) },
      });
    `);

    expect(diagnosticCodes(getMachine(machines, "noParam"))).toContain("LFG_UNSUPPORTED_EFFECT");
    expect(diagnosticCodes(getMachine(machines, "nonObjectParam"))).toContain("LFG_UNSUPPORTED_EFFECT");
    expect(diagnosticCodes(getMachine(machines, "missingTransition"))).toContain("LFG_UNSUPPORTED_EFFECT");
    expect(diagnosticCodes(getMachine(machines, "nestedTransitionBinding"))).toContain("LFG_UNSUPPORTED_EFFECT");
    expect(diagnosticCodes(getMachine(machines, "stringLiteralBinding"))).toContain("LFG_UNSUPPORTED_EFFECT");
    expect(diagnosticCodes(getMachine(machines, "computedBinding"))).toContain("LFG_UNSUPPORTED_EFFECT");
  });

  it("покрывает routing resolver fallbacks", () => {
    const machines = compileSnippetMachines(`
      import { createMachine } from "@lite-fsm/core";

      const groupIds = ["group-1", "group-2"];
      const mixedIds = ["group-1", 2];

      export const routingFallbacks = createMachine({
        config: {
          __INIT: { SPAWN: "ACTIVE" },
          ACTIVE: {},
        },
        initialState: "__INIT",
        initialContext: {},
        effects: {
          ACTIVE: ({ action, transition, self }) => {
            transition({ type: "GROUPS", meta: { groupId: groupIds } });
            transition({ type: "MIXED", meta: { groupId: mixedIds } });
            transition({ type: "UNKNOWN_META", meta: action.meta });
            transition({ type: "TRACE", meta: { traceId: "trace-1" } });
            transition.actor(self.unknownField, { type: "UNKNOWN_SELF" });
            transition.actor({ id: "object" }, { type: "OBJECT_TARGET" });
            transition.actor();
          },
        },
      });
    `);
    const machine = getMachine(machines, "routingFallbacks");

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({ event: "GROUPS", routing: "group:[group-1,group-2]", confidence: "exact" }),
      expect.objectContaining({ event: "MIXED", routing: "group:dynamic:mixedIds", confidence: "partial" }),
      expect.objectContaining({ event: "UNKNOWN_META", routing: "unknown:action.meta", confidence: "unknown" }),
      expect.objectContaining({ event: "TRACE", routing: "default", confidence: "exact" }),
      expect.objectContaining({ event: "UNKNOWN_SELF", routing: "actor:dynamic:LFG_UNSUPPORTED_EXPRESSION", confidence: "partial" }),
      expect.objectContaining({ event: "OBJECT_TARGET", routing: 'actor:dynamic:{ id: "object" }', confidence: "partial" }),
    ]);
    expect(diagnosticCodes(machine)).toEqual(expect.arrayContaining([
      "LFG_EFFECT_DYNAMIC_ROUTING_TARGET",
      "LFG_EFFECT_DYNAMIC_EVENT_TYPE",
    ]));
  });

  it("запрещает все actor routing sugar variants в domain effects", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          IDLE: { START: "ACTIVE" },
          ACTIVE: {},
        },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          ACTIVE: ({ transition }) => {
            transition.actor("actor-1", { type: "ACTOR" });
            transition.group("group-1", { type: "GROUP" });
            transition.tag("workers", { type: "TAG" });
            transition.unscoped({ type: "UNSCOPED" });
          },
        },
      });
    `);

    expect(machine.emissions).toEqual([]);
    expect(diagnosticCodes(machine)).toEqual([
      "LFG_EFFECT_ACTOR_ROUTING_ON_DOMAIN",
      "LFG_EFFECT_ACTOR_ROUTING_ON_DOMAIN",
      "LFG_EFFECT_ACTOR_ROUTING_ON_DOMAIN",
      "LFG_EFFECT_ACTOR_ROUTING_ON_DOMAIN",
    ]);
  });

  it("поддерживает self routing targets в direct transition meta", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: {
          __INIT: { SPAWN: "ACTIVE" },
          ACTIVE: {},
        },
        initialState: "__INIT",
        initialContext: {},
        effects: {
          ACTIVE: ({ transition, self }) => {
            transition({ type: "SELF_ACTOR", meta: { actorId: self.actorId } });
            transition({ type: "SELF_GROUP", meta: { groupId: [self.groupId, "group-2"] } });
            transition({ type: "SELF_TAG", meta: { groupTag: self.groupTag } });
          },
        },
      });
    `);

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({ event: "SELF_ACTOR", routing: "actor:self.actorId", confidence: "exact" }),
      expect.objectContaining({ event: "SELF_GROUP", routing: "group:[self.groupId,group-2]", confidence: "exact" }),
      expect.objectContaining({ event: "SELF_TAG", routing: "tag:self.groupTag", confidence: "exact" }),
    ]);
  });

  it("возвращает diagnostics для unsupported transition action objects", () => {
    const machine = compileSnippetMachine(`
      import { createMachine } from "@lite-fsm/core";

      export const machine = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          IDLE: ({ transition }) => {
            transition();
            transition("DONE");
            transition({});
          },
        },
      });
    `);

    expect(machine.emissions).toEqual([]);
    expect(diagnosticCodes(machine)).toEqual([
      "LFG_EFFECT_DYNAMIC_EVENT_TYPE",
      "LFG_EFFECT_DYNAMIC_EVENT_TYPE",
      "LFG_EFFECT_DYNAMIC_EVENT_TYPE",
    ]);
  });

  it("сохраняет partial labels для unsupported switch expressions", () => {
    const machines = compileSnippetMachines(`
      import { createMachine } from "@lite-fsm/core";

      export const unsupportedSwitch = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          IDLE: ({ action, transition }) => {
            switch (action.kind) {
              case "one":
                transition({ type: "ONE" });
                return;
              default:
                transition({ type: "OTHER" });
            }
          },
        },
      });

      export const literalSwitch = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          IDLE: ({ action, transition }) => {
            switch ("literal") {
              case "literal":
                return transition({ type: "RETURNED" });
              default:
                transition({ type: "DEFAULT" });
            }
            debugger;
          },
        },
      });

      export const functionExpression = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          IDLE: function ({ transition }) {
            let value;
            value = transition({ type: "ASSIGNED" });
            return value;
          },
        },
      });

      export const noActionSwitch = createMachine({
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: {
          IDLE: ({ transition }) => {
            switch ("literal") {
              default:
                transition({ type: "NO_ACTION" });
            }
          },
        },
      });
    `);
    const machine = getMachine(machines, "unsupportedSwitch");
    const literalSwitch = getMachine(machines, "literalSwitch");
    const functionExpression = getMachine(machines, "functionExpression");
    const noActionSwitch = getMachine(machines, "noActionSwitch");

    expect(emissionRows(machine)).toEqual([
      expect.objectContaining({ event: "ONE", guardKind: "unknown", confidence: "partial" }),
      expect.objectContaining({ event: "OTHER", guardKind: "unknown", confidence: "partial" }),
    ]);
    expect(diagnosticCodes(machine)).toContain("LFG_UNSUPPORTED_EFFECT_BRANCH");
    expect(emissionRows(literalSwitch)).toEqual([
      expect.objectContaining({ event: "RETURNED", guardKind: "unknown", confidence: "partial" }),
      expect.objectContaining({ event: "DEFAULT", guardKind: "unknown", confidence: "partial" }),
    ]);
    expect(emissionRows(functionExpression)).toEqual([
      expect.objectContaining({ event: "ASSIGNED", routing: "default" }),
    ]);
    expect(emissionRows(noActionSwitch)).toEqual([
      expect.objectContaining({ event: "NO_ACTION", guardKind: "unknown", confidence: "partial" }),
    ]);
  });
});
