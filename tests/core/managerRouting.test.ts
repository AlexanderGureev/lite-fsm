import { describe, expect, it, vi } from "vitest";

import { createRoutingResolver } from "@lite-fsm/core/internal/managerRouting";
import {
  addActorToGroupIndexes,
  createSidecarState,
  type SidecarState,
} from "@lite-fsm/core/internal/sidecar";
import { createActorMeta, type ActorIdentity, type ActorRuntime } from "@lite-fsm/core/internal/actor";

const makeActor = (
  templateKey: string,
  actorId: string,
  groupId = actorId,
  groupTag = templateKey,
): ActorRuntime => ({
  templateKey,
  meta: createActorMeta({ actorId, groupId, groupTag }),
  bag: new Map(),
});

const seed = (sidecar: SidecarState, actor: ActorRuntime) => {
  sidecar.actorById.set(actor.meta.actorId, actor);
  addActorToGroupIndexes(sidecar, actor);
  return actor;
};

const makeResolver = (
  sidecar: SidecarState,
  options: {
    actorTemplateKeys?: readonly string[];
    actorReduceIndex?: Map<string, string[]>;
    actorSpawnIndex?: Map<string, Map<string, string[]>>;
  } = {},
) =>
  createRoutingResolver({
    sidecar,
    actorTemplateKeys: options.actorTemplateKeys ?? ["worker"],
    actorReduceIndex: options.actorReduceIndex ?? new Map([["TICK", ["worker"]]]),
    actorSpawnIndex: options.actorSpawnIndex ?? new Map(),
    spawnIdConfig: { originId: undefined, generateActorId: undefined, generateGroupId: undefined },
  });

describe("forEachRoutedIdentity — unit", () => {
  describe("actor scope", () => {
    it("без pending: посещает только live actors по actorId; missing skip", () => {
      const sidecar = createSidecarState();
      const live = seed(sidecar, makeActor("worker", "worker/0"));
      seed(sidecar, makeActor("worker", "worker/1"));

      const visit = vi.fn();
      const resolver = makeResolver(sidecar);

      resolver.forEachRoutedIdentity("actor", ["worker/0", "missing/x"], [], { type: "TICK" }, visit);

      expect(visit).toHaveBeenCalledOnce();
      expect(visit).toHaveBeenCalledWith(live);
    });

    it("с pending: actor scope не учитывает pendingSpawned (только live)", () => {
      const sidecar = createSidecarState();
      const pending: ActorIdentity = {
        templateKey: "worker",
        meta: createActorMeta({ actorId: "worker/5", groupId: "worker/5", groupTag: "worker" }),
      };

      const visit = vi.fn();
      makeResolver(sidecar).forEachRoutedIdentity("actor", ["worker/5"], [pending], { type: "TICK" }, visit);

      expect(visit).not.toHaveBeenCalled();
    });
  });

  describe("group scope", () => {
    it("без pending: посещает live actors target групп", () => {
      const sidecar = createSidecarState();
      seed(sidecar, makeActor("worker", "worker/0", "g/0", "worker"));
      const other = seed(sidecar, makeActor("worker", "worker/1", "g/1", "worker"));

      const visit = vi.fn();
      makeResolver(sidecar).forEachRoutedIdentity("group", ["g/1"], [], { type: "TICK" }, visit);

      expect(visit).toHaveBeenCalledOnce();
      expect(visit).toHaveBeenCalledWith(other);
    });

    it("с pending: pending с groupId вне targetSet пропускается через isPendingInScope", () => {
      const sidecar = createSidecarState();
      seed(sidecar, makeActor("worker", "worker/0", "g/0", "worker"));
      const pendingIn: ActorIdentity = {
        templateKey: "worker",
        meta: createActorMeta({ actorId: "worker/1", groupId: "g/0", groupTag: "worker" }),
      };
      const pendingOut: ActorIdentity = {
        templateKey: "worker",
        meta: createActorMeta({ actorId: "worker/2", groupId: "g/x", groupTag: "worker" }),
      };

      const visit = vi.fn();
      makeResolver(sidecar).forEachRoutedIdentity(
        "group",
        ["g/0"],
        [pendingIn, pendingOut],
        { type: "TICK" },
        visit,
      );

      const visited = visit.mock.calls.map(([id]) => (id as ActorIdentity).meta.actorId);
      expect(visited).toContain("worker/0");
      expect(visited).toContain("worker/1");
      expect(visited).not.toContain("worker/2");
    });
  });

  describe("tag scope", () => {
    it("без pending + tag без actors: visit не вызывается", () => {
      const sidecar = createSidecarState();
      seed(sidecar, makeActor("worker", "worker/0"));

      const visit = vi.fn();
      makeResolver(sidecar).forEachRoutedIdentity("tag", ["missingTag"], [], { type: "TICK" }, visit);

      expect(visit).not.toHaveBeenCalled();
    });

    it("с pending: live + pending в одном tag посещаются", () => {
      const sidecar = createSidecarState();
      const live = seed(sidecar, makeActor("worker", "worker/0", "g/0", "worker"));
      const pending: ActorIdentity = {
        templateKey: "worker",
        meta: createActorMeta({ actorId: "worker/1", groupId: "g/1", groupTag: "worker" }),
      };

      const visit = vi.fn();
      makeResolver(sidecar).forEachRoutedIdentity("tag", ["worker"], [pending], { type: "TICK" }, visit);

      const visited = visit.mock.calls.map(([id]) => (id as ActorIdentity).meta.actorId);
      expect(visited).toEqual([live.meta.actorId, "worker/1"]);
    });
  });

  describe("unscoped scope", () => {
    it("без pending: обходит всех live actors из actorReduceIndex", () => {
      const sidecar = createSidecarState();
      seed(sidecar, makeActor("worker", "worker/0"));
      seed(sidecar, makeActor("worker", "worker/1"));

      const visit = vi.fn();
      makeResolver(sidecar).forEachRoutedIdentity("unscoped", [], [], { type: "TICK" }, visit);

      expect(visit).toHaveBeenCalledTimes(2);
    });

    it("с pending: live actors того же template обходятся раньше pending (порядок)", () => {
      const sidecar = createSidecarState();
      seed(sidecar, makeActor("worker", "worker/0"));
      const pending: ActorIdentity = {
        templateKey: "worker",
        meta: createActorMeta({ actorId: "worker/9", groupId: "worker/9", groupTag: "worker" }),
      };

      const visit = vi.fn();
      makeResolver(sidecar).forEachRoutedIdentity("unscoped", [], [pending], { type: "TICK" }, visit);

      const order = visit.mock.calls.map(([id]) => (id as ActorIdentity).meta.actorId);
      expect(order).toEqual(["worker/0", "worker/9"]);
    });

    it("action не в actorReduceIndex: pending всё равно обходится (если template в actorTemplateKeys)", () => {
      const sidecar = createSidecarState();
      const pending: ActorIdentity = {
        templateKey: "worker",
        meta: createActorMeta({ actorId: "worker/0", groupId: "worker/0", groupTag: "worker" }),
      };

      const visit = vi.fn();
      makeResolver(sidecar, {
        actorReduceIndex: new Map(),
      }).forEachRoutedIdentity("unscoped", [], [pending], { type: "TICK" }, visit);

      expect(visit).toHaveBeenCalledOnce();
      expect(visit.mock.calls[0][0]).toMatchObject({ meta: { actorId: "worker/0" } });
    });
  });

  describe("resolveSpawnGroups", () => {
    it("scope 'group': возвращает {groupId, groupTag} существующих групп; missing skip", () => {
      const sidecar = createSidecarState();
      seed(sidecar, makeActor("worker", "worker/0", "g/0", "tagA"));

      const resolver = makeResolver(sidecar);
      const groups = resolver.resolveSpawnGroups(
        "group",
        ["g/0", "g/missing"],
        { countersBase: sidecar.counters, pendingSpawned: [], pendingDelivered: [], pendingDeleted: [], touchedActorRecords: new Map(), effectsTargets: [], normalizeOpts: {} } as never,
        { type: "SPAWN" },
      );

      expect(groups).toEqual([{ groupId: "g/0", groupTag: "tagA" }]);
    });

    it("scope 'tag': все группы каждого target-тега", () => {
      const sidecar = createSidecarState();
      seed(sidecar, makeActor("worker", "w/0", "g/0", "tagA"));
      seed(sidecar, makeActor("worker", "w/1", "g/1", "tagA"));

      const resolver = makeResolver(sidecar);
      const groups = resolver.resolveSpawnGroups(
        "tag",
        ["tagA", "missingTag"],
        { countersBase: sidecar.counters, pendingSpawned: [], pendingDelivered: [], pendingDeleted: [], touchedActorRecords: new Map(), effectsTargets: [], normalizeOpts: {} } as never,
        { type: "SPAWN" },
      );

      expect(groups).toEqual([
        { groupId: "g/0", groupTag: "tagA" },
        { groupId: "g/1", groupTag: "tagA" },
      ]);
    });
  });
});
