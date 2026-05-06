import { describe, expect, it, vi } from "vitest";

import { MachineManager, Machine, defineMachine } from "@lite-fsm/core";
import { LiteFsmError } from "@lite-fsm/core/internal/utils";
import type { GenericMiddleware, MachineConfig } from "@lite-fsm/core";

import { createLikeSync, type LikeEvent } from "./MachineManager.actors.fixtures";

describe("MachineManager actors — маршрутизация", () => {
  describe("реестр / распознавание templates", () => {
    it("инициализирует actor template как пустой record со стабильной ссылкой между unrelated dispatch", () => {
      const manager = MachineManager({
        domain: { config: { IDLE: { DOMAIN: "IDLE" } }, initialState: "IDLE", initialContext: { n: 0 } },
        likeSync: createLikeSync(),
      });

      const empty = manager.getState().likeSync;
      expect(empty).toEqual({});

      manager.transition({ type: "DOMAIN" });

      expect(manager.getState().likeSync).toBe(empty);
    });

    it("idle → busy → idle цикл возвращает actor record к той же EMPTY-ссылке", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });
      const empty = manager.getState().likeSync;

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync).toBe(empty);
      expect(manager.getSnapshot().machines.likeSync).toBe(empty);
    });

    it("getSnapshot() с live actor включает public actor record", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });

      expect(manager.getSnapshot().machines.likeSync).toEqual({
        "likeSync/0": {
          state: "PENDING",
          context: { id: "a", count: 1 },
          meta: { actorId: "likeSync/0", groupId: "likeSync/0", groupTag: "likeSync" },
        },
      });
    });

    it("генерирует детерминированные actorId/groupId через monotonic counters", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
      manager.transition({ type: "LIKE", payload: { id: "b" } });
      manager.transition({ type: "LIKE", payload: { id: "c" }, meta: { groupId: "likeSync/1" } });

      expect(Object.keys(manager.getState().likeSync)).toEqual(["likeSync/1", "likeSync/2"]);
      manager.transition({ type: "BUMP", meta: { groupId: "likeSync/1" } });
      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2);
      expect(manager.getState().likeSync["likeSync/2"].context.count).toBe(2);
    });

    it("standalone Machine отклоняет actor template при transition", () => {
      const machine = Machine(createLikeSync());

      expect(() =>
        machine.transition({ state: "__INIT", context: { id: "", count: 0 } }, { type: "LIKE", payload: { id: "a" } }),
      ).toThrow(LiteFsmError);
    });

    it("defineMachine().create отклоняет actor template при transition", () => {
      const runtime = defineMachine<LikeEvent>().create(createLikeSync());

      expect(() => runtime.transition({ type: "LIKE", payload: { id: "a" } })).toThrow(
        expect.objectContaining({ code: "LITE_FSM_STANDALONE_ACTOR_TEMPLATE" }),
      );
    });
  });

  describe("валидация config", () => {
    it("требует initialState === '__INIT'", () => {
      expect(() => MachineManager({ bad: { ...createLikeSync(), initialState: "PENDING" } })).toThrow(LiteFsmError);
    });

    it("отклоняет hydrate hook на actor template", () => {
      expect(() => MachineManager({ bad: { ...createLikeSync(), hydrate: (prev: never) => prev } })).toThrow(
        LiteFsmError,
      );
    });

    it("отклоняет dehydrate hook на actor template", () => {
      expect(() => MachineManager({ bad: { ...createLikeSync(), dehydrate: (state: never) => state } })).toThrow(
        LiteFsmError,
      );
    });

    it("отклоняет reserved __* state в config keys", () => {
      expect(() =>
        MachineManager({ bad: { ...createLikeSync(), config: { ...createLikeSync().config, __RESOLVED: {} } } }),
      ).toThrow(LiteFsmError);
    });

    it("отклоняет null target из __INIT", () => {
      expect(() =>
        MachineManager({ bad: { ...createLikeSync(), config: { __INIT: { LIKE: null }, PENDING: {} } } }),
      ).toThrow(LiteFsmError);
    });

    it("отклоняет __INIT как transition target", () => {
      expect(() =>
        MachineManager({ bad: { ...createLikeSync(), config: { __INIT: { LIKE: "__INIT" }, PENDING: {} } } }),
      ).toThrow(LiteFsmError);
    });

    it("выводит предупреждение, когда groupTag задан на domain machine", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      MachineManager({
        domain: { config: { IDLE: {} }, initialState: "IDLE", initialContext: {}, groupTag: "ignored" },
      });

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("groupTag on domain machine"));
      warn.mockRestore();
    });
  });

  describe("spawn / reduce / terminal-схлопывание", () => {
    it("shallow-clone'ит initialContext для каждого spawned actor", () => {
      type Event = { type: "SPAWN" };
      const nested = { shared: true };
      const actor = {
        config: { __INIT: { SPAWN: "PENDING" }, PENDING: {} },
        initialState: "__INIT",
        initialContext: { nested, value: 0 },
        reducer: (state, _action, meta) => ({ state: meta.nextState, context: state.context }),
      } satisfies MachineConfig<
        { __INIT: { SPAWN: "PENDING" }; PENDING: {} },
        { nested: { shared: boolean }; value: number },
        Event
      >;
      const manager = MachineManager({ sync: actor });

      manager.transition({ type: "SPAWN" });
      manager.transition({ type: "SPAWN" });

      const first = manager.getState().sync["sync/0"].context;
      const second = manager.getState().sync["sync/1"].context;
      expect(first).not.toBe(second);
      expect(first).not.toBe(actor.initialContext);
      expect(first.nested).toBe(nested);
      expect(second.nested).toBe(nested);
    });

    it("unscoped event доставляет live actors и spawn'ит новый instance в одном dispatch", () => {
      const actor = {
        config: {
          __INIT: { LIKE: "PENDING" },
          PENDING: { LIKE: null, BUMP: null, OK: "__RESOLVED" },
          "*": { CANCEL: "__CANCELLED" },
        },
        initialState: "__INIT",
        initialContext: { id: "", count: 0 },
        reducer: (state, action, meta) => {
          if (action.type === "LIKE" && state.state === "__INIT") {
            return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
          }
          if (action.type === "LIKE" || action.type === "BUMP") {
            return { state: meta.nextState, context: { ...state.context, count: state.context.count + 1 } };
          }
          return { state: meta.nextState, context: state.context };
        },
      } satisfies MachineConfig<
        {
          __INIT: { LIKE: "PENDING" };
          PENDING: { LIKE: null; BUMP: null; OK: "__RESOLVED" };
          "*": { CANCEL: "__CANCELLED" };
        },
        { id: string; count: number },
        LikeEvent
      >;
      const manager = MachineManager({ likeSync: actor });

      manager.transition({ type: "LIKE", payload: { id: "first" } });
      manager.transition({ type: "LIKE", payload: { id: "second" } });

      expect(manager.getState().likeSync["likeSync/0"].context).toEqual({ id: "first", count: 2 });
      expect(manager.getState().likeSync["likeSync/1"].context).toEqual({ id: "second", count: 1 });
    });

    it("unscoped event для нескольких templates одного groupTag создаёт одну группу и один action order", () => {
      const calls: string[] = [];
      const createMember = (label: string): ReturnType<typeof createLikeSync> => ({
        ...createLikeSync(),
        groupTag: "party",
        effects: {
          PENDING: ({ action, self }) => {
            if (action.type === "LIKE") calls.push(`${label}:${action.payload.id}:${self.groupId}`);
          },
        },
      });
      const manager = MachineManager({
        alpha: createMember("alpha"),
        beta: createMember("beta"),
      });

      manager.transition({ type: "LIKE", payload: { id: "same-action" } });

      expect(calls).toEqual(["alpha:same-action:party/0", "beta:same-action:party/0"]);
      expect(Object.keys(manager.getState().alpha)).toEqual(["alpha/0"]);
      expect(Object.keys(manager.getState().beta)).toEqual(["beta/1"]);
    });

    it("spawn от unscoped LIKE добавляет actor в record", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });

      expect(manager.getState().likeSync).toEqual({
        "likeSync/0": {
          state: "PENDING",
          context: { id: "a", count: 1 },
          meta: { actorId: "likeSync/0", groupId: "likeSync/0", groupTag: "likeSync" },
        },
      });
    });

    it("spawn создаёт frozen public meta без templateKey и сохраняет ссылку после reduce", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      const firstMeta = manager.getState().likeSync["likeSync/0"].meta;

      expect(firstMeta).toEqual({ actorId: "likeSync/0", groupId: "likeSync/0", groupTag: "likeSync" });
      expect(Object.isFrozen(firstMeta)).toBe(true);
      expect("templateKey" in firstMeta).toBe(false);

      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync["likeSync/0"].meta).toBe(firstMeta);
    });

    it("meta остаётся frozen и reference-stable через произвольное число reduce", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      const meta = manager.getState().likeSync["likeSync/0"].meta;

      for (let i = 0; i < 10; i += 1) {
        manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
        const current = manager.getState().likeSync["likeSync/0"].meta;
        expect(current).toBe(meta);
        expect(Object.isFrozen(current)).toBe(true);
      }
      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(11);
    });

    it("scoped spawn event не создаёт actor для actor scope и неизвестных group/tag", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "actor" }, meta: { actorId: "missing" } });
      manager.transition({ type: "LIKE", payload: { id: "group" }, meta: { groupId: "missing" } });
      manager.transition({ type: "LIKE", payload: { id: "tag" }, meta: { groupTag: "missing" } });

      expect(manager.getState().likeSync).toEqual({});
    });

    it("reduce доставляет event и обновляет slice", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
    });

    it("terminal collapse удаляет actor из record", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync).toEqual({});
    });

    it("wildcard CANCEL не спавнит из __INIT и схлопывает live actor в __CANCELLED", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "CANCEL" });
      expect(manager.getState().likeSync).toEqual({});

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "CANCEL", meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync).toEqual({});
    });

    it("__REJECTED terminal target удаляет actor из record", () => {
      const rejecting = {
        config: {
          __INIT: { LIKE: "PENDING" },
          PENDING: { BUMP: null, OK: "__REJECTED" },
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
      } satisfies MachineConfig<
        { __INIT: { LIKE: "PENDING" }; PENDING: { BUMP: null; OK: "__REJECTED" }; "*": { CANCEL: "__CANCELLED" } },
        { id: string; count: number },
        LikeEvent
      >;
      const manager = MachineManager({ likeSync: rejecting });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync).toEqual({});
    });

    it("terminal одного actor оставляет группу с живым actor рабочей", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" }, meta: { groupId: "likeSync/0" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
      manager.transition({ type: "BUMP", meta: { groupId: "likeSync/0" } });

      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2);
    });

    it("actor spawned + terminal в same dispatch не попадает в sidecar", () => {
      const instant = {
        config: { __INIT: { LIKE: "__RESOLVED" }, PENDING: {} },
        initialState: "__INIT",
        initialContext: { id: "", count: 0 },
        reducer: (_state, _action, meta) => ({ state: meta.nextState, context: { id: "done", count: 0 } }),
      } satisfies MachineConfig<
        { __INIT: { LIKE: "__RESOLVED" }; PENDING: {} },
        { id: string; count: number },
        LikeEvent
      >;
      const manager = MachineManager({ likeSync: instant });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "BUMP", meta: { groupId: "likeSync/0" } });

      expect(manager.getState().likeSync).toEqual({});
    });

    it("tag routing после удаления последнего actor в группе не оживляет удалённую группу", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
      manager.transition({ type: "LIKE", payload: { id: "ghost" }, meta: { groupTag: "likeSync" } });

      expect(manager.getState().likeSync).toEqual({});
    });
  });

  describe("scopes маршрутизации", () => {
    it("actor scope доставляет event только указанным actor ids и dedupe array form", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" } });
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
      manager.transition({ type: "BUMP", meta: { actorId: ["likeSync/0", "likeSync/0"] } });

      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(3);
      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(1);
    });

    it("group scope создаёт новые actors внутри существующей группы и доставляет scoped events", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" }, meta: { groupId: "likeSync/0" } });

      expect(Object.keys(manager.getState().likeSync)).toEqual(["likeSync/0", "likeSync/1"]);

      manager.transition({ type: "BUMP", meta: { groupId: "likeSync/0" } });

      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2);
    });

    it("multi-target group routing спавнит actors в каждой target группе", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" } });
      manager.transition({ type: "LIKE", payload: { id: "c" } });

      manager.transition({
        type: "LIKE",
        payload: { id: "d" },
        meta: { groupId: ["likeSync/0", "likeSync/2"] },
      });

      expect(Object.keys(manager.getState().likeSync)).toHaveLength(5);
      expect(manager.getState().likeSync["likeSync/3"].context.id).toBe("d");
      expect(manager.getState().likeSync["likeSync/4"].context.id).toBe("d");
    });

    it("groupId[] с дублями доставляет один раз и не создаёт лишних actors", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" }, meta: { groupId: "likeSync/0" } });
      manager.transition({ type: "BUMP", meta: { groupId: ["likeSync/0", "likeSync/0"] } });

      expect(Object.keys(manager.getState().likeSync)).toEqual(["likeSync/0", "likeSync/1"]);
      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2);
    });

    it("groupId[] остаётся exact target set и не превращается в broadcast", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" } });
      manager.transition({ type: "LIKE", payload: { id: "c" } });
      manager.transition({ type: "BUMP", meta: { groupId: ["likeSync/0", "likeSync/2", "likeSync/0"] } });

      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(1);
      expect(manager.getState().likeSync["likeSync/2"].context.count).toBe(2);
    });

    it("multi-target routing делает один commit и один subscriber-call", () => {
      const commits: string[] = [];
      const manager = MachineManager({ likeSync: createLikeSync() });
      manager.onTransition((_prev, _current, action) => commits.push(action.type));

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" } });
      commits.length = 0;

      manager.transition({ type: "LIKE", payload: { id: "c" }, meta: { groupId: ["likeSync/0", "likeSync/1"] } });

      expect(commits).toEqual(["LIKE"]);
      expect(Object.keys(manager.getState().likeSync)).toHaveLength(4);
    });

    it("tag scope спавнит и доставляет события всем группам tag", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "tag-spawn" }, meta: { groupTag: "likeSync" } });

      expect(manager.getState().likeSync["likeSync/1"].context.id).toBe("tag-spawn");

      manager.transition({ type: "BUMP", meta: { groupTag: "likeSync" } });

      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2);
    });

    it("multi-target tag routing спавнит actors во всех групп каждого target tag", () => {
      const manager = MachineManager({
        alpha: createLikeSync(),
        beta: { ...createLikeSync(), groupTag: "betaTag" },
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({
        type: "LIKE",
        payload: { id: "b" },
        meta: { groupTag: ["alpha", "betaTag"] },
      });

      expect(Object.keys(manager.getState().alpha)).toHaveLength(2);
      expect(Object.keys(manager.getState().beta)).toHaveLength(2);
      expect(
        Object.values(manager.getState().alpha)
          .map((s) => s.context.id)
          .sort(),
      ).toEqual(["a", "b"]);
      expect(
        Object.values(manager.getState().beta)
          .map((s) => s.context.id)
          .sort(),
      ).toEqual(["a", "b"]);
    });

    it("groupTag[] с дублями доставляет один раз и не создаёт лишних actors", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "BUMP", meta: { groupTag: ["likeSync", "likeSync"] } });

      expect(Object.keys(manager.getState().likeSync)).toEqual(["likeSync/0"]);
      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
    });

    it("groupTag[] остаётся exact target set и не broadcast'ит другие tags", () => {
      const manager = MachineManager({
        alpha: createLikeSync(),
        beta: { ...createLikeSync(), groupTag: "beta" },
        gamma: { ...createLikeSync(), groupTag: "gamma" },
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" }, meta: { groupTag: "beta" } });
      manager.transition({ type: "LIKE", payload: { id: "c" }, meta: { groupTag: "gamma" } });
      manager.transition({ type: "BUMP", meta: { groupTag: ["alpha", "gamma", "alpha"] } });

      expect(manager.getState().alpha["alpha/0"].context.count).toBe(2);
      expect(manager.getState().beta["beta/1"].context.count).toBe(1);
      expect(manager.getState().gamma["gamma/2"].context.count).toBe(2);
    });

    it("priority actorId > groupId > groupTag", () => {
      const manager = MachineManager({ likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" }, meta: { groupId: "likeSync/0" } });
      manager.transition({ type: "LIKE", payload: { id: "c" } });

      manager.transition({
        type: "BUMP",
        meta: { actorId: "likeSync/2", groupId: "likeSync/0", groupTag: "likeSync" },
      });
      manager.transition({ type: "BUMP", meta: { groupId: "likeSync/0", groupTag: "likeSync" } });
      manager.transition({ type: "BUMP", meta: { actorId: [], groupTag: "likeSync" } });

      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2);
      expect(manager.getState().likeSync["likeSync/2"].context.count).toBe(2);
    });

    it("unknown actor/group/tag — scoped no-op для actor runtime, domain видит committed action", () => {
      const domain = {
        config: { IDLE: { BUMP: null } },
        initialState: "IDLE",
        initialContext: { seen: 0 },
        reducer: (state, action) => {
          if (action.type === "BUMP") return { state: state.state, context: { seen: state.context.seen + 1 } };
        },
      } satisfies MachineConfig<{ IDLE: { BUMP: null } }, { seen: number }, LikeEvent>;
      const manager = MachineManager({ domain, likeSync: createLikeSync() });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      const before = manager.getState().likeSync["likeSync/0"].context.count;

      manager.transition({ type: "BUMP", meta: { actorId: "missing" } });
      manager.transition({ type: "BUMP", meta: { groupId: "missing" } });
      manager.transition({ type: "BUMP", meta: { groupTag: "missing" } });
      manager.transition({ type: "BUMP", meta: { actorId: [] } });
      manager.transition({ type: "BUMP", meta: { groupId: [] } });
      manager.transition({ type: "BUMP", meta: { groupTag: [] } });

      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(before);
      expect(manager.getState().domain.context.seen).toBe(6);
    });

    it("очищает внешние sender meta поля перед commit", () => {
      const committed: unknown[] = [];
      const manager = MachineManager({
        domain: { config: { IDLE: { BUMP: null } }, initialState: "IDLE", initialContext: {} },
      });
      manager.onTransition((_prev, _current, action) => committed.push(action));

      manager.transition({
        type: "BUMP",
        meta: {
          senderActorId: "spoofed",
          senderGroupId: "spoofed-group",
          senderGroupTag: "spoofed-tag",
        },
      });

      expect(committed[0]).toEqual({ type: "BUMP" });
    });

    it("middleware видит action после pre-normalize без внешних spoofed sender fields", () => {
      const seen: unknown[] = [];
      const middleware: GenericMiddleware = () => (next) => (action) => {
        seen.push(action);
        return next(action);
      };
      const manager = MachineManager({ likeSync: createLikeSync() }, { middleware: [middleware] });

      manager.transition({
        type: "BUMP",
        meta: { groupId: "missing", senderActorId: "fake", senderGroupId: "fake", senderGroupTag: "fake" },
      });

      expect(seen[0]).toEqual({ type: "BUMP", meta: { groupId: "missing" } });
    });

    it("subscribers и domain reducer получают один committed normalized action для каждого scope", () => {
      const domainActions: unknown[] = [];
      const subscriberActions: unknown[] = [];
      const domain = {
        config: { IDLE: { BUMP: null } },
        initialState: "IDLE",
        initialContext: { seen: 0 },
        reducer: (state, action) => {
          if (action.type === "BUMP") {
            domainActions.push(action);
            return { state: state.state, context: { seen: state.context.seen + 1 } };
          }
        },
      } satisfies MachineConfig<{ IDLE: { BUMP: null } }, { seen: number }, LikeEvent>;
      const manager = MachineManager({ domain, likeSync: createLikeSync() });
      manager.onTransition((_prev, _current, action) => subscriberActions.push(action));

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0", senderActorId: "fake" } });
      manager.transition({ type: "BUMP", meta: { groupId: "likeSync/0", senderGroupId: "fake" } });
      manager.transition({ type: "BUMP", meta: { groupTag: "likeSync", senderGroupTag: "fake" } });
      manager.transition({ type: "BUMP", meta: { senderActorId: "fake" } });

      expect(domainActions).toEqual([
        { type: "BUMP", meta: { actorId: "likeSync/0" } },
        { type: "BUMP", meta: { groupId: "likeSync/0" } },
        { type: "BUMP", meta: { groupTag: "likeSync" } },
        { type: "BUMP" },
      ]);
      expect(subscriberActions.slice(1)).toEqual(domainActions);
      expect(manager.getState().domain.context.seen).toBe(4);
    });

    it("multi-target routing на трёх groupId не fan-out'ит middleware/subscribers/domain", () => {
      let middlewareCalls = 0;
      const subscriberActions: unknown[] = [];
      const middleware: GenericMiddleware = () => (next) => (action) => {
        if (action.type === "BUMP") middlewareCalls += 1;
        return next(action);
      };
      const domain = {
        config: { IDLE: { BUMP: null } },
        initialState: "IDLE",
        initialContext: { bumps: 0 },
        reducer: (state, action) => {
          if (action.type === "BUMP") return { state: state.state, context: { bumps: state.context.bumps + 1 } };
        },
      } satisfies MachineConfig<{ IDLE: { BUMP: null } }, { bumps: number }, LikeEvent>;
      const manager = MachineManager({ domain, likeSync: createLikeSync() }, { middleware: [middleware] });
      manager.onTransition((_prev, _current, action) => {
        if (action.type === "BUMP") subscriberActions.push(action);
      });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" } });
      manager.transition({ type: "LIKE", payload: { id: "c" } });
      manager.transition({
        type: "BUMP",
        meta: { groupId: ["likeSync/0", "likeSync/1", "likeSync/2", "likeSync/1"] },
      });

      expect(middlewareCalls).toBe(1);
      expect(subscriberActions).toEqual([
        { type: "BUMP", meta: { groupId: ["likeSync/0", "likeSync/1", "likeSync/2", "likeSync/1"] } },
      ]);
      expect(manager.getState().domain.context.bumps).toBe(1);
      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2);
      expect(manager.getState().likeSync["likeSync/2"].context.count).toBe(2);
    });
  });
});
