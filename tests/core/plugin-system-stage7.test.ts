import { describe, expect, it } from "vitest";

import { definePlugin, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type {
  FSMEvent,
  MachineConfig,
  ScopedDepsFactory,
  ScopedTransitionFactory,
} from "@lite-fsm/core";
import type { StorageRuntime } from "@lite-fsm/core/internal/runtime/kernel/storage";

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

const scopedDeps = <Deps extends object>(
  keys: readonly string[],
  factory: (ctx: Parameters<ScopedDepsFactory<Deps>>[0]) => Deps,
): ScopedDepsFactory<Deps> => Object.assign(factory, { keys });

const scopedTransition = <Transition extends object>(
  keys: readonly string[],
  factory: (ctx: Parameters<ScopedTransitionFactory<Transition>>[0]) => Transition,
): ScopedTransitionFactory<Transition> => Object.assign(factory, { keys });

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

describe("plugin system stage 7 — scoped deps и transition", () => {
  it("вызывает deps extension для каждого domain effect invocation и передает scope", async () => {
    const scopes: string[] = [];
    const values: string[] = [];
    const plugin = definePlugin({
      name: "scoped-domain",
      install(ctx) {
        ctx.deps.extendDeps(
          scopedDeps(["trace"], (scope) => {
            scopes.push(`${scope.phase}:${scope.source.storage}:${scope.source.template}:${scope.event.type}`);
            return {
              trace: () =>
                `${scope.phase}:${scope.source.template}:${scope.event.type}:${Object.keys(scope.indices).join(",")}`,
            };
          }),
        );
      },
    });
    const makeMachine = (label: string) =>
      baseMachine<{ trace: () => string }>({
        active: ({ trace }) => {
          values.push(`${label}:${trace()}`);
        },
      });
    const manager = MachineManager({ first: makeMachine("first"), second: makeMachine("second") }, {
      plugins: [plugin] as const,
    });

    manager.transition({ type: "START" });
    await flushEffects();

    expect(scopes).toEqual(["effect:instance:first:START", "effect:instance:second:START"]);
    expect(values).toEqual(["first:effect:first:START:", "second:effect:second:START:"]);
  });

  it("передает actor indices в scoped deps", async () => {
    const captured: string[] = [];
    const plugin = definePlugin({
      name: "scoped-actor",
      install(ctx) {
        ctx.deps.extendDeps(
          scopedDeps(["traceActor"], (scope) => ({
            traceActor: () =>
              `${scope.source.template}:${scope.event.type}:${scope.indices.actorId}:${scope.indices.groupId}:${scope.indices.groupTag}`,
          })),
        );
      },
    });
    const actorMachine = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ traceActor }) => {
          captured.push(traceActor());
        },
      },
    } satisfies MachineConfig<LikeConfig, LikeSyncContext, LikeEvent, { traceActor: () => string }>;
    const manager = MachineManager({ likeSync: actorMachine }, { plugins: [plugin] as const });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    await flushEffects();

    expect(captured).toEqual(["likeSync:LIKE:likeSync/0:likeSync/0:likeSync"]);
  });

  it("поддерживает scoped deps в storage reactions", () => {
    const captured: string[] = [];
    const plugin = definePlugin({
      name: "reaction-scoped",
      install(ctx) {
        ctx.storage.register(
          "reaction-test",
          createReactionRuntime((deps) => captured.push((deps.traceReaction as () => string)())),
        );
        ctx.deps.extendDeps(
          scopedDeps(["traceReaction"], (scope) => ({
            traceReaction: () =>
              `${scope.phase}:${scope.source.storage}:${scope.source.template}:${scope.event.type}:${scope.indices.slot}`,
          })),
        );
      },
    });
    const machine: ReactionMachine = {
      storage: "reaction-test",
      config: { IDLE: { START: "IDLE" } },
      initialState: "IDLE",
      initialContext: { count: 0 },
    };
    const manager = MachineManager({ machine }, { plugins: [plugin] as const });

    manager.transition({ type: "START" });

    expect(captured).toEqual(["reaction:reaction-test:reaction:START:1"]);
  });

  it("не разрешает deps extension заменить user dep key", () => {
    const plugin = definePlugin({
      name: "override-user-dep",
      install(ctx) {
        ctx.deps.extendDeps(scopedDeps(["api"], () => ({ api: "plugin" })));
      },
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

    expect(() => manager.transition({ type: "START" })).toThrow(LiteFsmError);
    expect(() => manager.transition({ type: "START" })).toThrow(
      "[lite-fsm] plugin 'override-user-dep' cannot override existing scoped dep key 'api'.",
    );
  });

  it("бросает init error при duplicate deps ownership", () => {
    const first = definePlugin({
      name: "dep-owner-a",
      install(ctx) {
        ctx.deps.extendDeps(scopedDeps(["trace"], () => ({ trace: "a" })));
      },
    });
    const second = definePlugin({
      name: "dep-owner-b",
      install(ctx) {
        ctx.deps.extendDeps(scopedDeps(["trace"], () => ({ trace: "b" })));
      },
    });

    expect(() =>
      MachineManager({ machine: baseMachine() }, { plugins: [first, second] as const }),
    ).toThrow("[lite-fsm] duplicate scoped dep extension key 'trace'.");
  });

  it("валидирует форму scoped extension factory на init", () => {
    const withoutKeys = definePlugin({
      name: "without-keys",
      install(ctx) {
        ctx.deps.extendDeps((() => ({})) as unknown as ScopedDepsFactory);
      },
    });
    const invalidKey = definePlugin({
      name: "invalid-key",
      install(ctx) {
        ctx.deps.extendTransition(scopedTransition([""], () => ({ noop: () => undefined })));
      },
    });

    expect(() => MachineManager({ machine: baseMachine() }, { plugins: [withoutKeys] as const })).toThrow(
      "[lite-fsm] plugin 'without-keys' registered dep extension without declared keys.",
    );
    expect(() => MachineManager({ machine: baseMachine() }, { plugins: [invalidKey] as const })).toThrow(
      "[lite-fsm] plugin 'invalid-key' registered invalid transition extension key.",
    );
  });

  it("бросает clear error, если deps factory возвращает key без ownership", () => {
    const plugin = definePlugin({
      name: "unowned-dep",
      install(ctx) {
        ctx.deps.extendDeps(scopedDeps(["owned"], () => ({ extra: true })));
      },
    });
    const manager = MachineManager(
      {
        machine: baseMachine<{ owned?: true }>({
          active: () => {},
        }),
      },
      { plugins: [plugin] as const },
    );

    expect(() => manager.transition({ type: "START" })).toThrow(
      "[lite-fsm] plugin 'unowned-dep' returned scoped dep key 'extra' without ownership.",
    );
  });

  it("transition extension добавляет scoped method и сохраняет core transition", async () => {
    const plugin = definePlugin({
      name: "transition-method",
      install(ctx) {
        ctx.deps.extendTransition(
          scopedTransition(["finish"], (scope) => ({
            finish: () => scope.transition({ type: "DONE" }),
          })),
        );
      },
    });
    const manager = MachineManager(
      {
        machine: baseMachine<{ transition: { finish: () => Event } }>({
          active: ({ transition }) => {
            transition({ type: "AGAIN" });
            transition.finish();
          },
        }),
      },
      { plugins: [plugin] as const },
    );

    manager.transition({ type: "START" });
    await flushEffects();

    expect(manager.getState().machine).toEqual({ state: "idle", context: { count: 1 } });
  });

  it("бросает init error при duplicate transition ownership", () => {
    const first = definePlugin({
      name: "transition-owner-a",
      install(ctx) {
        ctx.deps.extendTransition(scopedTransition(["finish"], () => ({ finish: () => undefined })));
      },
    });
    const second = definePlugin({
      name: "transition-owner-b",
      install(ctx) {
        ctx.deps.extendTransition(scopedTransition(["finish"], () => ({ finish: () => undefined })));
      },
    });

    expect(() =>
      MachineManager({ machine: baseMachine() }, { plugins: [first, second] as const }),
    ).toThrow("[lite-fsm] duplicate scoped transition extension key 'finish'.");
  });

  it("запрещает заменить core transition key", () => {
    const depPlugin = definePlugin({
      name: "replace-transition-dep",
      install(ctx) {
        ctx.deps.extendDeps(scopedDeps(["transition"], () => ({ transition: () => undefined })));
      },
    });
    const transitionPlugin = definePlugin({
      name: "replace-transition-method",
      install(ctx) {
        ctx.deps.extendTransition(scopedTransition(["actor"], () => ({ actor: () => undefined })));
      },
    });

    expect(() => MachineManager({ machine: baseMachine() }, { plugins: [depPlugin] as const })).toThrow(
      "[lite-fsm] plugin 'replace-transition-dep' cannot override core scoped dep key 'transition'.",
    );
    expect(() => MachineManager({ machine: baseMachine() }, { plugins: [transitionPlugin] as const })).toThrow(
      "[lite-fsm] plugin 'replace-transition-method' cannot override core scoped transition key 'actor'.",
    );
  });

  it("async effect сохраняет captured invocation scope после await", async () => {
    const waits: Array<() => void> = [];
    const captured: string[] = [];
    const plugin = definePlugin({
      name: "async-scope",
      install(ctx) {
        ctx.deps.extendDeps(
          scopedDeps(["capture"], (scope) => ({
            capture: () => `${scope.source.template}:${scope.event.type}`,
          })),
        );
      },
    });
    const manager = MachineManager(
      {
        machine: baseMachine<{ capture: () => string; wait: () => Promise<void> }>({
          "*": async ({ capture, wait }) => {
            await wait();
            captured.push(capture());
          },
        }),
      },
      { plugins: [plugin] as const },
    );
    manager.setDependencies({
      wait: () =>
        new Promise<void>((resolve) => {
          waits.push(resolve);
        }),
    } as never);

    manager.transition({ type: "START" });
    manager.transition({ type: "AGAIN" });
    waits[0]?.();
    await flushEffects();
    waits[1]?.();
    await flushEffects();

    expect(captured).toEqual(["machine:START", "machine:AGAIN"]);
  });

  it("no-op deps extension не меняет поведение и сохраняет phase ordering", async () => {
    const order: string[] = [];
    const plugin = definePlugin({
      name: "noop-scoped",
      install(ctx) {
        ctx.dispatch.beforeEffects(() => order.push("beforeEffects"));
        ctx.deps.extendDeps(
          scopedDeps([], () => {
            order.push("deps");
            return {};
          }),
        );
        ctx.dispatch.afterEffects(() => order.push("afterEffects"));
      },
    });
    const manager = MachineManager(
      {
        machine: baseMachine({
          active: () => {
            order.push("effect");
          },
        }),
      },
      { plugins: [plugin] as const },
    );

    manager.transition({ type: "START" });
    await flushEffects();

    expect(manager.getState().machine.state).toBe("active");
    expect(order).toEqual(["beforeEffects", "deps", "effect", "afterEffects"]);
  });
});
