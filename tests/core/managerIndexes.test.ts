import { describe, expect, it } from "vitest";

import { buildManagerIndexes, createConfigHelpers } from "@lite-fsm/core/internal/managerIndexes";
import type { MachineStore } from "@lite-fsm/core";

type DomainCfg = {
  config: Record<string, Record<string, string | null> | undefined>;
  groupTag?: string;
};

const makeConfig = (configs: Record<string, DomainCfg>): MachineStore =>
  configs as unknown as MachineStore;

describe("buildManagerIndexes — unit", () => {
  it("domain без edges → попадает в domainAlwaysReduce", () => {
    const config = makeConfig({
      noEdges: { config: { IDLE: {} } },
    });

    const result = buildManagerIndexes(config, [], ["noEdges"], (key) => key);

    expect(result.domainAlwaysReduce).toEqual(["noEdges"]);
    expect(result.domainReduceIndex.size).toBe(0);
  });

  it("domain с edges из wildcard '*' source → попадает в domainReduceIndex", () => {
    const config = makeConfig({
      withWildcard: { config: { IDLE: {}, "*": { TICK: null } } },
    });

    const result = buildManagerIndexes(config, [], ["withWildcard"], (key) => key);

    expect(result.domainAlwaysReduce).toEqual([]);
    expect(result.domainReduceIndex.get("TICK")).toEqual(["withWildcard"]);
  });

  it("actor template с wildcard '*' source: НЕ в spawn index, но в actorReduceIndex", () => {
    const config = makeConfig({
      worker: {
        config: { __INIT: { SPAWN: "BUSY" }, BUSY: {}, "*": { CANCEL: "__CANCELLED" } },
      },
    });

    const result = buildManagerIndexes(config, ["worker"], [], (key) => key);

    expect(result.actorReduceIndex.get("CANCEL")).toEqual(["worker"]);
    expect(result.actorSpawnIndex.get("CANCEL")).toBeUndefined();
    expect(result.actorSpawnIndex.get("SPAWN")?.get("worker")).toEqual(["worker"]);
  });

  it("два actor templates с одинаковым __INIT action → оба регистрируются в spawnIndex", () => {
    const config = makeConfig({
      enemy: { config: { __INIT: { ARENA_START: "ALIVE" }, ALIVE: {} }, groupTag: "arena" },
      turret: { config: { __INIT: { ARENA_START: "ALIVE" }, ALIVE: {} }, groupTag: "arena" },
    });

    const result = buildManagerIndexes(
      config,
      ["enemy", "turret"],
      [],
      (key) => (key === "enemy" || key === "turret" ? "arena" : key),
    );

    const arenaGroups = result.actorSpawnIndex.get("ARENA_START");
    expect(arenaGroups).toBeDefined();
    expect(arenaGroups!.get("arena")).toEqual(["enemy", "turret"]);
  });

  it("actor template: __INIT edges НЕ попадают в actorReduceIndex (только не-__INIT)", () => {
    const config = makeConfig({
      worker: { config: { __INIT: { SPAWN: "BUSY" }, BUSY: { DONE: "__RESOLVED" } } },
    });

    const result = buildManagerIndexes(config, ["worker"], [], (key) => key);

    expect(result.actorReduceIndex.get("SPAWN")).toBeUndefined();
    expect(result.actorReduceIndex.get("DONE")).toEqual(["worker"]);
  });
});

describe("createConfigHelpers — unit", () => {
  it("groupTagForTemplate: explicit groupTag приоритетнее, fallback на templateKey", () => {
    const config = makeConfig({
      enemy: { config: { __INIT: {} }, groupTag: "arena" },
      bare: { config: { __INIT: {} } },
    });

    const helpers = createConfigHelpers(config);

    expect(helpers.groupTagForTemplate("enemy")).toBe("arena");
    expect(helpers.groupTagForTemplate("bare")).toBe("bare");
  });

  it("isPublicActorState: __INIT/terminal/неизвестный → false; normal → true", () => {
    const config = makeConfig({
      worker: { config: { __INIT: { SPAWN: "BUSY" }, BUSY: { DONE: "__RESOLVED" } } },
    });

    const helpers = createConfigHelpers(config);

    expect(helpers.isPublicActorState("worker", "__INIT")).toBe(false);
    expect(helpers.isPublicActorState("worker", "__RESOLVED")).toBe(false);
    expect(helpers.isPublicActorState("worker", "__CANCELLED")).toBe(false);
    expect(helpers.isPublicActorState("worker", "__REJECTED")).toBe(false);
    expect(helpers.isPublicActorState("worker", "UNKNOWN")).toBe(false);
    expect(helpers.isPublicActorState("worker", "BUSY")).toBe(true);
  });

  it("hasActorTransition через wildcard source распознаёт actions из '*'", () => {
    const config = makeConfig({
      worker: { config: { __INIT: { SPAWN: "BUSY" }, BUSY: {}, "*": { CANCEL: "__CANCELLED" } } },
    });

    const helpers = createConfigHelpers(config);

    expect(helpers.hasActorTransition("worker", "BUSY", { type: "CANCEL" })).toBe(true);
    expect(helpers.hasActorTransition("worker", "BUSY", { type: "UNKNOWN" })).toBe(false);
  });

  it("hasActorTransition для явного source[actionType] возвращает true", () => {
    const config = makeConfig({
      worker: { config: { __INIT: { SPAWN: "BUSY" }, BUSY: { DONE: "__RESOLVED" } } },
    });

    const helpers = createConfigHelpers(config);

    expect(helpers.hasActorTransition("worker", "BUSY", { type: "DONE" })).toBe(true);
  });
});
