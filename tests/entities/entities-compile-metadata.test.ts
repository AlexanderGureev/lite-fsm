import { describe, expect, it } from "vitest";

import {
  compileEntityRuntimeMetadata,
  compileEntityTemplate,
} from "../../packages/entities/src/runtime/compile";

const compileActor = (
  config: object,
  options: Partial<Omit<Parameters<typeof compileEntityTemplate>[1], "config" | "initialContext" | "spawnSchema">> = {},
) => {
  const runtime = compileEntityRuntimeMetadata([
    compileEntityTemplate("actor", {
      config,
      initialContext: {},
      spawnSchema: {},
      ...options,
    }),
  ]);
  const metadata = runtime.metadataByKey.actor;

  return {
    metadata,
    planFor(eventType: string) {
      const eventCode = runtime.eventCodeByType[eventType];
      if (eventCode === undefined) throw new Error(`missing event code for ${eventType}`);
      return metadata.reducePlansByEventCode[eventCode];
    },
  };
};

describe("compile metadata для reduce plan", () => {
  it("помечает переход active: TICK -> active как identity plan", () => {
    const { planFor } = compileActor({
      __INIT: { ENTITY_SPAWNED: "active" },
      active: { TICK: "active" },
    });

    expect(planFor("TICK")).toMatchObject({
      eventCode: 1,
      acceptStateCodes: [0],
      allDefaultTransitionsIdentity: true,
      hasNonIdentityDefaultTransition: false,
      mayEnterEffectState: false,
      hasDespawnOnStates: false,
      hasReaction: false,
      mayEnterTerminalState: false,
      requiresReducerCall: false,
    });
  });

  it("помечает событие из двух состояний с identity transitions", () => {
    const { planFor } = compileActor({
      __INIT: { ENTITY_SPAWNED: "active" },
      active: { TICK: "active" },
      paused: { TICK: "paused" },
    });

    expect(planFor("TICK")).toMatchObject({
      acceptStateCodes: [0, 1],
      allDefaultTransitionsIdentity: true,
      hasNonIdentityDefaultTransition: false,
    });
  });

  it("помечает READY -> STOPPED как non-identity и отделяет requiresReducerCall", () => {
    const config = {
      __INIT: { ENTITY_SPAWNED: "READY" },
      READY: { TICK: "STOPPED" },
      STOPPED: {},
    };
    const noReducerPlan = compileActor(config).planFor("TICK");
    const reducerPlan = compileActor(config, { reducer: () => undefined }).planFor("TICK");

    expect(noReducerPlan).toMatchObject({
      acceptStateCodes: [0],
      allDefaultTransitionsIdentity: false,
      hasNonIdentityDefaultTransition: true,
      requiresReducerCall: false,
    });
    expect(reducerPlan).toMatchObject({
      allDefaultTransitionsIdentity: false,
      hasNonIdentityDefaultTransition: true,
      requiresReducerCall: true,
    });
  });

  it("помечает target state с effects через mayEnterEffectState", () => {
    const { planFor } = compileActor(
      {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { TICK: "ACTIVE" },
        ACTIVE: {},
      },
      { effects: { ACTIVE: () => undefined } },
    );

    expect(planFor("TICK")).toMatchObject({
      mayEnterEffectState: true,
      hasNonIdentityDefaultTransition: true,
    });
  });

  it("помечает template с despawnOn states", () => {
    const { planFor } = compileActor(
      {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { TICK: "GONE" },
        GONE: {},
      },
      { despawnOn: "GONE" },
    );

    expect(planFor("TICK")).toMatchObject({
      hasDespawnOnStates: true,
      hasNonIdentityDefaultTransition: true,
    });
  });

  it("помечает reactions.TICK через hasReaction", () => {
    const { planFor } = compileActor(
      {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { TICK: "READY" },
      },
      { reactions: { TICK: () => undefined } },
    );

    expect(planFor("TICK")).toMatchObject({
      hasReaction: true,
      allDefaultTransitionsIdentity: true,
    });
  });

  it("помечает transition в terminal state", () => {
    const { planFor } = compileActor({
      __INIT: { ENTITY_SPAWNED: "READY" },
      READY: { FINISH: "__RESOLVED" },
    });

    expect(planFor("FINISH")).toMatchObject({
      acceptStateCodes: [0],
      mayEnterTerminalState: true,
      hasNonIdentityDefaultTransition: true,
    });
  });

  it("строит reduce plan для ENTITY_SPAWNED и ENTITY_DESPAWNED", () => {
    const { planFor } = compileActor(
      {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { ENTITY_DESPAWNED: "GONE" },
        GONE: {},
      },
      { reactions: { ENTITY_DESPAWNED: () => undefined } },
    );

    expect(planFor("ENTITY_SPAWNED")).toMatchObject({
      acceptStateCodes: [-1],
      allDefaultTransitionsIdentity: false,
      hasNonIdentityDefaultTransition: true,
      hasReaction: false,
    });
    expect(planFor("ENTITY_DESPAWNED")).toMatchObject({
      acceptStateCodes: [0],
      allDefaultTransitionsIdentity: false,
      hasNonIdentityDefaultTransition: true,
      hasReaction: true,
    });
  });
});
