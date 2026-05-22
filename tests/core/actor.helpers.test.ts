import { describe, expect, it } from "vitest";

import {
  attachMeta,
  createActorMeta,
  isActorStateContextSlice,
  isTerminal,
  resolveRouting,
  resolveTransitionTarget,
  stripRouting,
  stripSenderFields,
} from "@lite-fsm/core/internal/actor";
import { assertSnapshotEnvelope } from "@lite-fsm/core/internal/hydration";
import { LiteFsmError } from "@lite-fsm/core/internal/utils";

describe("resolveRouting — приоритет actor > group > tag > unscoped", () => {
  it("без meta → unscoped scope с пустым targetSet", () => {
    expect(resolveRouting()).toEqual({ scope: "unscoped", targetSet: [] });
    expect(resolveRouting({})).toEqual({ scope: "unscoped", targetSet: [] });
  });

  it("actorId вытесняет groupId и groupTag", () => {
    expect(resolveRouting({ actorId: "a/1", groupId: "g/1", groupTag: "t" })).toEqual({
      scope: "actor",
      targetSet: ["a/1"],
    });
  });

  it("groupId вытесняет groupTag, когда actorId отсутствует", () => {
    expect(resolveRouting({ groupId: "g/1", groupTag: "t" })).toEqual({
      scope: "group",
      targetSet: ["g/1"],
    });
  });

  it("groupTag используется, когда выше нет точечной адресации", () => {
    expect(resolveRouting({ groupTag: "t" })).toEqual({ scope: "tag", targetSet: ["t"] });
  });

  it("array-форма дедуплицируется", () => {
    expect(resolveRouting({ actorId: ["a", "b", "a", "b"] })).toEqual({
      scope: "actor",
      targetSet: ["a", "b"],
    });
    expect(resolveRouting({ groupId: ["g", "g"] })).toEqual({ scope: "group", targetSet: ["g"] });
    expect(resolveRouting({ groupTag: ["x", "y", "x"] })).toEqual({ scope: "tag", targetSet: ["x", "y"] });
  });
});

describe("resolveTransitionTarget — приоритет source over wildcard", () => {
  const graph = {
    IDLE: { GO: "ACTIVE", RESET: "IDLE" },
    "*": { RESET: "MENU", PING: null },
  } satisfies Record<string, Record<string, unknown> | undefined>;

  it("explicit source имеет приоритет над wildcard", () => {
    expect(resolveTransitionTarget(graph, "IDLE", "RESET", false)).toBe("IDLE");
  });

  it("wildcard fallback срабатывает, если source не содержит edge", () => {
    expect(resolveTransitionTarget(graph, "ACTIVE", "RESET", false)).toBe("MENU");
    expect(resolveTransitionTarget(graph, "ACTIVE", "PING", false)).toBeNull();
  });

  it("отсутствие edge возвращает undefined", () => {
    expect(resolveTransitionTarget(graph, "ACTIVE", "UNKNOWN", false)).toBeUndefined();
  });

  it("explicit null target отличается от undefined (self-transition)", () => {
    expect(resolveTransitionTarget({ IDLE: { PING: null } }, "IDLE", "PING", false)).toBeNull();
  });
});

describe("stripSenderFields / stripRouting", () => {
  it("stripSenderFields удаляет sender*-поля и сохраняет routing", () => {
    const meta = {
      actorId: "a",
      groupId: "g",
      groupTag: "t",
      senderActorId: "sa",
      senderGroupId: "sg",
      senderGroupTag: "st",
    };
    expect(stripSenderFields(meta)).toEqual({ actorId: "a", groupId: "g", groupTag: "t" });
  });

  it("stripRouting удаляет routing-поля и сохраняет sender", () => {
    const meta = {
      actorId: "a",
      groupId: "g",
      groupTag: "t",
      senderActorId: "sa",
    };
    expect(stripRouting(meta)).toEqual({ senderActorId: "sa" });
  });

  it("игнорирует undefined-поля и возвращает пустой объект для undefined meta", () => {
    expect(stripSenderFields(undefined)).toEqual({});
    expect(stripRouting(undefined)).toEqual({});
    expect(stripSenderFields({ actorId: undefined, groupTag: "t" })).toEqual({ groupTag: "t" });
  });
});

describe("attachMeta", () => {
  it("при пустом meta удаляет поле meta из action (без allocations лишних ключей)", () => {
    const result = attachMeta({ type: "X", meta: { actorId: "a" } }, {});
    expect(result).toEqual({ type: "X" });
    expect("meta" in result).toBe(false);
  });

  it("при non-empty meta присоединяет его к новому action object", () => {
    const action = { type: "X" };
    const result = attachMeta(action, { actorId: "a" });
    expect(result).toEqual({ type: "X", meta: { actorId: "a" } });
    expect(result).not.toBe(action);
  });
});

describe("createActorMeta", () => {
  it("берёт только actorId/groupId/groupTag и возвращает frozen объект", () => {
    const meta = createActorMeta({
      actorId: "a/1",
      groupId: "g/1",
      groupTag: "t",
      // лишние поля не должны попадать в результат
    } as never);

    expect(meta).toEqual({ actorId: "a/1", groupId: "g/1", groupTag: "t" });
    expect(Object.isFrozen(meta)).toBe(true);
    expect("templateKey" in meta).toBe(false);
  });
});

describe("isTerminal / isActorStateContextSlice", () => {
  it("isTerminal распознаёт __RESOLVED, __REJECTED, __CANCELLED", () => {
    expect(isTerminal("__RESOLVED")).toBe(true);
    expect(isTerminal("__REJECTED")).toBe(true);
    expect(isTerminal("__CANCELLED")).toBe(true);
    expect(isTerminal("__INIT")).toBe(false);
    expect(isTerminal("PENDING")).toBe(false);
    expect(isTerminal(null)).toBe(false);
    expect(isTerminal(42)).toBe(false);
  });

  it("isActorStateContextSlice валидирует { state: string, context: object }", () => {
    expect(isActorStateContextSlice({ state: "PENDING", context: {} })).toBe(true);
    expect(isActorStateContextSlice({ state: "PENDING", context: null })).toBe(false);
    expect(isActorStateContextSlice({ state: 42, context: {} })).toBe(false);
    expect(isActorStateContextSlice(null)).toBe(false);
    expect(isActorStateContextSlice([])).toBe(false);
  });
});

describe("assertSnapshotEnvelope", () => {
  it("принимает валидный envelope и нормализует schemaVersion", () => {
    expect(assertSnapshotEnvelope({ machines: { a: {} } })).toEqual({
      schemaVersion: undefined,
      machines: { a: {} },
    });
    expect(assertSnapshotEnvelope({ schemaVersion: 3, machines: { a: {} } })).toEqual({
      schemaVersion: 3,
      machines: { a: {} },
    });
  });

  it("игнорирует non-number schemaVersion (нормализует в undefined)", () => {
    expect(
      assertSnapshotEnvelope({ schemaVersion: "v1" as never, machines: { a: {} } }).schemaVersion,
    ).toBeUndefined();
  });

  it("отвергает non-object envelope и machines", () => {
    expect(() => assertSnapshotEnvelope(null)).toThrow(LiteFsmError);
    expect(() => assertSnapshotEnvelope("snap" as never)).toThrow(/must be an object envelope/);
    expect(() => assertSnapshotEnvelope({ machines: "not-object" })).toThrow(/machines must be an object/);
    expect(() => assertSnapshotEnvelope({})).toThrow(/machines must be an object/);
  });
});
