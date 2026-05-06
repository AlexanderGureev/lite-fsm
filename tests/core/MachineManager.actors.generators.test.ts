import { describe, expect, it } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import { LiteFsmError } from "@lite-fsm/core/internal/utils";

import { createLikeSync, createSnapshotLikeSync } from "./MachineManager.actors.fixtures";

describe("MachineManager actors — generateActorId / generateGroupId", () => {
  it("generateActorId строит id из action.payload и адресуется по нему", () => {
    const manager = MachineManager(
      { likeSync: createLikeSync() },
      {
        generateActorId: ({ action }) => {
          if (action.type !== "LIKE") throw new Error("unexpected action");
          return `player/${action.payload.id}`;
        },
      },
    );

    manager.transition({ type: "LIKE", payload: { id: "userA" } });
    expect(manager.getState().likeSync["player/userA"].context.id).toBe("userA");

    manager.transition({ type: "BUMP", meta: { actorId: "player/userA" } });
    expect(manager.getState().likeSync["player/userA"].context.count).toBe(2);
  });

  it("generateActorId с дубликатом бросает LITE_FSM_INVALID_GENERATED_ID", () => {
    const manager = MachineManager(
      { likeSync: createLikeSync() },
      { generateActorId: () => "player/userA" },
    );

    manager.transition({ type: "LIKE", payload: { id: "userA" } });
    expect(() => manager.transition({ type: "LIKE", payload: { id: "userA" } })).toThrow(LiteFsmError);

    try {
      manager.transition({ type: "LIKE", payload: { id: "userA" } });
    } catch (error) {
      expect(error).toBeInstanceOf(LiteFsmError);
      expect((error as LiteFsmError).code).toBe("LITE_FSM_INVALID_GENERATED_ID");
    }
  });

  it("generateActorId возвращает пустую строку или не-строку → LITE_FSM_INVALID_GENERATED_ID", () => {
    const empty = MachineManager({ likeSync: createLikeSync() }, { generateActorId: () => "" });
    expect(() => empty.transition({ type: "LIKE", payload: { id: "x" } })).toThrow(LiteFsmError);

    const nullish = MachineManager(
      { likeSync: createLikeSync() },
      { generateActorId: (() => null) as never },
    );
    expect(() => nullish.transition({ type: "LIKE", payload: { id: "x" } })).toThrow(LiteFsmError);
  });

  it("generateActorId через UUID + hydrate snapshot не двигает counter но избегает collision", () => {
    let nextUuid = 0;
    const fakeUuid = () => `uuid-${nextUuid++}`;

    const manager = MachineManager(
      { likeSync: createSnapshotLikeSync() },
      { generateActorId: () => fakeUuid() },
    );

    manager.transition({ type: "LIKE", payload: { id: "first" } });
    const snapshot = manager.dehydrate();

    const restored = MachineManager(
      { likeSync: createSnapshotLikeSync() },
      { generateActorId: () => fakeUuid() },
    );
    restored.hydrate(snapshot);
    restored.transition({ type: "LIKE", payload: { id: "second" } });

    const ids = Object.keys(restored.getState().likeSync).sort();
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("generateActorId использует originId и payload, и id корректно классифицируется как owned", () => {
    const make = (originId: string) =>
      MachineManager(
        { likeSync: createSnapshotLikeSync() },
        {
          originId,
          generateActorId: ({ originId: from, action, counter }) => {
            const tail = action.type === "LIKE" ? action.payload.id : `t${counter}`;
            return `${from}#custom/${tail}`;
          },
        },
      );

    const alice = make("alice");
    alice.transition({ type: "LIKE", payload: { id: "a" } });

    expect(Object.keys(alice.getState().likeSync)).toEqual(["alice#custom/a"]);

    const bob = make("bob");
    bob.hydrate(alice.dehydrate(), { strategy: "merge" });

    bob.transition({ type: "LIKE", payload: { id: "b" } });
    expect(Object.keys(bob.getState().likeSync).sort()).toEqual(["alice#custom/a", "bob#custom/b"]);
  });

  it("generateGroupId с невалидным результатом бросает LITE_FSM_INVALID_GENERATED_ID", () => {
    const empty = MachineManager(
      { likeSync: createLikeSync() },
      { generateGroupId: () => "" },
    );
    expect(() => empty.transition({ type: "LIKE", payload: { id: "x" } })).toThrow(LiteFsmError);

    try {
      empty.transition({ type: "LIKE", payload: { id: "x" } });
    } catch (error) {
      expect((error as LiteFsmError).code).toBe("LITE_FSM_INVALID_GENERATED_ID");
      expect((error as LiteFsmError).message).toContain("generateGroupId");
    }
  });

  it("generateGroupId возвращает кастомный groupId, доступный для transition.group", () => {
    const manager = MachineManager(
      { likeSync: createLikeSync() },
      {
        generateGroupId: ({ groupTag, action }) => {
          if (action.type !== "LIKE") return `${groupTag}/fallback`;
          return `room:${action.payload.id}`;
        },
      },
    );

    manager.transition({ type: "LIKE", payload: { id: "lobby" } });
    const actor = Object.values(manager.getState().likeSync)[0];
    expect(actor.meta.groupId).toBe("room:lobby");

    manager.transition({ type: "BUMP", meta: { groupId: "room:lobby" } });
    expect(actor.meta.actorId).toBeDefined();
    const updated = manager.getState().likeSync[actor.meta.actorId];
    expect(updated.context.count).toBe(2);
  });

  it("generateGroupId с дубликатом sidecar бросает LITE_FSM_INVALID_GENERATED_ID", () => {
    const manager = MachineManager(
      { likeSync: createLikeSync() },
      { generateGroupId: () => "fixed-group" },
    );

    manager.transition({ type: "LIKE", payload: { id: "a" } });
    expect(() => manager.transition({ type: "LIKE", payload: { id: "b" } })).toThrow(LiteFsmError);

    try {
      manager.transition({ type: "LIKE", payload: { id: "b" } });
    } catch (error) {
      expect((error as LiteFsmError).code).toBe("LITE_FSM_INVALID_GENERATED_ID");
      expect((error as LiteFsmError).message).toContain("groupId 'fixed-group' is already in use");
    }
  });

  it("generateGroupId дубликат внутри одного dispatch (collected) бросает LITE_FSM_INVALID_GENERATED_ID", () => {
    const manager = MachineManager(
      { likeSync: createLikeSync(), echoSync: createLikeSync() },
      { generateGroupId: () => "fixed-group" },
    );

    expect(() => manager.transition({ type: "LIKE", payload: { id: "a" } })).toThrow(LiteFsmError);

    try {
      manager.transition({ type: "LIKE", payload: { id: "a" } });
    } catch (error) {
      expect((error as LiteFsmError).code).toBe("LITE_FSM_INVALID_GENERATED_ID");
      expect((error as LiteFsmError).message).toContain("groupId 'fixed-group' is already in use");
    }
  });

  it("generateActorId дубликат в pending одного dispatch (разные templateKeys) бросает LITE_FSM_INVALID_GENERATED_ID", () => {
    const manager = MachineManager(
      { likeSync: createLikeSync(), echoSync: createLikeSync() },
      { generateActorId: () => "fixed-actor" },
    );

    expect(() => manager.transition({ type: "LIKE", payload: { id: "a" } })).toThrow(LiteFsmError);

    try {
      manager.transition({ type: "LIKE", payload: { id: "a" } });
    } catch (error) {
      expect((error as LiteFsmError).code).toBe("LITE_FSM_INVALID_GENERATED_ID");
      expect((error as LiteFsmError).message).toContain("actorId 'fixed-actor' is already in use");
    }
  });

  it("counter передаётся в generator монотонно даже когда custom id игнорирует его", () => {
    const seenCounters: number[] = [];
    const manager = MachineManager(
      { likeSync: createLikeSync() },
      {
        generateActorId: ({ counter, action }) => {
          seenCounters.push(counter);
          return action.type === "LIKE" ? `a/${action.payload.id}` : `a/x`;
        },
      },
    );

    manager.transition({ type: "LIKE", payload: { id: "x" } });
    manager.transition({ type: "LIKE", payload: { id: "y" } });
    manager.transition({ type: "LIKE", payload: { id: "z" } });

    expect(seenCounters).toEqual([0, 1, 2]);
  });

  it("SpawnIdContext передаёт templateKey, groupTag, originId и action в generators", () => {
    const seenActor: Array<Record<string, unknown>> = [];
    const seenGroup: Array<Record<string, unknown>> = [];

    const manager = MachineManager(
      { likeSync: createLikeSync() },
      {
        originId: "tester",
        generateActorId: (ctx) => {
          seenActor.push({
            templateKey: ctx.templateKey,
            groupTag: ctx.groupTag,
            originId: ctx.originId,
            actionType: ctx.action.type,
            counter: ctx.counter,
          });
          return `tester#a/${ctx.counter}`;
        },
        generateGroupId: (ctx) => {
          seenGroup.push({
            templateKey: ctx.templateKey,
            groupTag: ctx.groupTag,
            originId: ctx.originId,
            actionType: ctx.action.type,
            counter: ctx.counter,
          });
          return `tester#g/${ctx.counter}`;
        },
      },
    );

    manager.transition({ type: "LIKE", payload: { id: "first" } });

    expect(seenGroup).toEqual([
      { templateKey: "likeSync", groupTag: "likeSync", originId: "tester", actionType: "LIKE", counter: 0 },
    ]);
    expect(seenActor).toEqual([
      { templateKey: "likeSync", groupTag: "likeSync", originId: "tester", actionType: "LIKE", counter: 0 },
    ]);
  });
});
