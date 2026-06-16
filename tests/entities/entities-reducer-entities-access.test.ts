import { describe, expect, it } from "vitest";

import { LiteFsmError, MachineManager } from "@lite-fsm/core";
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  f32,
  i32,
  spawnEvent,
} from "@lite-fsm/entities";
import type { EntityAccess, EntityIndex } from "@lite-fsm/entities";

type TestReducerMeta = {
  readonly self: any;
  readonly entities: () => any;
  payloadFor(entity: EntityIndex): Record<string, number>;
};

type TestReducer = (
  slice: { readonly state: string; readonly context: Record<string, unknown> },
  action: { readonly type: string },
  meta: TestReducerMeta,
) => void;

const spawnEvents = defineSpawnEvents({
  SPAWN_UNIT: spawnEvent<{
    readonly id: string;
    readonly groupTag: string;
    readonly x: number;
    readonly hp: number;
  }>(),
});

const createMovementActor = (reducer?: TestReducer) => {
  const actor = {
    storage: "entity",
    config: {
      __INIT: { ENTITY_SPAWNED: "READY" },
      READY: { TICK: "READY", ROUTED: "READY" },
    },
    initialState: "__INIT",
    initialContext: {
      x: f32(),
      sampled: i32(),
      spawnSeen: i32(),
    },
    spawnSchema: {
      x: f32(),
    },
  } as const;

  return reducer ? { ...actor, reducer } : actor;
};

const defaultHealthReducer: TestReducer = (_slice, action, { self, payloadFor }) => {
  if (action.type !== "ENTITY_SPAWNED") return;

  for (const entity of self.indices) {
    self.hp[entity] = payloadFor(entity).hp;
  }
};

const createHealthActor = (reducer = defaultHealthReducer) => ({
  storage: "entity",
  config: {
    __INIT: { ENTITY_SPAWNED: "READY" },
    READY: { TICK: "READY", ROUTED: "READY" },
  },
  initialState: "__INIT",
  initialContext: {
    hp: i32(),
  },
  spawnSchema: {
    hp: i32(),
  },
  reducer,
} as const);

const createManager = (movementReducer?: TestReducer, healthReducer = defaultHealthReducer) => {
  const machines = {
    movementActor: createMovementActor(movementReducer),
    healthActor: createHealthActor(healthReducer),
  };
  const spawn = defineEntitySpawn(machines, spawnEvents)({
    SPAWN_UNIT: (payload) => ({
      id: payload.id,
      groupTag: payload.groupTag,
      actors: {
        healthActor: { hp: payload.hp },
        movementActor: { x: payload.x },
      },
    }),
  });

  const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
  return { manager, machines };
};

const spawnUnit = (
  manager: ReturnType<typeof createManager>["manager"],
  id: string,
  x: number,
  hp: number,
  groupTag = "unit",
): void => {
  manager.transition({ type: "SPAWN_UNIT", payload: { id, groupTag, x, hp } });
};

type EcsActorKey = "commandActor" | "movementActor" | "combatActor" | "healthActor";

type OrderedEcsReducer = (
  slice: { readonly state: string; readonly context: Record<string, unknown> },
  action: { readonly type: string },
  meta: TestReducerMeta,
) => void;

const ecsSpawnEvents = defineSpawnEvents({
  SPAWN_ECS: spawnEvent<{
    readonly id: string;
    readonly groupTag: string;
    readonly x: number;
    readonly hp: number;
    readonly dx: number;
    readonly damage: number;
    readonly withHealth: boolean;
    readonly withCombat: boolean;
  }>(),
});

const commandReducer: OrderedEcsReducer = (_slice, action, { self, entities, payloadFor }) => {
  if (action.type === "ENTITY_SPAWNED") {
    for (const entity of self.indices) self.dx[entity] = payloadFor(entity).dx;
    return;
  }

  if (action.type !== "TICK") return;

  const health = entities().get("healthActor");
  const combat = entities().get("combatActor");
  for (const entity of self.indices) {
    self.dx[entity] += 1;
    self.stateCode[entity] = self.states.ACTIVE;
    self.healthPresent[entity] = health.has(entity) ? 1 : 0;
    self.hpSeen[entity] = health.has(entity) ? health.hp[entity] : -1;
    self.combatSeen[entity] = combat.has(entity) ? combat.damage[entity] : -1;
  }
};

const movementReducer: OrderedEcsReducer = (_slice, action, { self, entities, payloadFor }) => {
  if (action.type === "ENTITY_SPAWNED") {
    for (const entity of self.indices) self.x[entity] = payloadFor(entity).x;
    return;
  }

  if (action.type !== "TICK") return;

  const command = entities().get("commandActor");
  const combat = entities().get("combatActor");
  for (const entity of self.indices) {
    self.commandSeen[entity] = command.dx[entity];
    self.commandStateSeen[entity] = command.state(entity) === "ACTIVE" ? 1 : 0;
    self.combatPresent[entity] = combat.has(entity) ? 1 : 0;
    self.combatSeen[entity] = combat.has(entity) ? combat.damage[entity] : -1;
    self.x[entity] += command.dx[entity];
  }
};

const combatReducer: OrderedEcsReducer = (_slice, action, { self, entities, payloadFor }) => {
  if (action.type === "ENTITY_SPAWNED") {
    for (const entity of self.indices) self.damage[entity] = payloadFor(entity).damage;
    return;
  }

  if (action.type !== "TICK") return;

  const command = entities().get("commandActor");
  const health = entities().get("healthActor");
  const movement = entities().get("movementActor");
  for (const entity of self.indices) {
    self.commandSeen[entity] = command.dx[entity];
    self.healthSeen[entity] = health.has(entity) ? health.hp[entity] : -1;
    self.xSeen[entity] = movement.has(entity) ? movement.x[entity] : -1;
    self.damage[entity] = command.dx[entity];
  }
};

const healthReducer: OrderedEcsReducer = (_slice, action, { self, entities, payloadFor }) => {
  if (action.type === "ENTITY_SPAWNED") {
    for (const entity of self.indices) self.hp[entity] = payloadFor(entity).hp;
    return;
  }

  if (action.type !== "TICK") return;

  const movement = entities().get("movementActor");
  const combat = entities().get("combatActor");
  const command = entities().get("commandActor");
  for (const entity of self.indices) {
    self.xSeen[entity] = movement.has(entity) ? movement.x[entity] : -1;
    self.damageSeen[entity] = combat.has(entity) ? combat.damage[entity] : -1;
    self.commandSeen[entity] = command.dx[entity];
    self.hp[entity] -= combat.has(entity) ? combat.damage[entity] : 0;
  }
};

const createCommandActor = () => ({
  storage: "entity",
  config: {
    __INIT: { ENTITY_SPAWNED: "READY" },
    READY: { TICK: "READY" },
    ACTIVE: { TICK: "ACTIVE" },
  },
  initialState: "__INIT",
  initialContext: {
    dx: i32(),
    hpSeen: i32(),
    combatSeen: i32(),
    healthPresent: i32(),
  },
  spawnSchema: { dx: i32() },
  reducer: commandReducer,
} as const);

const createOrderedMovementActor = () => ({
  storage: "entity",
  config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
  initialState: "__INIT",
  initialContext: {
    x: f32(),
    commandSeen: i32(),
    commandStateSeen: i32(),
    combatSeen: i32(),
    combatPresent: i32(),
  },
  spawnSchema: { x: f32() },
  reducer: movementReducer,
} as const);

const createCombatActor = () => ({
  storage: "entity",
  config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
  initialState: "__INIT",
  initialContext: {
    damage: i32(),
    commandSeen: i32(),
    healthSeen: i32(),
    xSeen: i32(),
  },
  spawnSchema: { damage: i32() },
  reducer: combatReducer,
} as const);

const createOrderedHealthActor = () => ({
  storage: "entity",
  config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
  initialState: "__INIT",
  initialContext: {
    hp: i32(),
    xSeen: i32(),
    damageSeen: i32(),
    commandSeen: i32(),
  },
  spawnSchema: { hp: i32() },
  reducer: healthReducer,
} as const);

const createOrderedEcsActors = () => ({
  commandActor: createCommandActor(),
  movementActor: createOrderedMovementActor(),
  combatActor: createCombatActor(),
  healthActor: createOrderedHealthActor(),
});

const createOrderedEcsManager = (order: readonly EcsActorKey[] = [
  "commandActor",
  "movementActor",
  "combatActor",
  "healthActor",
]) => {
  const actors = createOrderedEcsActors();
  const machines = Object.fromEntries(order.map((key) => [key, actors[key]])) as ReturnType<
    typeof createOrderedEcsActors
  >;
  const spawn = defineEntitySpawn(machines, ecsSpawnEvents)({
    SPAWN_ECS: (payload) => {
      const spawnedActors: Record<string, Record<string, number>> = {
        commandActor: { dx: payload.dx },
        movementActor: { x: payload.x },
      };
      if (payload.withCombat) spawnedActors.combatActor = { damage: payload.damage };
      if (payload.withHealth) spawnedActors.healthActor = { hp: payload.hp };

      return {
        id: payload.id,
        groupTag: payload.groupTag,
        actors: spawnedActors,
      };
    },
  });

  const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
  return { manager, machines };
};

const spawnEcsEntity = (
  manager: ReturnType<typeof createOrderedEcsManager>["manager"],
  id: string,
  options: {
    readonly x?: number;
    readonly hp?: number;
    readonly dx?: number;
    readonly damage?: number;
    readonly withHealth?: boolean;
    readonly withCombat?: boolean;
    readonly groupTag?: string;
  } = {},
): void => {
  manager.transition({
    type: "SPAWN_ECS",
    payload: {
      id,
      groupTag: options.groupTag ?? "unit",
      x: options.x ?? 10,
      hp: options.hp ?? 20,
      dx: options.dx ?? 2,
      damage: options.damage ?? 1,
      withHealth: options.withHealth ?? true,
      withCombat: options.withCombat ?? true,
    },
  });
};

const expectLiteFsmError = (run: () => unknown, code: LiteFsmError["code"]): LiteFsmError => {
  let caught: unknown;

  try {
    run();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(LiteFsmError);
  expect((caught as LiteFsmError).code).toBe(code);
  return caught as LiteFsmError;
};

describe("@lite-fsm/entities — reducer entities() access", () => {
  it("reducer читает другой entity store через entities().get(...) и мутирует только self", () => {
    const { manager } = createManager((_slice, action, { self, entities, payloadFor }) => {
      if (action.type === "ENTITY_SPAWNED") {
        for (const entity of self.indices) self.x[entity] = payloadFor(entity).x;
        return;
      }

      if (action.type !== "TICK") return;

      const health = entities().get("healthActor");
      for (const entity of self.indices) {
        self.sampled[entity] = health.hp[entity];
        if (health.hp[entity] > 0) self.x[entity] += 1;
      }
    });
    manager.setDependencies({
      entities() {
        throw new Error("deps entities provider must not be used by reducer entities()");
      },
    } as never);

    spawnUnit(manager, "unit/a", 10, 3);
    const health = manager.entities().get("healthActor");
    const hpBefore = health.hp[0 as EntityIndex];

    manager.transition({ type: "TICK" });

    const movement = manager.entities().get("movementActor");
    expect(movement.x[0 as EntityIndex]).toBe(11);
    expect(movement.sampled[0 as EntityIndex]).toBe(3);
    expect(health.hp[0 as EntityIndex]).toBe(hpBefore);
  });

  it("entities() возвращает тот же root access object, что manager.entities(), и остается stable", () => {
    let firstAccess: EntityAccess<any> | undefined;
    let secondAccess: EntityAccess<any> | undefined;
    const { manager } = createManager((_slice, action, { self, entities, payloadFor }) => {
      if (action.type === "ENTITY_SPAWNED") {
        for (const entity of self.indices) self.x[entity] = payloadFor(entity).x;
        return;
      }

      if (action.type !== "TICK") return;

      firstAccess = entities();
      secondAccess = entities();
    });

    spawnUnit(manager, "unit/a", 1, 1);
    const managerAccess = manager.entities();
    manager.transition({ type: "TICK" });

    expect(firstAccess).toBe(managerAccess);
    expect(secondAccess).toBe(firstAccess);
  });

  it("reducer читает entities() на ENTITY_SPAWNED", () => {
    const observations: number[] = [];
    const { manager } = createManager((_slice, action, { self, entities, payloadFor }) => {
      if (action.type !== "ENTITY_SPAWNED") return;

      const health = entities().get("healthActor");
      for (const entity of self.indices) {
        observations.push(health.hp[entity]);
        self.spawnSeen[entity] = health.hp[entity];
        self.x[entity] = payloadFor(entity).x;
      }
    });

    spawnUnit(manager, "unit/a", 4, 12);

    const movement = manager.entities().get("movementActor");
    expect(observations).toEqual([12]);
    expect(movement.spawnSeen[0 as EntityIndex]).toBe(12);
  });

  it("reducer читает entities() в routed transition", () => {
    const routed: string[] = [];
    const { manager } = createManager((_slice, action, { self, entities, payloadFor }) => {
      if (action.type === "ENTITY_SPAWNED") {
        for (const entity of self.indices) self.x[entity] = payloadFor(entity).x;
        return;
      }

      if (action.type !== "ROUTED") return;

      const health = entities().get("healthActor");
      for (const entity of self.indices) {
        routed.push(`${self.entityId(entity)}:${health.hp[entity]}`);
        self.sampled[entity] = health.hp[entity];
      }
    });

    spawnUnit(manager, "unit/a", 1, 5);
    spawnUnit(manager, "unit/b", 2, 7);
    manager.transition({ type: "ROUTED", meta: { entityId: "unit/b" } } as never);

    const movement = manager.entities().get("movementActor");
    expect(routed).toEqual(["unit/b:7"]);
    expect(movement.sampled[0 as EntityIndex]).toBe(0);
    expect(movement.sampled[1 as EntityIndex]).toBe(7);
  });

  it("entities().get(currentKey) видит live writes текущего reducer", () => {
    const { manager } = createManager((_slice, action, { self, entities, payloadFor }) => {
      if (action.type === "ENTITY_SPAWNED") {
        for (const entity of self.indices) self.x[entity] = payloadFor(entity).x;
        return;
      }

      if (action.type !== "TICK") return;

      const movement = entities().get("movementActor");
      for (const entity of self.indices) {
        self.x[entity] += 5;
        self.sampled[entity] = movement.x[entity];
      }
    });

    spawnUnit(manager, "unit/a", 1, 1);
    manager.transition({ type: "TICK" });

    const movement = manager.entities().get("movementActor");
    expect(movement.x[0 as EntityIndex]).toBe(6);
    expect(movement.sampled[0 as EntityIndex]).toBe(6);
  });

  it("ordered entity reducers читают live writes предыдущих machines и future machine как текущее значение", () => {
    const { manager } = createOrderedEcsManager();

    spawnEcsEntity(manager, "unit/a");
    spawnEcsEntity(manager, "unit/scout", { withHealth: false, withCombat: false });
    expect(() => manager.transition({ type: "TICK" })).not.toThrow();

    const access = manager.entities();
    const command = access.get("commandActor");
    const movement = access.get("movementActor");
    const combat = access.get("combatActor");
    const health = access.get("healthActor");

    expect(command.dx[0 as EntityIndex]).toBe(3);
    expect(command.state(0 as EntityIndex)).toBe("ACTIVE");
    expect(command.hpSeen[0 as EntityIndex]).toBe(20);
    expect(command.combatSeen[0 as EntityIndex]).toBe(1);
    expect(movement.commandSeen[0 as EntityIndex]).toBe(3);
    expect(movement.commandStateSeen[0 as EntityIndex]).toBe(1);
    expect(movement.combatSeen[0 as EntityIndex]).toBe(1);
    expect(movement.x[0 as EntityIndex]).toBe(13);
    expect(combat.commandSeen[0 as EntityIndex]).toBe(3);
    expect(combat.healthSeen[0 as EntityIndex]).toBe(20);
    expect(combat.xSeen[0 as EntityIndex]).toBe(13);
    expect(combat.damage[0 as EntityIndex]).toBe(3);
    expect(health.xSeen[0 as EntityIndex]).toBe(13);
    expect(health.damageSeen[0 as EntityIndex]).toBe(3);
    expect(health.commandSeen[0 as EntityIndex]).toBe(3);
    expect(health.hp[0 as EntityIndex]).toBe(17);

    expect(command.healthPresent[1 as EntityIndex]).toBe(0);
    expect(command.hpSeen[1 as EntityIndex]).toBe(-1);
    expect(movement.combatPresent[1 as EntityIndex]).toBe(0);
    expect(movement.combatSeen[1 as EntityIndex]).toBe(-1);
    expect(combat.has(1 as EntityIndex)).toBe(false);
    expect(health.has(1 as EntityIndex)).toBe(false);
  });

  it("reverse machines order меняет наблюдаемый live результат", () => {
    const { manager } = createOrderedEcsManager([
      "healthActor",
      "combatActor",
      "movementActor",
      "commandActor",
    ]);

    spawnEcsEntity(manager, "unit/a");
    manager.transition({ type: "TICK" });

    const access = manager.entities();
    const command = access.get("commandActor");
    const movement = access.get("movementActor");
    const combat = access.get("combatActor");
    const health = access.get("healthActor");

    expect(health.xSeen[0 as EntityIndex]).toBe(10);
    expect(health.damageSeen[0 as EntityIndex]).toBe(1);
    expect(health.commandSeen[0 as EntityIndex]).toBe(2);
    expect(health.hp[0 as EntityIndex]).toBe(19);
    expect(combat.commandSeen[0 as EntityIndex]).toBe(2);
    expect(combat.healthSeen[0 as EntityIndex]).toBe(19);
    expect(combat.xSeen[0 as EntityIndex]).toBe(10);
    expect(combat.damage[0 as EntityIndex]).toBe(2);
    expect(movement.commandSeen[0 as EntityIndex]).toBe(2);
    expect(movement.commandStateSeen[0 as EntityIndex]).toBe(0);
    expect(movement.combatSeen[0 as EntityIndex]).toBe(2);
    expect(movement.x[0 as EntityIndex]).toBe(12);
    expect(command.dx[0 as EntityIndex]).toBe(3);
    expect(command.hpSeen[0 as EntityIndex]).toBe(19);
    expect(command.combatSeen[0 as EntityIndex]).toBe(2);
    expect(command.state(0 as EntityIndex)).toBe("ACTIVE");
  });

  it("dehydrate и hydrate сохраняют cross-read columns, presence, stateCode и public slices", () => {
    const source = createOrderedEcsManager();
    spawnEcsEntity(source.manager, "unit/a");
    spawnEcsEntity(source.manager, "unit/scout", { withHealth: false, withCombat: false });
    source.manager.transition({ type: "TICK" });

    const snapshot = JSON.parse(JSON.stringify(source.manager.dehydrate())) as any;
    const storage = snapshot.storage.entity;
    expect(snapshot.machines.commandActor).toMatchObject({ storage: "entity", count: 2, capacity: 2 });
    expect(snapshot.machines.healthActor).toMatchObject({ storage: "entity", count: 1, capacity: 1 });
    expect(storage.actors.commandActor.presence).toEqual([1, 1]);
    expect(storage.actors.commandActor.stateCode).toEqual([1, 1]);
    expect(storage.actors.commandActor.columns.dx).toEqual([3, 3]);
    expect(storage.actors.movementActor.columns.x).toEqual([13, 13]);
    expect(storage.actors.movementActor.columns.commandStateSeen).toEqual([1, 1]);
    expect(storage.actors.combatActor.presence).toEqual([1]);
    expect(storage.actors.combatActor.columns.damage).toEqual([3]);
    expect(storage.actors.healthActor.presence).toEqual([1]);
    expect(storage.actors.healthActor.columns.hp).toEqual([17]);

    const target = createOrderedEcsManager();
    target.manager.hydrate(snapshot);

    const access = target.manager.entities();
    const command = access.get("commandActor");
    const movement = access.get("movementActor");
    const combat = access.get("combatActor");
    const health = access.get("healthActor");
    const publicState = (target.manager.getSnapshot() as any).machines;
    expect(publicState.commandActor).toMatchObject({ storage: "entity", count: 2, capacity: 2 });
    expect(publicState.healthActor).toMatchObject({ storage: "entity", count: 1, capacity: 1 });
    expect(command.state(0 as EntityIndex)).toBe("ACTIVE");
    expect(command.state(1 as EntityIndex)).toBe("ACTIVE");
    expect(command.dx[0 as EntityIndex]).toBe(3);
    expect(movement.x[0 as EntityIndex]).toBe(13);
    expect(movement.commandStateSeen[1 as EntityIndex]).toBe(1);
    expect(combat.has(0 as EntityIndex)).toBe(true);
    expect(combat.has(1 as EntityIndex)).toBe(false);
    expect(combat.damage[0 as EntityIndex]).toBe(3);
    expect(health.has(0 as EntityIndex)).toBe(true);
    expect(health.has(1 as EntityIndex)).toBe(false);
    expect(health.hp[0 as EntityIndex]).toBe(17);
  });

  it("payloadFor(entity) сохраняет ошибку вне ENTITY_SPAWNED при наличии entities()", () => {
    const { manager } = createManager((_slice, action, { self, entities, payloadFor }) => {
      if (action.type === "ENTITY_SPAWNED") {
        for (const entity of self.indices) self.x[entity] = payloadFor(entity).x;
        return;
      }

      if (action.type !== "TICK") return;

      entities().get("healthActor");
      payloadFor(self.indices[0]);
    });

    spawnUnit(manager, "unit/a", 1, 1);
    const error = expectLiteFsmError(() => manager.transition({ type: "TICK" }), "LITE_FSM_INVALID_STORAGE_RUNTIME");

    expect(error.message).toContain("payloadFor(entity)");
    expect(error.message).toContain("ENTITY_SPAWNED");
  });

  it("Promise result из reducer бросает clear LiteFsmError", () => {
    const { manager } = createManager((_slice, action) => {
      if (action.type === "TICK") return Promise.resolve() as never;
    });

    spawnUnit(manager, "unit/a", 1, 1);
    const error = expectLiteFsmError(() => manager.transition({ type: "TICK" }), "LITE_FSM_INVALID_STORAGE_RUNTIME");

    expect(error.message).toContain("reducer for actor 'movementActor'");
    expect(error.message).toContain("event 'TICK'");
    expect(error.message).toContain("entity reducers are sync-only");
  });
});
