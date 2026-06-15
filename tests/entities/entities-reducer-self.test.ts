import { describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  f32,
  spawnEvent,
  string as stringColumn,
} from "@lite-fsm/entities";
import type { EntityIndex } from "@lite-fsm/entities";

import { importEntitySnapshotPreview } from "../../packages/entities/src/runtime/snapshot";
import { getEntityRuntimeState } from "../../packages/entities/src/runtime/state";

type TestReducerSelf = {
  readonly indices: readonly EntityIndex[];
  readonly states: Record<"idle" | "moving" | "paused", number>;
  readonly presence: Uint8Array;
  readonly stateCode: Int16Array;
  readonly prevStateCode: Int16Array;
  readonly rowVersion: Uint32Array;
  readonly x: Float32Array;
  readonly label: string[];
  has(entity: EntityIndex): boolean;
  entityId(entity: EntityIndex): string;
};

type TestReducerMeta = {
  readonly nextState: string;
  readonly self: TestReducerSelf;
  payloadFor(entity: EntityIndex): { readonly x: number };
};

type TestReducer = (
  slice: { readonly state: string; readonly context: Record<string, unknown> },
  action: { readonly type: string },
  meta: TestReducerMeta,
) => void;

const createSpawnEvents = () =>
  defineSpawnEvents({
    SPAWN: spawnEvent<{ readonly id: string; readonly x: number }>(),
  });

const createActor = (reducer?: TestReducer) => {
  const actor = {
    storage: "entity",
    config: {
      __INIT: { ENTITY_SPAWNED: "idle" },
      idle: { START: "moving", TICK: "idle" },
      moving: {},
      paused: {},
    },
    initialState: "__INIT",
    initialContext: {
      x: f32(),
      label: stringColumn({ default: "idle" }),
    },
    spawnSchema: {
      x: f32(),
    },
  } as const;

  return reducer ? { ...actor, reducer } : actor;
};

const createManager = (reducer?: TestReducer) => {
  const machines = { actor: createActor(reducer) };
  const spawnEvents = createSpawnEvents();
  const spawn = defineEntitySpawn(machines, spawnEvents)({
    SPAWN: (payload) => ({
      id: payload.id,
      groupTag: "units",
      actors: {
        actor: { x: payload.x },
      },
    }),
  });

  const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
  return { manager, machines };
};

const spawnEntity = (manager: ReturnType<typeof createManager>["manager"], id: string, x: number): void => {
  manager.transition({ type: "SPAWN", payload: { id, x } });
};

describe("@lite-fsm/entities — stable reducer self и default transition fast path", () => {
  it("config-default transition применяется до reducer", () => {
    const observations: Array<{ readonly nextState: string; readonly previous: number; readonly current: number }> = [];
    const { manager } = createManager((_slice, action, { nextState, self }) => {
      if (action.type !== "START") return;

      const entity = self.indices[0];
      observations.push({
        nextState,
        previous: self.prevStateCode[entity],
        current: self.stateCode[entity],
      });
    });

    spawnEntity(manager, "unit/a", 1);
    manager.transition({ type: "START" });

    expect(observations).toEqual([
      {
        nextState: "moving",
        previous: 0,
        current: 1,
      },
    ]);
    expect(manager.entities().get("actor").state(0 as EntityIndex)).toBe("moving");
  });

  it("reducer rollback через self.prevStateCode сохраняет state", () => {
    const { manager } = createManager((_slice, action, { self }) => {
      if (action.type !== "START") return;

      for (const entity of self.indices) {
        self.stateCode[entity] = self.prevStateCode[entity];
      }
    });

    spawnEntity(manager, "unit/a", 1);
    manager.transition({ type: "START" });

    expect(manager.entities().get("actor").state(0 as EntityIndex)).toBe("idle");
  });

  it("reducer override через self.states меняет state после identity default transition", () => {
    const { manager } = createManager((_slice, action, { nextState, self }) => {
      if (action.type !== "TICK") return;

      expect(nextState).toBe("idle");
      for (const entity of self.indices) {
        expect(self.prevStateCode[entity]).toBe(self.states.idle);
        expect(self.stateCode[entity]).toBe(self.states.idle);
        self.stateCode[entity] = self.states.paused;
      }
    });

    spawnEntity(manager, "unit/a", 1);
    manager.transition({ type: "TICK" });

    expect(manager.entities().get("actor").state(0 as EntityIndex)).toBe("paused");
  });

  it("cached self получает актуальные columns после capacity growth", () => {
    const selfRefs: TestReducerSelf[] = [];
    const columnRefs: Float32Array[] = [];
    const { manager } = createManager((_slice, action, { self, payloadFor }) => {
      if (action.type !== "ENTITY_SPAWNED") return;

      selfRefs.push(self);
      columnRefs.push(self.x);
      for (const entity of self.indices) {
        self.x[entity] = payloadFor(entity).x;
      }
    });

    spawnEntity(manager, "unit/a", 10);
    const runtime = getEntityRuntimeState(manager.entities());
    const firstColumn = runtime.actorStores.actor.columns.x;
    const actorView = manager.entities().get("actor");
    const firstViewColumn = actorView.x;
    const descriptor = Object.getOwnPropertyDescriptor(actorView, "x");

    spawnEntity(manager, "unit/b", 20);

    expect(selfRefs[1]).toBe(selfRefs[0]);
    expect(columnRefs[0]).toBe(firstColumn);
    expect(columnRefs[1]).toBe(runtime.actorStores.actor.columns.x);
    expect(columnRefs[1]).not.toBe(firstColumn);
    expect(descriptor?.get).toBeUndefined();
    expect(descriptor?.writable).toBe(false);
    expect(actorView.x).toBe(runtime.actorStores.actor.columns.x);
    expect(actorView.x).not.toBe(firstViewColumn);
    expect(actorView.x[1 as EntityIndex]).toBe(20);
  });

  it("cached self получает актуальные columns после hydrate", () => {
    const source = createManager((_slice, action, { self, payloadFor }) => {
      if (action.type !== "ENTITY_SPAWNED") return;

      for (const entity of self.indices) {
        self.x[entity] = payloadFor(entity).x;
      }
    });
    spawnEntity(source.manager, "unit/a", 42);
    const snapshot = JSON.parse(JSON.stringify(source.manager.dehydrate()));

    let runtime: ReturnType<typeof getEntityRuntimeState>;
    const observed: number[] = [];
    const target = createManager((_slice, action, { self }) => {
      if (action.type !== "TICK") return;

      expect(self.x).toBe(runtime.actorStores.actor.columns.x);
      for (const entity of self.indices) {
        observed.push(self.x[entity]);
        self.x[entity] += 1;
      }
    });
    runtime = getEntityRuntimeState(target.manager.entities());
    const preview = importEntitySnapshotPreview(runtime, snapshot.storage.entity);
    expect(preview.actorStores.actor.columns.x[0]).toBe(42);
    const actorView = target.manager.entities().get("actor");
    const preHydrateColumn = actorView.x;

    target.manager.hydrate(snapshot);
    target.manager.transition({ type: "TICK" });

    expect(observed).toEqual([42]);
    expect(actorView.x).toBe(runtime.actorStores.actor.columns.x);
    expect(actorView.x).not.toBe(preHydrateColumn);
    expect(target.manager.entities().get("actor").x[0 as EntityIndex]).toBe(43);
  });

  it("dehydrate использует default для undefined present string column", () => {
    const { manager } = createManager();
    spawnEntity(manager, "unit/a", 1);
    const runtime = getEntityRuntimeState(manager.entities());
    (runtime.actorStores.actor.columns.label as string[])[0] = undefined as unknown as string;

    const snapshot = manager.dehydrate() as any;

    expect(snapshot.storage.entity.actors.actor.columns.label).toEqual(["idle"]);
  });

  it("generic default transition сохраняет invalid source state diagnostic", () => {
    const { manager } = createManager();
    spawnEntity(manager, "unit/a", 1);
    const runtime = getEntityRuntimeState(manager.entities());
    runtime.actorStores.actor.stateCode[0] = 99;

    expect(() => manager.transition({ type: "START" })).toThrow(
      "actor 'actor' has invalid stateCode 99 for entity 0",
    );
  });

  it("cached self получает актуальные columns после rollback restore", () => {
    let runtime: ReturnType<typeof getEntityRuntimeState>;
    const observed: number[] = [];
    const { manager } = createManager((_slice, action, { self, payloadFor }) => {
      if (action.type === "ENTITY_SPAWNED") {
        for (const entity of self.indices) {
          const payload = payloadFor(entity);
          if (payload.x < 0) throw new Error("spawn failed");
          self.x[entity] = payload.x;
        }
        return;
      }

      if (action.type !== "TICK") return;
      expect(self.x).toBe(runtime.actorStores.actor.columns.x);
      for (const entity of self.indices) {
        observed.push(self.x[entity]);
      }
    });
    runtime = getEntityRuntimeState(manager.entities());

    spawnEntity(manager, "unit/a", 7);
    const actorView = manager.entities().get("actor");
    const beforeRollbackColumn = actorView.x;
    expect(() => spawnEntity(manager, "unit/b", -1)).toThrow("spawn failed");
    manager.transition({ type: "TICK" });

    expect(runtime.actorStores.actor.columns.x.length).toBe(1);
    expect(actorView.x).toBe(runtime.actorStores.actor.columns.x);
    expect(actorView.x).not.toBe(beforeRollbackColumn);
    expect(observed).toEqual([7]);
  });

  it("hot identity TICK не перечисляет store.columns для reducer self", () => {
    const { manager } = createManager((_slice, action, { self, payloadFor }) => {
      for (const entity of self.indices) {
        if (action.type === "ENTITY_SPAWNED") {
          self.x[entity] = payloadFor(entity).x;
          continue;
        }
        if (action.type === "TICK") self.x[entity] += 1;
      }
    });
    spawnEntity(manager, "unit/a", 1);

    const runtime = getEntityRuntimeState(manager.entities());
    const originalEntries = Object.entries;
    let columnEnumerations = 0;
    const entriesSpy = vi.spyOn(Object, "entries").mockImplementation((value: object) => {
      if (value === runtime.actorStores.actor.columns) columnEnumerations += 1;
      return originalEntries(value);
    });

    try {
      manager.transition({ type: "TICK" });
      manager.transition({ type: "TICK" });
    } finally {
      entriesSpy.mockRestore();
    }

    expect(columnEnumerations).toBe(0);
    expect(manager.entities().get("actor").x[0 as EntityIndex]).toBe(3);
  });
});
