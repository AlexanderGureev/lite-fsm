import { describe, expect, it, vi } from "vitest";

import { createEffect, MachineManager } from "../../src/core";
import { LiteFsmError } from "../../src/core/utils";
import type { MachineConfig, Middleware } from "../../src/core/types";

import {
  createLikeSync,
  createReplacingMiddleware,
  type LikeConfig,
  type LikeEvent,
} from "./MachineManager.actors.fixtures";

describe("MachineManager actors — lifecycle (effects + condition + гидратация)", () => {
  describe("actor effects + sugar для transition", () => {
    it("self содержит actorId/groupId/groupTag и transition sugar маршрутизирует", () => {
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: createEffect<LikeEvent, {}, LikeConfig, "PENDING">({
            effect: ({ self, transition }) => {
              transition.actor(self.actorId, { type: "BUMP" });
              transition.group(self.groupId, { type: "BUMP" });
              transition.tag(self.groupTag, { type: "BUMP" });
            },
          }),
        },
      };
      const manager = MachineManager({ likeSync: actorMachine });

      manager.transition({ type: "LIKE", payload: { id: "a" } });

      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(4);
    });

    it("transition.unscoped() из actor effect не получает default group routing", () => {
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ transition }) => {
            transition.unscoped({ type: "PING" });
          },
        },
      };
      const manager = MachineManager({
        domain: {
          config: { IDLE: { PING: null } },
          initialState: "IDLE",
          initialContext: { pings: 0 },
          reducer: (state, action) => {
            if (action.type === "PING") return { state: state.state, context: { pings: state.context.pings + 1 } };
          },
        } satisfies MachineConfig<{ IDLE: { PING: null } }, { pings: number }, LikeEvent>,
        likeSync: actorMachine,
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });

      expect(manager.getState().domain.context.pings).toBe(1);
      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(1);
    });

    it("transition() из actor effect по умолчанию маршрутизируется в группу sender", () => {
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ action, transition }) => {
            if (action.type === "LIKE" && action.payload.id === "source") {
              transition({ type: "LIKE", payload: { id: "child" } });
            }
          },
        },
      };
      const manager = MachineManager({ likeSync: actorMachine });

      manager.transition({ type: "LIKE", payload: { id: "source" } });
      manager.transition({ type: "BUMP", meta: { groupId: "likeSync/0" } });

      expect(
        Object.values(manager.getState().likeSync)
          .map((slice) => slice.context.id)
          .sort(),
      ).toEqual(["child", "source"]);
      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2);
    });

    it("actor-dispatched transition variants сохраняют exact target и добавляют фактический sender", () => {
      const committed: LikeEvent[] = [];
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ action, self, transition }) => {
            if (action.type !== "LIKE") return;
            if (action.payload.id === "default") transition({ type: "BUMP" });
            if (action.payload.id === "unscoped") transition.unscoped({ type: "BUMP" });
            if (action.payload.id === "actor") transition.actor([self.actorId], { type: "BUMP" });
            if (action.payload.id === "group") transition.group([self.groupId], { type: "BUMP" });
            if (action.payload.id === "tag") transition.tag([self.groupTag], { type: "BUMP" });
            if (action.payload.id === "manual-actor") transition({ type: "BUMP", meta: { actorId: self.actorId } });
            if (action.payload.id === "manual-group") transition({ type: "BUMP", meta: { groupId: self.groupId } });
            if (action.payload.id === "manual-tag") transition({ type: "BUMP", meta: { groupTag: self.groupTag } });
            if (action.payload.id === "spoof") {
              transition({
                type: "BUMP",
                meta: { senderActorId: "fake", senderGroupId: "fake", senderGroupTag: "fake" },
              });
            }
          },
        },
      };
      const manager = MachineManager({ likeSync: actorMachine });
      manager.onTransition((_prev, _current, action) => {
        if (action.type === "BUMP") committed.push(action);
      });

      for (const id of [
        "default",
        "unscoped",
        "actor",
        "group",
        "tag",
        "manual-actor",
        "manual-group",
        "manual-tag",
        "spoof",
      ]) {
        manager.transition({ type: "LIKE", payload: { id } });
      }

      expect(committed).toEqual([
        {
          type: "BUMP",
          meta: {
            groupId: "likeSync/0",
            groupTag: "likeSync",
            senderActorId: "likeSync/0",
            senderGroupId: "likeSync/0",
            senderGroupTag: "likeSync",
          },
        },
        {
          type: "BUMP",
          meta: { senderActorId: "likeSync/1", senderGroupId: "likeSync/1", senderGroupTag: "likeSync" },
        },
        {
          type: "BUMP",
          meta: {
            actorId: ["likeSync/2"],
            senderActorId: "likeSync/2",
            senderGroupId: "likeSync/2",
            senderGroupTag: "likeSync",
          },
        },
        {
          type: "BUMP",
          meta: {
            groupId: ["likeSync/3"],
            senderActorId: "likeSync/3",
            senderGroupId: "likeSync/3",
            senderGroupTag: "likeSync",
          },
        },
        {
          type: "BUMP",
          meta: {
            groupTag: ["likeSync"],
            senderActorId: "likeSync/4",
            senderGroupId: "likeSync/4",
            senderGroupTag: "likeSync",
          },
        },
        {
          type: "BUMP",
          meta: {
            actorId: "likeSync/5",
            senderActorId: "likeSync/5",
            senderGroupId: "likeSync/5",
            senderGroupTag: "likeSync",
          },
        },
        {
          type: "BUMP",
          meta: {
            groupId: "likeSync/6",
            senderActorId: "likeSync/6",
            senderGroupId: "likeSync/6",
            senderGroupTag: "likeSync",
          },
        },
        {
          type: "BUMP",
          meta: {
            groupTag: "likeSync",
            senderActorId: "likeSync/7",
            senderGroupId: "likeSync/7",
            senderGroupTag: "likeSync",
          },
        },
        {
          type: "BUMP",
          meta: {
            groupId: "likeSync/8",
            groupTag: "likeSync",
            senderActorId: "likeSync/8",
            senderGroupId: "likeSync/8",
            senderGroupTag: "likeSync",
          },
        },
      ]);
    });

    it("actor из группы A адресно отправляет actor'у из группы B, sender остаётся только в meta", () => {
      type Event = LikeEvent | { type: "DAMAGE"; payload: { targetActorId: string } } | { type: "HIT" };
      type Config = {
        __INIT: { LIKE: "PENDING" };
        PENDING: { BUMP: null; OK: "__RESOLVED"; DAMAGE: null; HIT: null };
        "*": { CANCEL: "__CANCELLED" };
      };
      const seen: Array<{ self: string; sender: string | undefined }> = [];
      const actorMachine = {
        config: {
          __INIT: { LIKE: "PENDING" },
          PENDING: { BUMP: null, OK: "__RESOLVED", DAMAGE: null, HIT: null },
          "*": { CANCEL: "__CANCELLED" },
        },
        initialState: "__INIT",
        initialContext: { id: "", count: 0 },
        reducer: (state, action, meta) => {
          if (action.type === "LIKE") return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
          if (action.type === "HIT") {
            return { state: meta.nextState, context: { ...state.context, count: state.context.count + 10 } };
          }
          return { state: meta.nextState, context: state.context };
        },
        effects: {
          "*": ({ action, self, transition }) => {
            if (action.type === "DAMAGE") transition.actor(action.payload.targetActorId, { type: "HIT" });
            if (action.type === "HIT") seen.push({ self: self.actorId, sender: action.meta?.senderActorId });
          },
        },
      } satisfies MachineConfig<Config, { id: string; count: number }, Event>;
      const manager = MachineManager({ likeSync: actorMachine });

      manager.transition({ type: "LIKE", payload: { id: "source" } });
      manager.transition({ type: "LIKE", payload: { id: "target" } });
      manager.transition({ type: "DAMAGE", payload: { targetActorId: "likeSync/1" }, meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(11);
      expect(seen).toEqual([{ self: "likeSync/1", sender: "likeSync/0" }]);
    });

    it("late transition от disposed actor — full no-op для domain и actor", () => {
      let savedTransition: ((action: LikeEvent) => LikeEvent) | undefined;
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: { PENDING: ({ transition }) => void (savedTransition = transition) },
      };
      const manager = MachineManager({
        domain: {
          config: { IDLE: { BUMP: null } },
          initialState: "IDLE",
          initialContext: { bumps: 0 },
          reducer: (state, action) => {
            if (action.type === "BUMP") return { state: state.state, context: { bumps: state.context.bumps + 1 } };
          },
        } satisfies MachineConfig<{ IDLE: { BUMP: null } }, { bumps: number }, LikeEvent>,
        likeSync: actorMachine,
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
      savedTransition?.({ type: "BUMP" });

      expect(manager.getState().domain.context.bumps).toBe(0);
    });

    it("actor-dispatched action становится no-op, если middleware удалил sender до next", () => {
      const disposeBeforeNext: Middleware<any, LikeEvent> = (api) => (next) => (action) => {
        if (action.type === "BUMP" && action.meta?.senderActorId) {
          api.transition({ type: "OK", meta: { actorId: action.meta.senderActorId } });
        }
        return next(action);
      };
      const domainMachine: MachineConfig<{ IDLE: { BUMP: null } }, { bumps: number }, LikeEvent> = {
        config: { IDLE: { BUMP: null } },
        initialState: "IDLE",
        initialContext: { bumps: 0 },
        reducer: (state, action) => {
          if (action.type === "BUMP") state.context.bumps += 1;
        },
      };
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ transition }) => {
            transition({ type: "BUMP" });
          },
        },
      };
      const manager = MachineManager(
        { domain: domainMachine, likeSync: actorMachine },
        { middleware: [disposeBeforeNext] },
      );

      manager.transition({ type: "LIKE", payload: { id: "a" } });

      expect(manager.getState().likeSync).toEqual({});
      expect(manager.getState().domain.context.bumps).toBe(0);
    });

    it("ошибки actor effect сообщаются через onError", async () => {
      const onError = vi.fn();
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: () => {
            throw new Error("boom");
          },
        },
      };

      MachineManager({ likeSync: actorMachine }, { onError }).transition({ type: "LIKE", payload: { id: "a" } });

      await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)));
    });

    it("actor effect error не переводит actor в terminal автоматически", async () => {
      const onError = vi.fn();
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: () => {
            throw new Error("boom");
          },
        },
      };
      const manager = MachineManager({ likeSync: actorMachine }, { onError });

      manager.transition({ type: "LIKE", payload: { id: "a" } });

      await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
      expect(manager.getState().likeSync["likeSync/0"].state).toBe("PENDING");
    });

    it("terminal transition схлопывает actor без запуска actor effects", () => {
      const calls: LikeEvent["type"][] = [];
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ action }) => {
            calls.push(action.type);
          },
          "*": ({ action }) => {
            calls.push(action.type);
          },
        },
      };
      const manager = MachineManager({ likeSync: actorMachine });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync).toEqual({});
      expect(calls).toEqual(["LIKE"]);
    });

    it("subscriber видит actor record уже после terminal collapse", () => {
      const snapshots: Array<Record<string, unknown>> = [];
      const manager = MachineManager({ likeSync: createLikeSync() });
      manager.onTransition((_prev, current, action) => {
        if (action.type === "OK") snapshots.push(current.likeSync);
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });

      expect(snapshots).toEqual([{}]);
      expect(snapshots[0]).toBe(manager.getState().likeSync);
    });

    it("actor wildcard effect не запускается на unrelated event без actor transition", () => {
      const calls: LikeEvent["type"][] = [];
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          "*": ({ action }) => {
            calls.push(action.type);
          },
        },
      };
      const manager = MachineManager({
        domain: { config: { IDLE: { DOMAIN: null } }, initialState: "IDLE", initialContext: {} },
        likeSync: actorMachine,
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "DOMAIN" });

      expect(calls).toEqual(["LIKE"]);
    });

    it("не запускает actor effect, если subscriber reentrant удалил actor до phase 12", () => {
      const calls: LikeEvent["type"][] = [];
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ action }) => {
            calls.push(action.type);
          },
        },
      };
      const manager = MachineManager({ likeSync: actorMachine });
      manager.onTransition((_prev, _current, action) => {
        if (action.type === "LIKE") {
          manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
        }
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });

      expect(manager.getState().likeSync).toEqual({});
      expect(calls).toEqual([]);
    });

    it("reentrant dispatch из actor effect не перетирает effectsTargets родительского dispatch", () => {
      const calls: string[] = [];
      const alpha: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ action, transition }) => {
            calls.push(`alpha:${action.type}`);
            if (action.type === "LIKE") transition.unscoped({ type: "DOMAIN" });
          },
        },
      };
      const beta: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        groupTag: "likeSync",
        effects: {
          PENDING: ({ action }) => {
            calls.push(`beta:${action.type}`);
          },
        },
      };
      const manager = MachineManager({
        domain: { config: { IDLE: { DOMAIN: null } }, initialState: "IDLE", initialContext: {} },
        alpha,
        beta,
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });

      expect(calls).toEqual(["alpha:LIKE", "beta:LIKE"]);
    });

    it("actor reduce и effects идут по Object.keys(config) и spawn order внутри template", () => {
      type Event = { type: "SPAWN" } | { type: "TICK" };
      type Config = { __INIT: { SPAWN: "ACTIVE" }; ACTIVE: { SPAWN: null; TICK: null } };
      type Context = { label: string; ticks: number };
      const reduceOrder: string[] = [];
      const effectOrder: string[] = [];
      const createTemplate = (label: string) =>
        ({
          config: { __INIT: { SPAWN: "ACTIVE" }, ACTIVE: { SPAWN: null, TICK: null } },
          groupTag: "unit",
          initialState: "__INIT",
          initialContext: { label, ticks: 0 },
          reducer: (state, action, meta) => {
            if (action.type === "TICK") reduceOrder.push(`${label}:${state.context.ticks}`);
            return {
              state: meta.nextState,
              context: { label, ticks: action.type === "TICK" ? state.context.ticks + 1 : state.context.ticks },
            };
          },
          effects: {
            "*": ({ action, self }) => {
              if (action.type === "TICK") effectOrder.push(`${label}:${self.actorId}`);
            },
          },
        }) satisfies MachineConfig<Config, Context, Event>;
      const manager = MachineManager({
        alpha: createTemplate("alpha"),
        beta: createTemplate("beta"),
      });

      manager.transition({ type: "SPAWN" });
      manager.transition({ type: "SPAWN", meta: { groupId: "unit/0" } });
      reduceOrder.length = 0;
      effectOrder.length = 0;

      manager.transition({ type: "TICK", meta: { groupId: "unit/0" } });

      expect(reduceOrder).toEqual(["alpha:0", "alpha:0", "beta:0", "beta:0"]);
      expect(effectOrder).toEqual(["alpha:alpha/0", "alpha:alpha/2", "beta:beta/1", "beta:beta/3"]);
    });

    it("createEffect latest подавляет устаревший actor transition sugar для каждого owner", async () => {
      type LatestConfig = {
        __INIT: { LIKE: "PENDING" };
        PENDING: { BUMP: null; PING: null; OK: "__RESOLVED" };
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
          PENDING: { BUMP: null, PING: null, OK: "__RESOLVED" },
          "*": { CANCEL: "__CANCELLED" },
        },
        initialState: "__INIT",
        initialContext: { id: "", count: 0 },
        reducer: (state, action, meta) => {
          if (action.type === "LIKE") {
            return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
          }
          if (action.type === "BUMP") {
            return { state: "PENDING", context: { ...state.context, count: state.context.count + 1 } };
          }
          return { state: meta.nextState, context: state.context };
        },
        effects: {
          "*": createEffect<LikeEvent, {}, LatestConfig, "*">({
            type: "latest",
            effect: async ({ action, self, transition }) => {
              if (action.type !== "LIKE" && action.type !== "PING") return;
              await waitForGate(`${self.actorId}:${action.type}`);
              if (action.type === "PING") {
                transition.actor(self.actorId, { type: "BUMP" });
                return;
              }
              transition.group(self.groupId, { type: "BUMP" });
              transition.unscoped({ type: "DOMAIN" });
              transition.tag(self.groupTag, { type: "DOMAIN" });
            },
          }),
        },
      } satisfies MachineConfig<LatestConfig, { id: string; count: number }, LikeEvent>;
      const manager = MachineManager({ likeSync: actorMachine });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" } });
      manager.transition({ type: "PING", meta: { actorId: "likeSync/0" } });

      release("likeSync/1:LIKE");
      await vi.waitFor(() => expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2));

      release("likeSync/0:PING");
      await vi.waitFor(() => expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2));

      release("likeSync/0:LIKE");
      await Promise.resolve();
      await Promise.resolve();

      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2);
    });
  });

  describe("owner state у domain createEffect", () => {
    type DomainEvent = { type: "START"; payload: { id: string } } | { type: "DONE" } | { type: "CANCEL" };
    type DomainConfig = { IDLE: { START: "RUNNING" }; RUNNING: { START: null; DONE: null; CANCEL: null } };
    type DomainContext = { done: number };

    const createGate = () => {
      const gates = new Map<string, () => void>();
      return {
        wait: (key: string) =>
          new Promise<void>((resolve) => {
            gates.set(key, resolve);
          }),
        release: (key: string) => {
          gates.get(key)?.();
          gates.delete(key);
        },
      };
    };

    const createDomain = (
      effects: MachineConfig<DomainConfig, DomainContext, DomainEvent>["effects"],
    ): MachineConfig<DomainConfig, DomainContext, DomainEvent> => ({
      config: { IDLE: { START: "RUNNING" }, RUNNING: { START: null, DONE: null, CANCEL: null } },
      initialState: "IDLE",
      initialContext: { done: 0 },
      reducer: (state, action, meta) => ({
        state: meta.nextState,
        context: { done: state.context.done + (action.type === "DONE" ? 1 : 0) },
      }),
      effects,
    });

    it("latest использует общую domain owner ячейку в MachineManager", async () => {
      const gate = createGate();
      const domain = createDomain({
        "*": createEffect<DomainEvent, {}, DomainConfig, "*">({
          type: "latest",
          effect: async ({ action, transition }) => {
            if (action.type !== "START") return;
            await gate.wait(action.payload.id);
            transition({ type: "DONE" });
          },
        }),
      });
      const manager = MachineManager({ domain });

      manager.transition({ type: "START", payload: { id: "first" } });
      manager.transition({ type: "START", payload: { id: "second" } });
      gate.release("first");
      await Promise.resolve();
      await Promise.resolve();
      expect(manager.getState().domain.context.done).toBe(0);

      gate.release("second");
      await vi.waitFor(() => expect(manager.getState().domain.context.done).toBe(1));
    });

    it("cancelFn для domain machine работает как общая ячейка MachineManager owner'а", async () => {
      const gate = createGate();
      const domain = createDomain({
        "*": createEffect<DomainEvent, {}, DomainConfig, "*">({
          effect: async ({ action, transition }) => {
            if (action.type !== "START") return;
            await gate.wait(action.payload.id);
            transition({ type: "DONE" });
          },
          cancelFn:
            ({ action }) =>
            () =>
              action.type === "CANCEL",
        }),
      });
      const manager = MachineManager({ domain });

      manager.transition({ type: "START", payload: { id: "job" } });
      manager.transition({ type: "CANCEL" });
      gate.release("job");
      await Promise.resolve();
      await Promise.resolve();

      expect(manager.getState().domain.context.done).toBe(0);
    });
  });

  describe("actor condition + очистка bag", () => {
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

  describe("hydration: skip-by-design", () => {
    it("dehydrate() пропускает actor templates", () => {
      const manager = MachineManager({
        domain: { config: { IDLE: {} }, initialState: "IDLE", initialContext: { ok: true } },
        likeSync: createLikeSync(),
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });

      expect(manager.dehydrate()).toEqual({
        schemaVersion: undefined,
        machines: { domain: { state: "IDLE", context: { ok: true } } },
      });
    });

    it("dehydrate({ machines: [actorKey] }) бросает LITE_FSM_INVALID_HYDRATION_ENVELOPE", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });
      expect(() => manager.dehydrate({ machines: ["likeSync"] as never })).toThrow(LiteFsmError);
    });

    it("hydrate() пропускает actor template ключи с DEV warning", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.hydrate({ machines: { likeSync: { hacked: { state: "PENDING", context: {} } } } } as never);

      expect(manager.getState().likeSync["likeSync/0"].context.id).toBe("a");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("actor template 'likeSync' was skipped"));
      warn.mockRestore();
    });

    it("opts.snapshot пропускает actor template keys и применяет domain keys", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const domain = {
        config: { IDLE: {} },
        initialState: "IDLE",
        initialContext: { value: 0 },
      } satisfies MachineConfig<{ IDLE: {} }, { value: number }, LikeEvent>;

      const manager = MachineManager(
        { domain, likeSync: createLikeSync() },
        {
          snapshot: {
            machines: {
              domain: { state: "IDLE", context: { value: 42 } },
              likeSync: { ghost: { state: "PENDING", context: { id: "ghost", count: 1 } } },
            },
          } as never,
        },
      );

      expect(manager.getState().domain.context.value).toBe(42);
      expect(manager.getState().likeSync).toEqual({});
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("actor template 'likeSync' was skipped"));
      warn.mockRestore();
    });

    it("getHydratedState сохраняет actor template record по ссылке", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      const state = manager.getState();
      const preview = manager.getHydratedState({
        machines: {
          likeSync: { ghost: { state: "PENDING", context: { id: "ghost", count: 1 } } },
        },
      } as never);

      expect(preview).toBe(state);
      expect(preview.likeSync).toBe(state.likeSync);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("actor template 'likeSync' was skipped"));
      warn.mockRestore();
    });

    it("invalid envelope shape бросает LITE_FSM_INVALID_HYDRATION_ENVELOPE", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });
      expect(() => manager.hydrate(null as never)).toThrow(LiteFsmError);
      expect(() => manager.hydrate({ machines: null } as never)).toThrow(LiteFsmError);
    });
  });
});
