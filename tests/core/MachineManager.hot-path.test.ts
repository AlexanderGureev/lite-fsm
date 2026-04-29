import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "../../src/core/MachineManager";
import type { MachineConfig } from "../../src/core/types";

describe("MachineManager — hot-path индексы", () => {
  it("не вызывает domain reducer для action без transition edge", () => {
    type Event = { type: "GO" } | { type: "SKIP" };
    const reducer = vi.fn((state, _action: Event, meta) => ({
      state: meta.nextState,
      context: { calls: state.context.calls + 1 },
    }));
    const manager = MachineManager({
      domain: {
        config: { IDLE: { GO: "ON" }, ON: {} },
        initialState: "IDLE",
        initialContext: { calls: 0 },
        reducer,
      } satisfies MachineConfig<{ IDLE: { GO: "ON" }; ON: {} }, { calls: number }, Event>,
    });

    manager.transition({ type: "SKIP" });

    expect(reducer).not.toHaveBeenCalled();
    expect(manager.getState().domain).toEqual({ state: "IDLE", context: { calls: 0 } });
  });

  it("не spawn'ит actor template без __INIT edge для action", () => {
    type Event = { type: "SPAWN" } | { type: "SKIP" };
    const reducer = vi.fn((state, _action: Event, meta) => ({ state: meta.nextState, context: state.context }));
    const manager = MachineManager({
      worker: {
        config: { __INIT: { SPAWN: "PENDING" }, PENDING: {} },
        initialState: "__INIT",
        initialContext: {},
        reducer,
      } satisfies MachineConfig<{ __INIT: { SPAWN: "PENDING" }; PENDING: {} }, {}, Event>,
    });

    manager.transition({ type: "SKIP" });

    expect(reducer).not.toHaveBeenCalled();
    expect(manager.getState().worker).toEqual({});
  });

  it("не route'ит live actors template без transition edge для action", () => {
    type Event = { type: "SPAWN" } | { type: "BUMP" } | { type: "SKIP" };
    const reducer = vi.fn((state, action: Event, meta) => ({
      state: meta.nextState,
      context: { count: action.type === "BUMP" ? state.context.count + 1 : state.context.count },
    }));
    const manager = MachineManager({
      worker: {
        config: { __INIT: { SPAWN: "PENDING" }, PENDING: { BUMP: null } },
        initialState: "__INIT",
        initialContext: { count: 0 },
        reducer,
      } satisfies MachineConfig<{ __INIT: { SPAWN: "PENDING" }; PENDING: { BUMP: null } }, { count: number }, Event>,
    });

    manager.transition({ type: "SPAWN" });
    reducer.mockClear();
    manager.transition({ type: "SKIP" });

    expect(reducer).not.toHaveBeenCalled();
    expect(manager.getState().worker["worker/0"].context.count).toBe(0);
  });

  it("учитывает wildcard source в actor reduce index", () => {
    type Event = { type: "SPAWN" } | { type: "PING" };
    const reducer = vi.fn((state, action: Event, meta) => ({
      state: meta.nextState,
      context: { pings: action.type === "PING" ? state.context.pings + 1 : state.context.pings },
    }));
    const manager = MachineManager({
      worker: {
        config: { __INIT: { SPAWN: "PENDING" }, PENDING: {}, "*": { PING: null } },
        initialState: "__INIT",
        initialContext: { pings: 0 },
        reducer,
      } satisfies MachineConfig<
        { __INIT: { SPAWN: "PENDING" }; PENDING: {}; "*": { PING: null } },
        { pings: number },
        Event
      >,
    });

    manager.transition({ type: "SPAWN" });
    reducer.mockClear();
    manager.transition({ type: "PING" });

    expect(reducer).toHaveBeenCalledOnce();
    expect(manager.getState().worker["worker/0"].context.pings).toBe(1);
  });

  it("actor в state без edge для action не reduce'ится, даже если action попал в actorReduceIndex", () => {
    type Event = { type: "SPAWN" } | { type: "JUMP" };
    const reducer = vi.fn((state, _action: Event, meta) => ({ state: meta.nextState, context: state.context }));
    const manager = MachineManager({
      worker: {
        config: { __INIT: { SPAWN: "PENDING" }, PENDING: { JUMP: "OTHER" }, OTHER: {} },
        initialState: "__INIT",
        initialContext: {},
        reducer,
      } satisfies MachineConfig<
        { __INIT: { SPAWN: "PENDING" }; PENDING: { JUMP: "OTHER" }; OTHER: {} },
        {},
        Event
      >,
    });

    manager.transition({ type: "SPAWN" });
    manager.transition({ type: "JUMP", meta: { actorId: "worker/0" } });
    expect(manager.getState().worker["worker/0"].state).toBe("OTHER");

    reducer.mockClear();
    manager.transition({ type: "JUMP" });

    expect(reducer).not.toHaveBeenCalled();
    expect(manager.getState().worker["worker/0"].state).toBe("OTHER");
  });

  it("group scope с groupTag без INIT edge для action не spawn'ит template", () => {
    type Event = { type: "ALPHA_INIT" } | { type: "BETA_INIT" };
    type AlphaConfig = { __INIT: { ALPHA_INIT: "PENDING" }; PENDING: {} };
    type BetaConfig = { __INIT: { BETA_INIT: "PENDING" }; PENDING: {} };
    const manager = MachineManager({
      alpha: {
        config: { __INIT: { ALPHA_INIT: "PENDING" }, PENDING: {} },
        initialState: "__INIT",
        initialContext: {},
      } satisfies MachineConfig<AlphaConfig, {}, Event>,
      beta: {
        config: { __INIT: { BETA_INIT: "PENDING" }, PENDING: {} },
        initialState: "__INIT",
        initialContext: {},
      } satisfies MachineConfig<BetaConfig, {}, Event>,
    });

    manager.transition({ type: "ALPHA_INIT" });
    // alpha-группа alpha/0 существует. BETA_INIT попадает в actorSpawnIndex,
    // но только для groupTag "beta" — для alpha groupTag fallback `?? []`.
    manager.transition({ type: "BETA_INIT", meta: { groupId: "alpha/0" } });

    expect(Object.keys(manager.getState().alpha)).toEqual(["alpha/0"]);
    expect(manager.getState().beta).toEqual({});
  });
});
