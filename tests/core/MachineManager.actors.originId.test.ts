import { describe, expect, it } from "vitest";

import { MachineManager } from "../../src/core";
import { LiteFsmError } from "../../src/core/utils";

import { createLikeSync, createSnapshotLikeSync } from "./MachineManager.actors.fixtures";

describe("MachineManager actors — originId namespacing", () => {
  it("два менеджера с разными originId спавнят один шаблон без коллизий", () => {
    const alice = MachineManager({ likeSync: createLikeSync() }, { originId: "alice" });
    const bob = MachineManager({ likeSync: createLikeSync() }, { originId: "bob" });

    alice.transition({ type: "LIKE", payload: { id: "a" } });
    bob.transition({ type: "LIKE", payload: { id: "b" } });

    expect(Object.keys(alice.getState().likeSync)).toEqual(["alice#likeSync/0"]);
    expect(Object.keys(bob.getState().likeSync)).toEqual(["bob#likeSync/0"]);
    expect(alice.getState().likeSync["alice#likeSync/0"].meta.groupId).toBe("alice#likeSync/0");
    expect(bob.getState().likeSync["bob#likeSync/0"].meta.groupId).toBe("bob#likeSync/0");
  });

  it("cross-merge через hydrate({ strategy: 'merge' }) сохраняет обе записи", () => {
    const alice = MachineManager({ likeSync: createSnapshotLikeSync() }, { originId: "alice" });
    const bob = MachineManager({ likeSync: createSnapshotLikeSync() }, { originId: "bob" });

    alice.transition({ type: "LIKE", payload: { id: "alice-1" } });
    bob.transition({ type: "LIKE", payload: { id: "bob-1" } });

    bob.hydrate(alice.dehydrate(), { strategy: "merge" });
    expect(Object.keys(bob.getState().likeSync).sort()).toEqual(["alice#likeSync/0", "bob#likeSync/0"]);

    bob.transition({ type: "LIKE", payload: { id: "bob-2" } });
    expect(Object.keys(bob.getState().likeSync).sort()).toEqual([
      "alice#likeSync/0",
      "bob#likeSync/0",
      "bob#likeSync/1",
    ]);
    expect(bob.getState().likeSync["bob#likeSync/1"].context.id).toBe("bob-2");
  });

  it("counter менеджера двигается только на свои id после hydrate чужих", () => {
    const bob = MachineManager({ likeSync: createSnapshotLikeSync() }, { originId: "bob" });

    bob.hydrate({
      machines: {
        likeSync: {
          "alice#likeSync/5": {
            snapshot: { state: "PENDING", context: { id: "alice", count: 1 } },
            meta: { actorId: "alice#likeSync/5", groupId: "alice#likeSync/5", groupTag: "likeSync" },
          },
        },
      },
    } as never);

    bob.transition({ type: "LIKE", payload: { id: "fresh" } });
    expect(bob.getState().likeSync["bob#likeSync/0"]).toBeDefined();
    expect(bob.getState().likeSync["bob#likeSync/0"].context.id).toBe("fresh");
  });

  it("менеджер без originId сохраняет формат templateKey/0 (back-compat)", () => {
    const manager = MachineManager({ likeSync: createLikeSync() });
    manager.transition({ type: "LIKE", payload: { id: "a" } });

    expect(Object.keys(manager.getState().likeSync)).toEqual(["likeSync/0"]);
    expect(manager.getState().likeSync["likeSync/0"].meta.groupId).toBe("likeSync/0");
  });

  it("originId с : и / принимается", () => {
    const urn = MachineManager({ likeSync: createLikeSync() }, { originId: "urn:user:alice" });
    const shard = MachineManager({ likeSync: createLikeSync() }, { originId: "shard/eu-1" });

    urn.transition({ type: "LIKE", payload: { id: "u" } });
    shard.transition({ type: "LIKE", payload: { id: "s" } });

    expect(Object.keys(urn.getState().likeSync)).toEqual(["urn:user:alice#likeSync/0"]);
    expect(Object.keys(shard.getState().likeSync)).toEqual(["shard/eu-1#likeSync/0"]);
  });

  it("пустой originId или содержащий # бросает LITE_FSM_INVALID_OPTIONS", () => {
    expect(() => MachineManager({ likeSync: createLikeSync() }, { originId: "" })).toThrow(LiteFsmError);
    expect(() => MachineManager({ likeSync: createLikeSync() }, { originId: "bad#peer" })).toThrow(LiteFsmError);

    try {
      MachineManager({ likeSync: createLikeSync() }, { originId: "" });
    } catch (error) {
      expect(error).toBeInstanceOf(LiteFsmError);
      expect((error as LiteFsmError).code).toBe("LITE_FSM_INVALID_OPTIONS");
    }
  });

  it("hydrate своего же owned snapshot двигает local counter", () => {
    const alice = MachineManager({ likeSync: createSnapshotLikeSync() }, { originId: "alice" });

    alice.hydrate({
      machines: {
        likeSync: {
          "alice#likeSync/5": {
            snapshot: { state: "PENDING", context: { id: "old", count: 1 } },
            meta: { actorId: "alice#likeSync/5", groupId: "alice#likeSync/5", groupTag: "likeSync" },
          },
        },
      },
    } as never);

    alice.transition({ type: "LIKE", payload: { id: "new" } });
    expect(alice.getState().likeSync["alice#likeSync/6"]).toBeDefined();
    expect(alice.getState().likeSync["alice#likeSync/6"].context.id).toBe("new");
    expect(alice.getState().likeSync["alice#likeSync/6"].meta.groupId).toBe("alice#likeSync/6");
  });

  it("менеджер без originId hydrate чужого '#'-id принимает запись, но не двигает counter", () => {
    const manager = MachineManager({ likeSync: createSnapshotLikeSync() });

    manager.hydrate({
      machines: {
        likeSync: {
          "alice#likeSync/9": {
            snapshot: { state: "PENDING", context: { id: "alice", count: 1 } },
            meta: { actorId: "alice#likeSync/9", groupId: "alice#likeSync/9", groupTag: "likeSync" },
          },
        },
      },
    } as never);

    manager.transition({ type: "LIKE", payload: { id: "fresh" } });
    expect(manager.getState().likeSync["likeSync/0"]).toBeDefined();
    expect(manager.getState().likeSync["likeSync/0"].context.id).toBe("fresh");
    expect(manager.getState().likeSync["alice#likeSync/9"]).toBeDefined();
  });

  it("default groupId с originId без generator получает префикс и инкрементируется", () => {
    const alice = MachineManager({ likeSync: createLikeSync() }, { originId: "alice" });

    alice.transition({ type: "LIKE", payload: { id: "a" } });
    alice.transition({ type: "LIKE", payload: { id: "b" } });

    const ids = Object.keys(alice.getState().likeSync).sort();
    expect(ids).toEqual(["alice#likeSync/0", "alice#likeSync/1"]);
    expect(alice.getState().likeSync["alice#likeSync/0"].meta.groupId).toBe("alice#likeSync/0");
    expect(alice.getState().likeSync["alice#likeSync/1"].meta.groupId).toBe("alice#likeSync/1");
  });

  it("originId-aware: hydrate с собственным opaque (UUID-form) id не двигает counter, но защищает от collision", () => {
    const alice = MachineManager({ likeSync: createSnapshotLikeSync() }, { originId: "alice" });

    alice.hydrate({
      machines: {
        likeSync: {
          "alice#uuid-xyz": {
            snapshot: { state: "PENDING", context: { id: "restored", count: 1 } },
            meta: { actorId: "alice#uuid-xyz", groupId: "alice#uuid-xyz", groupTag: "likeSync" },
          },
        },
      },
    } as never);

    alice.transition({ type: "LIKE", payload: { id: "fresh" } });
    expect(alice.getState().likeSync["alice#likeSync/0"]).toBeDefined();
    expect(alice.getState().likeSync["alice#uuid-xyz"]).toBeDefined();
  });
});
