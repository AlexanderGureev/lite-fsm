import { describe, expect, it } from "vitest";

import { createEffect, MachineManager } from "@lite-fsm/core";
import { LiteFsmError } from "@lite-fsm/core/internal/utils";
import type { MachineConfig } from "@lite-fsm/core";

import {
  createLikeSync,
  createReplacingMiddleware,
  type LikeConfig,
  type LikeEvent,
} from "./MachineManager.actors.fixtures";

describe("MachineManager actors — condition + очистка bag", () => {
  it("condition resolve работает per-owner и rejects при terminal collapse", async () => {
    const resolved: Array<Promise<boolean>> = [];
    const rejected: Array<Promise<boolean>> = [];
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ action, condition }) => {
          const promise = condition((next) => next.type === "BUMP");
          if (action.payload.id === "resolve") resolved.push(promise);
          else rejected.push(promise);
        },
      },
    };
    const manager = MachineManager({ likeSync: actorMachine });

    manager.transition({ type: "LIKE", payload: { id: "resolve" } });
    manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
    await expect(resolved[0]).resolves.toBe(true);

    manager.transition({ type: "LIKE", payload: { id: "reject" } });
    manager.transition({ type: "OK", meta: { actorId: "likeSync/1" } });
    await expect(rejected[0]).rejects.toThrow(LiteFsmError);
    await expect(rejected[0]).rejects.toMatchObject({ code: "LITE_FSM_ACTOR_DISPOSED" });
  });

  it("несколько pending condition одного actor reject'ятся при dispose с LITE_FSM_ACTOR_DISPOSED", async () => {
    const pending: Array<Promise<boolean>> = [];
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ condition }) => {
          pending.push(condition((next) => next.type === "DOMAIN"));
          pending.push(condition((next) => next.type === "PING"));
        },
      },
    };
    const manager = MachineManager({ likeSync: actorMachine });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });

    await expect(Promise.all(pending)).rejects.toMatchObject({ code: "LITE_FSM_ACTOR_DISPOSED" });
    await expect(pending[0]).rejects.toMatchObject({ code: "LITE_FSM_ACTOR_DISPOSED" });
    await expect(pending[1]).rejects.toMatchObject({ code: "LITE_FSM_ACTOR_DISPOSED" });
  });

  it("dispose одного actor не reject'ит pending condition другого actor в той же группе", async () => {
    const pending = new Map<string, Promise<boolean>>();
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ condition, self }) => {
          pending.set(
            self.actorId,
            condition((next) => next.type === "BUMP" && next.meta?.actorId === self.actorId),
          );
        },
      },
    };
    const manager = MachineManager({ likeSync: actorMachine });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "LIKE", payload: { id: "b" }, meta: { groupId: "likeSync/0" } });
    manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });

    await expect(pending.get("likeSync/0")).rejects.toMatchObject({ code: "LITE_FSM_ACTOR_DISPOSED" });
    manager.transition({ type: "BUMP", meta: { actorId: "likeSync/1" } });
    await expect(pending.get("likeSync/1")).resolves.toBe(true);
  });

  it("late event после dispose не resolve'ит старый condition", async () => {
    const pending: Array<Promise<boolean>> = [];
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ condition }) => {
          pending.push(condition((next) => next.type === "BUMP"));
        },
      },
    };
    const manager = MachineManager({ likeSync: actorMachine });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
    manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });

    await expect(pending[0]).rejects.toMatchObject({ code: "LITE_FSM_ACTOR_DISPOSED" });
  });

  it("condition отписывается после resolve и reject", async () => {
    const calls: string[] = [];
    const resolved: Array<Promise<boolean>> = [];
    const rejected: Array<Promise<boolean>> = [];
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ action, condition, self }) => {
          if (action.payload.id === "resolve") {
            resolved.push(
              condition((next) => {
                calls.push(`resolve:${next.type}`);
                return next.type === "BUMP" && next.meta?.actorId === self.actorId;
              }),
            );
            return;
          }

          rejected.push(
            condition((next) => {
              calls.push(`reject:${next.type}`);
              throw new Error(`predicate failed on ${next.type}`);
            }),
          );
        },
      },
    };
    const manager = MachineManager({ likeSync: actorMachine });

    manager.transition({ type: "LIKE", payload: { id: "resolve" } });
    manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
    await expect(resolved[0]).resolves.toBe(true);
    manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
    manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });

    manager.transition({ type: "LIKE", payload: { id: "reject" } });
    manager.transition({ type: "BUMP", meta: { actorId: "likeSync/1" } });
    await expect(rejected[0]).rejects.toThrow("predicate failed on BUMP");
    manager.transition({ type: "BUMP", meta: { actorId: "likeSync/1" } });
    manager.transition({ type: "OK", meta: { actorId: "likeSync/1" } });

    expect(calls).toEqual(["resolve:BUMP", "reject:BUMP"]);
  });

  it("dispose-wins при reentrant transition в subscriber до и внутри predicate", async () => {
    const beforePredicate: Array<Promise<boolean>> = [];
    const afterPredicate: Array<Promise<boolean>> = [];
    let manager!: ReturnType<typeof MachineManager<{ likeSync: ReturnType<typeof createLikeSync> }, LikeEvent>>;
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ action, condition, self }) => {
          if (action.payload.id === "before") {
            beforePredicate.push(condition((next) => next.type === "BUMP" && next.meta?.actorId === self.actorId));
          } else {
            afterPredicate.push(
              condition((next) => {
                if (next.type !== "BUMP" || next.meta?.actorId !== self.actorId) return false;
                manager.transition({ type: "OK", meta: { actorId: self.actorId } });
                return true;
              }),
            );
          }
        },
      },
    };
    manager = MachineManager({ likeSync: actorMachine });
    manager.onTransition((_prev, _current, action) => {
      if (action.type === "BUMP" && action.meta?.actorId === "likeSync/0") {
        manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
      }
    });

    manager.transition({ type: "LIKE", payload: { id: "before" } });
    manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
    await expect(beforePredicate[0]).rejects.toThrow(LiteFsmError);

    manager.transition({ type: "LIKE", payload: { id: "after" } });
    manager.transition({ type: "BUMP", meta: { actorId: "likeSync/1" } });
    await expect(afterPredicate[0]).rejects.toThrow(LiteFsmError);
  });

  it("replacement reconcile cleanup делает pending condition reject", async () => {
    const pending: Array<Promise<boolean>> = [];
    const removeOnBump = createReplacingMiddleware("BUMP", (next) => ({ ...next, likeSync: {} }));
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ condition }) => {
          pending.push(condition((next) => next.type === "DOMAIN"));
        },
      },
    };
    const manager = MachineManager({ likeSync: actorMachine }, { middleware: [removeOnBump] });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
    removeOnBump.replace();

    expect(manager.getState().likeSync).toEqual({});
    await expect(pending[0]).rejects.toThrow(LiteFsmError);
  });

  it("immediate dispose в same effect делает condition reject", async () => {
    const rejected: Array<Promise<boolean>> = [];
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        PENDING: ({ condition, self, transition }) => {
          transition.actor(self.actorId, { type: "OK" });
          rejected.push(condition(() => true));
        },
      },
    };
    MachineManager({ likeSync: actorMachine }).transition({ type: "LIKE", payload: { id: "a" } });

    await expect(rejected[0]).rejects.toThrow(LiteFsmError);
  });

  it("createEffect latest очищает owner state после удаления actor", async () => {
    const gates = new Map<string, () => void>();
    const waitForGate = (key: string) =>
      new Promise<void>((resolve) => {
        gates.set(key, resolve);
      });
    const release = (key: string) => {
      gates.get(key)?.();
      gates.delete(key);
    };
    const actorMachine: ReturnType<typeof createLikeSync> = {
      ...createLikeSync(),
      effects: {
        "*": createEffect<LikeEvent, {}, LikeConfig, "*">({
          type: "latest",
          effect: async ({ action, self, transition }) => {
            if (action.type !== "LIKE") return;
            await waitForGate(self.actorId);
            transition.actor(self.actorId, { type: "BUMP" });
          },
        }),
      },
    };
    const manager = MachineManager({ likeSync: actorMachine });

    manager.transition({ type: "LIKE", payload: { id: "old" } });
    manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
    manager.transition({ type: "LIKE", payload: { id: "new" } });
    release("likeSync/0");
    await Promise.resolve();
    release("likeSync/1");

    await vi.waitFor(() => expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2));
    expect(manager.getState().likeSync["likeSync/0"]).toBeUndefined();
  });

  it("cancelFn у createEffect изолирован per actor instance", async () => {
    type Config = {
      __INIT: { LIKE: "PENDING" };
      PENDING: { BUMP: null; OK: "__RESOLVED"; PING: null };
      "*": { CANCEL: "__CANCELLED" };
    };
    const gates = new Map<string, () => void>();
    const waitForGate = (key: string) =>
      new Promise<void>((resolve) => {
        gates.set(key, resolve);
      });
    const release = (key: string) => {
      gates.get(key)?.();
      gates.delete(key);
    };
    const actorMachine = {
      config: {
        __INIT: { LIKE: "PENDING" },
        PENDING: { BUMP: null, OK: "__RESOLVED", PING: null },
        "*": { CANCEL: "__CANCELLED" },
      },
      initialState: "__INIT",
      initialContext: { id: "", count: 0 },
      reducer: (state, action, meta) => {
        if (action.type === "LIKE") return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
        if (action.type === "BUMP") {
          return { state: meta.nextState, context: { ...state.context, count: state.context.count + 1 } };
        }
        return { state: meta.nextState, context: state.context };
      },
      effects: {
        "*": createEffect<LikeEvent, {}, Config, "*">({
          effect: async ({ action, self, transition }) => {
            if (action.type !== "LIKE") return;
            await waitForGate(self.actorId);
            transition.actor(self.actorId, { type: "BUMP" });
          },
          cancelFn:
            ({ action }) =>
            () =>
              action.type === "PING",
        }),
      },
    } satisfies MachineConfig<Config, { id: string; count: number }, LikeEvent>;
    const manager = MachineManager({ likeSync: actorMachine });

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "LIKE", payload: { id: "b" } });
    manager.transition({ type: "PING", meta: { actorId: "likeSync/0" } });
    release("likeSync/0");
    release("likeSync/1");

    await vi.waitFor(() => expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2));
    expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(1);
  });
});
