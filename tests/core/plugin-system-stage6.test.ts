import { describe, expect, it } from "vitest";

import { definePlugin, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { StorageRuntime } from "@lite-fsm/core/internal/runtime/kernel/storage";

type StageMachine = {
  storage: "stage6";
  pluginRequired?: { route?: string };
  config: { IDLE: { HIT: "IDLE" } };
  initialState: "IDLE";
  initialContext: { hits: number };
};

type StageState = {
  validates: number;
  commits: number;
};

const createStageMachine = (pluginRequired: StageMachine["pluginRequired"] = { route: "entity/a" }): StageMachine =>
  ({
    storage: "stage6",
    pluginRequired,
    config: { IDLE: { HIT: "IDLE" } },
    initialState: "IDLE",
    initialContext: { hits: 0 },
  }) as StageMachine;

const createStageRuntime = (routeMetaKeys?: readonly string[]): StorageRuntime => ({
  kind: "stage6",
  routeMetaKeys,
  validateTemplate({ key, machine, storageKind }) {
    const value = (machine as Partial<StageMachine>).pluginRequired?.route;
    if (typeof value === "string" && value.length > 0) return;

    throw new LiteFsmError(
      "LITE_FSM_INVALID_STORAGE_CONFIG",
      `[lite-fsm] machine '${key}' for storage kind '${storageKind}' requires pluginRequired.route.`,
    );
  },
  compileTemplate(ctx) {
    return { key: ctx.key, kind: "stage6" };
  },
  createRuntimeState() {
    return { validates: 0, commits: 0 } satisfies StageState;
  },
  createPublicInitialState() {
    return { state: "IDLE", context: { hits: 0 } };
  },
  acceptsEvent({ action }) {
    return action.type === "HIT";
  },
  reduce() {},
  commit({ state }) {
    (state as StageState).commits += 1;
  },
});

const stageRuntimePlugin = (runtime: StorageRuntime) =>
  definePlugin({
    name: `stage6-runtime:${runtime.routeMetaKeys?.join(",") ?? "plain"}`,
    install(ctx) {
      ctx.storage.register("stage6", runtime);
    },
  });

describe("plugin system stage 6 runtime validation", () => {
  it("invalid storage-specific config из test plugin бросает init error", () => {
    const runtime = createStageRuntime();

    expect(() =>
      MachineManager(
        {
          custom: createStageMachine({}) as never,
        },
        {
          plugins: [stageRuntimePlugin(runtime)],
        },
      ),
    ).toThrow("[lite-fsm] machine 'custom' for storage kind 'stage6' requires pluginRequired.route.");
  });

  it("отсутствие route resolver для runtime-supported meta key бросает clear error", () => {
    const runtime = createStageRuntime(["entityId"]);

    expect(() =>
      MachineManager(
        {
          custom: createStageMachine() as never,
        },
        {
          plugins: [stageRuntimePlugin(runtime)],
        },
      ),
    ).toThrow("[lite-fsm] storage runtime 'stage6' requires route resolver for meta key 'entityId'.");
  });

  it("registered route resolver закрывает runtime-supported meta key", () => {
    const runtime = createStageRuntime(["entityId"]);
    const routing = definePlugin({
      name: "stage6-routing",
      install(ctx) {
        ctx.routing.registerMetaKey("entityId", (value) => String(value));
      },
    });

    const manager = MachineManager(
      {
        custom: createStageMachine() as never,
      },
      {
        plugins: [stageRuntimePlugin(runtime), routing],
      },
    );

    manager.transition({ type: "HIT", meta: { entityId: "entity/a" } } as never);

    expect(manager.getState()).toEqual({ custom: { state: "IDLE", context: { hits: 0 } } });
  });
});
