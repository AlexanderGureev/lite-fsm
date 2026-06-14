import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { definePlugin, defineStorageRuntime, HYDRATE_ACTION_TYPE, LiteFsmError, MachineManager } from "@lite-fsm/core";
import { getNormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import type { FSMEvent, MachineConfig, MachineStore, Middleware } from "@lite-fsm/core";
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  f32,
  i16,
  i32,
  optional,
  spawnEvent,
  string,
  u8,
} from "@lite-fsm/entities";
import type { EntityAccess, EntityIndex, LiteFsmEntityLifecycleEvents } from "@lite-fsm/entities";
import * as entities from "@lite-fsm/entities";

import {
  compileEntityTemplate,
  createEntityRuntimeState,
  ensureActorCapacity,
  ensureEntityCapacity,
  getEntityStateCode,
  getEntityStateName,
  getEntityRuntimeState,
  moveActorStateBucket,
} from "../../packages/entities/src/runtime/state";
import {
  compileEntityRuntimeMetadata,
  ENTITY_RESOLVED_STATE_CODE,
} from "../../packages/entities/src/runtime/compile";
import { invokeEntityEffect, resolveEntityEffectInvocations } from "../../packages/entities/src/runtime/effects";
import { collectEntityPublicReducerBatches } from "../../packages/entities/src/runtime/routing";
import {
  createEntityDespawnOptions,
  prepareEntityTransaction,
  scheduleEntityDespawn,
  scheduleEntityEffectBatch,
  scheduleEntityReactionBatch,
} from "../../packages/entities/src/runtime/transaction";
import { runEntityReactionBatches, runEntityReactions } from "../../packages/entities/src/runtime/reactions";

type CounterEvent = FSMEvent<"INC">;
type CounterConfig = { readonly READY: { readonly INC: "READY" } };
type CounterMachine = MachineConfig<CounterConfig, { readonly count: number }, CounterEvent>;
type EntityTemplateConfig = {
  readonly __INIT: { readonly ENTITY_SPAWNED: "READY" };
  readonly READY: { readonly TICK: "READY" };
};
type SpawnEntityPayload = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly label: string | null;
};
type MovementSpawnPayload = {
  readonly x: number;
  readonly y: number;
  readonly label: string | null;
};
type MovementReducerSelf = {
  readonly indices: readonly EntityIndex[];
  readonly stateCode: Int16Array;
  readonly prevStateCode: Int16Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly spawnCount: Int32Array;
  readonly publicCount: Int32Array;
  readonly label: string[];
  has(entity: EntityIndex): boolean;
  entityId(entity: EntityIndex): string;
};
type MovementReducerMeta = {
  readonly self: MovementReducerSelf;
  payloadFor(entity: EntityIndex): MovementSpawnPayload;
};
type EntityTemplateFixture<
  Context extends Record<string, unknown>,
  Spawn extends Record<string, unknown>,
> = {
  readonly storage: "entity";
  readonly config: EntityTemplateConfig;
  readonly initialState: "__INIT";
  readonly initialContext: Context;
  readonly spawnSchema: Spawn;
  readonly groupTag?: string;
};

const rootDir = process.cwd();

const createCounter = (): CounterMachine => ({
  config: { READY: { INC: "READY" } },
  initialState: "READY",
  initialContext: { count: 0 },
  reducer: (slice) => ({
    state: "READY",
    context: { count: slice.context.count + 1 },
  }),
});

const createEntityTemplate = (): EntityTemplateFixture<Record<string, never>, Record<string, never>> => ({
  storage: "entity",
  config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
  initialState: "__INIT",
  initialContext: {},
  spawnSchema: {},
});

const createEntityTemplateWithSchema = () => {
  const initialContext = {
    x: f32({ default: 1 }),
    y: f32(),
    hp: i16(),
    score: i32(),
    flags: u8(),
    name: string({ default: "unit" }),
  };
  const spawnSchema = {
    x: f32(),
    y: f32(),
    team: optional(string()),
    flags: u8(),
  };

  return {
    storage: "entity",
    config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
    initialState: "__INIT",
    initialContext,
    spawnSchema,
  } satisfies EntityTemplateFixture<typeof initialContext, typeof spawnSchema>;
};

const createMovementSpawnActor = (
  reducer?: (slice: unknown, action: { readonly type: string }, meta: MovementReducerMeta) => void,
) => {
  const base = {
    storage: "entity",
    config: {
      __INIT: { ENTITY_SPAWNED: "READY" },
      READY: {
        SPAWN_ENTITY: "READY",
        SPAWN_EMPTY: "READY",
        PING: "READY",
        TICK: "READY",
      },
    },
    initialState: "__INIT",
    initialContext: {
      x: f32({ default: 1 }),
      y: f32(),
      spawnCount: i32(),
      publicCount: i32(),
      label: string(),
    },
    spawnSchema: {
      x: f32(),
      y: f32(),
      label: optional(string()),
    },
  } as const;

  return reducer ? { ...base, reducer } : base;
};

const createSpawnEvents = () =>
  defineSpawnEvents({
    SPAWN_ENTITY: spawnEvent<SpawnEntityPayload>(),
  });

const createEmptySpawnEvents = () =>
  defineSpawnEvents({
    SPAWN_EMPTY: spawnEvent<{ readonly id: string }>(),
  });

const entityAccess = <Machines extends MachineStore>(
  manager: { readonly entities: () => EntityAccess<Machines> },
): EntityAccess<Machines> => manager.entities();

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

const emptyEntitySlice = {
  storage: "entity",
  version: 0,
  count: 0,
  capacity: 0,
} as const;

const readFiles = (dir: string): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...readFiles(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
};

describe("@lite-fsm/entities — этап 1 plugin shell", () => {
  it("импортируется из package entrypoint", () => {
    expect(Object.keys(entities).sort()).toEqual([
      "defineEntitySpawn",
      "defineSpawnEvents",
      "entitiesPlugin",
      "f32",
      "i16",
      "i32",
      "optional",
      "spawnEvent",
      "string",
      "u8",
    ]);
    expect(entities.entitiesPlugin).toBe(entitiesPlugin);
    expect(typeof entities.entitiesPlugin).toBe("function");
    expect(entities.defineSpawnEvents).toBe(defineSpawnEvents);
    expect(entities.defineEntitySpawn).toBe(defineEntitySpawn);
    expect(entities.spawnEvent).toBe(spawnEvent);
    expect(entities.f32).toBe(f32);
    expect(entities.string).toBe(string);
  });

  it("публикует root, react и package.json exports", () => {
    const packageJson = JSON.parse(readFileSync(join(rootDir, "packages/entities/package.json"), "utf8")) as {
      readonly exports: Record<string, unknown>;
    };

    expect(Object.keys(packageJson.exports).sort()).toEqual([".", "./package.json", "./react"]);
    expect(packageJson.exports).toHaveProperty("./react");
  });

  it("устанавливается один раз через MachineManager", () => {
    const manager = MachineManager({ counter: createCounter() }, { plugins: [entitiesPlugin()] as const });

    expect(manager.getState()).toEqual({ counter: { state: "READY", context: { count: 0 } } });
    expect(manager.transition({ type: "INC" })).toEqual({ type: "INC" });
    expect(manager.getState()).toEqual({ counter: { state: "READY", context: { count: 1 } } });
  });

  it("регистрирует storage: \"entity\" через plugin storage section", () => {
    const manager = MachineManager({ entity: createEntityTemplate() }, { plugins: [entitiesPlugin()] as const });

    expect(manager.getState()).toEqual({ entity: emptyEntitySlice });
    expect(manager.transition({ type: "TICK" })).toEqual({ type: "TICK" });
    expect(manager.getState()).toEqual({ entity: emptyEntitySlice });
  });

  it("публикует storage и manager sections через plugin DSL", () => {
    const plugin = getNormalizedPlugin(entitiesPlugin());
    const [entry] = plugin.storage;

    expect(entry?.kind).toBe("entity");
    expect(plugin.manager.map((section) => section.key)).toEqual(["entities"]);
  });

  it("бросает unknown storage kind для storage: \"entity\" без plugin", () => {
    const error = expectLiteFsmError(
      () => MachineManager({ entity: createEntityTemplate() }),
      "LITE_FSM_UNKNOWN_STORAGE_KIND",
    );

    expect(error.message).toContain("unknown storage kind 'entity'");
  });

  it("бросает duplicate storage kind при повторной регистрации entity", () => {
    const duplicateEntityStorage = defineStorageRuntime<{
      readonly runtimeState: object;
      readonly publicState: object;
    }>().create({
      kind: "entity",
      reduceScope: "bucket",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      reduceBucket() {
        return { type: "skip" };
      },
      commit() {},
    });
    const duplicatePlugin = definePlugin().create({
      name: "duplicate-entity-storage",
      storage: [duplicateEntityStorage],
    });

    const error = expectLiteFsmError(
      () => MachineManager({}, { plugins: [entitiesPlugin(), duplicatePlugin] }),
      "LITE_FSM_DUPLICATE_STORAGE_KIND",
    );

    expect(error.message).toContain("duplicate storage kind 'entity'");
  });

  it("не меняет поведение storage: \"instance\"", () => {
    const withoutPlugin = MachineManager({ counter: createCounter() });
    const withPlugin = MachineManager({ counter: createCounter() }, { plugins: [entitiesPlugin()] as const });

    withoutPlugin.transition({ type: "INC" });
    withPlugin.transition({ type: "INC" });

    expect(withPlugin.getState()).toEqual(withoutPlugin.getState());
  });

  it("пробрасывает ошибку из storage runtime callback при инициализации manager", () => {
    const throwingStorage = defineStorageRuntime().create({
      kind: "throwing-init",
      reduceScope: "bucket",
      validateTemplate() {
        throw new LiteFsmError("LITE_FSM_INVALID_STORAGE_CONFIG", "[lite-fsm] test storage callback failure.");
      },
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      reduceBucket() {
        return { type: "skip" };
      },
      commit() {},
    });
    const throwingPlugin = definePlugin().create({
      name: "throwing-init-plugin",
      storage: [throwingStorage],
    });

    const error = expectLiteFsmError(
      () =>
        MachineManager(
          {
            item: {
              storage: "throwing-init",
              config: { READY: {} },
              initialContext: {},
            } as never,
          },
          { plugins: [throwingPlugin] },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );

    expect(error.message).toContain("test storage callback failure");
  });

  it("отклоняет options без spawn descriptor", () => {
    const error = expectLiteFsmError(() => entitiesPlugin({} as never), "LITE_FSM_INVALID_OPTIONS");

    expect(error.message).toContain("entitiesPlugin options must be { spawn }");
  });

  it("не добавляет импорт @lite-fsm/entities в core source и package metadata", () => {
    const coreSourceFiles = readFiles(join(rootDir, "packages/core/src"));
    const corePackageJson = readFileSync(join(rootDir, "packages/core/package.json"), "utf8");

    for (const file of coreSourceFiles) {
      expect(readFileSync(file, "utf8")).not.toContain("@lite-fsm/entities");
    }
    expect(corePackageJson).not.toContain("@lite-fsm/entities");
  });
});

describe("@lite-fsm/entities — этап 2 schema descriptors", () => {
  it("валидный entity template проходит manager init", () => {
    const manager = MachineManager({ entity: createEntityTemplateWithSchema() }, { plugins: [entitiesPlugin()] as const });

    expect(manager.getState()).toEqual({ entity: emptyEntitySlice });
  });

  it("бросает clear error без spawnSchema", () => {
    const { spawnSchema: _spawnSchema, ...machine } = createEntityTemplateWithSchema() as Record<string, unknown>;
    const error = expectLiteFsmError(
      () => MachineManager({ entity: machine as never }, { plugins: [entitiesPlugin()] as const }),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );

    expect(error.message).toContain("machine 'entity'");
    expect(error.message).toContain("spawnSchema");
  });

  it("бросает clear error без initialContext", () => {
    const { initialContext: _initialContext, ...machine } = createEntityTemplateWithSchema() as Record<string, unknown>;
    const error = expectLiteFsmError(
      () => MachineManager({ entity: machine as never }, { plugins: [entitiesPlugin()] as const }),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );

    expect(error.message).toContain("machine 'entity'");
    expect(error.message).toContain("initialContext");
  });

  it("бросает clear error без initialState", () => {
    const { initialState: _initialState, ...machine } = createEntityTemplateWithSchema() as Record<string, unknown>;
    const error = expectLiteFsmError(
      () => MachineManager({ entity: machine as never }, { plugins: [entitiesPlugin()] as const }),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );

    expect(error.message).toContain("machine 'entity'");
    expect(error.message).toContain("initialState");
  });

  it('бросает clear error если initialState не "__INIT"', () => {
    const error = expectLiteFsmError(
      () =>
        MachineManager(
          { entity: { ...createEntityTemplateWithSchema(), initialState: "READY" } as never },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );

    expect(error.message).toContain("initialState");
    expect(error.message).toContain("__INIT");
  });

  it("бросает clear error для optional(...) в initialContext", () => {
    const error = expectLiteFsmError(
      () =>
        MachineManager(
          {
            entity: {
              ...createEntityTemplateWithSchema(),
              initialContext: { nullableName: optional(string()) },
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );

    expect(error.message).toContain("initialContext.nullableName");
    expect(error.message).toContain("optional");
  });

  it("бросает clear error для unknown descriptor shape и custom prototype schema object", () => {
    const error = expectLiteFsmError(
      () =>
        MachineManager(
          {
            entity: {
              ...createEntityTemplateWithSchema(),
              initialContext: {
                malformed: { kind: "f32" },
              },
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(error.message).toContain("initialContext.malformed");
    expect(error.message).toContain("unknown descriptor shape");

    const customSchema = Object.create({ inherited: true }) as Record<string, unknown>;
    customSchema.x = f32();
    const customError = expectLiteFsmError(
      () =>
        MachineManager(
          { entity: { ...createEntityTemplateWithSchema(), initialContext: customSchema } as never },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(customError.message).toContain("initialContext");
    expect(customError.message).toContain("custom prototype");
  });

  it("бросает clear error для invalid descriptor object", () => {
    const marker = Object.getOwnPropertySymbols(f32())[0];
    const invalidDescriptors = [
      ["unknownKind", { [marker]: true, kind: "bool" }, "unknown descriptor kind"],
      ["extraField", { ...f32(), extra: true }, "unknown descriptor property"],
      ["badDefault", { ...f32(), default: "bad" }, "default value"],
      ["primitive", 1, "schema field must be a descriptor"],
    ] as const;

    for (const [field, descriptor, message] of invalidDescriptors) {
      const error = expectLiteFsmError(
        () =>
          MachineManager(
            { entity: { ...createEntityTemplateWithSchema(), initialContext: { [field]: descriptor } } as never },
            { plugins: [entitiesPlugin()] as const },
          ),
        "LITE_FSM_INVALID_STORAGE_CONFIG",
      );

      expect(error.message).toContain(`initialContext.${field}`);
      expect(error.message).toContain(message);
    }
  });

  it("бросает clear error для schema, который не является plain object", () => {
    const error = expectLiteFsmError(
      () =>
        MachineManager(
          { entity: { ...createEntityTemplateWithSchema(), initialContext: 1 } as never },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );

    expect(error.message).toContain("initialContext");
    expect(error.message).toContain("plain object");
  });

  it("бросает clear error для default в spawnSchema", () => {
    const error = expectLiteFsmError(
      () =>
        MachineManager(
          { entity: { ...createEntityTemplateWithSchema(), spawnSchema: { x: f32({ default: 1 }) } } as never },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );

    expect(error.message).toContain("spawnSchema.x");
    expect(error.message).toContain("default");
  });

  it("бросает clear error для reserved column name", () => {
    const error = expectLiteFsmError(
      () =>
        MachineManager(
          { entity: { ...createEntityTemplateWithSchema(), initialContext: { count: f32() } } as never },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );

    expect(error.message).toContain("initialContext.count");
    expect(error.message).toContain("reserved");
  });

  it("бросает clear error для groupTag на template", () => {
    const error = expectLiteFsmError(
      () =>
        MachineManager(
          { entity: { ...createEntityTemplateWithSchema(), groupTag: "enemy" } as never },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );

    expect(error.message).toContain("groupTag");
    expect(error.message).toContain("EntitySpawnSpec");
  });

  it("бросает clear error для nested object, array, Map и Set в schema", () => {
    const invalidValues = [
      ["nested", { nested: true }, "unknown descriptor shape"],
      ["array", [f32()], "arrays"],
      ["map", new Map(), "Map"],
      ["set", new Set(), "Set"],
    ] as const;

    for (const [field, value, message] of invalidValues) {
      const error = expectLiteFsmError(
        () =>
          MachineManager(
            { entity: { ...createEntityTemplateWithSchema(), spawnSchema: { [field]: value } } as never },
            { plugins: [entitiesPlugin()] as const },
          ),
        "LITE_FSM_INVALID_STORAGE_CONFIG",
      );

      expect(error.message).toContain(`spawnSchema.${field}`);
      expect(error.message).toContain(message);
    }
  });

  it('сохраняет поведение storage: "instance" с custom __INIT', () => {
    const manager = MachineManager({
      actor: {
        storage: "instance",
        config: { __INIT: { SPAWN: "READY" }, READY: { INC: null } },
        initialState: "__INIT",
        initialContext: { count: 0 },
        reducer: (slice, action, meta) => {
          if (action.type === "INC") {
            return { state: meta.nextState, context: { count: slice.context.count + 1 } };
          }
          return { state: meta.nextState, context: slice.context };
        },
      } satisfies MachineConfig<
        { __INIT: { SPAWN: "READY" }; READY: { INC: null } },
        { count: number },
        { type: "SPAWN" } | { type: "INC" }
      >,
    });

    manager.transition({ type: "SPAWN" });
    manager.transition({ type: "INC", meta: { actorId: "actor/0" } });

    expect(manager.getState().actor["actor/0"].context.count).toBe(1);
  });
});

describe("@lite-fsm/entities — этап 3 public state и manager.entities", () => {
  it("manager с entity templates возвращает lightweight public slices без columns", () => {
    const manager = MachineManager(
      {
        movementActor: createEntityTemplateWithSchema(),
        emptyActor: createEntityTemplate(),
      },
      { plugins: [entitiesPlugin()] as const },
    );

    expect(manager.getState()).toEqual({
      movementActor: emptyEntitySlice,
      emptyActor: emptyEntitySlice,
    });
    expect(manager.getState().movementActor).not.toHaveProperty("columns");
    expect(manager.getState().movementActor).not.toHaveProperty("x");
  });

  it("manager.entities().get возвращает cached live store view с readonly indexed columns", () => {
    const machines = { movementActor: createEntityTemplateWithSchema() };
    const manager = MachineManager(machines, { plugins: [entitiesPlugin()] as const });
    const access = entityAccess<typeof machines>(manager);
    const store = access.get("movementActor");
    const repeated = access.get("movementActor");

    expect(repeated).toBe(store);
    expect(store.count).toBe(0);
    expect(store.version).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(store, "x")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(store, "hp")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(store, "score")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(store, "flags")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(store, "name")).toBe(true);
    expect(store.x[0 as EntityIndex]).toBeUndefined();
    expect(store.hp[0 as EntityIndex]).toBeUndefined();
    expect(store.score[0 as EntityIndex]).toBeUndefined();
    expect(store.flags[0 as EntityIndex]).toBeUndefined();
    expect(store.name[0 as EntityIndex]).toBeUndefined();
  });

  it("manager.entities остается stable provider, а manager.entities() возвращает stable root access", () => {
    const manager = MachineManager(
      {
        counter: createCounter(),
        movementActor: createEntityTemplateWithSchema(),
      },
      { plugins: [entitiesPlugin()] as const },
    );
    const provider = manager.entities;
    const access = manager.entities();

    expect(manager.entities()).toBe(access);

    manager.transition({ type: "INC" });

    expect(manager.entities).toBe(provider);
    expect(manager.entities()).toBe(access);
  });

  it("manager.entities().maybe возвращает cached optional store view", () => {
    const machines = { movementActor: createEntityTemplateWithSchema() };
    const manager = MachineManager(machines, { plugins: [entitiesPlugin()] as const });
    const access = entityAccess<typeof machines>(manager);

    expect(access.maybe("movementActor")).toBe(access.get("movementActor"));
  });

  it("store.has и store.state возвращают empty-row значения для отсутствующей строки", () => {
    const machines = { movementActor: createEntityTemplateWithSchema() };
    const manager = MachineManager(machines, { plugins: [entitiesPlugin()] as const });
    const entity = 0 as EntityIndex;
    const store = entityAccess<typeof machines>(manager).get("movementActor");

    expect(store.has(entity)).toBe(false);
    expect(store.state(entity)).toBeUndefined();
  });

  it("phantom metadata не попадает в runtime public slice", () => {
    const manager = MachineManager({ movementActor: createEntityTemplateWithSchema() }, { plugins: [entitiesPlugin()] as const });
    const slice = manager.getState().movementActor;

    expect(Object.keys(slice).sort()).toEqual(["capacity", "count", "storage", "version"]);
    expect(Object.getOwnPropertySymbols(slice)).toEqual([]);
  });

  it("не добавляет manager.entities без plugin", () => {
    const manager = MachineManager({ counter: createCounter() });

    expect("entities" in manager).toBe(false);
  });

  it("manager.entities().get бросает clear LiteFsmError для unknown runtime key", () => {
    const manager = MachineManager({ movementActor: createEntityTemplateWithSchema() }, { plugins: [entitiesPlugin()] as const });
    const error = expectLiteFsmError(
      () => manager.entities().get("unknownActor" as never),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    expect(error.message).toContain("unknown entity actor template 'unknownActor'");
  });

  it("external replacement entity public slice не мутирует storage и восстанавливается при commit", () => {
    const manager = MachineManager(
      {
        counter: createCounter(),
        movementActor: createEntityTemplateWithSchema(),
        statusActor: createEntityTemplate(),
      },
      { plugins: [entitiesPlugin()] as const },
    );
    const store = entityAccess<{
      readonly movementActor: ReturnType<typeof createEntityTemplateWithSchema>;
      readonly statusActor: ReturnType<typeof createEntityTemplate>;
    }>(manager).get("movementActor");

    manager.replaceReducer((next) => (state, action) => {
      const result = next(state, action);
      return {
        ...result,
        movementActor: {
          storage: "entity",
          version: 99,
          count: 99,
          capacity: 99,
          columns: { x: [1] },
        },
        statusActor: {
          storage: "entity",
          version: 1,
          count: 1,
          capacity: 1,
        },
      } as never;
    });
    manager.transition({ type: "INC" });

    expect(manager.getState().movementActor).toEqual(emptyEntitySlice);
    expect(manager.getState().statusActor).toEqual(emptyEntitySlice);
    expect(manager.getState().movementActor).not.toHaveProperty("columns");
    expect(store.count).toBe(0);
    expect(store.version).toBe(0);
    expect(store.x[0 as EntityIndex]).toBeUndefined();
  });
});

describe("@lite-fsm/entities — этап 4 lifecycle events", () => {
  it("запрещает public transition ENTITY_SPAWNED даже если event добавлен в AppEvents", () => {
    const plugins = [entitiesPlugin()] as const;
    const machines = {
      counter: createCounter(),
      entity: createEntityTemplate(),
    };
    const manager = MachineManager<typeof machines, CounterEvent | LiteFsmEntityLifecycleEvents, typeof plugins>(
      machines,
      { plugins },
    );
    const error = expectLiteFsmError(
      () => manager.transition({ type: "ENTITY_SPAWNED" }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    expect(error.message).toContain("public dispatch");
    expect(error.message).toContain("ENTITY_SPAWNED");
  });

  it("запрещает public transition ENTITY_DESPAWNED даже если event добавлен в AppEvents", () => {
    const plugins = [entitiesPlugin()] as const;
    const machines = {
      counter: createCounter(),
      entity: createEntityTemplate(),
    };
    const manager = MachineManager<typeof machines, CounterEvent | LiteFsmEntityLifecycleEvents, typeof plugins>(
      machines,
      { plugins },
    );
    const error = expectLiteFsmError(
      () => manager.transition({ type: "ENTITY_DESPAWNED" }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    expect(error.message).toContain("public dispatch");
    expect(error.message).toContain("ENTITY_DESPAWNED");
  });

  it("запрещает lifecycle action после plugin intercept replacement", () => {
    const replaceWithLifecycle = definePlugin().create({
      name: "replace-with-lifecycle",
      intercept() {
        return { action: { type: "ENTITY_SPAWNED" } };
      },
    });
    const manager = MachineManager(
      {
        entity: createEntityTemplate(),
      },
      { plugins: [replaceWithLifecycle, entitiesPlugin()] as const },
    );
    const delivered: string[] = [];
    manager.onTransition((_prev, _next, action) => {
      delivered.push(action.type);
    });
    const error = expectLiteFsmError(
      () => manager.transition({ type: "TICK" } as never),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    expect(error.message).toContain("ENTITY_SPAWNED");
    expect(delivered).toEqual([]);
  });

  it("бросает clear init error для custom event edge из __INIT entity template", () => {
    const error = expectLiteFsmError(
      () =>
        MachineManager(
          {
            entity: {
              ...createEntityTemplateWithSchema(),
              config: { __INIT: { SPAWN: "READY" }, READY: { TICK: "READY" } },
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );

    expect(error.message).toContain("__INIT");
    expect(error.message).toContain("SPAWN");
    expect(error.message).toContain("ENTITY_SPAWNED");
  });

  it("бросает clear init error для невалидной lifecycle config shape", () => {
    const configError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            entity: {
              ...createEntityTemplateWithSchema(),
              config: 1,
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(configError.message).toContain("config must be a plain object");

    const missingInitError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            entity: {
              ...createEntityTemplateWithSchema(),
              config: { READY: { TICK: "READY" } },
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(missingInitError.message).toContain("config.__INIT");
    expect(missingInitError.message).toContain("transition map");

    const initError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            entity: {
              ...createEntityTemplateWithSchema(),
              config: { __INIT: "READY", READY: { TICK: "READY" } },
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(initError.message).toContain("config.__INIT");
    expect(initError.message).toContain("transition map");
  });
});

describe("@lite-fsm/entities — этап 5 spawn events и entity spawn", () => {
  it("runtime state helpers сохраняют capacity no-op и __INIT stateCode", () => {
    const movementActor = createMovementSpawnActor();
    const metadata = compileEntityTemplate("movementActor", movementActor);
    const runtime = createEntityRuntimeState(
      [{ key: "movementActor", kind: "entity", data: metadata }],
      {} as never,
    );
    const entityStore = runtime.entityStore;
    const actorStore = runtime.actorStores.movementActor;

    const alive = entityStore.alive;
    const generation = entityStore.generation;
    ensureEntityCapacity(entityStore, 0);
    expect(entityStore.alive).toBe(alive);
    expect(entityStore.generation).toBe(generation);

    entityStore.capacity = -1;
    ensureEntityCapacity(entityStore, 0);
    expect(entityStore.alive).toBe(alive);
    expect(entityStore.generation).toBe(generation);

    const presence = actorStore.presence;
    const stateCode = actorStore.stateCode;
    const prevStateCode = actorStore.prevStateCode;
    const rowVersion = actorStore.rowVersion;
    const statePosition = actorStore.statePosition;
    const xColumn = actorStore.columns.x;
    ensureActorCapacity(actorStore, 0);
    expect(actorStore.presence).toBe(presence);
    expect(actorStore.stateCode).toBe(stateCode);
    expect(actorStore.prevStateCode).toBe(prevStateCode);
    expect(actorStore.rowVersion).toBe(rowVersion);
    expect(actorStore.statePosition).toBe(statePosition);
    expect(actorStore.columns.x).toBe(xColumn);

    actorStore.capacity = -1;
    ensureActorCapacity(actorStore, 0);
    expect(actorStore.presence).toBe(presence);
    expect(actorStore.stateCode).toBe(stateCode);
    expect(actorStore.prevStateCode).toBe(prevStateCode);
    expect(actorStore.rowVersion).toBe(rowVersion);
    expect(actorStore.statePosition).toBe(statePosition);
    expect(actorStore.columns.x).toBe(xColumn);
    expect(getEntityStateCode(actorStore.metadata, "__INIT")).toBe(-1);
    expect(getEntityStateName(actorStore.metadata, -1)).toBe("__INIT");

    moveActorStateBucket(actorStore, 0 as EntityIndex, 0, -1);
    moveActorStateBucket(actorStore, 0 as EntityIndex, -1, 99);
    expect(actorStore.statePosition[0]).toBeUndefined();

    ensureActorCapacity(actorStore, 1);
    moveActorStateBucket(actorStore, 0 as EntityIndex, 0, -1);
    expect(actorStore.statePosition[0]).toBe(-1);
  });

  it("public spawn event создает entity rows, запускает ENTITY_SPAWNED перед public event и инициализирует columns через self", () => {
    const delivered: string[] = [];
    const reducerCalls: string[] = [];
    const movementActor = createMovementSpawnActor((_slice, action, { self, payloadFor }) => {
      reducerCalls.push(action.type);

      for (const entity of self.indices) {
        expect(self.has(entity)).toBe(true);
        expect(self.entityId(entity)).toBe("projectile/a");

        if (action.type === "ENTITY_SPAWNED") {
          expect(self.prevStateCode[entity]).toBe(-1);
          expect(self.stateCode[entity]).toBe(0);
          const payload = payloadFor(entity);
          self.x[entity] = payload.x;
          self.y[entity] = payload.y;
          self.label[entity] = payload.label ?? "null";
          self.spawnCount[entity] += 1;
          continue;
        }

        if (action.type === "SPAWN_ENTITY") {
          self.publicCount[entity] += 1;
        }
      }
    });
    const machines = { movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "projectile",
        actors: {
          movementActor: {
            x: payload.x,
            y: payload.y,
            label: payload.label,
          },
        },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    manager.onTransition((_prev, _next, action) => {
      delivered.push(action.type);
    });

    manager.transition({ type: "SPAWN_ENTITY", payload: { id: "projectile/a", x: 10, y: 20, label: null } });

    const entity = 0 as EntityIndex;
    const store = entityAccess<typeof machines>(manager).get("movementActor");
    expect(reducerCalls).toEqual(["ENTITY_SPAWNED", "SPAWN_ENTITY"]);
    expect(delivered).toEqual(["SPAWN_ENTITY"]);
    expect(store.count).toBe(1);
    expect(store.has(entity)).toBe(true);
    expect(store.state(entity)).toBe("READY");
    expect(store.x[entity]).toBe(10);
    expect(store.y[entity]).toBe(20);
    expect(store.label[entity]).toBe("null");
    expect(store.spawnCount[entity]).toBe(1);
    expect(store.publicCount[entity]).toBe(1);
    expect(manager.getState().movementActor.count).toBe(1);
    expect(manager.getState().movementActor.capacity).toBe(1);
  });

  it("payloadFor(entity) outside ENTITY_SPAWNED бросает clear error", () => {
    const movementActor = createMovementSpawnActor((_slice, action, { self, payloadFor }) => {
      if (action.type === "ENTITY_SPAWNED") {
        for (const entity of self.indices) {
          const payload = payloadFor(entity);
          self.x[entity] = payload.x;
        }
        return;
      }

      if (action.type === "TICK") payloadFor(self.indices[0]);
    });
    const machines = { movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: "a" } });
    const error = expectLiteFsmError(() => manager.transition({ type: "TICK" }), "LITE_FSM_INVALID_STORAGE_RUNTIME");

    expect(error.message).toContain("payloadFor(entity)");
    expect(error.message).toContain("ENTITY_SPAWNED");
  });

  it("payloadFor(entity) для entity вне current spawn scope бросает clear error", () => {
    let existingEntity: EntityIndex | undefined;
    let probeOutsideScope = false;
    const movementActor = createMovementSpawnActor((_slice, action, { self, payloadFor }) => {
      if (action.type !== "ENTITY_SPAWNED") return;
      if (probeOutsideScope) payloadFor(existingEntity!);

      for (const entity of self.indices) {
        payloadFor(entity);
        existingEntity ??= entity;
      }
    });
    const machines = { movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: "a" } });
    probeOutsideScope = true;
    const error = expectLiteFsmError(
      () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/b", x: 3, y: 4, label: "b" } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    expect(error.message).toContain("current spawn scope");
  });

  it("ошибка payloadFor(existingEntity) во втором ENTITY_SPAWNED откатывает только второй spawn", () => {
    let failSecondSpawn = true;
    const movementActor = createMovementSpawnActor((_slice, action, { self, payloadFor }) => {
      if (action.type !== "ENTITY_SPAWNED") return;

      for (const entity of self.indices) {
        if (self.entityId(entity) === "unit/b" && failSecondSpawn) {
          payloadFor(0 as EntityIndex);
        }
      }
    });
    const machines = { movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } });
    const error = expectLiteFsmError(
      () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/b", x: 3, y: 4, label: null } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    const store = entityAccess<typeof machines>(manager).get("movementActor");
    expect(error.message).toContain("current spawn scope");
    expect(store.count).toBe(1);
    expect(store.has(0 as EntityIndex)).toBe(true);
    expect(store.has(1 as EntityIndex)).toBe(false);

    failSecondSpawn = false;
    manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/b", x: 3, y: 4, label: null } });
    expect(store.count).toBe(2);
    expect(store.has(1 as EntityIndex)).toBe(true);
  });

  it("ошибка public spawn event reducer откатывает lifecycle-created row в том же dispatch", () => {
    let failPublicSpawn = true;
    const movementActor = createMovementSpawnActor((_slice, action, { self, payloadFor }) => {
      if (action.type === "ENTITY_SPAWNED") {
        for (const entity of self.indices) {
          const payload = payloadFor(entity);
          self.x[entity] = payload.x;
        }
        return;
      }

      if (action.type === "SPAWN_ENTITY" && failPublicSpawn) {
        payloadFor(self.indices[0]);
      }
    });
    const machines = { movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const error = expectLiteFsmError(
      () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    const store = entityAccess<typeof machines>(manager).get("movementActor");
    expect(error.message).toContain("payloadFor(entity)");
    expect(error.message).toContain("ENTITY_SPAWNED");
    expect(store.count).toBe(0);
    expect(store.has(0 as EntityIndex)).toBe(false);

    failPublicSpawn = false;
    manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } });
    expect(store.count).toBe(1);
    expect(store.has(0 as EntityIndex)).toBe(true);
  });

  it("empty recipe result является no-op spawn, но public event delivery продолжается", () => {
    const counter = {
      config: { READY: { SPAWN_EMPTY: "READY" } },
      initialState: "READY",
      initialContext: { count: 0 },
      reducer: (slice: { readonly context: { readonly count: number } }) => ({
        state: "READY",
        context: { count: slice.context.count + 1 },
      }),
    };
    const movementActor = createMovementSpawnActor();
    const machines = { counter, movementActor };
    const spawnEvents = createEmptySpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_EMPTY: () => [],
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    manager.transition({ type: "SPAWN_EMPTY", payload: { id: "ignored" } });

    expect(manager.getState().counter.context.count).toBe(1);
    expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(0);
  });

  it("duplicate id против live entity fails atomically", () => {
    const movementActor = createMovementSpawnActor();
    const machines = { movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const delivered: string[] = [];
    manager.onTransition((_prev, _next, action) => {
      delivered.push(action.type);
    });

    manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: "a" } });
    delivered.length = 0;
    const error = expectLiteFsmError(
      () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 3, y: 4, label: "b" } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    expect(error.message).toContain("duplicate entity id 'unit/a'");
    expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(1);
    expect(delivered).toEqual([]);
  });

  it("duplicate ids внутри одного recipe result fails atomically", () => {
    const movementActor = createMovementSpawnActor();
    const machines = { movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => [
        {
          id: payload.id,
          groupTag: "unit",
          actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
        },
        {
          id: payload.id,
          groupTag: "unit",
          actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
        },
      ],
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const delivered: string[] = [];
    manager.onTransition((_prev, _next, action) => {
      delivered.push(action.type);
    });
    const error = expectLiteFsmError(
      () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: "a" } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    expect(error.message).toContain("duplicate entity id 'unit/a'");
    expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(0);
    expect(delivered).toEqual([]);
  });

  it("invalid actor payload, extra key и optional(...) mismatch fail atomically", () => {
    const cases = [
      ["missing optional key", { x: 1, y: 2 }],
      ["undefined optional key", { x: 1, y: 2, label: undefined }],
      ["wrong optional inner type", { x: 1, y: 2, label: 1 }],
      ["extra key", { x: 1, y: 2, label: null, extra: 1 }],
      ["wrong scalar type", { x: "bad", y: 2, label: null }],
      ["null scalar", { x: null, y: 2, label: null }],
      ["undefined scalar", { x: undefined, y: 2, label: null }],
    ] as const;

    for (const [name, actorPayload] of cases) {
      const movementActor = createMovementSpawnActor();
      const machines = { movementActor };
      const spawnEvents = createSpawnEvents();
      const spawn = defineEntitySpawn(machines, spawnEvents)({
        SPAWN_ENTITY: (payload) => ({
          id: payload.id,
          groupTag: "unit",
          actors: { movementActor: actorPayload as never },
        }),
      });
      const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
      const error = expectLiteFsmError(
        () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: `unit/${name}`, x: 1, y: 2, label: null } }),
        "LITE_FSM_INVALID_STORAGE_RUNTIME",
      );

      expect(error.message).toContain("payload");
      expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(0);
    }
  });

  it("invalid recipe/spec aborts before storage reduce and public delivery", () => {
    const counter = {
      config: { READY: { SPAWN_ENTITY: "READY" } },
      initialState: "READY",
      initialContext: { count: 0 },
      reducer: (slice: { readonly context: { readonly count: number } }) => ({
        state: "READY",
        context: { count: slice.context.count + 1 },
      }),
    };
    const movementActor = createMovementSpawnActor();
    const machines = { counter, movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: () => ({ groupTag: "unit", actors: { movementActor: { x: 1, y: 2, label: null } } }) as never,
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const delivered: string[] = [];
    manager.onTransition((_prev, _next, action) => {
      delivered.push(action.type);
    });
    const error = expectLiteFsmError(
      () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    expect(error.message).toContain("EntitySpawnSpec.id");
    expect(manager.getState().counter.context.count).toBe(0);
    expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(0);
    expect(delivered).toEqual([]);
  });

  it("middleware без next предотвращает spawn recipe execution", () => {
    let recipeCalls = 0;
    const movementActor = createMovementSpawnActor();
    const machines = { movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => {
        recipeCalls += 1;
        return {
          id: payload.id,
          groupTag: "unit",
          actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
        };
      },
    });
    const manager = MachineManager(machines, {
      plugins: [entitiesPlugin({ spawn })] as const,
      middleware: [() => () => (action) => action],
    });

    manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } });

    expect(recipeCalls).toBe(0);
    expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(0);
  });

  it("interceptor replacements управляют spawn по финальному action независимо от позиции entitiesPlugin", () => {
    const createManager = (pluginOrder: "before" | "after") => {
      let recipeCalls = 0;
      const movementActor = createMovementSpawnActor();
      const machines = { movementActor };
      const spawnEvents = createSpawnEvents();
      const spawn = defineEntitySpawn(machines, spawnEvents)({
        SPAWN_ENTITY: (payload) => {
          recipeCalls += 1;
          return {
            id: payload.id,
            groupTag: "unit",
            actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
          };
        },
      });
      const replacePing = definePlugin().create({
        name: `replace-ping-${pluginOrder}`,
        intercept(ctx) {
          if (ctx.action.type !== "PING") return;
          return { action: { type: "SPAWN_ENTITY", payload: { id: `unit/${pluginOrder}`, x: 1, y: 2, label: null } } };
        },
      });
      const entityPlugin = entitiesPlugin({ spawn });
      const plugins =
        pluginOrder === "before" ? ([entityPlugin, replacePing] as const) : ([replacePing, entityPlugin] as const);
      const manager = MachineManager(machines, {
        plugins,
      });

      return { manager, machines, recipeCalls: () => recipeCalls };
    };

    for (const order of ["before", "after"] as const) {
      const { manager, machines, recipeCalls } = createManager(order);
      manager.transition({ type: "PING" } as never);

      expect(recipeCalls()).toBe(1);
      expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(1);
    }
  });

  it("replacement from spawn event to non-spawn и skipDelivery предотвращают spawn", () => {
    const movementActor = createMovementSpawnActor();
    const machines = { movementActor };
    const spawnEvents = createSpawnEvents();
    let recipeCalls = 0;
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => {
        recipeCalls += 1;
        return {
          id: payload.id,
          groupTag: "unit",
          actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
        };
      },
    });
    const replaceFromSpawn = definePlugin().create({
      name: "replace-from-spawn",
      intercept() {
        return { action: { type: "PING" } };
      },
    });
    const skipSpawn = definePlugin().create({
      name: "skip-spawn",
      intercept() {
        return { skipDelivery: true };
      },
    });
    const managerWithReplacement = MachineManager(machines, {
      plugins: [replaceFromSpawn, entitiesPlugin({ spawn })] as const,
    });
    managerWithReplacement.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } });

    expect(recipeCalls).toBe(0);
    expect(entityAccess<typeof machines>(managerWithReplacement).get("movementActor").count).toBe(0);

    const managerWithSkip = MachineManager(machines, {
      plugins: [skipSpawn, entitiesPlugin({ spawn })] as const,
    });
    managerWithSkip.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/b", x: 1, y: 2, label: null } });

    expect(recipeCalls).toBe(0);
    expect(entityAccess<typeof machines>(managerWithSkip).get("movementActor").count).toBe(0);
  });

  it("empty actors fails atomically", () => {
    const movementActor = createMovementSpawnActor();
    const machines = { movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors: {},
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const error = expectLiteFsmError(
      () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    expect(error.message).toContain("at least one actor");
    expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(0);
  });

  it("invalid spec aborts before subscribers and effects observe partial state", () => {
    const effects: string[] = [];
    const delivered: string[] = [];
    const counter = {
      config: { READY: { SPAWN_ENTITY: "READY" } },
      initialState: "READY",
      initialContext: {},
      effects: {
        READY: () => {
          effects.push("READY");
        },
      },
    };
    const movementActor = createMovementSpawnActor();
    const machines = { counter, movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: () => ({
        id: "unit/a",
        groupTag: "unit",
        actors: { unknownActor: {} },
      }) as never,
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    manager.onTransition((_prev, _next, action) => {
      delivered.push(action.type);
    });
    const error = expectLiteFsmError(
      () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    expect(error.message).toContain("unknown entity actor template 'unknownActor'");
    expect(delivered).toEqual([]);
    expect(effects).toEqual([]);
    expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(0);
  });

  it("invalid recipe output shapes and required spec fields fail before mutation", () => {
    const cases = [
      ["primitive result", () => 1, "recipe must return"],
      ["primitive array item", () => [1], "EntitySpawnSpec must be a plain object"],
      [
        "empty groupTag",
        (payload: SpawnEntityPayload) => ({
          id: payload.id,
          groupTag: "",
          actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
        }),
        "EntitySpawnSpec.groupTag",
      ],
      [
        "actors not object",
        (payload: SpawnEntityPayload) => ({
          id: payload.id,
          groupTag: "unit",
          actors: null,
        }),
        "actors must be a plain object",
      ],
      [
        "actor payload not object",
        (payload: SpawnEntityPayload) => ({
          id: payload.id,
          groupTag: "unit",
          actors: { movementActor: null },
        }),
        "payload must be a plain object",
      ],
    ] as const;

    for (const [name, recipe, message] of cases) {
      const movementActor = createMovementSpawnActor();
      const machines = { movementActor };
      const spawnEvents = createSpawnEvents();
      const spawn = defineEntitySpawn(machines, spawnEvents)({
        SPAWN_ENTITY: recipe as never,
      });
      const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
      const error = expectLiteFsmError(
        () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: `unit/${name}`, x: 1, y: 2, label: null } }),
        "LITE_FSM_INVALID_STORAGE_RUNTIME",
      );

      expect(error.message).toContain(message);
      expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(0);
    }
  });

  it("spawn row без ENTITY_SPAWNED transition остается в __INIT, а null transition сохраняет state", () => {
    const passiveActor = {
      ...createMovementSpawnActor(),
      config: { __INIT: {}, READY: { TICK: null } },
    } as never;
    const passiveMachines = { movementActor: passiveActor };
    const passiveSpawnEvents = createSpawnEvents();
    const passiveSpawn = defineEntitySpawn(passiveMachines, passiveSpawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
      }),
    });
    const passiveManager = MachineManager(passiveMachines, { plugins: [entitiesPlugin({ spawn: passiveSpawn })] as const });
    passiveManager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/passive", x: 1, y: 2, label: null } });

    const passiveStore = entityAccess<typeof passiveMachines>(passiveManager).get("movementActor");
    expect(passiveStore.count).toBe(1);
    expect(passiveStore.state(0 as EntityIndex)).toBeUndefined();

    const stableActor = {
      ...createMovementSpawnActor(),
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: null } },
    } as never;
    const stableMachines = { movementActor: stableActor };
    const stableSpawnEvents = createSpawnEvents();
    const stableSpawn = defineEntitySpawn(stableMachines, stableSpawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
      }),
    });
    const stableManager = MachineManager(stableMachines, { plugins: [entitiesPlugin({ spawn: stableSpawn })] as const });
    stableManager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/stable", x: 1, y: 2, label: null } });
    stableManager.transition({ type: "TICK" });

    expect(entityAccess<typeof stableMachines>(stableManager).get("movementActor").state(0 as EntityIndex)).toBe("READY");
  });

  it("public delivery пропускает capacity holes в actor store", () => {
    const movementActor = createMovementSpawnActor();
    const nameActor = createMovementSpawnActor();
    const machines = { movementActor, nameActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors:
          payload.id === "unit/name"
            ? { nameActor: { x: payload.x, y: payload.y, label: payload.label } }
            : { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/name", x: 1, y: 2, label: null } });
    manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/movement", x: 3, y: 4, label: null } });
    manager.transition({ type: "TICK" });

    const movement = entityAccess<typeof machines>(manager).get("movementActor");
    expect(movement.has(0 as EntityIndex)).toBe(false);
    expect(movement.has(1 as EntityIndex)).toBe(true);
  });

  it("invalid entity state targets and reducer stateCode writes throw clear errors", () => {
    const badTargetActor = {
      ...createMovementSpawnActor(),
      config: { __INIT: { ENTITY_SPAWNED: "MISSING" }, READY: { TICK: "READY" } },
    } as never;
    const targetMachines = { movementActor: badTargetActor };
    const targetSpawnEvents = createSpawnEvents();
    const targetSpawn = defineEntitySpawn(targetMachines, targetSpawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
      }),
    });
    const targetManager = MachineManager(targetMachines, { plugins: [entitiesPlugin({ spawn: targetSpawn })] as const });
    const targetError = expectLiteFsmError(
      () => targetManager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );
    expect(targetError.message).toContain("targets unknown state 'MISSING'");
    expect(entityAccess<typeof targetMachines>(targetManager).get("movementActor").count).toBe(0);
    const targetRetryError = expectLiteFsmError(
      () => targetManager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );
    expect(targetRetryError.message).toContain("targets unknown state 'MISSING'");

    const invalidStateActor = createMovementSpawnActor((_slice, action, { self }) => {
      if (action.type !== "TICK") return;
      for (const entity of self.indices) self.stateCode[entity] = 99;
    });
    const machines = { movementActor: invalidStateActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } });

    const reducerError = expectLiteFsmError(() => manager.transition({ type: "TICK" }), "LITE_FSM_INVALID_STORAGE_RUNTIME");
    expect(reducerError.message).toContain("invalid stateCode 99");

    const collectError = expectLiteFsmError(() => manager.transition({ type: "TICK" }), "LITE_FSM_INVALID_STORAGE_RUNTIME");
    expect(collectError.message).toContain("invalid stateCode 99");
  });

  it("self.entityId(entity) validates entity index", () => {
    const movementActor = createMovementSpawnActor((_slice, action, { self }) => {
      if (action.type === "ENTITY_SPAWNED") self.entityId(999 as EntityIndex);
    });
    const machines = { movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => ({
        id: payload.id,
        groupTag: "unit",
        actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const error = expectLiteFsmError(
      () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );

    expect(error.message).toContain("unknown entity index 999");
    expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(0);
    const retryError = expectLiteFsmError(
      () => manager.transition({ type: "SPAWN_ENTITY", payload: { id: "unit/a", x: 1, y: 2, label: null } }),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );
    expect(retryError.message).toContain("unknown entity index 999");
  });

  it("hydrate не вызывает spawn recipes", () => {
    let recipeCalls = 0;
    const counter = createCounter();
    const movementActor = createMovementSpawnActor();
    const machines = { counter, movementActor };
    const spawnEvents = createSpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_ENTITY: (payload) => {
        recipeCalls += 1;
        return {
          id: payload.id,
          groupTag: "unit",
          actors: { movementActor: { x: payload.x, y: payload.y, label: payload.label } },
        };
      },
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    manager.hydrate({ machines: {} });

    expect(recipeCalls).toBe(0);
    expect(entityAccess<typeof machines>(manager).get("movementActor").count).toBe(0);
  });

  it("lifecycle names и invalid spawn descriptor дают clear errors", () => {
    expectLiteFsmError(() => defineSpawnEvents(1 as never), "LITE_FSM_INVALID_OPTIONS");
    expectLiteFsmError(() => defineSpawnEvents({ SPAWN_ENTITY: {} as never }), "LITE_FSM_INVALID_OPTIONS");

    expectLiteFsmError(
      () => defineSpawnEvents({ ENTITY_SPAWNED: spawnEvent<{}>() }),
      "LITE_FSM_INVALID_OPTIONS",
    );

    const movementActor = createMovementSpawnActor();
    const spawnEvents = defineSpawnEvents({ SPAWN_ENTITY: spawnEvent<SpawnEntityPayload>() });
    expectLiteFsmError(
      () => defineEntitySpawn({ movementActor }, spawnEvents)(1 as never),
      "LITE_FSM_INVALID_OPTIONS",
    );
    expectLiteFsmError(
      () => defineEntitySpawn({ movementActor }, spawnEvents)({ SPAWN_ENTITY: 1 } as never),
      "LITE_FSM_INVALID_OPTIONS",
    );
    expectLiteFsmError(
      () =>
        defineEntitySpawn({ movementActor }, spawnEvents)({
          SPAWN_ENTITY: () => [],
          UNKNOWN: () => [],
        } as never),
      "LITE_FSM_INVALID_OPTIONS",
    );
    expectLiteFsmError(
      () => defineEntitySpawn({ movementActor }, spawnEvents)({} as never),
      "LITE_FSM_INVALID_OPTIONS",
    );
    expectLiteFsmError(
      () => defineEntitySpawn({ movementActor }, spawnEvents)({ ENTITY_DESPAWNED: () => [] } as never),
      "LITE_FSM_INVALID_OPTIONS",
    );
    expectLiteFsmError(() => entitiesPlugin({ spawn: {} } as never), "LITE_FSM_INVALID_OPTIONS");
  });
});

describe("@lite-fsm/entities — этап 6 reduce pipeline и routing", () => {
  const createStage6SpawnEvents = () =>
    defineSpawnEvents({
      SPAWN_STAGE6: spawnEvent<{ readonly id: string; readonly groupTag: string }>(),
    });

  const spawnStage6Entity = (
    manager: { transition(action: { readonly type: "SPAWN_STAGE6"; readonly payload: { readonly id: string; readonly groupTag: string } }): unknown },
    id: string,
    groupTag = "unit",
  ) => {
    manager.transition({ type: "SPAWN_STAGE6", payload: { id, groupTag } });
  };

  it("TICK доставляется только accepting templates и reducer вызывается один раз на template", () => {
    const tickCalls: number[] = [];
    const pingCalls: string[] = [];
    const tickActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
      initialState: "__INIT",
      initialContext: { hits: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "TICK") return;
        tickCalls.push(self.indices.length);
        for (const entity of self.indices) self.hits[entity] += 1;
      },
    } as const;
    const pingActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: { hits: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }) {
        pingCalls.push(action.type);
      },
    } as const;
    const machines = { tickActor, pingActor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: { tickActor: {}, pingActor: {} },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage6Entity(manager, "unit/a");
    spawnStage6Entity(manager, "unit/b");
    pingCalls.length = 0;
    manager.transition({ type: "TICK" });

    const tickStore = entityAccess<typeof machines>(manager).get("tickActor");
    const pingStore = entityAccess<typeof machines>(manager).get("pingActor");
    expect(tickCalls).toEqual([2]);
    expect(pingCalls).toEqual([]);
    expect(tickStore.hits[0 as EntityIndex]).toBe(1);
    expect(tickStore.hits[1 as EntityIndex]).toBe(1);
    expect(pingStore.hits[0 as EntityIndex]).toBe(0);
    expect(pingStore.hits[1 as EntityIndex]).toBe(0);
  });

  it("compile metadata строит numeric event codes без duplicate event types", () => {
    const metadata = compileEntityTemplate("actor", {
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { TICK: "READY" },
        STOPPED: { TICK: "READY" },
        EMPTY: undefined,
        "*": { TICK: "READY" },
      } as never,
      initialContext: {},
      spawnSchema: {},
    });
    const compiled = compileEntityRuntimeMetadata([metadata]);
    const patched = compileEntityRuntimeMetadata([{ ...metadata, eventTypes: ["ENTITY_SPAWNED"] }]);

    expect(compiled.eventTypesByCode).toEqual(["ENTITY_SPAWNED", "TICK"]);
    expect(compiled.metadataByKey.actor.eventAcceptMask[compiled.eventCodeByType.TICK]).toBe(1);
    expect(patched.eventTypesByCode).toEqual(["ENTITY_SPAWNED"]);
  });

  it("lifecycle batch skips actor без ENTITY_SPAWNED transition когда eventCode существует", () => {
    const passiveActor = {
      storage: "entity",
      config: { __INIT: {}, READY: { TICK: "READY" } },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
    } as const;
    const activeActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
    } as const;
    const machines = { passiveActor, activeActor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: { passiveActor: {}, activeActor: {} },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage6Entity(manager, "unit/a");

    const access = entityAccess<typeof machines>(manager);
    expect(access.get("passiveActor").state(0 as EntityIndex)).toBeUndefined();
    expect(access.get("activeActor").state(0 as EntityIndex)).toBe("READY");
  });

  it("empty multi-bucket event и unknown eventCode возвращают no-op batches", () => {
    const actor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { TICK: "READY" },
        STOPPED: { TICK: "STOPPED" },
      },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
    } as const;
    const manager = MachineManager({ actor }, { plugins: [entitiesPlugin()] as const });
    const runtime = getEntityRuntimeState(manager.entities());
    const eventCode = runtime.eventCodeByType.TICK;

    expect(manager.transition({ type: "TICK" })).toEqual({ type: "TICK" });
    expect(collectEntityPublicReducerBatches(runtime, eventCode, { scope: "unscoped", key: undefined, targetSet: [] })).toEqual(
      [],
    );
    expect(
      collectEntityPublicReducerBatches(runtime, 999, { scope: "unscoped", key: undefined, targetSet: [] }),
    ).toEqual([]);
    (runtime.templatesByEventCode as unknown as Array<unknown>)[999] = [runtime.actorStores.actor];
    expect(
      collectEntityPublicReducerBatches(runtime, 999, { scope: "unscoped", key: undefined, targetSet: [] }),
    ).toEqual([]);
  });

  it("entity route пропускает dead, missing actor и non-accepting rows", () => {
    const routedCalls: string[] = [];
    const routedActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { PING: "READY", STOP: "STOPPED" },
        STOPPED: {},
      },
      initialState: "__INIT",
      initialContext: { hits: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "PING") return;
        for (const entity of self.indices) {
          routedCalls.push(self.entityId(entity));
          self.hits[entity] += 1;
        }
      },
    } as const;
    const otherActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
    } as const;
    const machines = { routedActor, otherActor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: payload.id === "other/a" ? { otherActor: {} } : { routedActor: {} },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const runtime = getEntityRuntimeState(manager.entities());

    spawnStage6Entity(manager, "unit/dead");
    spawnStage6Entity(manager, "other/a");
    spawnStage6Entity(manager, "unit/stopped");
    const eventCode = runtime.eventCodeByType.PING;
    const otherEntity = 1 as EntityIndex;
    const otherRows = runtime.actorRowsByEntity[otherEntity];
    delete runtime.actorRowsByEntity[otherEntity];
    expect(
      collectEntityPublicReducerBatches(runtime, eventCode, {
        scope: "plugin",
        key: "entityId",
        targetSet: ["other/a"],
      }),
    ).toEqual([]);
    runtime.actorRowsByEntity[otherEntity] = otherRows;
    runtime.actorStores.otherActor.presence[otherEntity] = 0;
    runtime.entityStore.alive[0] = 0;
    manager.transition({ type: "STOP", meta: { entityId: "unit/stopped" } } as never);
    manager.transition({
      type: "PING",
      meta: { entityId: ["unit/dead", "other/a", "unit/stopped"] },
    } as never);

    expect(routedCalls).toEqual([]);
    expect(entityAccess<typeof machines>(manager).get("routedActor").hits[0 as EntityIndex]).toBe(0);
  });

  it("config-default transition применяется до reducer, а reducer может override и rollback stateCode", () => {
    const observations: string[] = [];
    const actor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { STOP: "STOPPED", TICK: "READY" },
        STOPPED: {},
      },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        for (const entity of self.indices) {
          if (action.type === "STOP") {
            observations.push(`${self.prevStateCode[entity]}->${self.stateCode[entity]}:${self.states.STOPPED}`);
            self.stateCode[entity] = self.prevStateCode[entity];
          }
          if (action.type === "TICK") {
            self.stateCode[entity] = self.states.STOPPED;
          }
        }
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const store = entityAccess<typeof machines>(manager).get("actor");
    const entity = 0 as EntityIndex;

    spawnStage6Entity(manager, "unit/a");
    manager.transition({ type: "STOP" });
    expect(observations).toEqual(["0->1:1"]);
    expect(store.state(entity)).toBe("READY");

    manager.transition({ type: "TICK" });
    expect(store.state(entity)).toBe("STOPPED");
  });

  it("unscoped event собирает accepted rows из нескольких state buckets в reusable scratch", () => {
    const frames: string[][] = [];
    const actor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { STOP: "STOPPED", TICK: "READY" },
        STOPPED: { TICK: "STOPPED" },
      },
      initialState: "__INIT",
      initialContext: { hits: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "TICK") return;
        const ids: string[] = [];
        for (const entity of self.indices) {
          ids.push(self.entityId(entity));
          self.hits[entity] += 1;
        }
        frames.push(ids);
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage6Entity(manager, "unit/a");
    spawnStage6Entity(manager, "unit/b");
    manager.transition({ type: "STOP", meta: { entityId: "unit/b" } } as never);
    manager.transition({ type: "TICK" });

    const store = entityAccess<typeof machines>(manager).get("actor");
    expect(frames).toEqual([["unit/a", "unit/b"]]);
    expect(store.hits[0 as EntityIndex]).toBe(1);
    expect(store.hits[1 as EntityIndex]).toBe(1);
  });

  it("invalid stateCode после reducer бросает clear dev error", () => {
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type === "TICK") {
          for (const entity of self.indices) self.stateCode[entity] = 99;
        }
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage6Entity(manager, "unit/a");
    const error = expectLiteFsmError(() => manager.transition({ type: "TICK" }), "LITE_FSM_INVALID_STORAGE_RUNTIME");
    expect(error.message).toContain("invalid stateCode 99");

    const routedError = expectLiteFsmError(
      () => manager.transition({ type: "TICK", meta: { entityId: "unit/a" } } as never),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );
    expect(routedError.message).toContain("invalid stateCode 99");
  });

  it("state transition обновляет buckets через dense swap-remove", () => {
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { STOP: "STOPPED" }, STOPPED: {} },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
    } as const;
    const machines = { actor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage6Entity(manager, "unit/a");
    spawnStage6Entity(manager, "unit/b");
    spawnStage6Entity(manager, "unit/c");

    const actorStore = getEntityRuntimeState(manager.entities()).actorStores.actor;
    const readyCode = actorStore.metadata.stateCodeByName.READY;
    const stoppedCode = actorStore.metadata.stateCodeByName.STOPPED;
    expect(actorStore.stateBuckets[readyCode]).toEqual([0, 1, 2]);

    manager.transition({ type: "STOP", meta: { entityId: "unit/b" } } as never);

    expect(actorStore.stateBuckets[readyCode]).toEqual([0, 2]);
    expect(actorStore.stateBuckets[stoppedCode]).toEqual([1]);
    expect(actorStore.statePosition[0]).toBe(0);
    expect(actorStore.statePosition[1]).toBe(0);
    expect(actorStore.statePosition[2]).toBe(1);
  });

  it("meta.entityId доставляет rows указанной entity и bump-ит rowVersion только accepted rows", () => {
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: { hits: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "PING") return;
        for (const entity of self.indices) self.hits[entity] += 1;
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage6Entity(manager, "unit/a");
    spawnStage6Entity(manager, "unit/b");
    const actorStore = getEntityRuntimeState(manager.entities()).actorStores.actor;
    const beforeA = actorStore.rowVersion[0];
    const beforeB = actorStore.rowVersion[1];

    manager.transition({ type: "PING", meta: { entityId: "unit/a" } } as never);

    const store = entityAccess<typeof machines>(manager).get("actor");
    expect(store.hits[0 as EntityIndex]).toBe(1);
    expect(store.hits[1 as EntityIndex]).toBe(0);
    expect(actorStore.rowVersion[0]).toBe(beforeA + 1);
    expect(actorStore.rowVersion[1]).toBe(beforeB);
  });

  it("meta.entityId array dedupe сохраняет первое появление и порядок доставки", () => {
    const delivered: string[] = [];
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "PING") return;
        for (const entity of self.indices) delivered.push(self.entityId(entity));
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage6Entity(manager, "unit/a");
    spawnStage6Entity(manager, "unit/b");
    spawnStage6Entity(manager, "unit/c");
    manager.transition({ type: "PING", meta: { entityId: ["unit/c", "unit/a", "unit/c", "unit/b"] } } as never);

    expect(delivered).toEqual(["unit/c", "unit/a", "unit/b"]);
  });

  it("invalid raw meta.entityId value throws clear route resolver error", () => {
    const actor = createEntityTemplate();
    const manager = MachineManager({ actor }, { plugins: [entitiesPlugin()] as const });
    const error = expectLiteFsmError(
      () => manager.transition({ type: "TICK", meta: { entityId: 1 } } as never),
      "LITE_FSM_INVALID_ROUTE_RESOLVER_RESULT",
    );

    expect(error.message).toContain("routeMeta.entityId");
    expect(error.message).toContain("string or an array of strings");
  });

  it("meta.groupTag доставляет entity rows matching groups и сохраняет instance behavior", () => {
    const entityActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: { hits: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "PING") return;
        for (const entity of self.indices) self.hits[entity] += 1;
      },
    } as const;
    const instanceActor = {
      storage: "instance",
      groupTag: "enemy",
      config: { __INIT: { SPAWN_INSTANCE: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: { hits: 0 },
      reducer: (slice: { readonly context: { readonly hits: number } }, _action: unknown, meta: { readonly nextState: "READY" }) => ({
        state: meta.nextState,
        context: { hits: slice.context.hits + 1 },
      }),
    } as const;
    const machines = { entityActor, instanceActor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { entityActor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage6Entity(manager, "enemy/a", "enemy");
    spawnStage6Entity(manager, "ally/a", "ally");
    manager.transition({ type: "SPAWN_INSTANCE" } as never);
    manager.transition({ type: "PING", meta: { groupTag: "enemy" } });

    const store = entityAccess<typeof machines>(manager).get("entityActor");
    const instanceRows = Object.values(manager.getState().instanceActor);
    expect(store.hits[0 as EntityIndex]).toBe(1);
    expect(store.hits[1 as EntityIndex]).toBe(0);
    expect(instanceRows).toHaveLength(1);
    expect(instanceRows[0].context.hits).toBe(2);
  });

  it("entityId и groupTag вместе бросают ambiguous route error до delivery", () => {
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: { hits: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "PING") return;
        for (const entity of self.indices) self.hits[entity] += 1;
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage6Entity(manager, "unit/a");
    const error = expectLiteFsmError(
      () => manager.transition({ type: "PING", meta: { entityId: "unit/a", groupTag: "unit" } } as never),
      "LITE_FSM_AMBIGUOUS_ROUTE_META",
    );

    expect(error.message).toContain("entityId, groupTag");
    expect(entityAccess<typeof machines>(manager).get("actor").hits[0 as EntityIndex]).toBe(0);
  });

  it("actorId не адресует entity rows, unknown entityId и unknown groupTag являются no-op", () => {
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: { hits: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "PING") return;
        for (const entity of self.indices) self.hits[entity] += 1;
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const store = entityAccess<typeof machines>(manager).get("actor");

    spawnStage6Entity(manager, "unit/a");
    manager.transition({ type: "PING", meta: { actorId: "unit/a" } });
    manager.transition({ type: "PING", meta: { entityId: "missing" } } as never);
    manager.transition({ type: "PING", meta: { groupTag: "missing" } });

    expect(store.hits[0 as EntityIndex]).toBe(0);
  });

  it("middleware rewrite сохраняет meta.entityId для entity delivery", () => {
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: { hits: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "PING") return;
        for (const entity of self.indices) self.hits[entity] += 1;
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    type Stage6RewriteEvent =
      | { readonly type: "PING" }
      | { readonly type: "SPAWN_STAGE6"; readonly payload: { readonly id: string; readonly groupTag: string } };
    type Stage6RewriteMeta = {
      readonly actorId?: string | string[];
      readonly groupId?: string | string[];
      readonly groupTag?: string | string[];
      readonly entityId?: string | readonly string[];
    };
    const rewrite: Middleware<any, Stage6RewriteEvent, Stage6RewriteMeta> = () => (next) => (action) =>
      next({ ...action, meta: { ...action.meta, entityId: "unit/b" } } as never);
    const manager = MachineManager(machines, {
      middleware: [rewrite],
      plugins: [entitiesPlugin({ spawn })] as const,
    });

    spawnStage6Entity(manager, "unit/a");
    spawnStage6Entity(manager, "unit/b");
    manager.transition({ type: "PING", meta: { entityId: "unit/a" } } as never);

    const store = entityAccess<typeof machines>(manager).get("actor");
    expect(store.hits[0 as EntityIndex]).toBe(0);
    expect(store.hits[1 as EntityIndex]).toBe(1);
  });

  it("routed entityId и groupTag не сканируют unrelated accepting templates", () => {
    const delivered: string[] = [];
    const targetActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: { hits: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "PING") return;
        for (const entity of self.indices) {
          delivered.push(self.entityId(entity));
          self.hits[entity] += 1;
        }
      },
    } as const;
    const noiseA = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
    } as const;
    const noiseB = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
    } as const;
    const noiseC = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { PING: "READY" } },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
    } as const;
    const machines = { targetActor, noiseA, noiseB, noiseC };
    const spawnEvents = createStage6SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE6: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors:
          payload.groupTag === "target"
            ? { targetActor: {} }
            : { noiseA: {}, noiseB: {}, noiseC: {} },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage6Entity(manager, "unit/target", "target");
    spawnStage6Entity(manager, "unit/noise", "noise");

    const runtime = getEntityRuntimeState(manager.entities());
    let unrelatedScratchReads = 0;
    for (const templateKey of ["noiseA", "noiseB", "noiseC"] as const) {
      const store = runtime.actorStores[templateKey];
      const scratch = store.acceptedScratch;
      Object.defineProperty(store, "acceptedScratch", {
        configurable: true,
        get() {
          unrelatedScratchReads += 1;
          return scratch;
        },
      });
    }

    manager.transition({ type: "PING", meta: { entityId: "unit/target" } } as never);
    manager.transition({ type: "PING", meta: { groupTag: "target" } });

    expect(unrelatedScratchReads).toBe(0);
    expect(delivered).toEqual(["unit/target", "unit/target"]);
    expect(entityAccess<typeof machines>(manager).get("targetActor").hits[0 as EntityIndex]).toBe(2);
  });

  it("hot TICK переиспользует indices buffer и не масштабирует Map.get от row count", () => {
    const createManager = (rows: number) => {
      const indicesFrames: Array<readonly EntityIndex[]> = [];
      const actor = {
        storage: "entity",
        config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
        initialState: "__INIT",
        initialContext: { hits: i32() },
        spawnSchema: {},
        reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
          if (action.type !== "TICK") return;
          indicesFrames.push(self.indices);
          for (const entity of self.indices) {
            expect(typeof entity).toBe("number");
            self.hits[entity] += 1;
          }
        },
      } as const;
      const machines = { actor };
      const spawnEvents = createStage6SpawnEvents();
      const spawn = defineEntitySpawn(machines, spawnEvents)({
        SPAWN_STAGE6: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
      });
      const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

      for (let index = 0; index < rows; index += 1) spawnStage6Entity(manager, `unit/${index}`);
      return { manager, indicesFrames };
    };
    const countMapGets = (rows: number): number => {
      const { manager } = createManager(rows);
      const originalGet = Map.prototype.get;
      let calls = 0;
      Map.prototype.get = function patchedMapGet(this: Map<unknown, unknown>, key: unknown) {
        calls += 1;
        return originalGet.call(this, key);
      };
      try {
        manager.transition({ type: "TICK" });
      } finally {
        Map.prototype.get = originalGet;
      }
      return calls;
    };
    const countSetArrayEntries = (rows: number): number => {
      const { manager } = createManager(rows);
      const OriginalSet = globalThis.Set;
      let copiedEntries = 0;
      class CountingSet<T> extends OriginalSet<T> {
        constructor(iterable?: Iterable<T> | null) {
          if (Array.isArray(iterable)) copiedEntries += iterable.length;
          super(iterable);
        }
      }
      (globalThis as typeof globalThis & { Set: SetConstructor }).Set = CountingSet as SetConstructor;
      try {
        manager.transition({ type: "TICK" });
      } finally {
        (globalThis as typeof globalThis & { Set: SetConstructor }).Set = OriginalSet;
      }
      return copiedEntries;
    };
    const { manager, indicesFrames } = createManager(32);

    manager.transition({ type: "TICK" });
    manager.transition({ type: "TICK" });
    manager.transition({ type: "TICK" });

    const routingSource = readFileSync(join(rootDir, "packages/entities/src/runtime/routing.ts"), "utf8");
    expect(new Set(indicesFrames).size).toBe(1);
    expect(indicesFrames[0]).toHaveLength(32);
    expect(countMapGets(32)).toBe(countMapGets(1));
    expect(countSetArrayEntries(32)).toBe(countSetArrayEntries(1));
    expect(countSetArrayEntries(32)).toBe(0);
    expect(routingSource).not.toContain("metadata.config");
    expect(routingSource).not.toContain("getEntityStateName");
  });
});

describe("@lite-fsm/entities — этап 8 despawnOn и lifecycle cleanup", () => {
  const createStage8SpawnEvents = () =>
    defineSpawnEvents({
      SPAWN_STAGE8: spawnEvent<{ readonly id: string; readonly groupTag: string; readonly hp: number }>(),
    });

  const spawnStage8Entity = (
    manager: {
      transition(action: {
        readonly type: "SPAWN_STAGE8";
        readonly payload: { readonly id: string; readonly groupTag: string; readonly hp: number };
      }): unknown;
    },
    id: string,
    hp: number,
    groupTag = "unit",
  ) => {
    manager.transition({ type: "SPAWN_STAGE8", payload: { id, groupTag, hp } });
  };

  it("despawnOn удаляет всю entity в том же dispatch, дедуплицирует rows и позволяет переиспользовать id", () => {
    const ownerLifecycleCalls: string[] = [];
    const cleanupLifecycleCalls: string[] = [];
    const ownerActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "ALIVE" },
        ALIVE: { EXPIRE: "EXPIRED" },
        EXPIRED: {},
      },
      initialState: "__INIT",
      initialContext: { hp: i32() },
      spawnSchema: { hp: i32() },
      despawnOn: "EXPIRED",
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly hp: number } },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") self.hp[entity] = payloadFor(entity).hp;
          if (action.type === "ENTITY_DESPAWNED") ownerLifecycleCalls.push(self.entityId(entity));
        }
      },
    } as const;
    const cleanupActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "ACTIVE" },
        ACTIVE: { EXPIRE: "EXPIRED", ENTITY_DESPAWNED: "CLEANED" },
        EXPIRED: { ENTITY_DESPAWNED: "CLEANED" },
        CLEANED: {},
      },
      initialState: "__INIT",
      initialContext: { hp: i32() },
      spawnSchema: { hp: i32() },
      despawnOn: ["EXPIRED"] as const,
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly hp: number } },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") self.hp[entity] = payloadFor(entity).hp;
          if (action.type === "ENTITY_DESPAWNED") {
            cleanupLifecycleCalls.push(`cleanup:${self.entityId(entity)}:${self.hp[entity]}`);
          }
        }
      },
    } as const;
    const auditActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "ACTIVE" },
        ACTIVE: { ENTITY_DESPAWNED: "CLEANED" },
        CLEANED: {},
      },
      initialState: "__INIT",
      initialContext: { hp: i32() },
      spawnSchema: { hp: i32() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly hp: number } },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") self.hp[entity] = payloadFor(entity).hp;
          if (action.type === "ENTITY_DESPAWNED") {
            cleanupLifecycleCalls.push(`audit:${self.entityId(entity)}:${self.hp[entity]}`);
          }
        }
      },
    } as const;
    const machines = { ownerActor, cleanupActor, auditActor };
    const spawnEvents = createStage8SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE8: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: {
          ownerActor: { hp: payload.hp },
          cleanupActor: { hp: payload.hp },
          auditActor: { hp: payload.hp },
        },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const access = entityAccess<typeof machines>(manager);
    const ownerStore = access.get("ownerActor");
    const cleanupStore = access.get("cleanupActor");
    const auditStore = access.get("auditActor");
    const subscriberSnapshots: Array<{ readonly ownerHasA: boolean; readonly ownerCount: number; readonly cleanupCount: number }> = [];
    manager.onTransition((_prev, _next, action) => {
      if (action.type !== "EXPIRE") return;
      subscriberSnapshots.push({
        ownerHasA: ownerStore.has(0 as EntityIndex),
        ownerCount: ownerStore.count,
        cleanupCount: cleanupStore.count,
      });
    });

    spawnStage8Entity(manager, "unit/a", 10);
    spawnStage8Entity(manager, "unit/b", 20);
    const runtime = getEntityRuntimeState(manager.entities());
    const firstGeneration = runtime.entityStore.generation[0];

    manager.transition({ type: "EXPIRE", meta: { entityId: "unit/a" } } as never);

    expect(ownerLifecycleCalls).toEqual([]);
    expect(cleanupLifecycleCalls).toEqual(["cleanup:unit/a:10", "audit:unit/a:10"]);
    expect(subscriberSnapshots).toEqual([{ ownerHasA: false, ownerCount: 1, cleanupCount: 1 }]);
    expect(ownerStore.has(0 as EntityIndex)).toBe(false);
    expect(cleanupStore.has(0 as EntityIndex)).toBe(false);
    expect(auditStore.has(0 as EntityIndex)).toBe(false);
    expect(ownerStore.has(1 as EntityIndex)).toBe(true);
    expect(cleanupStore.hp[0 as EntityIndex]).toBe(0);
    expect(runtime.actorRowsByEntity[0]).toEqual([]);
    expect(runtime.entityStore.alive[0]).toBe(0);
    expect(runtime.entityStore.alive[1]).toBe(1);
    expect(runtime.entityStore.indexById["unit/a"]).toBeUndefined();
    expect(runtime.entityStore.indexById["unit/b"]).toBe(1);
    expect(runtime.entityStore.freeList).toEqual([0]);
    expect(runtime.entityStore.count).toBe(1);
    expect(manager.getState().ownerActor.count).toBe(1);

    spawnStage8Entity(manager, "unit/a", 30);

    expect(runtime.entityStore.indexById["unit/a"]).toBe(0);
    expect(runtime.entityStore.generation[0]).toBe(firstGeneration + 1);
    expect(runtime.entityStore.freeList).toEqual([]);
    expect(ownerStore.has(0 as EntityIndex)).toBe(true);
    expect(cleanupStore.has(0 as EntityIndex)).toBe(true);
    expect(cleanupStore.hp[0 as EntityIndex]).toBe(30);
    expect(cleanupStore.hp[1 as EntityIndex]).toBe(20);
    expect(runtime.actorStores.cleanupActor.rowVersion[0]).toBe(1);
  });

  it("переход в __RESOLVED удаляет только terminal row и не despawn-ит entity", () => {
    const lifecycleCalls: string[] = [];
    const resolverActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "ACTIVE" },
        ACTIVE: { DONE: "__RESOLVED" },
      },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "ENTITY_DESPAWNED") return;
        for (const entity of self.indices) lifecycleCalls.push(self.entityId(entity));
      },
    } as const;
    const siblingActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "ACTIVE" },
        ACTIVE: { PING: "ACTIVE" },
      },
      initialState: "__INIT",
      initialContext: { hits: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "PING") return;
        for (const entity of self.indices) self.hits[entity] += 1;
      },
    } as const;
    const machines = { resolverActor, siblingActor };
    const spawnEvents = createStage8SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE8: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: { resolverActor: {}, siblingActor: {} },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const resolverStore = entityAccess<typeof machines>(manager).get("resolverActor");
    const siblingStore = entityAccess<typeof machines>(manager).get("siblingActor");
    const subscriberSnapshots: Array<{ readonly resolverCount: number; readonly siblingCount: number }> = [];
    manager.onTransition((_prev, _next, action) => {
      if (action.type !== "DONE") return;
      subscriberSnapshots.push({ resolverCount: resolverStore.count, siblingCount: siblingStore.count });
    });

    spawnStage8Entity(manager, "unit/a", 1);
    manager.transition({ type: "DONE", meta: { entityId: "unit/a" } } as never);

    const runtime = getEntityRuntimeState(manager.entities());
    expect(lifecycleCalls).toEqual([]);
    expect(subscriberSnapshots).toEqual([{ resolverCount: 0, siblingCount: 1 }]);
    expect(resolverStore.has(0 as EntityIndex)).toBe(false);
    expect(siblingStore.has(0 as EntityIndex)).toBe(true);
    expect(runtime.entityStore.alive[0]).toBe(1);
    expect(runtime.entityStore.indexById["unit/a"]).toBe(0);
    expect(runtime.entityStore.freeList).toEqual([]);
  });

  it("cleanup удаляет entity без ENTITY_DESPAWNED edge и очищает group indexes", () => {
    const actor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "ACTIVE" },
        ACTIVE: { EXPIRE: "EXPIRED" },
        EXPIRED: {},
      },
      initialState: "__INIT",
      initialContext: { hp: i32() },
      spawnSchema: { hp: i32() },
      despawnOn: "EXPIRED",
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly hp: number } },
      ) {
        if (action.type !== "ENTITY_SPAWNED") return;
        for (const entity of self.indices) self.hp[entity] = payloadFor(entity).hp;
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage8SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE8: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: { actor: { hp: payload.hp } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const store = entityAccess<typeof machines>(manager).get("actor");

    spawnStage8Entity(manager, "unit/solo", 7);
    manager.transition({ type: "EXPIRE" });

    const runtime = getEntityRuntimeState(manager.entities());
    expect(store.count).toBe(0);
    expect(store.has(0 as EntityIndex)).toBe(false);
    expect(store.hp[0 as EntityIndex]).toBe(0);
    expect(runtime.actorRowsByGroupTag.unit).toBeUndefined();
    expect(runtime.entityStore.entitiesByGroupTag.unit).toBeUndefined();
    expect(runtime.entityStore.groupTagPosition[0]).toBe(-1);
    expect(runtime.entityStore.freeList).toEqual([0]);
  });

  it("despawn lifecycle пропускает terminal attached row и затем очищает ее вместе с entity", () => {
    const lifecycleCalls: string[] = [];
    const terminalActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "ACTIVE" },
        ACTIVE: { EXPIRE: "__RESOLVED" },
      },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
    } as const;
    const cleanupActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "ACTIVE" },
        ACTIVE: { EXPIRE: "EXPIRED" },
        EXPIRED: { ENTITY_DESPAWNED: "CLEANED" },
        CLEANED: {},
      },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      despawnOn: "EXPIRED",
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        if (action.type !== "ENTITY_DESPAWNED") return;
        for (const entity of self.indices) lifecycleCalls.push(self.entityId(entity));
      },
    } as const;
    const machines = { terminalActor, cleanupActor };
    const spawnEvents = createStage8SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE8: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: { terminalActor: {}, cleanupActor: {} },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage8Entity(manager, "unit/a", 1);
    manager.transition({ type: "EXPIRE" });

    const access = entityAccess<typeof machines>(manager);
    expect(lifecycleCalls).toEqual(["unit/a"]);
    expect(access.get("terminalActor").count).toBe(0);
    expect(access.get("cleanupActor").count).toBe(0);
    expect(getEntityRuntimeState(manager.entities()).entityStore.alive[0]).toBe(0);
  });

  it("валидирует despawnOn при init и компилирует его в despawnStateMask", () => {
    const metadata = compileEntityTemplate("actor", {
      config: {
        __INIT: { ENTITY_SPAWNED: "ACTIVE" },
        ACTIVE: { EXPIRE: "EXPIRED" },
        EXPIRED: {},
      },
      initialContext: {},
      spawnSchema: {},
      despawnOn: ["EXPIRED"],
    });
    expect(metadata.despawnStateMask[metadata.stateCodeByName.EXPIRED]).toBe(1);
    expect(metadata.despawnStateMask[metadata.stateCodeByName.ACTIVE]).toBe(0);

    const nonPublicError = expectLiteFsmError(
      () =>
        compileEntityTemplate("actor", {
          config: {
            __INIT: { ENTITY_SPAWNED: "ACTIVE" },
            ACTIVE: {},
            "*": {},
          },
          initialContext: {},
          spawnSchema: {},
          despawnOn: "*",
        }),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(nonPublicError.message).toContain("non-public state '*'");

    const unknownError = expectLiteFsmError(
      () =>
        MachineManager(
          { actor: { ...createEntityTemplate(), despawnOn: "MISSING" } as never },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(unknownError.message).toContain("despawnOn");
    expect(unknownError.message).toContain("MISSING");

    const specialError = expectLiteFsmError(
      () =>
        MachineManager(
          { actor: { ...createEntityTemplate(), despawnOn: "__RESOLVED" } as never },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(specialError.message).toContain("special state '__RESOLVED'");

    const shapeError = expectLiteFsmError(
      () =>
        MachineManager(
          { actor: { ...createEntityTemplate(), despawnOn: [1] } as never },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(shapeError.message).toContain("state name");

    const instanceError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            actor: {
              storage: "instance",
              config: { READY: {} },
              initialState: "READY",
              initialContext: {},
              despawnOn: "READY",
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(instanceError.message).toContain('storage: "entity"');

    const runtime = createEntityRuntimeState(
      [{ key: "actor", kind: "entity", data: compileEntityTemplate("actor", createEntityTemplate()) }],
      {} as never,
    );
    const transaction = prepareEntityTransaction({ runtime: new Map<string, unknown>() }, runtime);
    expect(scheduleEntityDespawn(transaction, 0 as EntityIndex)).toBe(false);
  });
});

describe("@lite-fsm/entities — этап 9 effects и transition helpers", () => {
  const createStage9SpawnEvents = () =>
    defineSpawnEvents({
      SPAWN_STAGE9: spawnEvent<{ readonly id: string; readonly groupTag: string }>(),
    });

  const spawnStage9Entity = (
    manager: {
      transition(action: {
        readonly type: "SPAWN_STAGE9";
        readonly payload: { readonly id: string; readonly groupTag: string };
      }): unknown;
    },
    id: string,
    groupTag = "unit",
  ) => {
    manager.transition({ type: "SPAWN_STAGE9", payload: { id, groupTag } });
  };

  it("enter-state effect вызывается один раз на batch после subscribers и middleware post-next", () => {
    const order: string[] = [];
    const actor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { TICK: "READY" },
      },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      effects: {
        READY: ({ self }: { readonly self: { readonly indices: readonly EntityIndex[]; entityId(entity: EntityIndex): string } }) => {
          order.push(`effect:${self.indices.map((entity) => self.entityId(entity)).join(",")}`);
        },
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage9SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE9: (payload) => [
        { id: `${payload.id}/a`, groupTag: payload.groupTag, actors: { actor: {} } },
        { id: `${payload.id}/b`, groupTag: payload.groupTag, actors: { actor: {} } },
      ],
    });
    type Stage9BatchEvent =
      | { readonly type: "TICK" }
      | { readonly type: "SPAWN_STAGE9"; readonly payload: { readonly id: string; readonly groupTag: string } };
    const middleware: Middleware<any, Stage9BatchEvent> =
      () => (next) => (action) => {
        order.push("middleware:before");
        const result = next(action);
        order.push("middleware:after");
        return result;
      };
    const manager = MachineManager(machines, {
      middleware: [middleware],
      plugins: [entitiesPlugin({ spawn })] as const,
    });
    manager.onTransition((_prev, _next, action) => {
      order.push(`subscriber:${action.type}`);
    });

    manager.transition({ type: "TICK" });
    expect(order).toEqual(["middleware:before", "subscriber:TICK", "middleware:after"]);
    order.length = 0;

    spawnStage9Entity(manager, "unit");

    expect(order).toEqual([
      "middleware:before",
      "subscriber:SPAWN_STAGE9",
      "middleware:after",
      "effect:unit/a,unit/b",
    ]);
  });

  it("effects используют final state после reducer и не запускаются для steady/rollback/despawnOn rows", () => {
    const effects: string[] = [];
    const actor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: {
          TICK: "READY",
          STOP: "STOPPED",
          ROLLBACK: "STOPPED",
          OVERRIDE: "STOPPED",
          EXPIRE: "EXPIRED",
        },
        STOPPED: {},
        ALT: {},
        EXPIRED: {},
      },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      despawnOn: "EXPIRED",
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        for (const entity of self.indices) {
          if (action.type === "ROLLBACK") self.stateCode[entity] = self.prevStateCode[entity];
          if (action.type === "OVERRIDE") self.stateCode[entity] = self.states.ALT;
        }
      },
      effects: {
        STOPPED: ({ self }: { readonly self: { readonly indices: readonly EntityIndex[]; entityId(entity: EntityIndex): string } }) => {
          effects.push(`STOPPED:${self.entityId(self.indices[0])}`);
        },
        ALT: ({ self }: { readonly self: { readonly indices: readonly EntityIndex[]; entityId(entity: EntityIndex): string } }) => {
          effects.push(`ALT:${self.entityId(self.indices[0])}`);
        },
        EXPIRED: () => {
          effects.push("EXPIRED");
        },
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage9SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE9: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const store = entityAccess<typeof machines>(manager).get("actor");

    spawnStage9Entity(manager, "unit/steady");
    manager.transition({ type: "TICK" });
    manager.transition({ type: "ROLLBACK" });
    expect(effects).toEqual([]);
    expect(store.state(0 as EntityIndex)).toBe("READY");

    manager.transition({ type: "OVERRIDE" });
    expect(effects).toEqual(["ALT:unit/steady"]);
    expect(store.state(0 as EntityIndex)).toBe("ALT");

    spawnStage9Entity(manager, "unit/stop");
    manager.transition({ type: "STOP", meta: { entityId: "unit/stop" } } as never);
    expect(effects).toEqual(["ALT:unit/steady", "STOPPED:unit/stop"]);

    spawnStage9Entity(manager, "unit/despawn");
    manager.transition({ type: "EXPIRE", meta: { entityId: "unit/despawn" } } as never);
    expect(effects).toEqual(["ALT:unit/steady", "STOPPED:unit/stop"]);
    expect(store.has(2 as EntityIndex)).toBe(false);
  });

  it("sync throw из entity effect сообщает onError и сохраняет committed state", () => {
    const errors: unknown[] = [];
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: {} },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      effects: {
        READY: () => {
          throw new Error("sync entity effect failed");
        },
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage9SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE9: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, {
      plugins: [entitiesPlugin({ spawn })] as const,
      onError: (error) => errors.push(error),
    });
    const store = entityAccess<typeof machines>(manager).get("actor");

    expect(() => spawnStage9Entity(manager, "unit/sync")).not.toThrow();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe("sync entity effect failed");
    expect(store.state(0 as EntityIndex)).toBe("READY");
  });

  it("async rejection из entity effect сообщает onError без unhandled flow и сохраняет committed state", async () => {
    const errors: unknown[] = [];
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      effects: {
        READY: async () => {
          await Promise.resolve();
          throw new Error("async entity effect failed");
        },
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage9SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE9: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, {
      plugins: [entitiesPlugin({ spawn })] as const,
      onError: (error) => errors.push(error),
    });
    const store = entityAccess<typeof machines>(manager).get("actor");

    expect(() => spawnStage9Entity(manager, "unit/async")).not.toThrow();
    expect(store.state(0 as EntityIndex)).toBe("READY");
    expect(errors).toEqual([]);

    await Promise.resolve();
    await Promise.resolve();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe("async entity effect failed");
    expect(() => manager.transition({ type: "TICK" })).not.toThrow();
    expect(store.state(0 as EntityIndex)).toBe("READY");
  });

  it("async effect сохраняет captured scope, self.has видит stale row, а scoped entities валидирует get/maybe", async () => {
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const observations: string[] = [];
    const mainActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { EXPIRE: "DEAD" },
        DEAD: {},
      },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      despawnOn: "DEAD",
      effects: {
        READY: async ({ self, entities }: { readonly self: any; readonly entities: () => EntityAccess<any> }) => {
          const entity = self.indices[0];
          const scopedEntities = entities();
          observations.push(`provider:${entities() === scopedEntities}`);
          const sibling = scopedEntities.get("siblingActor" as never);
          observations.push(`before:${self.has(entity)}:${sibling.has(entity)}`);
          await gate;
          observations.push(
            `after:${self.has(entity)}:${entities() === scopedEntities}:${entities().maybe("siblingActor" as never).has(entity)}`,
          );
          try {
            entities().get("siblingActor" as never);
          } catch (error) {
            observations.push(`get-error:${(error as LiteFsmError).code}:${(error as Error).message.includes("unit/a")}`);
          }
        },
      },
    } as const;
    const siblingActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: {} },
      initialState: "__INIT",
      initialContext: { value: i32() },
      spawnSchema: {},
    } as const;
    const machines = { mainActor, siblingActor };
    const spawnEvents = createStage9SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE9: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: { mainActor: {}, siblingActor: {} },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage9Entity(manager, "unit/a");
    expect(observations).toEqual(["provider:true", "before:true:true"]);
    manager.transition({ type: "EXPIRE", meta: { entityId: "unit/a" } } as never);
    resume();
    await Promise.resolve();

    expect(observations).toEqual([
      "provider:true",
      "before:true:true",
      "after:false:true:false",
      "get-error:LITE_FSM_INVALID_STORAGE_RUNTIME:true",
    ]);
  });

  it("scoped entities().get сообщает source actor, event type, requested key и entity id", () => {
    const mainActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: {} },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      effects: {
        READY: ({ entities }: { readonly entities: () => EntityAccess<any> }) => {
          entities().get("siblingActor" as never);
        },
      },
    } as const;
    const siblingActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: {} },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
    } as const;
    const machines = { mainActor, siblingActor };
    const spawnEvents = createStage9SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE9: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { mainActor: {} } }),
    });
    const errors: unknown[] = [];
    const manager = MachineManager(machines, {
      plugins: [entitiesPlugin({ spawn })] as const,
      onError: (error) => errors.push(error),
    });

    expect(() => spawnStage9Entity(manager, "unit/a")).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(LiteFsmError);
    const error = errors[0] as Error;
    expect(error.message).toContain("source actor 'mainActor'");
    expect(error.message).toContain("entities().get('siblingActor')");
    expect(error.message).toContain("SPAWN_STAGE9");
    expect(error.message).toContain("siblingActor");
    expect(error.message).toContain("unit/a");
  });

  it("transition.entity/tag/actor routes через core semantics и transition.entity dedupe-ит ids", () => {
    const commanderActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "IDLE" }, IDLE: { COMMAND: "ACTIVE" }, ACTIVE: {} },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      effects: {
        ACTIVE: ({ transition }: { readonly transition: any }) => {
          transition.entity(["target/a", "missing", "target/a", "target/b"], { type: "HIT" });
          transition.tag("enemy", { type: "TAG_HIT" });
          transition.actor(["instanceActor/0", "missing"], { type: "ACTOR_HIT" });
        },
      },
    } as const;
    const targetActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { HIT: "READY", TAG_HIT: "READY", ACTOR_HIT: "READY" } },
      initialState: "__INIT",
      initialContext: { hit: i32(), tagHit: i32(), actorHit: i32() },
      spawnSchema: {},
      reducer(_slice: unknown, action: { readonly type: string }, { self }: { readonly self: any }) {
        for (const entity of self.indices) {
          if (action.type === "HIT") self.hit[entity] += 1;
          if (action.type === "TAG_HIT") self.tagHit[entity] += 1;
          if (action.type === "ACTOR_HIT") self.actorHit[entity] += 1;
        }
      },
    } as const;
    const instanceActor = {
      storage: "instance",
      groupTag: "enemy",
      config: { __INIT: { SPAWN_INSTANCE: "READY" }, READY: { TAG_HIT: "READY", ACTOR_HIT: "READY" } },
      initialState: "__INIT",
      initialContext: { tagHit: 0, actorHit: 0 },
      reducer: (slice: { readonly context: { readonly tagHit: number; readonly actorHit: number } }, action: { readonly type: string }, meta: { readonly nextState: "READY" }) => ({
        state: meta.nextState,
        context: {
          tagHit: slice.context.tagHit + (action.type === "TAG_HIT" ? 1 : 0),
          actorHit: slice.context.actorHit + (action.type === "ACTOR_HIT" ? 1 : 0),
        },
      }),
    } as const;
    const machines = { commanderActor, targetActor, instanceActor };
    const spawnEvents = createStage9SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE9: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: payload.id.startsWith("target/")
          ? { targetActor: {} }
          : { commanderActor: {} },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const target = entityAccess<typeof machines>(manager).get("targetActor");

    spawnStage9Entity(manager, "target/a", "enemy");
    spawnStage9Entity(manager, "target/b", "ally");
    spawnStage9Entity(manager, "commander/a", "commander");
    manager.transition({ type: "SPAWN_INSTANCE" } as never);
    manager.transition({ type: "COMMAND", meta: { entityId: "commander/a" } } as never);

    const instanceRows = Object.values(manager.getState().instanceActor);
    expect(target.hit[0 as EntityIndex]).toBe(1);
    expect(target.hit[1 as EntityIndex]).toBe(1);
    expect(target.tagHit[0 as EntityIndex]).toBe(1);
    expect(target.tagHit[1 as EntityIndex]).toBe(0);
    expect(target.actorHit[0 as EntityIndex]).toBe(0);
    expect(target.actorHit[1 as EntityIndex]).toBe(0);
    expect(instanceRows).toHaveLength(1);
    expect(instanceRows[0].context).toEqual({ tagHit: 1, actorHit: 1 });
  });

  it("transition.despawn удаляет captured rows, entity ids unknown/already deleted являются no-op", () => {
    const despawnerActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { DESPAWN: "ACTIVE" }, ACTIVE: {} },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      effects: {
        ACTIVE: ({ self, transition }: { readonly self: { readonly indices: readonly EntityIndex[] }; readonly transition: any }) => {
          transition.despawn("missing");
          transition.despawn(self.indices);
          transition.despawn("unit/a");
        },
      },
    } as const;
    const machines = { despawnerActor };
    const spawnEvents = createStage9SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE9: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { despawnerActor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const store = entityAccess<typeof machines>(manager).get("despawnerActor");

    spawnStage9Entity(manager, "unit/a");
    manager.transition({ type: "DESPAWN", meta: { entityId: "unit/a" } } as never);

    expect(store.has(0 as EntityIndex)).toBe(false);
    expect(getEntityRuntimeState(manager.entities()).entityStore.indexById["unit/a"]).toBeUndefined();
  });

  it("transition.despawn отклоняет raw EntityIndex array вне self.indices", () => {
    const errors: string[] = [];
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { RUN: "ACTIVE" }, ACTIVE: {} },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      effects: {
        ACTIVE: ({ transition }: { readonly transition: any }) => {
          try {
            transition.despawn([0 as EntityIndex]);
          } catch (error) {
            errors.push((error as Error).message);
          }
        },
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage9SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE9: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

    spawnStage9Entity(manager, "unit/a");
    manager.transition({ type: "RUN" });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("self.indices");
    expect(entityAccess<typeof machines>(manager).get("actor").has(0 as EntityIndex)).toBe(true);
  });

  it("transition helpers валидируют runtime inputs и condition() бросает clear error", () => {
    const observations: string[] = [];
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { RUN: "ACTIVE" }, ACTIVE: {} },
      initialState: "__INIT",
      initialContext: { value: i32({ default: 7 }) },
      spawnSchema: {},
      effects: {
        ACTIVE: ({ self, transition, condition }: { readonly self: any; readonly transition: any; readonly condition: () => unknown }) => {
          const entity = self.indices[0];
          observations.push(`value:${self.value[entity]}`);
          observations.push(`outside:${self.has(999 as EntityIndex)}`);
          try {
            self.entityId(999 as EntityIndex);
          } catch (error) {
            observations.push(`entityId:${(error as Error).message.includes("outside current entity effect scope")}`);
          }
          for (const run of [
            () => transition.entity([1], { type: "NOOP" }),
            () => transition.actor([1], { type: "NOOP" }),
            () => transition.despawn(1),
            () => condition(),
          ]) {
            try {
              run();
            } catch (error) {
              observations.push((error as LiteFsmError).code);
            }
          }
          transition({ type: "NOOP" });
          transition.unscoped({ type: "NOOP" });
          transition.group("missing", { type: "NOOP" });
          transition.entity("missing", { type: "NOOP" });
          transition.despawn(self.entityId(entity));
        },
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage9SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE9: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const store = entityAccess<typeof machines>(manager).get("actor");

    spawnStage9Entity(manager, "unit/a");
    manager.transition({ type: "RUN" });

    expect(observations).toEqual([
      "value:7",
      "outside:false",
      "entityId:true",
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    ]);
    expect(store.has(0 as EntityIndex)).toBe(false);
  });

  it("explicit despawn options проверяют captured generation в transaction prepare", () => {
    const runtime = createEntityRuntimeState(
      [{ key: "actor", kind: "entity", data: compileEntityTemplate("actor", createEntityTemplate()) }],
      {} as never,
    );
    const options = createEntityDespawnOptions({
      mode: "scope",
      entries: [{ entity: 0 as EntityIndex, generation: 1, id: "unit/a" }],
    } as never);
    const error = expectLiteFsmError(
      () => prepareEntityTransaction({ runtime: new Map<string, unknown>(), options } as never, runtime),
      "LITE_FSM_INVALID_STORAGE_RUNTIME",
    );
    expect(error.message).toContain("stale entity effect scope");

    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() =>
        prepareEntityTransaction({ runtime: new Map<string, unknown>(), options } as never, runtime),
      ).not.toThrow();
    } finally {
      if (previousEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousEnv;
      }
    }

    const idsOptions = createEntityDespawnOptions({ mode: "ids", ids: ["missing"] } as never);
    const idsTransaction = prepareEntityTransaction(
      { runtime: new Map<string, unknown>(), options: idsOptions } as never,
      runtime,
    );
    expect(idsTransaction.scheduledDespawns).toEqual([]);

    const actorStore = runtime.actorStores.actor;
    scheduleEntityEffectBatch(undefined, actorStore, 0, [0 as EntityIndex]);
    scheduleEntityEffectBatch(idsTransaction, actorStore, 0, []);
    scheduleEntityEffectBatch(idsTransaction, actorStore, 0, [0 as EntityIndex]);
    expect(idsTransaction.effectBatches).toEqual([]);
    scheduleEntityReactionBatch(undefined, actorStore, 0, [0 as EntityIndex]);
    scheduleEntityReactionBatch(idsTransaction, actorStore, undefined, [0 as EntityIndex]);
    scheduleEntityReactionBatch(idsTransaction, actorStore, 0, []);
    scheduleEntityReactionBatch(idsTransaction, actorStore, 0, [0 as EntityIndex]);
    expect(idsTransaction.reactionBatches).toEqual([]);
  });

  it("effect runtime helpers пропускают stale candidates и missing invocation targets", () => {
    const actorWithoutEffects = compileEntityTemplate("actor", createEntityTemplate());
    const runtime = createEntityRuntimeState(
      [{ key: "actor", kind: "entity", data: actorWithoutEffects }],
      {} as never,
    );
    const carrier = { runtime: new Map<string, unknown>() };
    const transaction = prepareEntityTransaction(carrier, runtime);
    const actorStore = runtime.actorStores.actor;
    transaction.effectBatches.push({ store: actorStore, stateCode: 0, indices: [0 as EntityIndex] });

    expect(
      resolveEntityEffectInvocations(runtime, {
        action: { type: "TEST" },
        dispatch: carrier,
      }),
    ).toEqual([]);

    const actorWithEffect = compileEntityTemplate("actor", {
      ...createEntityTemplate(),
      effects: { READY: () => undefined },
    });
    const runtimeWithEffect = createEntityRuntimeState(
      [{ key: "actor", kind: "entity", data: actorWithEffect }],
      {} as never,
    );
    const carrierWithEffect = { runtime: new Map<string, unknown>() };
    const transactionWithEffect = prepareEntityTransaction(carrierWithEffect, runtimeWithEffect);
    const storeWithEffect = runtimeWithEffect.actorStores.actor;
    ensureEntityCapacity(runtimeWithEffect.entityStore, 3);
    ensureActorCapacity(storeWithEffect, 3);
    storeWithEffect.presence[1] = 1;
    storeWithEffect.presence[2] = 1;
    storeWithEffect.stateCode[1] = 0;
    storeWithEffect.stateCode[2] = 0;
    runtimeWithEffect.entityStore.alive[2] = 1;
    runtimeWithEffect.entityStore.ids[2] = "";
    transactionWithEffect.effectBatches.push({
      store: storeWithEffect,
      stateCode: 0,
      indices: [0 as EntityIndex, 1 as EntityIndex, 2 as EntityIndex],
    });

    expect(
      resolveEntityEffectInvocations(runtimeWithEffect, {
        action: { type: "TEST" },
        dispatch: carrierWithEffect,
      }),
    ).toEqual([]);

    const manager = {
      getDependencies: () => ({}),
      transition: (action: unknown) => action,
    };
    const invocation = {
      storeKey: "missing",
      stateCode: 0,
      indices: [],
      scope: { sourceActor: "actor", eventType: "TEST", entries: [] },
    };
    invokeEntityEffect(runtimeWithEffect, invocation, { action: { type: "TEST" }, manager } as never);
    invokeEntityEffect(
      runtime,
      { ...invocation, storeKey: "actor" },
      { action: { type: "TEST" }, manager } as never,
    );
  });

  it("stale transition.despawn(self.indices) бросает в dev и no-op в production", async () => {
    const runCase = async (nodeEnv: string | undefined) => {
      const previousEnv = process.env.NODE_ENV;
      if (nodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = nodeEnv;
      }
      let resume!: () => void;
      const gate = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const observations: string[] = [];
      const actor = {
        storage: "entity",
        config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { EXPIRE: "DEAD" }, DEAD: {} },
        initialState: "__INIT",
        initialContext: {},
        spawnSchema: {},
        despawnOn: "DEAD",
        effects: {
          READY: async ({ self, transition }: { readonly self: { readonly indices: readonly EntityIndex[] }; readonly transition: any }) => {
            await gate;
            try {
              transition.despawn(self.indices);
              observations.push("no-op");
            } catch (error) {
              observations.push((error as LiteFsmError).code);
            }
          },
        },
      } as const;
      const machines = { actor };
      const spawnEvents = createStage9SpawnEvents();
      const spawn = defineEntitySpawn(machines, spawnEvents)({
        SPAWN_STAGE9: (payload) => ({ id: payload.id, groupTag: payload.groupTag, actors: { actor: {} } }),
      });
      const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });

      try {
        spawnStage9Entity(manager, "unit/a");
        manager.transition({ type: "EXPIRE", meta: { entityId: "unit/a" } } as never);
        resume();
        await Promise.resolve();
        return observations;
      } finally {
        if (previousEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = previousEnv;
        }
      }
    };

    await expect(runCase(undefined)).resolves.toEqual(["LITE_FSM_INVALID_STORAGE_RUNTIME"]);
    await expect(runCase("production")).resolves.toEqual(["no-op"]);
  });

  it("валидирует unsupported entity effect features при init", () => {
    const wildcardError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            actor: {
              ...createEntityTemplate(),
              effects: { "*": () => undefined },
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(wildcardError.message).toContain("wildcard");

    const unknownStateError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            actor: {
              ...createEntityTemplate(),
              effects: { MISSING: () => undefined },
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(unknownStateError.message).toContain("MISSING");

    const valueError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            actor: {
              ...createEntityTemplate(),
              effects: { READY: 1 },
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(valueError.message).toContain("must be a function");

    const shapeError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            actor: {
              ...createEntityTemplate(),
              effects: 1,
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(shapeError.message).toContain("effects must be a plain object");
  });
});

describe("@lite-fsm/entities — этап 10 reactions и reaction error semantics", () => {
  const createStage10SpawnEvents = () =>
    defineSpawnEvents({
      SPAWN_STAGE10: spawnEvent<{ readonly id: string; readonly groupTag: string; readonly value: number }>(),
    });

  const spawnStage10Entity = (
    manager: {
      transition(action: {
        readonly type: "SPAWN_STAGE10";
        readonly payload: { readonly id: string; readonly groupTag: string; readonly value: number };
      }): unknown;
    },
    id: string,
    value: number,
    groupTag = "unit",
  ) => {
    manager.transition({ type: "SPAWN_STAGE10", payload: { id, groupTag, value } });
  };

  it("reaction вызывается один раз на template для accepted event и видит committed reducer state", () => {
    const movementReactions: string[] = [];
    const sensorReactions: string[] = [];
    const userDepsCalls: string[] = [];
    const movementActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { TICK: "READY", STEADY: "READY" },
      },
      initialState: "__INIT",
      initialContext: { x: i32() },
      spawnSchema: { value: i32() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly value: number } },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") self.x[entity] = payloadFor(entity).value;
          if (action.type === "TICK") self.x[entity] += 1;
        }
      },
      reactions: {
        TICK: ({
          self,
          entities,
          api,
        }: {
          readonly self: any;
          readonly entities: () => EntityAccess<any>;
          readonly api: { record(value: string): void };
        }) => {
          const sensor = entities().get("sensorActor" as never);
          movementReactions.push(
            self.indices
              .map((entity: EntityIndex) => `${self.entityId(entity)}:${self.x[entity]}:${sensor.marker[entity]}`)
              .join("|"),
          );
          api.record("movement");
        },
        STEADY: ({ self }: { readonly self: any }) => {
          movementReactions.push(`steady:${self.indices.map((entity: EntityIndex) => self.entityId(entity)).join(",")}`);
        },
      },
    } as const;
    const sensorActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { TICK: "READY" },
      },
      initialState: "__INIT",
      initialContext: { marker: i32() },
      spawnSchema: { value: i32() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly value: number } },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") self.marker[entity] = payloadFor(entity).value * 10;
        }
      },
      reactions: {
        TICK: ({ self }: { readonly self: any }) => {
          sensorReactions.push(`sensor:${self.indices.map((entity: EntityIndex) => self.entityId(entity)).join(",")}`);
        },
      },
    } as const;
    const machines = { movementActor, sensorActor };
    const spawnEvents = createStage10SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE10: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: {
          movementActor: { value: payload.value },
          sensorActor: { value: payload.value },
        },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    manager.setDependencies({ api: { record: (value: string) => userDepsCalls.push(value) } } as never);

    spawnStage10Entity(manager, "unit/a", 2);
    spawnStage10Entity(manager, "unit/b", 3);
    manager.transition({ type: "TICK" });
    manager.transition({ type: "STEADY" });

    expect(movementReactions).toEqual(["unit/a:3:20|unit/b:4:30", "steady:unit/a,unit/b"]);
    expect(sensorReactions).toEqual(["sensor:unit/a,unit/b"]);
    expect(userDepsCalls).toEqual(["movement"]);
  });

  it("ENTITY_DESPAWNED reaction читает columns до cleanup и исходный event не получает удаленные rows", () => {
    const lifecycleReactions: string[] = [];
    const originalReactions: string[] = [];
    const effects: string[] = [];
    const actor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "ACTIVE" },
        ACTIVE: { IGNORE: "IGNORED", EXPIRE: "EXPIRED" },
        IGNORED: { EXPIRE: "DEAD" },
        EXPIRED: { ENTITY_DESPAWNED: "CLEANED" },
        DEAD: {},
        CLEANED: {},
      },
      initialState: "__INIT",
      initialContext: { hp: i32() },
      spawnSchema: { value: i32() },
      despawnOn: ["EXPIRED", "DEAD"] as const,
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly value: number } },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") self.hp[entity] = payloadFor(entity).value;
        }
      },
      reactions: {
        EXPIRE: ({ self }: { readonly self: any }) => {
          originalReactions.push(self.indices.map((entity: EntityIndex) => self.entityId(entity)).join(","));
        },
        ENTITY_DESPAWNED: ({ self }: { readonly self: any }) => {
          lifecycleReactions.push(
            self.indices.map((entity: EntityIndex) => `${self.entityId(entity)}:${self.hp[entity]}`).join(","),
          );
        },
      },
      effects: {
        EXPIRED: () => effects.push("EXPIRED"),
        DEAD: () => effects.push("DEAD"),
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage10SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE10: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: { actor: { value: payload.value } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    const store = entityAccess<typeof machines>(manager).get("actor");
    const subscriberSnapshots: Array<{ readonly count: number; readonly hasA: boolean; readonly hasB: boolean }> = [];
    manager.onTransition((_prev, _next, action) => {
      if (action.type !== "EXPIRE") return;
      subscriberSnapshots.push({
        count: store.count,
        hasA: store.has(0 as EntityIndex),
        hasB: store.has(1 as EntityIndex),
      });
    });

    spawnStage10Entity(manager, "unit/a", 10);
    spawnStage10Entity(manager, "unit/b", 20);
    manager.transition({ type: "IGNORE", meta: { entityId: "unit/b" } } as never);
    manager.transition({ type: "EXPIRE" });

    expect(lifecycleReactions).toEqual(["unit/a:10"]);
    expect(originalReactions).toEqual([]);
    expect(subscriberSnapshots).toEqual([{ count: 0, hasA: false, hasB: false }]);
    expect(effects).toEqual([]);
    expect(store.count).toBe(0);
    expect(store.hp[0 as EntityIndex]).toBe(0);
    expect(store.hp[1 as EntityIndex]).toBe(0);
    expect(getEntityRuntimeState(manager.entities()).entityStore.alive[0]).toBe(0);
    expect(getEntityRuntimeState(manager.entities()).entityStore.alive[1]).toBe(0);
  });

  it("reaction errors идут в onError, не меняют return value и не блокируют subscribers", async () => {
    const errors: unknown[] = [];
    const observations: string[] = [];
    let promiseSettled = false;
    const failingActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
      initialState: "__INIT",
      initialContext: { value: i32() },
      spawnSchema: { value: i32() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly value: number } },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") self.value[entity] = payloadFor(entity).value;
          if (action.type === "TICK") self.value[entity] += 1;
        }
      },
      reactions: {
        TICK: (deps: { readonly transition?: unknown }) => {
          observations.push(`transition:${typeof deps.transition}`);
          throw new Error("sync reaction failed");
        },
      },
    } as const;
    const promiseActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
      initialState: "__INIT",
      initialContext: { value: i32() },
      spawnSchema: { value: i32() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly value: number } },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") self.value[entity] = payloadFor(entity).value;
          if (action.type === "TICK") self.value[entity] += 1;
        }
      },
      reactions: {
        TICK: () =>
          Promise.resolve().then(() => {
            promiseSettled = true;
          }),
      },
    } as const;
    const machines = { failingActor, promiseActor };
    const spawnEvents = createStage10SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE10: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: {
          failingActor: { value: payload.value },
          promiseActor: { value: payload.value },
        },
      }),
    });
    const manager = MachineManager(machines, {
      plugins: [entitiesPlugin({ spawn })] as const,
      onError: (error) => errors.push(error),
    });
    const failingStore = entityAccess<typeof machines>(manager).get("failingActor");
    const promiseStore = entityAccess<typeof machines>(manager).get("promiseActor");
    manager.onTransition((_prev, _next, action) => {
      if (action.type === "TICK") {
        observations.push(`subscriber:${failingStore.value[0 as EntityIndex]}:${promiseSettled}`);
      }
    });

    spawnStage10Entity(manager, "unit/a", 5);
    const result = manager.transition({ type: "TICK" });

    expect(result).toEqual({ type: "TICK" });
    expect(observations).toEqual(["transition:undefined", "subscriber:6:false"]);
    expect(failingStore.value[0 as EntityIndex]).toBe(6);
    expect(promiseStore.value[0 as EntityIndex]).toBe(6);
    expect(errors).toHaveLength(2);
    expect((errors[0] as Error).message).toBe("sync reaction failed");
    expect(errors[1]).toBeInstanceOf(LiteFsmError);
    expect((errors[1] as Error).message).toContain("sync-only");

    await Promise.resolve();

    expect(promiseSettled).toBe(true);
    expect(errors).toHaveLength(2);
  });

  it("reaction self helpers проверяют captured scope и generation", () => {
    const observations: string[] = [];
    let runtime!: ReturnType<typeof getEntityRuntimeState>;
    const actor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { TICK: "READY" } },
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: { value: i32() },
      reactions: {
        TICK: ({ self }: { readonly self: any }) => {
          const entity = self.indices[0] as EntityIndex;
          observations.push(`outside:${self.has(999 as EntityIndex)}`);
          try {
            self.entityId(999 as EntityIndex);
          } catch (error) {
            observations.push(`entityId:${(error as Error).message.includes("reaction scope")}`);
          }
          runtime.entityStore.generation[entity] += 1;
          observations.push(`stale:${self.has(entity)}`);
          runtime.entityStore.generation[entity] -= 1;
          runtime.actorStores.actor.presence[entity] = 0;
          observations.push(`missing:${self.has(entity)}`);
          runtime.actorStores.actor.presence[entity] = 1;
        },
      },
    } as const;
    const machines = { actor };
    const spawnEvents = createStage10SpawnEvents();
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE10: (payload) => ({
        id: payload.id,
        groupTag: payload.groupTag,
        actors: { actor: { value: payload.value } },
      }),
    });
    const manager = MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const });
    runtime = getEntityRuntimeState(manager.entities());

    spawnStage10Entity(manager, "unit/a", 1);
    manager.transition({ type: "TICK" });

    expect(observations).toEqual(["outside:false", "entityId:true", "stale:false", "missing:false"]);
    expect(runtime.entityStore.generation[0]).toBe(1);
  });

  it("reaction runtime helpers пропускают missing transaction, missing reaction и empty scope", () => {
    const calls: string[] = [];
    const runtime = createEntityRuntimeState(
      [
        {
          key: "actor",
          kind: "entity",
          data: compileEntityTemplate("actor", {
            ...createEntityTemplate(),
            reactions: { TICK: () => calls.push("tick") },
          }),
        },
      ],
      {} as never,
    );
    const dispatch = {
      runtime: new Map<string, unknown>(),
      reportError(error: unknown) {
        calls.push(`error:${String(error)}`);
      },
    };
    const ctx = {
      action: { type: "TICK" },
      manager: { getDependencies: () => ({}) },
      dispatch,
    };
    const store = runtime.actorStores.actor;

    runEntityReactions(runtime, ctx);
    runEntityReactionBatches(
      runtime,
      [{ store, eventCode: runtime.eventCodeByType.ENTITY_SPAWNED, indices: [0 as EntityIndex] }],
      ctx,
    );
    runEntityReactionBatches(
      runtime,
      [{ store, eventCode: runtime.eventCodeByType.TICK, indices: [0 as EntityIndex] }],
      ctx,
    );
    ensureEntityCapacity(runtime.entityStore, 1);
    ensureActorCapacity(store, 1);
    runtime.entityStore.alive[0] = 1;
    runtime.entityStore.ids[0] = "";
    store.presence[0] = 1;
    runEntityReactionBatches(
      runtime,
      [{ store, eventCode: runtime.eventCodeByType.TICK, indices: [0 as EntityIndex] }],
      ctx,
    );

    expect(calls).toEqual([]);
  });

  it("валидирует reactions при init", () => {
    const instanceError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            actor: {
              storage: "instance",
              config: { READY: { TICK: "READY" } },
              initialState: "READY",
              initialContext: {},
              reactions: { TICK: () => undefined },
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(instanceError.message).toContain("reactions");
    expect(instanceError.message).toContain('storage: "entity"');

    const unknownEventError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            actor: {
              ...createEntityTemplate(),
              reactions: { MISSING: () => undefined },
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(unknownEventError.message).toContain("MISSING");
    expect(unknownEventError.message).toContain("not accepted");

    const valueError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            actor: {
              ...createEntityTemplate(),
              reactions: { TICK: 1 },
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(valueError.message).toContain("must be a function");

    const shapeError = expectLiteFsmError(
      () =>
        MachineManager(
          {
            actor: {
              ...createEntityTemplate(),
              reactions: 1,
            } as never,
          },
          { plugins: [entitiesPlugin()] as const },
        ),
      "LITE_FSM_INVALID_STORAGE_CONFIG",
    );
    expect(shapeError.message).toContain("reactions must be a plain object");
  });
});

describe("@lite-fsm/entities — этап 11 snapshot.storage.entity", () => {
  const createStage11SpawnEvents = () =>
    defineSpawnEvents({
      SPAWN_STAGE11: spawnEvent<{
        readonly id: string;
        readonly groupTag: string;
        readonly x: number;
        readonly hp: number;
        readonly flags: number;
        readonly name: string;
      }>(),
    });

  const createStage11Machines = () => {
    const movementActor = {
      storage: "entity",
      config: {
        __INIT: { ENTITY_SPAWNED: "READY" },
        READY: { MOVE: "READY", STOP: "STOPPED", EXPIRE: "DEAD" },
        STOPPED: { MOVE: "READY" },
        DEAD: {},
      },
      initialState: "__INIT",
      initialContext: {
        x: f32(),
        hp: i16(),
        flags: u8(),
        name: string(),
      },
      spawnSchema: {
        x: f32(),
        hp: i16(),
        flags: u8(),
        name: string(),
      },
      despawnOn: "DEAD",
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        {
          self,
          payloadFor,
        }: {
          readonly self: any;
          payloadFor(entity: EntityIndex): { readonly x: number; readonly hp: number; readonly flags: number; readonly name: string };
        },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") {
            const payload = payloadFor(entity);
            self.x[entity] = payload.x;
            self.hp[entity] = payload.hp;
            self.flags[entity] = payload.flags;
            self.name[entity] = payload.name;
          }
          if (action.type === "MOVE") {
            self.x[entity] += 1;
            self.hp[entity] += 1;
          }
        }
      },
    } as const;
    const sensorActor = {
      storage: "entity",
      config: { __INIT: { ENTITY_SPAWNED: "READY" }, READY: { MOVE: "READY" } },
      initialState: "__INIT",
      initialContext: { marker: i32() },
      spawnSchema: { hp: i16() },
      reducer(
        _slice: unknown,
        action: { readonly type: string },
        { self, payloadFor }: { readonly self: any; payloadFor(entity: EntityIndex): { readonly hp: number } },
      ) {
        for (const entity of self.indices) {
          if (action.type === "ENTITY_SPAWNED") self.marker[entity] = payloadFor(entity).hp * 10;
          if (action.type === "MOVE") self.marker[entity] += 1;
        }
      },
    } as const;
    const counter = createCounter();
    return { counter, movementActor, sensorActor } as const;
  };

  const createStage11Manager = () => {
    const machines = createStage11Machines();
    const spawnEvents = createStage11SpawnEvents();
    let recipeCalls = 0;
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_STAGE11: (payload) => {
        recipeCalls += 1;
        return {
          id: payload.id,
          groupTag: payload.groupTag,
          actors: {
            movementActor: {
              x: payload.x,
              hp: payload.hp,
              flags: payload.flags,
              name: payload.name,
            },
            sensorActor: { hp: payload.hp },
          },
        };
      },
    });

    return {
      machines,
      manager: MachineManager(machines, { plugins: [entitiesPlugin({ spawn })] as const }),
      recipeCalls: () => recipeCalls,
    };
  };

  const spawnStage11Entity = (
    manager: ReturnType<typeof createStage11Manager>["manager"],
    id: string,
    groupTag: string,
    hp: number,
  ) => {
    manager.transition({
      type: "SPAWN_STAGE11",
      payload: { id, groupTag, x: hp / 10, hp, flags: hp % 255, name: id },
    });
  };

  const entityStorageSnapshot = (manager: ReturnType<typeof createStage11Manager>["manager"]) =>
    JSON.parse(JSON.stringify(manager.dehydrate().storage?.entity)) as any;

  it("dehydrate JSON hydrate восстанавливает rows, columns, versions, freeList и routing", () => {
    const source = createStage11Manager();
    spawnStage11Entity(source.manager, "unit/a", "enemy", 10);
    spawnStage11Entity(source.manager, "unit/b", "enemy", 20);
    source.manager.transition({ type: "MOVE", meta: { entityId: "unit/b" } } as never);
    source.manager.transition({ type: "EXPIRE", meta: { entityId: "unit/a" } } as never);

    const snapshot = JSON.parse(JSON.stringify(source.manager.dehydrate())) as any;
    const storage = snapshot.storage?.entity as any;
    expect(snapshot.machines.movementActor).toMatchObject({
      storage: "entity",
      count: 1,
      capacity: 2,
    });
    expect(snapshot.machines.movementActor.version).toBeGreaterThan(0);
    expect(snapshot.machines.movementActor).not.toHaveProperty("columns");
    expect(storage.entityStore.freeList).toEqual([0]);
    expect(storage.entityStore.generation).toEqual([1, 1]);
    expect(storage.entityStore.version).toBeGreaterThan(0);
    expect(storage.actors.movementActor.rowVersion).toHaveLength(2);
    expect(storage.actors.movementActor.columns.name).toEqual(["", "unit/b"]);
    expect(source.manager.getSnapshot()).not.toHaveProperty("storage");
    storage.actors.movementActor.rowVersion[1] = 999;

    const target = createStage11Manager();
    const delivered: string[] = [];
    target.manager.onTransition((_prev, _next, action) => {
      delivered.push(action.type);
    });
    const beforeCalls = target.recipeCalls();

    target.manager.hydrate(snapshot);

    const runtime = getEntityRuntimeState(target.manager.entities());
    const movement = entityAccess<typeof target.machines>(target.manager).get("movementActor");
    const sensor = entityAccess<typeof target.machines>(target.manager).get("sensorActor");
    expect(delivered).toEqual([HYDRATE_ACTION_TYPE]);
    expect(target.recipeCalls()).toBe(beforeCalls);
    expect(movement.count).toBe(1);
    expect(movement.has(0 as EntityIndex)).toBe(false);
    expect(movement.has(1 as EntityIndex)).toBe(true);
    expect(movement.state(1 as EntityIndex)).toBe("READY");
    expect(movement.x[1 as EntityIndex]).toBeCloseTo(3);
    expect(movement.hp[1 as EntityIndex]).toBe(21);
    expect(movement.flags[1 as EntityIndex]).toBe(20);
    expect(movement.name[1 as EntityIndex]).toBe("unit/b");
    expect(sensor.marker[1 as EntityIndex]).toBe(201);
    expect(runtime.entityStore.indexById["unit/b"]).toBe(1);
    expect(runtime.entityStore.entitiesByGroupTag.enemy).toEqual([1]);
    expect(runtime.entityStore.freeList).toEqual([0]);
    expect(runtime.actorRowsByEntity[1].map((row) => row.store.templateKey).sort()).toEqual([
      "movementActor",
      "sensorActor",
    ]);
    expect(runtime.actorRowsByGroupTag.enemy.map((row) => row.store.templateKey).sort()).toEqual([
      "movementActor",
      "sensorActor",
    ]);
    expect(runtime.actorStores.movementActor.rowVersion[1]).toBeGreaterThan(999);
    expect(runtime.actorStores.movementActor.version).toBeGreaterThan(storage.actors.movementActor.version);

    target.manager.transition({ type: "MOVE", meta: { entityId: "unit/b" } } as never);
    target.manager.transition({ type: "MOVE", meta: { groupTag: "enemy" } });
    expect(movement.x[1 as EntityIndex]).toBeCloseTo(5);
    expect(sensor.marker[1 as EntityIndex]).toBe(203);

    spawnStage11Entity(target.manager, "unit/c", "enemy", 30);
    expect(runtime.entityStore.indexById["unit/c"]).toBe(0);
    expect(runtime.entityStore.generation[0]).toBe(2);
  });

  it("dehydrate filters для machines и storage независимы", () => {
    const { manager } = createStage11Manager();
    spawnStage11Entity(manager, "unit/a", "enemy", 10);
    manager.transition({ type: "INC" });

    const full = manager.dehydrate();
    const machineFiltered = manager.dehydrate({ machines: ["counter"] });
    const storageFiltered = manager.dehydrate({ storage: ["entity"] });
    const withoutStorage = manager.dehydrate({ storage: [] });
    const onlyEntityStorage = manager.dehydrate({ machines: [], storage: ["entity"] });
    const fullMachines = full.machines as Record<string, unknown>;
    const storageFilteredMachines = storageFiltered.machines as Record<string, unknown>;
    const withoutStorageMachines = withoutStorage.machines as Record<string, unknown>;

    expect(full.storage?.entity).toBeDefined();
    expect(fullMachines.counter).toEqual({ state: "READY", context: { count: 1 } });
    expect(fullMachines.movementActor).toEqual(manager.getState().movementActor);
    expect(machineFiltered.machines).toEqual({ counter: { state: "READY", context: { count: 1 } } });
    expect(machineFiltered.storage?.entity).toBeDefined();
    expect(storageFilteredMachines.counter).toEqual({ state: "READY", context: { count: 1 } });
    expect(storageFilteredMachines.movementActor).toEqual(manager.getState().movementActor);
    expect(storageFiltered.storage?.entity).toBeDefined();
    expect(withoutStorage.storage).toBeUndefined();
    expect(withoutStorageMachines.movementActor).toEqual(manager.getState().movementActor);
    expect(onlyEntityStorage).toEqual({
      schemaVersion: undefined,
      machines: {},
      storage: { entity: full.storage?.entity },
    });
  });

  it("storage-only hydrate уведомляет subscribers и не меняет storage: \"instance\"", () => {
    const source = createStage11Manager();
    spawnStage11Entity(source.manager, "unit/a", "enemy", 10);
    source.manager.transition({ type: "INC" });
    const storage = source.manager.dehydrate().storage?.entity;

    const target = createStage11Manager();
    const delivered: string[] = [];
    target.manager.onTransition((_prev, _next, action) => {
      delivered.push(action.type);
    });

    target.manager.hydrate({ machines: {}, storage: { entity: storage } });

    expect(delivered).toEqual([HYDRATE_ACTION_TYPE]);
    expect(target.manager.getState().counter.context.count).toBe(0);
    expect(entityAccess<typeof target.machines>(target.manager).get("movementActor").count).toBe(1);
  });

  it("dehydrate нормализует sparse строковые массивы в plain JSON arrays", () => {
    const { manager } = createStage11Manager();
    const runtime = getEntityRuntimeState(manager.entities());
    ensureEntityCapacity(runtime.entityStore, 1);

    const snapshot = manager.dehydrate().storage?.entity as any;

    expect(snapshot.entityStore.ids).toEqual([""]);
    expect(snapshot.entityStore.groupTagByIndex).toEqual([""]);
  });

  it("hydrate без storage.entity сохраняет columns и канонизирует lightweight slices", () => {
    const { manager, machines } = createStage11Manager();
    spawnStage11Entity(manager, "unit/a", "enemy", 10);
    const movement = entityAccess<typeof machines>(manager).get("movementActor");
    const beforeState = manager.getState().movementActor;

    manager.hydrate({
      machines: {
        movementActor: {
          storage: "entity",
          version: 999,
          count: 999,
          capacity: 999,
          columns: { x: [999] },
        },
      },
    } as never);

    expect(manager.getState().movementActor).toBe(beforeState);
    expect(movement.count).toBe(1);
    expect(movement.x[0 as EntityIndex]).toBe(1);
  });

  it("getHydratedState preview валидирует storage.entity и не мутирует runtime state", () => {
    const source = createStage11Manager();
    spawnStage11Entity(source.manager, "unit/incoming", "enemy", 30);
    const snapshot = source.manager.dehydrate();

    const target = createStage11Manager();
    spawnStage11Entity(target.manager, "unit/current", "ally", 10);
    const movement = entityAccess<typeof target.machines>(target.manager).get("movementActor");
    const runtime = getEntityRuntimeState(target.manager.entities());
    const currentVersion = runtime.actorStores.movementActor.version;

    const preview = target.manager.getHydratedState(snapshot);

    expect(preview.movementActor.count).toBe(1);
    expect(preview.movementActor.capacity).toBe(1);
    expect(preview.movementActor.version).toBeGreaterThan(currentVersion);
    expect(movement.name[0 as EntityIndex]).toBe("unit/current");
    expect(runtime.entityStore.indexById["unit/current"]).toBe(0);
    expect(runtime.entityStore.indexById["unit/incoming"]).toBeUndefined();
  });

  it("hydrate replace повышает entityStore.version выше текущей и удаленной versions", () => {
    const source = createStage11Manager();
    spawnStage11Entity(source.manager, "unit/incoming", "enemy", 30);
    const storage = entityStorageSnapshot(source.manager);
    storage.entityStore.version = 1;

    const target = createStage11Manager();
    spawnStage11Entity(target.manager, "unit/current-a", "ally", 10);
    spawnStage11Entity(target.manager, "unit/current-b", "ally", 20);
    spawnStage11Entity(target.manager, "unit/current-c", "ally", 30);
    const runtime = getEntityRuntimeState(target.manager.entities());
    const currentVersion = runtime.entityStore.version;

    target.manager.hydrate({ machines: {}, storage: { entity: storage } });

    expect(currentVersion).toBeGreaterThan(storage.entityStore.version);
    expect(runtime.entityStore.version).toBeGreaterThan(currentVersion);
    expect(runtime.entityStore.version).toBeGreaterThan(storage.entityStore.version);
  });

  it("legacy snapshot без generation и rowVersion восстанавливает freeList и свежие rowVersion", () => {
    const source = createStage11Manager();
    spawnStage11Entity(source.manager, "unit/a", "enemy", 10);
    spawnStage11Entity(source.manager, "unit/b", "enemy", 20);
    source.manager.transition({ type: "EXPIRE", meta: { entityId: "unit/a" } } as never);
    const storage = entityStorageSnapshot(source.manager);
    delete storage.entityStore.generation;
    storage.entityStore.freeList = [];
    delete storage.actors.movementActor.rowVersion;
    delete storage.actors.sensorActor.rowVersion;

    const target = createStage11Manager();
    target.manager.hydrate({ machines: {}, storage: { entity: storage } });

    const runtime = getEntityRuntimeState(target.manager.entities());
    expect(Array.from(runtime.entityStore.generation)).toEqual([0, 0]);
    expect(runtime.entityStore.freeList).toEqual([0]);
    expect(runtime.actorStores.movementActor.rowVersion[1]).toBeGreaterThan(0);
    expect(runtime.actorStores.sensorActor.rowVersion[1]).toBeGreaterThan(0);
  });

  it("invalid snapshot.storage.entity бросает до mutation", () => {
    const source = createStage11Manager();
    spawnStage11Entity(source.manager, "unit/a", "enemy", 10);
    spawnStage11Entity(source.manager, "unit/b", "enemy", 20);
    source.manager.transition({ type: "EXPIRE", meta: { entityId: "unit/a" } } as never);
    const valid = entityStorageSnapshot(source.manager);

    const cases = [
      ["root object", () => null, "storage.entity must be an object"],
      ["ids array", (snapshot: any) => (snapshot.entityStore.ids = "bad"), "ids must be an array"],
      ["capacity integer", (snapshot: any) => (snapshot.entityStore.capacity = 1.5), "capacity must be an integer"],
      ["count negative", (snapshot: any) => (snapshot.entityStore.count = -1), "count must be a non-negative integer"],
      ["version uint32", (snapshot: any) => (snapshot.entityStore.version = 0xffffffff), "version must fit Uint32"],
      ["alive value", (snapshot: any) => (snapshot.entityStore.alive[1] = 2), "alive[1] must be 0 or 1"],
      ["ids length", (snapshot: any) => snapshot.entityStore.ids.pop(), "ids length"],
      ["ids item", (snapshot: any) => (snapshot.entityStore.ids[1] = 1), "ids[1] must be a string"],
      ["freeList", (snapshot: any) => (snapshot.entityStore.freeList = []), "freeList"],
      ["freeList range", (snapshot: any) => (snapshot.entityStore.freeList = [99]), "out of range"],
      ["freeList live", (snapshot: any) => (snapshot.entityStore.freeList = [1]), "live entity"],
      ["freeList duplicate", (snapshot: any) => (snapshot.entityStore.freeList = [0, 0]), "duplicate entity index"],
      ["empty live id", (snapshot: any) => (snapshot.entityStore.ids[1] = ""), "non-empty"],
      ["empty groupTag", (snapshot: any) => (snapshot.entityStore.groupTagByIndex[1] = ""), "groupTag"],
      ["entity count mismatch", (snapshot: any) => (snapshot.entityStore.count = 0), "live entity count"],
      ["entity count capacity", (snapshot: any) => (snapshot.entityStore.count = 3), "count cannot exceed capacity"],
      [
        "duplicate",
        (snapshot: any) => {
          snapshot.entityStore.alive[0] = 1;
          snapshot.entityStore.ids[0] = snapshot.entityStore.ids[1];
          snapshot.entityStore.groupTagByIndex[0] = "enemy";
          snapshot.entityStore.count = 2;
          snapshot.entityStore.freeList = [];
          snapshot.actors.movementActor.presence[0] = 1;
          snapshot.actors.sensorActor.presence[0] = 1;
          snapshot.actors.movementActor.count = 2;
          snapshot.actors.sensorActor.count = 2;
        },
        "duplicate",
      ],
      ["schema", (snapshot: any) => (snapshot.actors.movementActor.schema.columns.x = "i32"), "schema"],
      [
        "schema keys length",
        (snapshot: any) => {
          delete snapshot.actors.movementActor.schema.columns.hp;
        },
        "keys",
      ],
      [
        "schema keys value",
        (snapshot: any) => {
          delete snapshot.actors.movementActor.schema.columns.hp;
          snapshot.actors.movementActor.schema.columns.extra = "i16";
        },
        "keys",
      ],
      ["schema states", (snapshot: any) => (snapshot.actors.movementActor.schema.states[0] = "OTHER"), "states"],
      ["column", (snapshot: any) => (snapshot.actors.movementActor.columns.x[1] = "bad"), "finite number"],
      ["i16 integer", (snapshot: any) => (snapshot.actors.movementActor.columns.hp[1] = 1.5), "integer"],
      ["i16 range", (snapshot: any) => (snapshot.actors.movementActor.columns.hp[1] = 40000), "Int16"],
      ["i32 range", (snapshot: any) => (snapshot.actors.sensorActor.columns.marker[1] = 999999999999), "Int32"],
      ["u8 range", (snapshot: any) => (snapshot.actors.movementActor.columns.flags[1] = 999), "Uint8"],
      ["string column", (snapshot: any) => (snapshot.actors.movementActor.columns.name[1] = 1), "must be a string"],
      ["presence", (snapshot: any) => snapshot.actors.movementActor.presence.pop(), "presence length"],
      [
        "presence missing entity",
        (snapshot: any) => {
          snapshot.actors.movementActor.presence[0] = 1;
          snapshot.actors.movementActor.count = 2;
        },
        "missing entity",
      ],
      ["stateCode", (snapshot: any) => (snapshot.actors.movementActor.stateCode[1] = 99), "stateCode"],
      [
        "terminal stateCode",
        (snapshot: any) => (snapshot.actors.movementActor.stateCode[1] = ENTITY_RESOLVED_STATE_CODE),
        "terminal stateCode",
      ],
      ["stateCode int16", (snapshot: any) => (snapshot.actors.movementActor.stateCode[1] = 40000), "Int16"],
      ["rowVersion", (snapshot: any) => snapshot.actors.movementActor.rowVersion.pop(), "rowVersion length"],
      ["actor capacity", (snapshot: any) => (snapshot.actors.movementActor.capacity = 3), "capacity"],
      ["actor count capacity", (snapshot: any) => (snapshot.actors.movementActor.count = 3), "count cannot exceed capacity"],
      ["actor count mismatch", (snapshot: any) => (snapshot.actors.movementActor.count = 0), "present row count"],
      [
        "live entity without rows",
        (snapshot: any) => {
          snapshot.actors.movementActor.presence[1] = 0;
          snapshot.actors.sensorActor.presence[1] = 0;
          snapshot.actors.movementActor.count = 0;
          snapshot.actors.sensorActor.count = 0;
        },
        "no actor rows",
      ],
      ["formatVersion", (snapshot: any) => (snapshot.formatVersion = 2), "formatVersion"],
    ] as const;

    for (const [name, mutate, message] of cases) {
      const target = createStage11Manager();
      spawnStage11Entity(target.manager, "unit/current", "ally", 30);
      const before = target.manager.dehydrate();
      const snapshot = JSON.parse(JSON.stringify(valid));
      const mutated = mutate(snapshot);
      const payload = name === "root object" ? mutated : snapshot;

      let error: LiteFsmError;
      try {
        error = expectLiteFsmError(
          () => target.manager.hydrate({ machines: {}, storage: { entity: payload } }),
          "LITE_FSM_INVALID_HYDRATION_ENVELOPE",
        );
      } catch (assertionError) {
        throw new Error(`${name}: ${(assertionError as Error).message}`);
      }

      expect(error.message).toContain(message);
      expect(target.manager.dehydrate()).toEqual(before);
      expect(entityAccess<typeof target.machines>(target.manager).get("movementActor").name[0 as EntityIndex]).toBe(
        "unit/current",
      );
    }
  });
});
