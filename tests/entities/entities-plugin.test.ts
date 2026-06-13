import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { definePlugin, defineStorageRuntime, LiteFsmError, MachineManager } from "@lite-fsm/core";
import { getNormalizedPlugin } from "@lite-fsm/core/internal/plugin";
import type { FSMEvent, MachineConfig, MachineStore } from "@lite-fsm/core";
import { entitiesPlugin, f32, i16, i32, optional, string, u8 } from "@lite-fsm/entities";
import type { EntityAccess, EntityIndex } from "@lite-fsm/entities";
import * as entities from "@lite-fsm/entities";

type CounterEvent = FSMEvent<"INC">;
type CounterConfig = { readonly READY: { readonly INC: "READY" } };
type CounterMachine = MachineConfig<CounterConfig, { readonly count: number }, CounterEvent>;
type EntityTemplateConfig = {
  readonly __INIT: { readonly SPAWN: "READY" };
  readonly READY: { readonly TICK: "READY" };
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
  config: { __INIT: { SPAWN: "READY" }, READY: { TICK: "READY" } },
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
    config: { __INIT: { SPAWN: "READY" }, READY: { TICK: "READY" } },
    initialState: "__INIT",
    initialContext,
    spawnSchema,
  } satisfies EntityTemplateFixture<typeof initialContext, typeof spawnSchema>;
};

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
    expect(Object.keys(entities).sort()).toEqual(["entitiesPlugin", "f32", "i16", "i32", "optional", "string", "u8"]);
    expect(entities.entitiesPlugin).toBe(entitiesPlugin);
    expect(typeof entities.entitiesPlugin).toBe("function");
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

  it("отклоняет options, которые пока не поддерживаются", () => {
    const error = expectLiteFsmError(() => entitiesPlugin({} as never), "LITE_FSM_INVALID_OPTIONS");

    expect(error.message).toContain("entitiesPlugin options are not supported");
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
