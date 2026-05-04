import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "../../src/core";
import { EMPTY_ACTOR_RECORD } from "../../src/core/actor";
import type { MachineConfig, Middleware } from "../../src/core/types";
import { HYDRATE_ACTION_TYPE, LiteFsmError } from "../../src/core/utils";

import {
  createLikeSync,
  createReplacingMiddleware,
  createSnapshotLikeSync,
  type LikeEvent,
  type LikeSyncContext,
} from "./MachineManager.actors.fixtures";

type SnapshotSlice = {
  state: "PENDING";
  context: LikeSyncContext;
  meta: { actorId: string; groupId: string; groupTag: string };
};
type SnapshotData = Omit<SnapshotSlice, "meta">;
type SnapshotEntry = {
  snapshot: SnapshotData;
  meta: SnapshotSlice["meta"];
};

const actorSlice = (
  actorId: string,
  id: string,
  count = 1,
  groupId = actorId,
  groupTag = "likeSync",
): SnapshotSlice => ({
  state: "PENDING",
  context: { id, count },
  meta: { actorId, groupId, groupTag },
});

const actorData = (id: string, count = 1): SnapshotData => ({
  state: "PENDING",
  context: { id, count },
});

const actorEntry = (
  actorId: string,
  id: string,
  count = 1,
  groupId = actorId,
  groupTag = "likeSync",
): SnapshotEntry => ({
  snapshot: actorData(id, count),
  meta: { actorId, groupId, groupTag },
});

const counter = {
  config: { IDLE: { INC: null } },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (state, action) => {
    if (action.type === "INC") return { state: state.state, context: { count: state.context.count + 1 } };
    return state;
  },
  hydrate: (prev, snapshot: { count: number }) => ({ state: prev.state, context: { count: snapshot.count } }),
  dehydrate: (state) => ({ count: state.context.count }),
} satisfies MachineConfig<
  { IDLE: { INC: null } },
  { count: number },
  LikeEvent | { type: "INC" },
  {},
  { count: number }
>;

describe("MachineManager actors — snapshot hydration", () => {
  it("валидирует persistence config для domain, runtime actor и snapshot actor hooks", () => {
    expect(() =>
      MachineManager({
        domain: {
          config: { IDLE: {} },
          initialState: "IDLE",
          initialContext: {},
          persistence: "snapshot",
        } as never,
      }),
    ).toThrow(LiteFsmError);

    expect(() =>
      MachineManager({
        likeSync: {
          ...createLikeSync(),
          hydrate: () => actorSlice("likeSync/0", "bad"),
        } as never,
      }),
    ).toThrow(LiteFsmError);

    expect(() =>
      MachineManager({
        likeSync: {
          ...createLikeSync(),
          persistence: "disk",
        } as never,
      }),
    ).toThrow(LiteFsmError);

    expect(() =>
      MachineManager({
        likeSync: {
          ...createLikeSync(),
          persistence: "runtime",
          dehydrate: () => ({}),
        } as never,
      }),
    ).toThrow(LiteFsmError);

    expect(() =>
      MachineManager({
        likeSync: createSnapshotLikeSync({
          hydrate: (_prev, snapshot) => snapshot,
          dehydrate: (slice) => slice,
        }),
      }),
    ).not.toThrow();
  });

  it("сохраняет совместимость domain hydrate/dehydrate рядом со snapshot actors", () => {
    const manager = MachineManager({ counter, likeSync: createSnapshotLikeSync() });
    manager.transition({ type: "INC" });
    manager.transition({ type: "LIKE", payload: { id: "a" } });

    const snapshot = manager.dehydrate();
    const restored = MachineManager({ counter, likeSync: createSnapshotLikeSync() }, { snapshot });

    expect(snapshot).toEqual({
      schemaVersion: undefined,
      machines: {
        counter: { count: 1 },
        likeSync: {
          "likeSync/0": actorEntry("likeSync/0", "a"),
        },
      },
    });
    expect(restored.getState().counter.context.count).toBe(1);
    expect(restored.getState().likeSync["likeSync/0"].context.id).toBe("a");
  });

  it("runtime actor dehydrate() остаётся implicit skip, а explicit key бросает ошибку", () => {
    const runtimeActor = createLikeSync();
    const manager = MachineManager({ counter, likeSync: runtimeActor });
    manager.transition({ type: "LIKE", payload: { id: "a" } });

    expect(manager.dehydrate()).toEqual({
      schemaVersion: undefined,
      machines: { counter: { count: 0 } },
    });
    expect(() => manager.dehydrate({ machines: ["likeSync"] as never })).toThrow(LiteFsmError);
  });

  it("runtime actor hydrate, opts.snapshot и preview сохраняют skip behavior", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runtimeActor = createLikeSync();
    const manager = MachineManager({ likeSync: runtimeActor });
    manager.transition({ type: "LIKE", payload: { id: "live" } });
    const base = manager.getState();
    const snapshot = { machines: { likeSync: { ghost: actorSlice("ghost", "ghost") } } } as never;

    const preview = manager.getHydratedState(snapshot);
    manager.hydrate(snapshot);
    const boot = MachineManager({ likeSync: runtimeActor }, { snapshot });

    expect(preview).toBe(base);
    expect(preview.likeSync).toBe(base.likeSync);
    expect(manager.getState().likeSync["likeSync/0"].context.id).toBe("live");
    expect(boot.getState().likeSync).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("actor template 'likeSync' was skipped"));
    warn.mockRestore();
  });

  it("snapshot actor dehydrate() implicit и explicit выгружают actor record", () => {
    const manager = MachineManager({ counter, likeSync: createSnapshotLikeSync() });
    manager.transition({ type: "LIKE", payload: { id: "a" } });

    expect(manager.dehydrate()).toEqual({
      schemaVersion: undefined,
      machines: {
        counter: { count: 0 },
        likeSync: { "likeSync/0": actorEntry("likeSync/0", "a") },
      },
    });
    expect(manager.dehydrate({ machines: ["likeSync"] })).toEqual({
      schemaVersion: undefined,
      machines: { likeSync: { "likeSync/0": actorEntry("likeSync/0", "a") } },
    });
  });

  it("actor dehydrate hook вызывается per actor без identity meta", () => {
    const dehydrate = vi.fn((slice) => ({
      data: {
        id: slice.context.id,
        count: slice.context.count,
      },
    }));
    const manager = MachineManager({ likeSync: createSnapshotLikeSync({ dehydrate }) });
    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "LIKE", payload: { id: "b" }, meta: { groupId: "likeSync/0" } });

    expect(manager.dehydrate({ machines: ["likeSync"] }).machines.likeSync).toEqual({
      "likeSync/0": {
        snapshot: {
          data: {
            id: "a",
            count: 1,
          },
        },
        meta: {
          actorId: "likeSync/0",
          groupId: "likeSync/0",
          groupTag: "likeSync",
        },
      },
      "likeSync/1": {
        snapshot: {
          data: {
            id: "b",
            count: 1,
          },
        },
        meta: {
          actorId: "likeSync/1",
          groupId: "likeSync/0",
          groupTag: "likeSync",
        },
      },
    });
    expect(dehydrate).toHaveBeenCalledTimes(2);
    expect(dehydrate).toHaveBeenCalledWith(actorData("a"));
    expect(dehydrate).toHaveBeenCalledWith(actorData("b"));
  });

  it("actor hydrate hook получает prev, snapshot и meta для existing и new actors", () => {
    const calls: unknown[] = [];
    const hydrate = vi.fn((prev, snapshot: { id: string; count: number }, meta) => {
      calls.push({ prev, snapshot, meta });
      return {
        state: "PENDING" as const,
        context: { id: snapshot.id, count: snapshot.count },
      };
    });
    const manager = MachineManager({ likeSync: createSnapshotLikeSync({ hydrate }) });
    manager.transition({ type: "LIKE", payload: { id: "live" } });

    manager.hydrate({
      machines: {
        likeSync: {
          "likeSync/0": {
            snapshot: { id: "restored-live", count: 2 },
            meta: { actorId: "likeSync/0", groupId: "spoofed/group", groupTag: "wrong" },
          },
          "likeSync/1": {
            snapshot: { id: "new", count: 3 },
            meta: { actorId: "likeSync/1", groupId: "likeSync/1", groupTag: "likeSync" },
          },
        },
      },
    } as never);

    expect(hydrate).toHaveBeenCalledTimes(2);
    expect(calls[0]).toMatchObject({
      prev: expect.objectContaining({ context: { id: "live", count: 1 } }),
      snapshot: { id: "restored-live", count: 2 },
      meta: { strategy: "merge" },
    });
    expect(calls[1]).toMatchObject({
      prev: undefined,
      snapshot: { id: "new", count: 3 },
      meta: { strategy: "merge" },
    });
    expect(manager.getState().likeSync["likeSync/0"].meta).toEqual({
      actorId: "likeSync/0",
      groupId: "likeSync/0",
      groupTag: "likeSync",
    });
    expect(manager.getState().likeSync["likeSync/1"].meta).toEqual({
      actorId: "likeSync/1",
      groupId: "likeSync/1",
      groupTag: "likeSync",
    });
  });

  it("existing actor может гидратиться legacy data без meta, но new actor без meta отклоняется", () => {
    const manager = MachineManager({ likeSync: createSnapshotLikeSync() });
    manager.transition({ type: "LIKE", payload: { id: "live" } });

    manager.hydrate({
      machines: {
        likeSync: {
          "likeSync/0": actorData("restored", 2),
        },
      },
    } as never);

    expect(manager.getState().likeSync["likeSync/0"]).toEqual(actorSlice("likeSync/0", "restored", 2));
    expect(() =>
      manager.hydrate({
        machines: {
          likeSync: {
            "server/actor": actorData("new", 1),
          },
        },
      } as never),
    ).toThrow(LiteFsmError);
  });

  it('пользовательский snapshot может иметь поле "snapshot" внутри manager-owned entry', () => {
    const hydrate = vi.fn((_prev, snapshot: { snapshot: { id: string }; count: number }) => ({
      state: "PENDING" as const,
      context: { id: snapshot.snapshot.id, count: snapshot.count },
    }));
    const dehydrate = vi.fn((slice: SnapshotData) => ({
      snapshot: { id: slice.context.id },
      count: slice.context.count,
    }));
    const manager = MachineManager({ likeSync: createSnapshotLikeSync({ hydrate, dehydrate }) });
    manager.transition({ type: "LIKE", payload: { id: "live" } });

    const snapshot = manager.dehydrate({ machines: ["likeSync"] });
    const restored = MachineManager({ likeSync: createSnapshotLikeSync({ hydrate, dehydrate }) }, { snapshot });

    expect(snapshot.machines.likeSync).toEqual({
      "likeSync/0": {
        snapshot: {
          snapshot: { id: "live" },
          count: 1,
        },
        meta: { actorId: "likeSync/0", groupId: "likeSync/0", groupTag: "likeSync" },
      },
    });
    expect(hydrate).toHaveBeenCalledWith(undefined, { snapshot: { id: "live" }, count: 1 }, { strategy: "replace" });
    expect(restored.getState().likeSync["likeSync/0"]).toEqual(actorSlice("likeSync/0", "live"));
  });

  it("actor hydrate hook может вернуть prev при replace и валидирует собственный output", () => {
    const keepPrev = vi.fn((prev) => prev ?? actorData("new"));
    const manager = MachineManager({ likeSync: createSnapshotLikeSync({ hydrate: keepPrev }) });
    manager.transition({ type: "LIKE", payload: { id: "live" } });
    const before = manager.getState();
    const sub = vi.fn();
    manager.onTransition(sub);

    manager.hydrate(
      {
        machines: {
          likeSync: {
            "likeSync/0": actorEntry("likeSync/0", "ignored"),
          },
        },
      },
      { strategy: "replace" },
    );

    expect(manager.getState()).toBe(before);
    expect(sub).not.toHaveBeenCalled();

    const invalidManager = MachineManager({
      likeSync: createSnapshotLikeSync({
        hydrate: () => "bad" as never,
      }),
    });
    expect(() =>
      invalidManager.hydrate({
        machines: {
          likeSync: {
            "likeSync/0": actorEntry("likeSync/0", "bad"),
          },
        },
      }),
    ).toThrow(LiteFsmError);
  });

  it("replace с пустым snapshot record удаляет существующих actors", () => {
    const manager = MachineManager({ likeSync: createSnapshotLikeSync() });
    manager.transition({ type: "LIKE", payload: { id: "live" } });
    const before = manager.getState();
    const sub = vi.fn();
    manager.onTransition(sub);

    manager.hydrate({ machines: { likeSync: {} } }, { strategy: "replace" });

    expect(manager.getState()).not.toBe(before);
    expect(manager.getState().likeSync).toBe(EMPTY_ACTOR_RECORD);
    expect(sub).toHaveBeenCalledTimes(1);
  });

  it("existing actor сохраняет canonical sidecar meta независимо от snapshot meta", () => {
    const manager = MachineManager({ likeSync: createSnapshotLikeSync() });
    manager.transition({ type: "LIKE", payload: { id: "live" } });

    manager.hydrate({
      machines: {
        likeSync: {
          "likeSync/0": actorEntry("likeSync/0", "restored", 2, "spoofed/group", "wrongTag"),
        },
      },
    } as never);

    expect(manager.getState().likeSync["likeSync/0"].meta).toEqual({
      actorId: "likeSync/0",
      groupId: "likeSync/0",
      groupTag: "likeSync",
    });
    manager.transition({ type: "BUMP", meta: { groupId: "likeSync/0" } });
    expect(manager.getState().likeSync["likeSync/0"].context.count).toBe(3);
  });

  it("replace удаляет отсутствующих actors, а merge сохраняет live actors вне snapshot record", () => {
    const manager = MachineManager({ likeSync: createSnapshotLikeSync() });
    manager.transition({ type: "LIKE", payload: { id: "a" } });
    manager.transition({ type: "LIKE", payload: { id: "b" }, meta: { groupId: "likeSync/0" } });

    manager.hydrate({ machines: { likeSync: { "likeSync/0": actorEntry("likeSync/0", "a2", 2) } } });
    expect(Object.keys(manager.getState().likeSync).sort()).toEqual(["likeSync/0", "likeSync/1"]);

    manager.hydrate(
      { machines: { likeSync: { "likeSync/0": actorEntry("likeSync/0", "a3", 3) } } },
      { strategy: "replace" },
    );
    expect(manager.getState().likeSync).toEqual({
      "likeSync/0": actorSlice("likeSync/0", "a3", 3),
    });
  });

  it("hydrate создаёт sidecar runtime для new actors и очищает bags у removed actors", async () => {
    let pending: Promise<boolean> | undefined;
    const manager = MachineManager({
      likeSync: createSnapshotLikeSync({
        effects: {
          "*": ({ action, condition }) => {
            if (action.type === "BUMP") pending = condition((next) => next.type === "PING");
          },
        },
      }),
    });

    manager.hydrate({
      machines: {
        likeSync: {
          "server/actor": actorEntry("server/actor", "server", 4, "server/group"),
        },
      },
    });
    manager.transition({ type: "BUMP", meta: { actorId: "server/actor" } });
    manager.hydrate({ machines: { likeSync: {} } }, { strategy: "replace" });

    expect(manager.getState().likeSync).toBe(EMPTY_ACTOR_RECORD);
    expect(pending).toBeDefined();
    await expect(pending).rejects.toMatchObject({ code: "LITE_FSM_ACTOR_DISPOSED" });
  });

  it("hydrate отправляет одно notification и не запускает middleware или effects", () => {
    const effect = vi.fn();
    const middleware: Middleware<any, LikeEvent> = () => (next) => (action) => next(action);
    const manager = MachineManager(
      {
        likeSync: createSnapshotLikeSync({
          effects: { PENDING: effect },
        }),
      },
      { middleware: [vi.fn(middleware)] },
    );
    const sub = vi.fn();
    manager.onTransition(sub);

    const snapshot = { machines: { likeSync: { "likeSync/0": actorEntry("likeSync/0", "a") } } };
    manager.hydrate(snapshot);

    expect(sub).toHaveBeenCalledOnce();
    expect(sub.mock.calls[0][2]).toEqual({
      type: HYDRATE_ACTION_TYPE,
      payload: { strategy: "merge", snapshot },
    });
    expect(effect).not.toHaveBeenCalled();
  });

  describe("validation: invalid input бросает LiteFsmError", () => {
    const createValidationManager = () =>
      MachineManager({
        likeSync: createSnapshotLikeSync(),
        otherSync: createSnapshotLikeSync({ groupTag: "otherSync" }),
      });

    it("отвергает не-object actor record", () => {
      const manager = createValidationManager();
      expect(() => manager.hydrate({ machines: { likeSync: null } } as never)).toThrow(LiteFsmError);
    });

    it("отвергает пустой actor id", () => {
      const manager = createValidationManager();
      expect(() => manager.hydrate({ machines: { likeSync: { "": actorEntry("", "empty") } } } as never)).toThrow(
        LiteFsmError,
      );
    });

    it("отвергает не-object actor snapshot value", () => {
      const manager = createValidationManager();
      expect(() => manager.hydrate({ machines: { likeSync: { bad: "not-an-object" } } } as never)).toThrow(
        LiteFsmError,
      );
    });

    it("отвергает несоответствие meta.actorId и record key", () => {
      const manager = createValidationManager();
      expect(() =>
        manager.hydrate({
          machines: {
            likeSync: {
              bad: {
                snapshot: actorData("bad"),
                meta: { actorId: "other", groupId: "bad", groupTag: "likeSync" },
              },
            },
          },
        }),
      ).toThrow(LiteFsmError);
    });

    it("отвергает state __INIT в snapshot actor slice", () => {
      const manager = createValidationManager();
      expect(() =>
        manager.hydrate({
          machines: {
            likeSync: {
              bad: {
                snapshot: { ...actorData("bad"), state: "__INIT" },
                meta: { actorId: "bad", groupId: "bad", groupTag: "likeSync" },
              },
            },
          },
        } as never),
      ).toThrow(LiteFsmError);
    });

    it("отвергает terminal state в snapshot actor slice", () => {
      const manager = createValidationManager();
      expect(() =>
        manager.hydrate({
          machines: {
            likeSync: {
              bad: {
                snapshot: { ...actorData("bad"), state: "__RESOLVED" },
                meta: { actorId: "bad", groupId: "bad", groupTag: "likeSync" },
              },
            },
          },
        } as never),
      ).toThrow(LiteFsmError);
    });

    it("отвергает duplicate actor id между snapshot templates", () => {
      const manager = createValidationManager();
      expect(() =>
        manager.hydrate({
          machines: {
            likeSync: { shared: actorEntry("shared", "a") },
            otherSync: { shared: actorEntry("shared", "b", 1, "otherSync/0", "otherSync") },
          },
        }),
      ).toThrow(LiteFsmError);
    });

    it("отвергает middleware-replaced actor record с пустым id", () => {
      const replaceWithEmptyId = createReplacingMiddleware("BUMP", (next) => ({
        ...next,
        likeSync: { "": actorSlice("", "empty") },
      }));
      const replacementManager = MachineManager(
        { likeSync: createSnapshotLikeSync() },
        { middleware: [replaceWithEmptyId] },
      );
      replacementManager.transition({ type: "LIKE", payload: { id: "a" } });
      expect(() => replacementManager.transition({ type: "BUMP", meta: { actorId: "likeSync/0" } })).toThrow(
        LiteFsmError,
      );
    });
  });

  it("existing actor id не может переходить между templates", () => {
    const manager = MachineManager({
      likeSync: createSnapshotLikeSync(),
      otherSync: createSnapshotLikeSync({ groupTag: "otherSync" }),
    });
    manager.transition({ type: "LIKE", payload: { id: "a" } });

    expect(() =>
      manager.hydrate({
        machines: {
          otherSync: {
            "likeSync/0": actorEntry("likeSync/0", "moved", 1, "otherSync/0", "otherSync"),
          },
        },
      }),
    ).toThrow(LiteFsmError);
  });

  it("принимает opaque external ids и bump'ит local counters для restored ids", () => {
    const manager = MachineManager({ likeSync: createSnapshotLikeSync() });

    manager.hydrate({
      machines: {
        likeSync: {
          "server:actor": actorEntry("server:actor", "opaque", 5, "server:group"),
          "likeSync/5": actorEntry("likeSync/5", "local", 1, "likeSync/7"),
        },
      },
    });
    manager.transition({ type: "BUMP", meta: { actorId: "server:actor" } });
    manager.transition({ type: "LIKE", payload: { id: "next" } });

    expect(manager.getState().likeSync["server:actor"].context.count).toBe(6);
    expect(manager.getState().likeSync["likeSync/6"].context.id).toBe("next");
    expect(manager.getState().likeSync["likeSync/6"].meta.groupId).toBe("likeSync/8");
  });

  it("originId-aware: чужие id (alice#) не двигают local counter Bob'а", () => {
    const bob = MachineManager({ likeSync: createSnapshotLikeSync() }, { originId: "bob" });

    bob.hydrate({
      machines: {
        likeSync: {
          "alice#likeSync/5": actorEntry("alice#likeSync/5", "alice", 1, "alice#likeSync/5"),
        },
      },
    });
    bob.transition({ type: "LIKE", payload: { id: "fresh" } });

    expect(bob.getState().likeSync["bob#likeSync/0"]).toBeDefined();
    expect(bob.getState().likeSync["bob#likeSync/0"].context.id).toBe("fresh");
    expect(bob.getState().likeSync["bob#likeSync/0"].meta.groupId).toBe("bob#likeSync/0");
  });
});
