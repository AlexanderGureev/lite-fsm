import { bench, describe } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import type { MachineConfig, MachineStore } from "@lite-fsm/core";

type Event =
  | { type: "SPAWN_ENEMY" }
  | { type: "SPAWN_PROJECTILE" }
  | { type: "SPAWN_NPC" }
  | { type: "TICK" };
type ActorTag = "enemy" | "projectile" | "npc";
type DomainConfig = {
  ACTIVE: { TICK: null };
};
type ActorConfig = {
  __INIT: Partial<Record<Exclude<Event["type"], "TICK">, "ALIVE">>;
  ALIVE: { TICK: null };
};
type CounterContext = { ticks: number; value: number };
type ActorContext = { ticks: number; x: number; y: number };
type GroupSpec = { tag: ActorTag; groups: number; size: number };
type GameEvent =
  | { type: "SPAWN_GAME_ENEMY" }
  | { type: "SPAWN_GAME_PROJECTILE" }
  | { type: "SPAWN_GAME_PROP" }
  | { type: "SPAWN_GAME_EFFECT" }
  | { type: "FRAME"; payload: { dt: number; frame: number } };
type GameActorTag = "enemy" | "projectile" | "prop" | "effect";
type GameDomainConfig = {
  ACTIVE: { FRAME: null };
};
type GameActorConfig = {
  __INIT: Partial<Record<Exclude<GameEvent["type"], "FRAME">, "ACTIVE">>;
  ACTIVE: { FRAME: null };
};
type GameDomainContext = { frame: number; accumulator: number; dirty: number };
type GameActorContext = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  ttl: number;
  renderVersion: number;
};
type GameGroupSpec = { tag: GameActorTag; groups: number; size: number };

const tickAction = { type: "TICK" } satisfies Event;
const frameAction = { type: "FRAME", payload: { dt: 1 / 60, frame: 1 } } satisfies GameEvent;
const spawnByTag = {
  enemy: "SPAWN_ENEMY",
  projectile: "SPAWN_PROJECTILE",
  npc: "SPAWN_NPC",
} satisfies Record<ActorTag, Exclude<Event["type"], "TICK">>;
const spawnGameByTag = {
  enemy: "SPAWN_GAME_ENEMY",
  projectile: "SPAWN_GAME_PROJECTILE",
  prop: "SPAWN_GAME_PROP",
  effect: "SPAWN_GAME_EFFECT",
} satisfies Record<GameActorTag, Exclude<GameEvent["type"], "FRAME">>;

const createDomain = (seed: number) =>
  ({
    config: { ACTIVE: { TICK: null } },
    initialState: "ACTIVE",
    initialContext: { ticks: 0, value: seed },
    reducer: (state, _action, meta) => ({
      state: meta.nextState,
      context: {
        ticks: state.context.ticks + 1,
        value: (state.context.value + 7) & 0xffff,
      },
    }),
  }) satisfies MachineConfig<DomainConfig, CounterContext, Event>;

const createActor = (tag: ActorTag) =>
  ({
    groupTag: tag,
    config: {
      __INIT: { [spawnByTag[tag]]: "ALIVE" } as ActorConfig["__INIT"],
      ALIVE: { TICK: null },
    },
    initialState: "__INIT",
    initialContext: { ticks: 0, x: 1, y: 1 },
    reducer: (state, action, meta) => {
      if (action.type !== "TICK") return { state: meta.nextState, context: state.context };

      return {
        state: meta.nextState,
        context: {
          ticks: state.context.ticks + 1,
          x: state.context.x + 1,
          y: state.context.y + 1,
        },
      };
    },
  }) satisfies MachineConfig<ActorConfig, ActorContext, Event>;

const actorCount = (groups: GroupSpec[]) => groups.reduce((sum, group) => sum + group.groups * group.size, 0);
const groupCount = (groups: GroupSpec[]) => groups.reduce((sum, group) => sum + group.groups, 0);

const createScenario = (domains: number, groups: GroupSpec[]) => {
  const store: MachineStore = {};
  for (let i = 0; i < domains; i += 1) store[`domain${i}`] = createDomain(i);
  for (const tag of new Set(groups.map((group) => group.tag))) store[tag] = createActor(tag);

  const manager = MachineManager<MachineStore, Event>(store);
  const idsByTag = new Map<ActorTag, string[]>();
  const nextGroupByTag = new Map<ActorTag, number>();

  for (const group of groups) {
    const ids = idsByTag.get(group.tag) ?? [];
    idsByTag.set(group.tag, ids);

    for (let g = 0; g < group.groups; g += 1) {
      const groupIndex = nextGroupByTag.get(group.tag) ?? 0;
      const groupId = `${group.tag}/${groupIndex}`;
      nextGroupByTag.set(group.tag, groupIndex + 1);

      manager.transition({ type: spawnByTag[group.tag] });
      ids.push(groupId);

      for (let i = 1; i < group.size; i += 1) {
        manager.transition({ type: spawnByTag[group.tag], meta: { groupId } });
      }
    }
  }

  return {
    manager,
    idsByTag,
    actors: actorCount(groups),
    groups: groupCount(groups),
    domains,
  };
};

const createGameDomain = (seed: number) =>
  ({
    config: { ACTIVE: { FRAME: null } },
    initialState: "ACTIVE",
    initialContext: { frame: 0, accumulator: seed & 0xff, dirty: 0 },
    reducer: (state, action, meta) => {
      if (action.type !== "FRAME") return { state: meta.nextState, context: state.context };

      return {
        state: meta.nextState,
        context: {
          frame: action.payload.frame,
          accumulator: state.context.accumulator + action.payload.dt,
          dirty: (state.context.dirty + seed + action.payload.frame) & 0xffff,
        },
      };
    },
  }) satisfies MachineConfig<GameDomainConfig, GameDomainContext, GameEvent>;

const createGameActor = (tag: GameActorTag) =>
  ({
    groupTag: tag,
    config: {
      __INIT: { [spawnGameByTag[tag]]: "ACTIVE" } as GameActorConfig["__INIT"],
      ACTIVE: { FRAME: null },
    },
    initialState: "__INIT",
    initialContext: { x: 0, y: 0, vx: 1, vy: 1, hp: 100, ttl: 600, renderVersion: 0 },
    reducer: (state, action, meta) => {
      if (action.type !== "FRAME") return { state: meta.nextState, context: state.context };

      const dt = action.payload.dt;
      const speed = tag === "projectile" ? 14 : tag === "effect" ? 4 : tag === "enemy" ? 2 : 0;
      const ttlCost = tag === "projectile" ? 2 : tag === "effect" ? 4 : 1;
      const nextX = state.context.x + state.context.vx * speed * dt;
      const nextY = state.context.y + state.context.vy * speed * dt;

      return {
        state: meta.nextState,
        context: {
          x: nextX,
          y: nextY,
          vx: state.context.vx,
          vy: state.context.vy,
          hp: tag === "enemy" ? state.context.hp - 0.01 : state.context.hp,
          ttl: Math.max(0, state.context.ttl - ttlCost),
          renderVersion: state.context.renderVersion + 1,
        },
      };
    },
  }) satisfies MachineConfig<GameActorConfig, GameActorContext, GameEvent>;

const gameActorCount = (groups: GameGroupSpec[]) => groups.reduce((sum, group) => sum + group.groups * group.size, 0);
const gameGroupCount = (groups: GameGroupSpec[]) => groups.reduce((sum, group) => sum + group.groups, 0);

const createGameLoopScenario = (domains: number, groups: GameGroupSpec[]) => {
  const store: MachineStore = {};
  for (let i = 0; i < domains; i += 1) store[`system${i}`] = createGameDomain(i);
  for (const tag of new Set(groups.map((group) => group.tag))) store[`game_${tag}`] = createGameActor(tag);

  const manager = MachineManager<MachineStore, GameEvent>(store);
  const nextGroupByTag = new Map<GameActorTag, number>();

  for (const group of groups) {
    for (let g = 0; g < group.groups; g += 1) {
      const groupIndex = nextGroupByTag.get(group.tag) ?? 0;
      const groupId = `${group.tag}/${groupIndex}`;
      nextGroupByTag.set(group.tag, groupIndex + 1);

      manager.transition({ type: spawnGameByTag[group.tag] });
      for (let i = 1; i < group.size; i += 1) {
        manager.transition({ type: spawnGameByTag[group.tag], meta: { groupId } });
      }
    }
  }

  return {
    manager,
    actors: gameActorCount(groups),
    groups: gameGroupCount(groups),
    domains,
  };
};

describe("hot-path indexes", () => {
  const boundary5k = createScenario(100, [{ tag: "enemy", groups: 500, size: 10 }]);
  const boundary6k = createScenario(100, [{ tag: "enemy", groups: 600, size: 10 }]);
  const mixed = createScenario(100, [
    { tag: "enemy", groups: 1000, size: 10 },
    { tag: "projectile", groups: 2500, size: 1 },
    { tag: "npc", groups: 100, size: 50 },
  ]);
  const gameLoop = createGameLoopScenario(240, [
    { tag: "enemy", groups: 600, size: 10 },
    { tag: "projectile", groups: 1000, size: 2 },
    { tag: "prop", groups: 500, size: 4 },
    { tag: "effect", groups: 1000, size: 2 },
  ]);
  const domainOnly = createScenario(10_000, []);

  bench(`${boundary5k.domains} domains + ${boundary5k.actors} actors / unscoped tick`, () => {
    boundary5k.manager.transition(tickAction);
  });

  bench(`${boundary6k.domains} domains + ${boundary6k.actors} actors / unscoped tick`, () => {
    boundary6k.manager.transition(tickAction);
  });

  bench(`${mixed.domains} domains + ${mixed.actors} actors across ${mixed.groups} groups / unscoped tick`, () => {
    mixed.manager.transition(tickAction);
  });

  bench("mixed scenario / tag-scoped enemy tick hits 10000 actors", () => {
    mixed.manager.transition({ type: "TICK", meta: { groupTag: "enemy" } });
  });

  bench("mixed scenario / group-scoped tick hits 500 actors", () => {
    mixed.manager.transition({
      type: "TICK",
      meta: { groupId: mixed.idsByTag.get("enemy")!.slice(0, 50) },
    });
  });

  bench(`${gameLoop.domains} game systems + ${gameLoop.actors} actors across ${gameLoop.groups} groups / full frame`, () => {
    gameLoop.manager.transition(frameAction);
  });

  bench(`${domainOnly.domains} domain machines / no actors`, () => {
    domainOnly.manager.transition(tickAction);
  });
});
