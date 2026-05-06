import { describe, expect, it } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { MachineConfig } from "@lite-fsm/core";

describe("MachineManager actors — характерные сценарии", () => {
  it("likes scenario: unscoped LIKE создаёт actor, domain видит LIKE, actor resolve/reject обновляет domain", () => {
    type Event =
      | { type: "LIKE"; payload: { id: string; fail?: boolean } }
      | { type: "LIKE_OK"; payload: { id: string } }
      | { type: "LIKE_ERR"; payload: { id: string } }
      | { type: "OK" }
      | { type: "FAIL" };
    type LikeActorConfig = { __INIT: { LIKE: "PENDING" }; PENDING: { OK: "__RESOLVED"; FAIL: "__REJECTED" } };

    const likes = {
      config: { IDLE: { LIKE: null, LIKE_OK: null, LIKE_ERR: null } },
      initialState: "IDLE",
      initialContext: { liked: [] as string[], resolved: [] as string[], rejected: [] as string[] },
      reducer: (state, action) => {
        if (action.type === "LIKE") {
          return { state: state.state, context: { ...state.context, liked: [...state.context.liked, action.payload.id] } };
        }
        if (action.type === "LIKE_OK") {
          return {
            state: state.state,
            context: { ...state.context, resolved: [...state.context.resolved, action.payload.id] },
          };
        }
        if (action.type === "LIKE_ERR") {
          return {
            state: state.state,
            context: { ...state.context, rejected: [...state.context.rejected, action.payload.id] },
          };
        }
      },
    } satisfies MachineConfig<
      { IDLE: { LIKE: null; LIKE_OK: null; LIKE_ERR: null } },
      { liked: string[]; resolved: string[]; rejected: string[] },
      Event
    >;

    const likeSync = {
      config: { __INIT: { LIKE: "PENDING" }, PENDING: { OK: "__RESOLVED", FAIL: "__REJECTED" } },
      initialState: "__INIT",
      initialContext: { id: "" },
      reducer: (state, action, meta) => ({
        state: meta.nextState,
        context: { id: action.type === "LIKE" ? action.payload.id : state.context.id },
      }),
      effects: {
        PENDING: ({ action, self, transition }) => {
          if (action.type !== "LIKE") return;
          transition.unscoped({
            type: action.payload.fail ? "LIKE_ERR" : "LIKE_OK",
            payload: { id: action.payload.id },
          });
          transition.actor(self.actorId, { type: action.payload.fail ? "FAIL" : "OK" });
        },
      },
    } satisfies MachineConfig<LikeActorConfig, { id: string }, Event>;
    const manager = MachineManager({ likes, likeSync });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "LIKE", payload: { id: "b", fail: true } });

    expect(manager.getState().likes.context).toEqual({
      liked: ["a", "b"],
      resolved: ["a"],
      rejected: ["b"],
    });
    expect(manager.getState().likeSync).toEqual({});
  });

  it("game tag-scoped scenario доставляет target tags и spawn'ит только в существующих groups", () => {
    type Event = { type: "PULSE" };
    type Config = { __INIT: { PULSE: "ACTIVE" }; ACTIVE: { PULSE: null } };
    type Context = { kind: string; pulses: number };
    const createTemplate = (kind: string, groupTag: string) =>
      ({
        config: { __INIT: { PULSE: "ACTIVE" }, ACTIVE: { PULSE: null } },
        groupTag,
        initialState: "__INIT",
        initialContext: { kind, pulses: 0 },
        reducer: (state, action, meta) => ({
          state: meta.nextState,
          context: { kind, pulses: state.state === "__INIT" && action.type === "PULSE" ? 1 : state.context.pulses + 1 },
        }),
      }) satisfies MachineConfig<Config, Context, Event>;
    const manager = MachineManager({
      enemy: createTemplate("enemy", "enemy"),
      turret: createTemplate("turret", "turret"),
      npc: createTemplate("npc", "npc"),
    });

    manager.transition({ type: "PULSE" });
    manager.transition({ type: "PULSE", meta: { groupTag: ["enemy", "turret", "missing"] } });

    expect(Object.keys(manager.getState().enemy)).toEqual(["enemy/0", "enemy/3"]);
    expect(Object.keys(manager.getState().turret)).toEqual(["turret/1", "turret/4"]);
    expect(Object.keys(manager.getState().npc)).toEqual(["npc/2"]);
    expect(manager.getState().enemy["enemy/0"].context.pulses).toBe(2);
    expect(manager.getState().enemy["enemy/3"].context.pulses).toBe(1);
    expect(manager.getState().turret["turret/1"].context.pulses).toBe(2);
    expect(manager.getState().turret["turret/4"].context.pulses).toBe(1);
    expect(manager.getState().npc["npc/2"].context.pulses).toBe(1);
  });
});
