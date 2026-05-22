import { describe, expect, it } from "vitest";

import {
  bumpCountersFromId,
  cloneCounters,
  type Counters,
  isOwnedId,
  mergeCounters,
  parseSpawnId,
} from "@lite-fsm/core/internal/actor";

const makeCounters = (actor = 0, groups: Array<[string, number]> = []): Counters => ({
  actor,
  groupByTag: new Map(groups),
});

describe("parseSpawnId", () => {
  it("id без '#' даёт owner=null и tail=id", () => {
    expect(parseSpawnId("likeSync/0")).toEqual({ owner: null, tail: "likeSync/0" });
    expect(parseSpawnId("server:actor")).toEqual({ owner: null, tail: "server:actor" });
    expect(parseSpawnId("")).toEqual({ owner: null, tail: "" });
  });

  it("id с '#' разделяется по первому вхождению", () => {
    expect(parseSpawnId("alice#likeSync/0")).toEqual({ owner: "alice", tail: "likeSync/0" });
    expect(parseSpawnId("a#b#c")).toEqual({ owner: "a", tail: "b#c" });
  });

  it("'#' в начале даёт пустой owner", () => {
    expect(parseSpawnId("#likeSync/0")).toEqual({ owner: "", tail: "likeSync/0" });
  });

  it("'#' в конце даёт пустой tail", () => {
    expect(parseSpawnId("alice#")).toEqual({ owner: "alice", tail: "" });
  });
});

describe("isOwnedId", () => {
  it("originId=undefined: owned только id без '#'", () => {
    expect(isOwnedId("likeSync/0", undefined)).toBe(true);
    expect(isOwnedId("server:actor", undefined)).toBe(true);
    expect(isOwnedId("alice#likeSync/0", undefined)).toBe(false);
    expect(isOwnedId("#likeSync/0", undefined)).toBe(false);
  });

  it("originId='alice': owned только id с префиксом 'alice#'", () => {
    expect(isOwnedId("alice#likeSync/0", "alice")).toBe(true);
    expect(isOwnedId("bob#likeSync/0", "alice")).toBe(false);
    expect(isOwnedId("likeSync/0", "alice")).toBe(false);
    expect(isOwnedId("#likeSync/0", "alice")).toBe(false);
  });

  it("originId с '/' и ':' матчится точно по полному префиксу до '#'", () => {
    expect(isOwnedId("urn:user:alice#likeSync/0", "urn:user:alice")).toBe(true);
    expect(isOwnedId("shard/eu-1#likeSync/0", "shard/eu-1")).toBe(true);
    expect(isOwnedId("urn:user:alice#likeSync/0", "urn:user:bob")).toBe(false);
  });
});

describe("bumpCountersFromId", () => {
  it("owned actorId с trailing /N двигает counters.actor до N+1", () => {
    const c = makeCounters();
    bumpCountersFromId(c, "likeSync/5", "likeSync/3", undefined);
    expect(c.actor).toBe(6);
    expect(c.groupByTag.get("likeSync")).toBe(4);
  });

  it("owned actorId/groupId max-merge со существующими counters", () => {
    const c = makeCounters(10, [["likeSync", 8]]);
    bumpCountersFromId(c, "likeSync/5", "likeSync/3", undefined);
    expect(c.actor).toBe(10);
    expect(c.groupByTag.get("likeSync")).toBe(8);
  });

  it("not-owned actorId не двигает counters.actor", () => {
    const c = makeCounters();
    bumpCountersFromId(c, "alice#likeSync/5", "likeSync/0", undefined);
    expect(c.actor).toBe(0);
    expect(c.groupByTag.get("likeSync")).toBe(1);
  });

  it("not-owned groupId не двигает groupByTag", () => {
    const c = makeCounters();
    bumpCountersFromId(c, "likeSync/0", "alice#likeSync/5", undefined);
    expect(c.actor).toBe(1);
    expect(c.groupByTag.get("likeSync")).toBeUndefined();
  });

  it("owned actorId с opaque tail (без /) не двигает counter", () => {
    const c = makeCounters();
    bumpCountersFromId(c, "server:actor", "likeSync/0", undefined);
    expect(c.actor).toBe(0);
    expect(c.groupByTag.get("likeSync")).toBe(1);
  });

  it("owned groupId с opaque tail (без /) не двигает counter — early return", () => {
    const c = makeCounters();
    bumpCountersFromId(c, "likeSync/2", "server:group", undefined);
    expect(c.actor).toBe(3);
    expect(c.groupByTag.get("likeSync")).toBeUndefined();
  });

  it("owned id с не-числом в trailing позиции не двигает counter", () => {
    const c = makeCounters();
    bumpCountersFromId(c, "likeSync/abc", "likeSync/-1", undefined);
    expect(c.actor).toBe(0);
    expect(c.groupByTag.get("likeSync")).toBeUndefined();
  });

  it("originId='alice': owned id двигает counters, чужой — нет", () => {
    const c = makeCounters();
    bumpCountersFromId(c, "alice#likeSync/5", "alice#likeSync/3", "alice");
    expect(c.actor).toBe(6);
    expect(c.groupByTag.get("likeSync")).toBe(4);

    bumpCountersFromId(c, "bob#likeSync/100", "bob#likeSync/100", "alice");
    expect(c.actor).toBe(6);
    expect(c.groupByTag.get("likeSync")).toBe(4);
  });

  it("originId задан: legacy id без '#' считается чужим (owner=null != originId)", () => {
    const c = makeCounters();
    bumpCountersFromId(c, "likeSync/5", "likeSync/3", "alice");
    expect(c.actor).toBe(0);
    expect(c.groupByTag.get("likeSync")).toBeUndefined();
  });

  it("owned actor бамп-ает только actor counter, не группу, если groupId чужой", () => {
    const c = makeCounters();
    bumpCountersFromId(c, "alice#likeSync/5", "bob#likeSync/9", "alice");
    expect(c.actor).toBe(6);
    expect(c.groupByTag.get("likeSync")).toBeUndefined();
  });
});

describe("cloneCounters", () => {
  it("создаёт независимый snapshot: мутация клона не трогает оригинал", () => {
    const original = makeCounters(3, [["a", 5]]);
    const clone = cloneCounters(original);

    clone.actor = 100;
    clone.groupByTag.set("a", 99);
    clone.groupByTag.set("b", 1);

    expect(original.actor).toBe(3);
    expect(original.groupByTag.get("a")).toBe(5);
    expect(original.groupByTag.has("b")).toBe(false);
  });
});

describe("mergeCounters", () => {
  it("max-merge actor counter — берёт большее из live и draft", () => {
    expect(mergeCounters(makeCounters(5), makeCounters(3)).actor).toBe(5);
    expect(mergeCounters(makeCounters(2), makeCounters(7)).actor).toBe(7);
    expect(mergeCounters(makeCounters(4), makeCounters(4)).actor).toBe(4);
  });

  it("max-merge per-tag counters — берёт максимум по каждому тегу", () => {
    const live = makeCounters(0, [
      ["a", 10],
      ["b", 2],
    ]);
    const draft = makeCounters(0, [
      ["a", 5],
      ["b", 8],
      ["c", 1],
    ]);

    const merged = mergeCounters(live, draft);

    expect(merged.groupByTag.get("a")).toBe(10);
    expect(merged.groupByTag.get("b")).toBe(8);
    expect(merged.groupByTag.get("c")).toBe(1);
  });

  it("не мутирует live: создаёт новый Counters", () => {
    const live = makeCounters(0, [["a", 1]]);
    const merged = mergeCounters(live, makeCounters(5, [["b", 9]]));

    expect(merged).not.toBe(live);
    expect(merged.groupByTag).not.toBe(live.groupByTag);
    expect(live.actor).toBe(0);
    expect(live.groupByTag.size).toBe(1);
  });

  it("draft без тега не удаляет тег из live", () => {
    const live = makeCounters(0, [["a", 3]]);
    const merged = mergeCounters(live, makeCounters());
    expect(merged.groupByTag.get("a")).toBe(3);
  });
});
