import { describe, expect, it } from "vitest";

import { createActorMeta, MachineManager } from "../../src/core";
import { EMPTY_ACTOR_RECORD } from "../../src/core/actor";
import { LiteFsmError, VOID_REDUCER_ERROR } from "../../src/core/utils";
import { immerMiddleware } from "../../src/middleware/immer";
import type { GenericMiddleware, MachineConfig } from "../../src/core/types";

import { createLikeSync, createReplacingMiddleware, type LikeEvent } from "./MachineManager.actors.fixtures";

describe("MachineManager actors — middleware (immer + replacement reconcile)", () => {
  describe("интеграция с immer", () => {
    it("immerMiddleware поддерживает mutating actor reducer", () => {
      const mutatingReducer: NonNullable<ReturnType<typeof createLikeSync>["reducer"]> = (state, action, meta) => {
        if (action.type === "LIKE") {
          state.state = meta.nextState;
          state.context.id = action.payload.id;
          state.context.count = 1;
          return;
        }
        if (action.type === "BUMP") {
          state.context.count += 1;
          return;
        }
        state.state = meta.nextState;
      };

      const manager = MachineManager(
        { likeSync: { ...createLikeSync(), reducer: mutatingReducer } },
        { middleware: [immerMiddleware] },
      );

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
    });

    it("mutating actor reducer без immerMiddleware бросает VOID_REDUCER_ERROR", () => {
      const mutatingReducer: NonNullable<ReturnType<typeof createLikeSync>["reducer"]> = (state, action, meta) => {
        if (action.type === "LIKE") {
          state.state = meta.nextState;
          state.context.id = action.payload.id;
          state.context.count = 1;
          return;
        }
        state.state = meta.nextState;
      };
      const manager = MachineManager({ likeSync: { ...createLikeSync(), reducer: mutatingReducer } });

      expect(() => manager.transition({ type: "LIKE", payload: { id: "a" } })).toThrow(VOID_REDUCER_ERROR);
    });

    it("manager перезаписывает meta, если actor reducer возвращает чужое значение", () => {
      const reducer: NonNullable<ReturnType<typeof createLikeSync>["reducer"]> = (state, action, meta) => {
        const context =
          action.type === "LIKE"
            ? { id: action.payload.id, count: 1 }
            : { ...state.context, count: state.context.count + 1 };
        return {
          state: meta.nextState,
          context,
          meta: { actorId: "fake", groupId: "fake", groupTag: "fake" },
        } as never;
      };
      const manager = MachineManager({ likeSync: { ...createLikeSync(), reducer } });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      const actorMeta = manager.getState().likeSync["likeSync/0"].meta;
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync["likeSync/0"].meta).toBe(actorMeta);
      expect(manager.getState().likeSync["likeSync/0"].meta).toEqual({
        actorId: "likeSync/0",
        groupId: "likeSync/0",
        groupTag: "likeSync",
      });
    });

    it("legacy reducer возвращает {state, context} без meta — manager пришивает canonical", () => {
      const legacyReducer: NonNullable<ReturnType<typeof createLikeSync>["reducer"]> = (state, action, meta) => {
        if (action.type === "LIKE") return { state: meta.nextState, context: { id: action.payload.id, count: 1 } };
        if (action.type === "BUMP") {
          return { state: meta.nextState, context: { ...state.context, count: state.context.count + 1 } };
        }
        return { state: meta.nextState, context: state.context };
      };
      const manager = MachineManager({ likeSync: { ...createLikeSync(), reducer: legacyReducer } });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      const spawnedMeta = manager.getState().likeSync["likeSync/0"].meta;
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });

      expect(spawnedMeta).toEqual({ actorId: "likeSync/0", groupId: "likeSync/0", groupTag: "likeSync" });
      expect(Object.isFrozen(spawnedMeta)).toBe(true);
      expect(manager.getState().likeSync["likeSync/0"].meta).toBe(spawnedMeta);
      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(3);
    });
  });

  describe("replacement reconcile", () => {
    it("middleware без next не запускает commit, sidecar и effects", () => {
      const calls: string[] = [];
      const blockNext: GenericMiddleware = () => () => (action) => action;
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ action }) => {
            calls.push(action.type);
          },
        },
      };
      const manager = MachineManager({ likeSync: actorMachine }, { middleware: [blockNext] });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "BUMP", meta: { groupId: "likeSync/0" } });

      expect(manager.getState().likeSync).toEqual({});
      expect(calls).toEqual([]);
    });

    it("middleware modified action доходит до actor reducer, subscriber и effect", () => {
      const committed: unknown[] = [];
      const effects: string[] = [];
      const rewriteLike: GenericMiddleware = () => (next) => (action) => {
        if (action.type === "LIKE") return next({ ...action, payload: { id: "modified" } });
        return next(action);
      };
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ action }) => {
            if (action.type === "LIKE") effects.push(action.payload.id);
          },
        },
      };
      const manager = MachineManager({ likeSync: actorMachine }, { middleware: [rewriteLike] });
      manager.onTransition((_prev, _current, action) => committed.push(action));

      manager.transition({ type: "LIKE", payload: { id: "original" } });

      expect(manager.getState().likeSync["likeSync/0"].context.id).toBe("modified");
      expect(committed[0]).toEqual({ type: "LIKE", payload: { id: "modified" } });
      expect(effects).toEqual(["modified"]);
    });

    it("middleware next(modifiedAction) пересчитывает routing по modified meta", () => {
      const rewriteTarget: GenericMiddleware = () => (next) => (action) => {
        if (action.type === "BUMP") return next({ ...action, meta: { actorId: "likeSync/1" } });
        return next(action);
      };
      const manager = MachineManager({ likeSync: createLikeSync() }, { middleware: [rewriteTarget] });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "LIKE", payload: { id: "b" } });
      manager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } });

      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(1);
      expect(manager.getState().likeSync["likeSync/1"].context.count).toBe(2);
    });

    it("middleware return после next не меняет committed action для reducers/subscribers/effects/transition", () => {
      const committed: unknown[] = [];
      const effects: string[] = [];
      const returnDifferent: GenericMiddleware = () => (next) => (action) => {
        if (action.type === "LIKE") {
          next({ ...action, payload: { id: "committed" } });
          return { type: "LIKE", payload: { id: "returned" } } as typeof action;
        }
        return next(action);
      };
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ action }) => {
            if (action.type === "LIKE") effects.push(action.payload.id);
          },
        },
      };
      const manager = MachineManager({ likeSync: actorMachine }, { middleware: [returnDifferent] });
      manager.onTransition((_prev, _current, action) => committed.push(action));

      const returned = manager.transition({ type: "LIKE", payload: { id: "original" } });

      expect(returned).toEqual({ type: "LIKE", payload: { id: "committed" } });
      expect(manager.getState().likeSync["likeSync/0"].context.id).toBe("committed");
      expect(committed).toEqual([{ type: "LIKE", payload: { id: "committed" } }]);
      expect(effects).toEqual(["committed"]);
    });

    it("MachineManager без actor templates сохраняет middleware/replacement поведение", () => {
      const replaceDomain: GenericMiddleware = (api) => {
        api.replaceReducer(() => (state, action) => {
          if (action.type === "BUMP") return { domain: { state: "IDLE", context: { seen: 10 } } } as typeof state;
          return state;
        });
        return (next) => (action) => next(action);
      };
      const domain = {
        config: { IDLE: { BUMP: null } },
        initialState: "IDLE",
        initialContext: { seen: 0 },
      } satisfies MachineConfig<{ IDLE: { BUMP: null } }, { seen: number }, LikeEvent>;
      const manager = MachineManager({ domain }, { middleware: [replaceDomain] });

      manager.transition({ type: "BUMP" });

      expect(manager.getState().domain.context.seen).toBe(10);
    });

    it("replacement поверх touched record отклоняет unknown actor без public meta", () => {
      const ghostMiddleware = createReplacingMiddleware("LIKE", (next) => ({
        ...next,
        likeSync: {
          ...next.likeSync,
          ghost: { state: "PENDING", context: { id: "ghost", count: 1 } },
        },
      }));
      const manager = MachineManager({ likeSync: createLikeSync() }, { middleware: [ghostMiddleware] });

      const before = manager.getState();
      expect(() => manager.transition({ type: "LIKE", payload: { id: "a" } })).toThrow(LiteFsmError);
      expect(manager.getState()).toBe(before);
    });

    it("replacement создаёт new actor по валидному public meta", () => {
      const restoreMiddleware = createReplacingMiddleware("PING", (next) => ({
        ...next,
        likeSync: {
          custom: {
            state: "PENDING",
            context: { id: "restored", count: 1 },
            meta: createActorMeta({ actorId: "custom", groupId: "opaque", groupTag: "likeSync" }),
          },
        },
      }));
      const manager = MachineManager({ likeSync: createLikeSync() }, { middleware: [restoreMiddleware] });

      restoreMiddleware.replace();
      manager.transition({ type: "BUMP", meta: { groupId: "opaque" } });

      expect(manager.getState().likeSync.custom.context).toEqual({ id: "restored", count: 2 });
      expect(manager.getState().likeSync.custom.meta).toEqual({
        actorId: "custom",
        groupId: "opaque",
        groupTag: "likeSync",
      });
    });

    it("replacement отклоняет new actor с невалидным public meta", () => {
      const cases = [
        ["actorId", { actorId: "other", groupId: "likeSync/0", groupTag: "likeSync" }],
        ["groupTag", { actorId: "ghost", groupId: "likeSync/0", groupTag: "other" }],
        ["groupId", { actorId: "ghost", groupId: "", groupTag: "likeSync" }],
      ] as const;

      for (const [_name, meta] of cases) {
        const invalidMeta = createReplacingMiddleware("PING", (next) => ({
          ...next,
          likeSync: {
            ghost: { state: "PENDING", context: { id: "ghost", count: 1 }, meta },
          },
        }));
        const manager = MachineManager({ likeSync: createLikeSync() }, { middleware: [invalidMeta] });

        expect(() => invalidMeta.replace()).toThrow(
          expect.objectContaining({ code: "LITE_FSM_INVALID_ACTOR_SLICE" }),
        );
        expect(manager.getState().likeSync).toEqual({});
      }
    });

    it("ошибка replacement reconcile атомарна: state и sidecar остаются прежними", () => {
      const invalidPatch = createReplacingMiddleware("PING", (next) => ({
        ...next,
        likeSync: {
          "likeSync/0": { state: "__INIT", context: { id: "bad", count: 0 } },
        },
      }));
      const manager = MachineManager({ likeSync: createLikeSync() }, { middleware: [invalidPatch] });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      const before = manager.getState();
      expect(() => invalidPatch.replace()).toThrow(LiteFsmError);

      expect(manager.getState()).toBe(before);
      manager.transition({ type: "BUMP", meta: { groupId: "likeSync/0" } });
      expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(2);
    });

    it("replacement может patch existing actor", () => {
      const patchExisting = createReplacingMiddleware("BUMP", (next) => ({
        ...next,
        likeSync: {
          ...next.likeSync,
          "likeSync/0": { state: "PENDING", context: { id: "patched", count: 99 } },
        },
      }));
      const manager = MachineManager(
        { likeSync: createLikeSync(), otherSync: { ...createLikeSync(), groupTag: "otherSync" } },
        { middleware: [patchExisting] },
      );

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "BUMP" });
      patchExisting.replace();

      expect(manager.getState().likeSync["likeSync/0"].context).toEqual({ id: "patched", count: 99 });
    });

    it("replacement existing actor игнорирует incoming meta и сохраняет canonical ссылку", () => {
      const patchExisting = createReplacingMiddleware("BUMP", (next) => ({
        ...next,
        likeSync: {
          ...next.likeSync,
          "likeSync/0": {
            state: "PENDING",
            context: { id: "patched", count: 99 },
            meta: { actorId: "likeSync/0", groupId: "fake", groupTag: "fake" },
          },
        },
      }));
      const manager = MachineManager({ likeSync: createLikeSync() }, { middleware: [patchExisting] });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      const meta = manager.getState().likeSync["likeSync/0"].meta;
      manager.transition({ type: "BUMP" });
      patchExisting.replace();

      expect(manager.getState().likeSync["likeSync/0"].meta).toBe(meta);
      expect(manager.getState().likeSync["likeSync/0"].meta).toEqual({
        actorId: "likeSync/0",
        groupId: "likeSync/0",
        groupTag: "likeSync",
      });
    });

    it("replacement patch surviving actor сохраняет pending condition bag", async () => {
      const pending: Array<Promise<boolean>> = [];
      const patchExisting = createReplacingMiddleware("PING", (next) => ({
        ...next,
        likeSync: {
          ...next.likeSync,
          "likeSync/0": { state: "PENDING", context: { id: "patched", count: 99 } },
        },
      }));
      const actorMachine: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        effects: {
          PENDING: ({ condition }) => {
            pending.push(condition((next) => next.type === "DOMAIN"));
          },
        },
      };
      const manager = MachineManager({ likeSync: actorMachine }, { middleware: [patchExisting] });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      patchExisting.replace();
      manager.transition({ type: "DOMAIN" });

      expect(manager.getState().likeSync["likeSync/0"].context).toEqual({ id: "patched", count: 99 });
      await expect(pending[0]).resolves.toBe(true);
    });

    it("replacement может удалить existing actor", () => {
      const removeExisting = createReplacingMiddleware("BUMP", (next) => ({ ...next, likeSync: {} }));
      const manager = MachineManager(
        { likeSync: createLikeSync(), otherSync: { ...createLikeSync(), groupTag: "otherSync" } },
        { middleware: [removeExisting] },
      );

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      removeExisting.replace();

      expect(manager.getState().likeSync).toEqual({});
      expect(manager.getState().likeSync).toBe(EMPTY_ACTOR_RECORD);
    });

    it("replaceReducer short-circuit с trusted actor snapshot восстанавливает routing", () => {
      const shortCircuitRemove: GenericMiddleware = (api) => {
        api.replaceReducer((original) => (state, action) => {
          if (action.type === "DOMAIN") return { ...state, likeSync: {} };
          return original(state, action);
        });
        return (next) => (action) => next(action);
      };
      const manager = MachineManager({ likeSync: createLikeSync() }, { middleware: [shortCircuitRemove] });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "DOMAIN" });
      expect(manager.getState().likeSync).toBe(EMPTY_ACTOR_RECORD);

      manager.transition({ type: "LIKE", payload: { id: "b" } });
      expect(manager.getState().likeSync["likeSync/1"].context.id).toBe("b");
    });

    it("replaceReducer full snapshot восстанавливает domain и actor records одним commit", () => {
      const restoreFullSnapshot: GenericMiddleware = (api) => {
        api.replaceReducer((original) => (state, action) => {
          if (action.type !== "PING") return original(state, action);
          return {
            ...state,
            domain: { state: "IDLE", context: { count: 42 } },
            likeSync: {
              custom: {
                state: "PENDING",
                context: { id: "restored", count: 1 },
                meta: createActorMeta({ actorId: "custom", groupId: "opaque", groupTag: "likeSync" }),
              },
            },
          };
        });
        return (next) => (action) => next(action);
      };
      const domain = {
        config: { IDLE: { PING: null } },
        initialState: "IDLE",
        initialContext: { count: 0 },
      } satisfies MachineConfig<{ IDLE: { PING: null } }, { count: number }, LikeEvent>;
      const manager = MachineManager({ domain, likeSync: createLikeSync() }, { middleware: [restoreFullSnapshot] });

      manager.transition({ type: "LIKE", payload: { id: "live" } });
      manager.transition({ type: "PING" });
      manager.transition({ type: "BUMP", meta: { groupId: "opaque" } });

      expect(manager.getState().domain.context.count).toBe(42);
      expect(manager.getState().likeSync).toEqual({
        custom: {
          state: "PENDING",
          context: { id: "restored", count: 2 },
          meta: createActorMeta({ actorId: "custom", groupId: "opaque", groupTag: "likeSync" }),
        },
      });
    });

    it("один dispatch может совместить core-touched actor record и trusted replacement другого template", () => {
      const mixedReplacement: GenericMiddleware = (api) => {
        api.replaceReducer((original) => (state, action) => {
          const next = original(state, action);
          if (action.type !== "LIKE") return next;
          return {
            ...next,
            otherSync: {
              restored: {
                state: "PENDING",
                context: { id: "restored", count: 1 },
                meta: createActorMeta({ actorId: "restored", groupId: "opaque-other", groupTag: "otherSync" }),
              },
            },
          };
        });
        return (next) => (action) => next(action);
      };
      const manager = MachineManager(
        { likeSync: createLikeSync(), otherSync: { ...createLikeSync(), groupTag: "otherSync" } },
        { middleware: [mixedReplacement] },
      );

      manager.transition({ type: "LIKE", payload: { id: "live" } });
      manager.transition({ type: "BUMP", meta: { groupId: "opaque-other" } });

      expect(manager.getState().likeSync["likeSync/0"].context).toEqual({ id: "live", count: 1 });
      expect(manager.getState().otherSync.restored.context).toEqual({ id: "restored", count: 2 });
    });

    it("replaceReducer restore проходит обычный effects pipeline", () => {
      const restoreBusy: GenericMiddleware = (api) => {
        api.replaceReducer((original) => (state, action) => {
          if (action.type !== "PING") return original(state, action);
          return { flow: { state: "BUSY", context: { runs: 10 } } } as typeof state;
        });
        return (next) => (action) => next(action);
      };
      const flow = {
        config: { READY: { PING: "BUSY" }, BUSY: { DOMAIN: "READY" } },
        initialState: "READY",
        initialContext: { runs: 0 },
        reducer: (state, action, meta) => ({
          state: meta.nextState,
          context: { runs: state.context.runs + (action.type === "DOMAIN" ? 1 : 0) },
        }),
        effects: {
          BUSY: ({ transition }) => {
            transition({ type: "DOMAIN" });
          },
        },
      } satisfies MachineConfig<{ READY: { PING: "BUSY" }; BUSY: { DOMAIN: "READY" } }, { runs: number }, LikeEvent>;
      const manager = MachineManager({ flow }, { middleware: [restoreBusy] });

      manager.transition({ type: "PING" });

      expect(manager.getState().flow).toEqual({ state: "READY", context: { runs: 11 } });
    });

    it("replacement не переносит actorId между templates", () => {
      const moveExisting = createReplacingMiddleware("BUMP", (next) => {
        const actorId = Object.keys(next.likeSync)[0];
        return { ...next, otherSync: { [actorId]: next.likeSync[actorId] } };
      });
      const manager = MachineManager(
        { likeSync: createLikeSync(), otherSync: { ...createLikeSync(), groupTag: "otherSync" } },
        { middleware: [moveExisting] },
      );

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      expect(() => moveExisting.replace()).toThrow(LiteFsmError);
    });

    it("replacement может заменить spawned actor валидным slice после dispatch", () => {
      const replaceSpawned = createReplacingMiddleware("LIKE", (next) => {
        const actorId = Object.keys(next.likeSync)[0];
        const slice = next.likeSync[actorId] as { meta: unknown };
        return {
          ...next,
          likeSync: {
            [actorId]: {
              state: "PENDING",
              context: { id: "replacement", count: 10 },
              meta: slice.meta,
            },
          },
        };
      });
      const manager = MachineManager({ likeSync: createLikeSync() }, { middleware: [replaceSpawned] });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "BUMP", meta: { groupId: "likeSync/0" } });

      expect(manager.getState().likeSync["likeSync/0"].context).toEqual({ id: "replacement", count: 11 });
    });

    it("replacement не переносит spawned actorId между templates", () => {
      const moveSpawned = createReplacingMiddleware("LIKE", (next) => {
        const actorId = Object.keys(next.likeSync)[0];
        return {
          ...next,
          likeSync: {},
          otherSync: { [actorId]: next.likeSync[actorId] },
        };
      });
      const manager = MachineManager(
        { likeSync: createLikeSync(), otherSync: { ...createLikeSync(), groupTag: "otherSync" } },
        { middleware: [moveSpawned] },
      );

      const before = manager.getState();
      expect(() => manager.transition({ type: "LIKE", payload: { id: "a" } })).toThrow(LiteFsmError);
      expect(manager.getState()).toBe(before);
    });

    it("replacement детектит дубликат actor id в нескольких изменённых templates", () => {
      const duplicateExisting = createReplacingMiddleware("PING", (next) => ({
        ...next,
        likeSync: { ...next.likeSync },
        otherSync: { "likeSync/0": next.likeSync["likeSync/0"] },
      }));
      const manager = MachineManager(
        { likeSync: createLikeSync(), otherSync: { ...createLikeSync(), groupTag: "otherSync" } },
        { middleware: [duplicateExisting] },
      );

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      expect(() => duplicateExisting.replace()).toThrow(LiteFsmError);
    });

    it("замена при terminal overlap — cleanup отдан slow reconcile", () => {
      const replaceTerminal = createReplacingMiddleware("OK", (next) => ({ ...next, likeSync: {} }));
      const manager = MachineManager({ likeSync: createLikeSync() }, { middleware: [replaceTerminal] });

      manager.transition({ type: "LIKE", payload: { id: "a" } });
      manager.transition({ type: "OK", meta: { actorId: "likeSync/0" } });
      replaceTerminal.replace();

      expect(manager.getState().likeSync).toEqual({});
    });

    // Общий harness для тестов ниже: "BUMP заменяет запись likeSync произвольным значением".
    const replaceWith = (likeSync: Record<string, unknown>, otherSync: Record<string, unknown> = {}) => {
      const middleware = createReplacingMiddleware("BUMP", (next) => ({ ...next, likeSync, otherSync }));
      const manager = MachineManager(
        { likeSync: createLikeSync(), otherSync: { ...createLikeSync(), groupTag: "otherSync" } },
        { middleware: [middleware] },
      );
      manager.transition({ type: "LIKE", payload: { id: "a" } });
      middleware.replace();
      return manager;
    };

    it("replacement отклоняет actor с __INIT state", () => {
      expect(() =>
        replaceWith({ "likeSync/0": { state: "__INIT", context: {} } }),
      ).toThrow(LiteFsmError);
    });

    it("replacement отклоняет невалидный slice shape", () => {
      expect(() => replaceWith({ "likeSync/0": null })).toThrow(LiteFsmError);
    });

    it("replacement отклоняет дубликат actorId через разные templates", () => {
      expect(() =>
        replaceWith(
          { shared: { state: "PENDING", context: { id: "a", count: 1 } } },
          { shared: { state: "PENDING", context: { id: "b", count: 1 } } },
        ),
      ).toThrow(LiteFsmError);
    });

    it("actor reducer оставивший actor в __INIT бросает LITE_FSM_INVALID_ACTOR_CONFIG", () => {
      const initReducer: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        reducer: () => ({ state: "__INIT", context: { id: "bad", count: 0 } }) as never,
      };
      expect(() =>
        MachineManager({ likeSync: initReducer }).transition({ type: "LIKE", payload: { id: "a" } }),
      ).toThrow(expect.objectContaining({ code: "LITE_FSM_INVALID_ACTOR_CONFIG" }));
    });

    it("actor reducer вернувший invalid public state бросает LITE_FSM_INVALID_ACTOR_CONFIG", () => {
      const invalidReducer: ReturnType<typeof createLikeSync> = {
        ...createLikeSync(),
        reducer: () => ({ state: "MISSING" as "PENDING", context: { id: "bad", count: 0 } }),
      };
      expect(() =>
        MachineManager({ likeSync: invalidReducer }).transition({ type: "LIKE", payload: { id: "a" } }),
      ).toThrow(expect.objectContaining({ code: "LITE_FSM_INVALID_ACTOR_CONFIG" }));
    });
  });
});
