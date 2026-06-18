import { afterEach, describe, expect, it, vi } from "vitest";

import { MachineManager } from "@lite-fsm/core";
import { defineEntitySpawn, defineSpawnEvents, entitiesPlugin, f32, i32, spawnEvent } from "@lite-fsm/entities";
import type { EntityIndex } from "@lite-fsm/entities";

import {
  readEntityTransitionTraceSession,
  recordEntityTracePhase,
  type EntityTransitionTraceSession,
} from "../../packages/entities/src/runtime/transitionTrace";

type TracePhase = {
  readonly key: string;
  readonly durationMs: number;
  readonly runtimeKind?: string;
};

type TraceRecord = {
  readonly actionType: string | undefined;
  readonly depth: number;
  readonly status: "ok" | "error";
  readonly phases: readonly TracePhase[];
  readonly counters: readonly { readonly key: string; readonly value: number }[];
};

type TraceCollector = {
  readonly records: TraceRecord[];
};

const TRANSITION_TRACE_COLLECTOR_SYMBOL = Symbol.for("@lite-fsm/performance-trace");
const TRANSITION_TRACE_RUNTIME_KEY = "@lite-fsm/core/transition-trace";
const traceGlobal = globalThis as Record<symbol, unknown>;

const spawnEvents = defineSpawnEvents({
  SPAWN_ENTITY: spawnEvent<{ readonly id: string; readonly x: number }>(),
});

const installCollector = (): TraceCollector => {
  const collector: TraceCollector = { records: [] };
  traceGlobal[TRANSITION_TRACE_COLLECTOR_SYMBOL] = collector;
  return collector;
};

const phaseKeysFor = (collector: TraceCollector, actionType: string): readonly string[] => {
  const record = collector.records.find((item) => item.actionType === actionType && item.depth === 0);
  if (!record) throw new Error(`Expected trace record for ${actionType}`);
  expect(record.status).toBe("ok");
  return record.phases.map((phase) => phase.key);
};

const spawnEntity = (
  manager: {
    transition(action: {
      readonly type: "SPAWN_ENTITY";
      readonly payload: { readonly id: string; readonly x: number };
    }): unknown;
  },
  id: string,
  x: number,
): void => {
  manager.transition({ type: "SPAWN_ENTITY", payload: { id, x } });
};

afterEach(() => {
  delete traceGlobal[TRANSITION_TRACE_COLLECTOR_SYMBOL];
  vi.restoreAllMocks();
});

describe("@lite-fsm/entities — transition trace helper", () => {
  it("читает только structural session из private runtime slot", () => {
    const carrier = { runtime: new Map<string, unknown>() };
    const session: EntityTransitionTraceSession = {
      depth: 0,
      now: vi.fn(() => 10),
      record: vi.fn(),
      count: vi.fn(),
      finish: vi.fn(),
    };

    expect(readEntityTransitionTraceSession(carrier)).toBeUndefined();
    carrier.runtime.set(TRANSITION_TRACE_RUNTIME_KEY, true);
    expect(readEntityTransitionTraceSession(carrier)).toBeUndefined();
    carrier.runtime.set(TRANSITION_TRACE_RUNTIME_KEY, { ...session, depth: "0" });
    expect(readEntityTransitionTraceSession(carrier)).toBeUndefined();
    carrier.runtime.set(TRANSITION_TRACE_RUNTIME_KEY, { ...session, now: 10 });
    expect(readEntityTransitionTraceSession(carrier)).toBeUndefined();
    carrier.runtime.set(TRANSITION_TRACE_RUNTIME_KEY, { ...session, record: 10 });
    expect(readEntityTransitionTraceSession(carrier)).toBeUndefined();
    carrier.runtime.set(TRANSITION_TRACE_RUNTIME_KEY, { ...session, count: 10 });
    expect(readEntityTransitionTraceSession(carrier)).toBeUndefined();
    carrier.runtime.set(TRANSITION_TRACE_RUNTIME_KEY, { ...session, finish: 10 });
    expect(readEntityTransitionTraceSession(carrier)).toBeUndefined();

    carrier.runtime.set(TRANSITION_TRACE_RUNTIME_KEY, session);
    expect(readEntityTransitionTraceSession(carrier)).toBe(session);
  });

  it("не вызывает performance.now при выключенном trace", () => {
    const now = vi.spyOn(performance, "now");
    const trace = readEntityTransitionTraceSession({ runtime: new Map() });
    const startedAt = trace?.now();

    recordEntityTracePhase(trace, "entities.test.disabled", startedAt);

    expect(trace).toBeUndefined();
    expect(now).not.toHaveBeenCalled();
  });

  it("записывает phase только при session и timestamp", () => {
    const session: EntityTransitionTraceSession = {
      depth: 0,
      now: vi.fn(() => 10),
      record: vi.fn(),
      count: vi.fn(),
      finish: vi.fn(),
    };

    recordEntityTracePhase(session, "entities.test.skipped", undefined);
    recordEntityTracePhase(undefined, "entities.test.skipped", 10);
    recordEntityTracePhase(session, "entities.test.recorded", 10);

    expect(session.record).toHaveBeenCalledTimes(1);
    expect(session.record).toHaveBeenCalledWith("entities.test.recorded", 10);
  });
});

describe("@lite-fsm/entities — transition trace разметка runtime phases", () => {
  it("spawn transition пишет spawn lifecycle phases", () => {
    const movementActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: {} },
      initialState: "__INIT",
      initialContext: { x: f32() },
      spawnSchema: { x: f32() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly x: number } },
      ) {
        if (action.type !== "ENTITY_SPAWNED") return;
        for (const entity of self.indices) self.x[entity] = payloadFor(entity).x;
      },
    } as const;
    const machines = { movementActor };
    const spawn = defineEntitySpawn(
      machines,
      spawnEvents,
    )({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "units",
        actors: { movementActor: { x: payload.x } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    const collector = installCollector();
    spawnEntity(manager, "unit/a", 1);

    expect(phaseKeysFor(collector, "SPAWN_ENTITY")).toEqual(
      expect.arrayContaining([
        "entities.spawn.stage",
        "entities.spawn.stage.recipe",
        "entities.spawn.stage.normalize",
        "entities.spawn.stage.validate",
        "entities.reduce.spawnLifecycle",
        "entities.reduce.spawnLifecycle.applyStagedSpawns",
        "entities.reduce.spawnLifecycle.reduceBatches",
        "entities.reduce.spawnLifecycle.batch.total",
        "entities.reduce.spawnLifecycle.batch.defaultTransitions",
        "entities.reduce.spawnLifecycle.batch.userReducer",
        "entities.reduce.spawnLifecycle.batch.postProcess",
        "entities.reduce.spawnLifecycle.batch.markTouched",
        "entities.reduce.spawnLifecycle.batch.scheduleEffects",
        "entities.reduce.spawnLifecycle.batch.scheduleReactions",
        "entities.reduce.spawnLifecycle.batch.updateStateBuckets",
        "entities.reduce.spawnLifecycle.reactions",
      ]),
    );
    expect(manager.entities().get("movementActor").x[0 as EntityIndex]).toBe(1);
  });

  it("movement update пишет reduce phases", () => {
    const movementActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
      initialState: "__INIT",
      initialContext: { x: f32() },
      spawnSchema: { x: f32() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly x: number } },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") self.x[entity] = payloadFor(entity).x;
          if (action.type === "TICK") self.x[entity] += 1;
        }
      },
    } as const;
    const machines = { movementActor };
    const spawn = defineEntitySpawn(
      machines,
      spawnEvents,
    )({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "units",
        actors: { movementActor: { x: payload.x } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    spawnEntity(manager, "unit/a", 1);
    spawnEntity(manager, "unit/b", 2);

    const collector = installCollector();
    manager.transition({ type: "TICK" });

    expect(phaseKeysFor(collector, "TICK")).toEqual(
      expect.arrayContaining([
        "entities.prepare.transaction",
        "entities.spawn.stage",
        "entities.reduce.total",
        "entities.reduce.spawnLifecycle",
        "entities.reduce.spawnCleanup",
        "entities.reduce.collectPublicBatches",
        "entities.reduce.publicBatch.total",
        "entities.reduce.publicBatch.defaultTransitions",
        "entities.reduce.publicBatch.userReducer",
        "entities.reduce.publicBatch.postProcess",
        "entities.reduce.publicBatch.markTouched",
        "entities.reduce.publicBatch.scheduleEffects",
        "entities.reduce.publicBatch.scheduleReactions",
        "entities.reduce.publicBatch.updateStateBuckets",
        "entities.reduce.publicCleanup",
        "entities.commit.restorePublicSlices",
        "entities.effects.resolve",
        "entities.reactions.total",
      ]),
    );
    expect(manager.entities().get("movementActor").x[0 as EntityIndex]).toBe(2);
  });

  it("sprite sync reaction пишет reaction phases", () => {
    const frames: string[] = [];
    const spriteActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
      initialState: "__INIT",
      initialContext: { frame: i32() },
      spawnSchema: { x: f32() },
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "TICK") return;
        for (const entity of self.indices) self.frame[entity] += 1;
      },
      reactions: {
        TICK: ({ self }: { readonly self: any }) => {
          frames.push(
            self.indices.map((entity: EntityIndex) => `${self.entityId(entity)}:${self.frame[entity]}`).join("|"),
          );
        },
      },
    } as const;
    const machines = { spriteActor };
    const spawn = defineEntitySpawn(
      machines,
      spawnEvents,
    )({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "sprites",
        actors: { spriteActor: { x: payload.x } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    spawnEntity(manager, "sprite/a", 1);
    spawnEntity(manager, "sprite/b", 2);

    const collector = installCollector();
    manager.transition({ type: "TICK" });

    expect(phaseKeysFor(collector, "TICK")).toEqual(
      expect.arrayContaining([
        "entities.reactions.total",
        "entities.reactions.captureScope",
        "entities.reactions.createDeps",
        "entities.reactions.user",
      ]),
    );
    expect(frames).toEqual(["sprite/a:1|sprite/b:1"]);
  });

  it("cleanup scenario пишет cleanup phases без reaction phases для lifecycle batches", () => {
    const lifecycleFrames: string[] = [];
    const actor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "ACTIVE" },
        ACTIVE: { EXPIRE: "EXPIRED" },
        EXPIRED: { ENTITY_DESPAWNED: "CLEANED" },
        CLEANED: {},
      },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: { x: f32() },
      despawnOn: "EXPIRED",
      reactions: {
        ENTITY_DESPAWNED: ({ self }: { readonly self: any }) => {
          lifecycleFrames.push(self.indices.map((entity: EntityIndex) => self.entityId(entity)).join(","));
        },
      },
    } as const;
    const machines = { actor };
    const spawn = defineEntitySpawn(
      machines,
      spawnEvents,
    )({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "units",
        actors: { actor: { x: payload.x } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    spawnEntity(manager, "unit/a", 1);
    spawnEntity(manager, "unit/b", 2);

    const collector = installCollector();
    manager.transition({ type: "EXPIRE" });
    const keys = phaseKeysFor(collector, "EXPIRE");

    expect(keys).toEqual(
      expect.arrayContaining([
        "entities.reduce.publicCleanup",
        "entities.cleanup.public.collectPlan",
        "entities.cleanup.public.lifecycle",
        "entities.cleanup.public.removeActorRows",
        "entities.cleanup.public.removeEntityRecords",
      ]),
    );
    expect(keys).not.toContain("entities.reactions.captureScope");
    expect(keys).not.toContain("entities.reactions.createDeps");
    expect(keys).not.toContain("entities.reactions.user");
    expect(lifecycleFrames).toEqual(["unit/a,unit/b"]);
    expect(manager.entities().get("actor").count).toBe(0);
  });
});
