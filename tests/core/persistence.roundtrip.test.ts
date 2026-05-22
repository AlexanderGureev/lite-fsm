import { describe, expect, it } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import { LiteFsmError } from "@lite-fsm/core/internal/utils";

import { createSnapshotLikeSync } from "./MachineManager.actors.fixtures";

describe("persistence — core-level roundtrip", () => {
  it("full roundtrip: 3 actors → dehydrate → fresh manager(opts.snapshot) → identical state и continued counters", () => {
    const source = MachineManager({ likeSync: createSnapshotLikeSync() });

    source.transition({ type: "LIKE", payload: { id: "a" } });
    source.transition({ type: "LIKE", payload: { id: "b" } });
    source.transition({ type: "LIKE", payload: { id: "c" } });

    const envelope = source.dehydrate();
    const restored = MachineManager({ likeSync: createSnapshotLikeSync() }, { snapshot: envelope });

    expect(restored.getState()).toEqual(source.getState());

    restored.transition({ type: "LIKE", payload: { id: "d" } });
    const keys = Object.keys(restored.getState().likeSync).sort();
    expect(keys).toContain("likeSync/3");
  });

  it("corrupted envelope: throw + state не меняется (atomicity)", () => {
    const manager = MachineManager({ likeSync: createSnapshotLikeSync() });
    manager.transition({ type: "LIKE", payload: { id: "a" } });
    const before = manager.getState();

    expect(() => manager.hydrate({ machines: 42 } as never)).toThrow(LiteFsmError);
    expect(manager.getState()).toBe(before);

    expect(() => manager.hydrate({ machines: { likeSync: "not-a-record" } } as never)).toThrow(LiteFsmError);
    expect(manager.getState()).toBe(before);
  });

  it("partial corruption: один slice invalid → throw отбрасывает весь reconcile", () => {
    const manager = MachineManager({ likeSync: createSnapshotLikeSync() });
    manager.transition({ type: "LIKE", payload: { id: "first" } });
    const before = manager.getState();

    expect(() =>
      manager.hydrate({
        machines: {
          likeSync: {
            "likeSync/10": {
              snapshot: { state: "PENDING", context: { id: "ok", count: 1 } },
              meta: { actorId: "likeSync/10", groupId: "likeSync/10", groupTag: "likeSync" },
            },
            "likeSync/11": {
              snapshot: { state: "PENDING", context: { id: "bad", count: 1 } },
              meta: { actorId: "likeSync/11", groupId: "likeSync/11", groupTag: "wrongTag" },
            },
          },
        },
      } as never),
    ).toThrow(LiteFsmError);

    expect(manager.getState()).toBe(before);
    expect(manager.getState().likeSync["likeSync/10"]).toBeUndefined();
    expect(manager.getState().likeSync["likeSync/11"]).toBeUndefined();
  });

  it("originId conflict: чужие id восстановлены, но local counter НЕ инкрементируется", () => {
    const alice = MachineManager({ likeSync: createSnapshotLikeSync() }, { originId: "alice" });
    alice.transition({ type: "LIKE", payload: { id: "a1" } });
    alice.transition({ type: "LIKE", payload: { id: "a2" } });

    const envelope = alice.dehydrate();

    const bob = MachineManager({ likeSync: createSnapshotLikeSync() }, { originId: "bob" });
    bob.hydrate(envelope as never, { strategy: "merge" });

    expect(Object.keys(bob.getState().likeSync).sort()).toEqual(["alice#likeSync/0", "alice#likeSync/1"]);

    bob.transition({ type: "LIKE", payload: { id: "b1" } });
    expect(bob.getState().likeSync["bob#likeSync/0"]).toBeDefined();
  });

  it("originId conflict: восстановленные actors доступны для actor-scope routing", () => {
    const alice = MachineManager({ likeSync: createSnapshotLikeSync() }, { originId: "alice" });
    alice.transition({ type: "LIKE", payload: { id: "first" } });

    const envelope = alice.dehydrate();

    const bob = MachineManager({ likeSync: createSnapshotLikeSync() }, { originId: "bob" });
    bob.hydrate(envelope as never, { strategy: "merge" });

    bob.transition({ type: "BUMP", meta: { actorId: "alice#likeSync/0" } });

    expect(bob.getState().likeSync["alice#likeSync/0"].context.count).toBe(2);
  });

  it("roundtrip сохраняет ActorMeta точно (actorId/groupId/groupTag)", () => {
    const source = MachineManager({ likeSync: createSnapshotLikeSync() });
    source.transition({ type: "LIKE", payload: { id: "x" } });
    const sourceMeta = source.getState().likeSync["likeSync/0"].meta;

    const envelope = source.dehydrate();
    const restored = MachineManager({ likeSync: createSnapshotLikeSync() }, { snapshot: envelope });

    expect(restored.getState().likeSync["likeSync/0"].meta).toEqual(sourceMeta);
  });
});
