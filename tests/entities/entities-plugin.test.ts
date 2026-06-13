import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { definePlugin, defineStorageRuntime, LiteFsmError, MachineManager } from "@lite-fsm/core";
import { getNormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import type { FSMEvent, MachineConfig, MachineStore } from "@lite-fsm/core";
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
} from "../../packages/entities/src/runtime/state";

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
  manager: { readonly entities: unknown },
): EntityAccess<Machines> => manager.entities as EntityAccess<Machines>;

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

  it("публикует только root и package.json exports", () => {
    const packageJson = JSON.parse(readFileSync(join(rootDir, "packages/entities/package.json"), "utf8")) as {
      readonly exports: Record<string, unknown>;
    };

    expect(Object.keys(packageJson.exports).sort()).toEqual([".", "./package.json"]);
    expect(packageJson.exports).not.toHaveProperty("./react");
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

  it("manager.entities.get возвращает cached live store view с readonly indexed columns", () => {
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

  it("manager.entities остается stable root accessor после transition", () => {
    const manager = MachineManager(
      {
        counter: createCounter(),
        movementActor: createEntityTemplateWithSchema(),
      },
      { plugins: [entitiesPlugin()] as const },
    );
    const access = manager.entities;

    manager.transition({ type: "INC" });

    expect(manager.entities).toBe(access);
  });

  it("manager.entities.maybe возвращает cached optional store view", () => {
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

  it("entities.get бросает clear LiteFsmError для unknown runtime key", () => {
    const manager = MachineManager({ movementActor: createEntityTemplateWithSchema() }, { plugins: [entitiesPlugin()] as const });
    const error = expectLiteFsmError(
      () => manager.entities.get("unknownActor" as never),
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
