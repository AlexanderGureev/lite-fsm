import { describe, expect, it } from "vitest";

import { definePlugin, LiteFsmError, MachineManager } from "@lite-fsm/core";
import { getNormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import {
  createMachineManagerFactory,
  type RuntimePreset,
} from "@lite-fsm/core/internal/runtime/kernel/createMachineManagerFactory";
import type { StorageRuntime } from "@lite-fsm/core/internal/runtime/kernel/storage";
import type { NormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import type { FSMEvent, MachineConfig } from "@lite-fsm/core";

import {
  createLikeSync,
  type LikeConfig,
  type LikeEvent,
  type LikeSyncContext,
} from "./MachineManager.actors.fixtures";

type Start = FSMEvent<"START">;
type Done = FSMEvent<"DONE">;
type Again = FSMEvent<"AGAIN">;
type Event = Start | Done | Again;
type Config = { idle: { START: "active"; AGAIN: null }; active: { DONE: "idle"; AGAIN: null } };
type Ctx = { count: number };
type ReactionMachine = {
  storage: "reaction-test";
  config: { IDLE: { START: "IDLE" } };
  initialState: "IDLE";
  initialContext: Ctx;
};

const flushEffects = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const baseMachine = <D extends Record<string, unknown> = {}>(
  effects: MachineConfig<Config, Ctx, Event, D>["effects"] = {},
): MachineConfig<Config, Ctx, Event, D> => ({
  config: { idle: { START: "active", AGAIN: null }, active: { DONE: "idle", AGAIN: null } },
  initialState: "idle",
  initialContext: { count: 0 },
  reducer: (state, action, meta) => {
    if (action.type === "AGAIN") {
      return { state: state.state, context: { count: state.context.count + 1 } };
    }
    return { state: meta.nextState, context: state.context };
  },
  effects,
});

const expectLiteFsmError = (run: () => unknown, code: LiteFsmError["code"]) => {
  expect(run).toThrow(LiteFsmError);

  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(LiteFsmError);
    expect((error as LiteFsmError).code).toBe(code);
    return;
  }

  throw new Error("Expected LiteFsmError.");
};

const createReactionRuntime = (capture: (deps: Record<string, unknown>) => void): StorageRuntime => ({
  kind: "reaction-test",
  validateTemplate() {},
  compileTemplate(ctx) {
    return { key: ctx.key, kind: "reaction-test" };
  },
  createRuntimeState() {
    return {};
  },
  createPublicInitialState() {
    return { state: "IDLE", context: { count: 0 } };
  },
  acceptsEvent({ action }) {
    return action.type === "START";
  },
  reduce({ template, dispatch }) {
    dispatch.nextState = {
      ...dispatch.nextState,
      [template.key]: { state: "IDLE", context: { count: 1 } },
    };
  },
  commit() {},
  reactions: {
    run({ action, manager }) {
      capture(
        manager.createScopedDeps(
          { transition: manager.transition },
          {
            source: { storage: "reaction-test", template: "reaction" },
            event: action,
            indices: { slot: 1 },
            phase: "reaction",
            transition: manager.transition,
          },
        ),
      );
    },
  },
});

const createStoragePlugin = (runtime: StorageRuntime): NormalizedPlugin => ({
  name: `stage-six-runtime:${runtime.kind}`,
  storage: [{ owner: `stage-six-runtime:${runtime.kind}`, kind: runtime.kind, value: runtime }],
  routeMeta: [],
  scopedDeps: [],
  scopedTransition: [],
  manager: [],
  hooks: {},
});

describe("plugin system — этап 6", () => {
  it("добавляет scoped dep для каждого domain effect invocation и передает scope", async () => {
    const scopes: string[] = [];
    const values: string[] = [];
    const plugin = definePlugin().create({
      name: "stage-six-domain-deps",
      scopedDeps: {
        trace(scope) {
          scopes.push(`${scope.phase}:${scope.source.storage}:${scope.source.template}:${scope.event.type}`);

          return () =>
            `${scope.phase}:${scope.source.template}:${scope.event.type}:${Object.keys(scope.indices).join(",")}`;
        },
      },
    });
    const createMachine = (label: string) =>
      baseMachine<{ trace: () => string }>({
        active: ({ trace }) => {
          values.push(`${label}:${trace()}`);
        },
      });
    const manager = MachineManager(
      { first: createMachine("first"), second: createMachine("second") },
      { plugins: [plugin] as const },
    );

    manager.transition({ type: "START" });
    await flushEffects();

    expect(scopes).toEqual(["effect:instance:first:START", "effect:instance:second:START"]);
    expect(values).toEqual(["first:effect:first:START:", "second:effect:second:START:"]);
  });

  it("добавляет scoped transition method и сохраняет callable core transition", async () => {
    const commandCalls: string[] = [];
    const plugin = definePlugin<Done>().create({
      name: "stage-six-transition-method",
      scopedTransition: {
        finish(scope) {
          return () => scope.transition({ type: "DONE" });
        },
        command(scope) {
          return (label: string) => {
            commandCalls.push(`${scope.event.type}:${label}`);
          };
        },
      },
    });
    const manager = MachineManager(
      {
        machine: baseMachine<{ transition: { finish: () => Done; command: (label: string) => void } }>({
          active: ({ transition }) => {
            transition({ type: "AGAIN" });
            transition.command("active");
            transition.finish();
          },
        }),
      },
      { plugins: [plugin] as const },
    );

    manager.transition({ type: "START" });
    await flushEffects();

    expect(commandCalls).toEqual(["START:active"]);
    expect(manager.getState().machine).toEqual({ state: "idle", context: { count: 1 } });
    expect("finish" in manager.transition).toBe(false);
  });

  it("сохраняет actor transition helpers при scopedTransition", async () => {
    const calls: string[] = [];
    const plugin = definePlugin<LikeEvent>().create({
      name: "stage-six-actor-transition",
      scopedTransition: {
        finish(scope) {
          return () => {
            calls.push(`method:${scope.indices.actorId}`);
          };
        },
      },
    });
    const actorMachine = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ transition }) => {
          calls.push(typeof transition.actor);
          transition.finish();
        },
      },
    } satisfies MachineConfig<LikeConfig, LikeSyncContext, LikeEvent, { transition: { finish: () => void } }>;
    const manager = MachineManager({ likeSync: actorMachine }, { plugins: [plugin] as const });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    await flushEffects();

    expect(calls).toEqual(["function", "method:likeSync/0"]);
  });

  it("добавляет scoped deps в storage reaction invocation", () => {
    const captured: string[] = [];
    const scopedPlugin = getNormalizedPlugin(
      definePlugin().create({
        name: "stage-six-reaction-deps",
        scopedDeps: {
          traceReaction(scope) {
            return () =>
              `${scope.phase}:${scope.source.storage}:${scope.source.template}:${scope.event.type}:${scope.indices.slot}`;
          },
        },
      }),
    );
    const preset: RuntimePreset = {
      name: "stage-six-reaction-preset",
      defaultStorageKind: "reaction-test",
      plugins: [
        createStoragePlugin(
          createReactionRuntime((deps) => captured.push((deps.traceReaction as () => string)())),
        ),
        scopedPlugin,
      ],
    };
    const manager = createMachineManagerFactory(preset)({
      reaction: {
        storage: "reaction-test",
        config: { IDLE: { START: "IDLE" } },
        initialState: "IDLE",
        initialContext: { count: 0 },
      } satisfies ReactionMachine,
    });

    manager.transition({ type: "START" });

    expect(captured).toEqual(["reaction:reaction-test:reaction:START:1"]);
  });

  it("диагностирует duplicate scoped keys", () => {
    const firstDep = definePlugin().create({
      name: "stage-six-dep-owner-a",
      scopedDeps: { trace: () => "a" },
    });
    const secondDep = definePlugin().create({
      name: "stage-six-dep-owner-b",
      scopedDeps: { trace: () => "b" },
    });
    const firstTransition = definePlugin().create({
      name: "stage-six-transition-owner-a",
      scopedTransition: { finish: () => () => undefined },
    });
    const secondTransition = definePlugin().create({
      name: "stage-six-transition-owner-b",
      scopedTransition: { finish: () => () => undefined },
    });

    expectLiteFsmError(
      () => MachineManager({ machine: baseMachine() }, { plugins: [firstDep, secondDep] as const }),
      "LITE_FSM_DUPLICATE_SCOPED_EXTENSION_KEY",
    );
    expectLiteFsmError(
      () => MachineManager({ machine: baseMachine() }, { plugins: [firstTransition, secondTransition] as const }),
      "LITE_FSM_DUPLICATE_SCOPED_EXTENSION_KEY",
    );
  });

  it("диагностирует попытки занять core scoped keys", () => {
    const depPlugin = definePlugin().create({
      name: "stage-six-core-dep",
      scopedDeps: { transition: () => undefined },
    });
    const transitionPlugin = definePlugin().create({
      name: "stage-six-core-transition",
      scopedTransition: { actor: () => () => undefined },
    });

    expectLiteFsmError(
      () => MachineManager({ machine: baseMachine() }, { plugins: [depPlugin] as const }),
      "LITE_FSM_SCOPED_EXTENSION_CORE_KEY",
    );
    expectLiteFsmError(
      () => MachineManager({ machine: baseMachine() }, { plugins: [transitionPlugin] as const }),
      "LITE_FSM_SCOPED_EXTENSION_CORE_KEY",
    );
  });

  it("диагностирует invalid scoped key на этапе composition", () => {
    const plugin = definePlugin().create({
      name: "stage-six-empty-key",
      scopedDeps: { "": () => undefined },
    });

    expectLiteFsmError(
      () => MachineManager({ machine: baseMachine() }, { plugins: [plugin] as const }),
      "LITE_FSM_INVALID_SCOPED_EXTENSION",
    );
  });

  it("диагностирует попытку занять app dep key во время invocation", () => {
    const plugin = definePlugin().create({
      name: "stage-six-app-dep-override",
      scopedDeps: { api: () => "plugin" },
    });
    const manager = MachineManager(
      {
        machine: baseMachine<{ api: string }>({
          active: () => {},
        }),
      },
      { plugins: [plugin] as const },
    );
    manager.setDependencies({ api: "app" });

    expectLiteFsmError(() => manager.transition({ type: "START" }), "LITE_FSM_SCOPED_EXTENSION_OVERRIDE");
  });

  it("оставляет empty scoped sections в local validation", () => {
    expectLiteFsmError(
      () => definePlugin().create({ name: "stage-six-empty-deps", scopedDeps: {} }),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
    expectLiteFsmError(
      () => definePlugin().create({ name: "stage-six-empty-transition", scopedTransition: {} }),
      "LITE_FSM_INVALID_PLUGIN_DEFINITION",
    );
  });
});
