import { describe, expect, test } from "tstyche";

import { createMachine, definePlugin, defineStorageRuntime, MachineManager } from "@lite-fsm/core";
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
import type {
  EntityAccess,
  EntityId,
  EntityIndex,
  EntityMachineExtension,
  EntitiesPlugin,
  EntityReducerContext,
  LiteFsmEntityLifecycleEvents,
  SpawnEventsFrom,
} from "@lite-fsm/entities";
import type {
  FSMEvent,
  LiteFsmPlugin,
  MachineResultMetadata,
  MachineEvents,
  ManagerAction,
  MachinesState,
  MachineStore,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type DescriptorValue<Descriptor> = Descriptor extends { readonly valueType?: infer Value } ? Value : never;
type DescriptorColumn<Descriptor> = Descriptor extends { readonly columnType?: infer Column } ? Column : never;
type DescriptorSpawnValue<Descriptor> = Descriptor extends { readonly spawnType?: infer Spawn } ? Spawn : never;

describe("@lite-fsm/entities — этап 1 public types", () => {
  test("entitiesPlugin возвращает runtime plugin, а EntitiesPlugin является type-only source", () => {
    type AppDeps = { readonly api: { readonly load: () => Promise<void> } };
    const plugin = entitiesPlugin();

    expect(plugin).type.toBeAssignableTo<LiteFsmPlugin<"@lite-fsm/entities">>();
    expect(plugin).type.toBeAssignableTo<EntitiesPlugin<unknown, never>>();

    type _PluginSource = Assert<EntitiesPlugin<AppDeps> extends LiteFsmPlugin<"@lite-fsm/entities"> ? true : false>;

    // @ts-expect-error!
    entitiesPlugin<AppDeps>();
  });

  test("EntityId совместим со строкой", () => {
    type _EntityId = Assert<Equal<EntityId, string>>;

    expect<EntityId>().type.toBeAssignableTo<string>();
    expect<string>().type.toBeAssignableTo<EntityId>();
  });

  test("EntityIndex является branded number", () => {
    type _NotPlainNumber = Assert<Equal<number extends EntityIndex ? true : false, false>>;

    expect<EntityIndex>().type.toBeAssignableTo<number>();
    expect<number>().type.not.toBeAssignableTo<EntityIndex>();
  });
});

describe("@lite-fsm/entities — этап 2 schema descriptors и machine extension", () => {
  test("schema descriptors несут value, column и spawn metadata", () => {
    const x = f32({ default: 1 });
    const hp = i16();
    const score = i32();
    const flags = u8();
    const name = string({ default: "unit" });
    const nullableName = optional(name);

    expect(x.kind).type.toBe<"f32">();
    expect(name.kind).type.toBe<"string">();
    expect(nullableName.kind).type.toBe<"optional">();

    type _F32Value = Assert<Equal<DescriptorValue<typeof x>, number>>;
    type _F32Column = Assert<Equal<DescriptorColumn<typeof x>, Float32Array>>;
    type _I16Column = Assert<Equal<DescriptorColumn<typeof hp>, Int16Array>>;
    type _I32Column = Assert<Equal<DescriptorColumn<typeof score>, Int32Array>>;
    type _U8Column = Assert<Equal<DescriptorColumn<typeof flags>, Uint8Array>>;
    type _StringValue = Assert<Equal<DescriptorValue<typeof name>, string>>;
    type _StringColumn = Assert<Equal<DescriptorColumn<typeof name>, readonly string[]>>;
    type _OptionalSpawn = Assert<Equal<DescriptorSpawnValue<typeof nullableName>, string | null>>;

    f32({
      // @ts-expect-error!
      default: "bad",
    });
    string({
      // @ts-expect-error!
      default: 1,
    });
  });

  test('wrapper с EntitiesPlugin<AppDeps> принимает storage: "entity"', () => {
    type AppEvent = FSMEvent<"TICK">;
    type AppDeps = { readonly api: { readonly load: () => Promise<void> } };
    const createAppMachine: TypedCreateMachineFn<AppEvent, AppDeps, EntitiesPlugin<AppDeps>> = createMachine;
    const initialContext = {
      x: f32(),
      y: f32(),
      hp: i16(),
      name: string(),
    } as const;
    const spawnSchema = {
      x: f32(),
      y: f32(),
      team: optional(string()),
    } as const;

    const machine = createAppMachine({
      storage: "entity",
      initialState: "__INIT",
      initialContext,
      spawnSchema,
      config: {
        __INIT: { ENTITY_SPAWNED: "ALIVE" },
        ALIVE: { TICK: "ALIVE" },
      },
    });

    expect(machine.storage).type.toBe<"entity">();
    expect<MachineResultMetadata<typeof machine>["entityContextSchema"]>().type.toBe<typeof initialContext>();
    expect<MachineResultMetadata<typeof machine>["entitySpawnSchema"]>().type.toBe<typeof spawnSchema>();

    type ContextMetadata = MachineResultMetadata<typeof machine>["entityContextSchema"];
    type SpawnMetadata = MachineResultMetadata<typeof machine>["entitySpawnSchema"];
    type _ContextXValue = Assert<Equal<DescriptorValue<ContextMetadata["x"]>, number>>;
    type _ContextXColumn = Assert<Equal<DescriptorColumn<ContextMetadata["x"]>, Float32Array>>;
    type _ContextNameValue = Assert<Equal<DescriptorValue<ContextMetadata["name"]>, string>>;
    type _SpawnTeamValue = Assert<Equal<DescriptorSpawnValue<SpawnMetadata["team"]>, string | null>>;
  });

  test("EntityMachineExtension нельзя передать третьим generic напрямую", () => {
    type AppEvent = FSMEvent<"TICK">;

    // @ts-expect-error!
    type _DirectExtensionRejected = TypedCreateMachineFn<AppEvent, {}, EntityMachineExtension>;
  });

  test('core createMachine без wrapper не принимает storage: "entity"', () => {
    type AppEvent = FSMEvent<"TICK">;

    // @ts-expect-error!
    createMachine<AppEvent>({
      storage: "entity",
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      config: { __INIT: { ENTITY_SPAWNED: "ALIVE" }, ALIVE: {} },
    });
  });
});

describe("@lite-fsm/entities — этап 3 EntityAccess и manager.entities types", () => {
  type AppEvent = FSMEvent<"SPAWN"> | FSMEvent<"TICK"> | FSMEvent<"STOP">;
  const entityPlugin = entitiesPlugin();
  const plugins = [entityPlugin] as const;
  const createAppMachine: TypedCreateMachineFn<AppEvent, {}, typeof plugins> = createMachine;

  const movementActor = createAppMachine({
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      x: f32(),
      y: f32(),
      label: string(),
    },
    spawnSchema: {
      x: f32(),
    },
    config: {
      __INIT: { ENTITY_SPAWNED: "moving" },
      moving: { TICK: "moving", STOP: "stopped" },
      stopped: { TICK: "moving" },
    },
  });

  const nameActor = createAppMachine({
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      name: string(),
    },
    spawnSchema: {},
    config: {
      __INIT: { ENTITY_SPAWNED: "visible" },
      visible: { TICK: "visible" },
    },
  });

  const domainMachine = createMachine<AppEvent, {}, { readonly idle: { readonly TICK: "idle" } }, {}>({
    config: {
      idle: { TICK: "idle" },
    },
    initialState: "idle",
    initialContext: {},
  });

  const instanceActor = createAppMachine({
    storage: "instance",
    initialState: "__INIT",
    initialContext: {
      attempts: 0,
    },
    config: {
      __INIT: { SPAWN: "ready" },
      ready: { TICK: "ready" },
    },
  });

  const machines = {
    movementActor,
    nameActor,
    domainMachine,
    instanceActor,
  };

  type AppMachines = typeof machines;
  type AppState = MachinesState<typeof machines>;
  type EntityKeys = Parameters<EntityAccess<AppMachines>["get"]>[0];

  test("EntityAccess включает entity actor keys и исключает остальные машины", () => {
    type _Keys = Assert<Equal<EntityKeys, "movementActor" | "nameActor">>;

    expect<AppState["movementActor"]>().type.toBeAssignableTo<{
      readonly storage: "entity";
      readonly version: number;
      readonly count: number;
      readonly capacity: number;
    }>();

    const access = null as unknown as EntityAccess<AppMachines>;

    access.get("movementActor");
    access.get("nameActor");

    // @ts-expect-error!
    access.get("domainMachine");
    // @ts-expect-error!
    access.get("instanceActor");
    // @ts-expect-error!
    access.get("unknownActor");
  });

  test("store view columns выводятся из initialContext descriptors", () => {
    const access = null as unknown as EntityAccess<AppMachines>;
    const entity = 0 as EntityIndex;

    const movement = access.get("movementActor");
    const name = access.get("nameActor");

    expect(movement.x[entity]).type.toBe<number>();
    expect(movement.y[entity]).type.toBe<number>();
    expect(movement.label[entity]).type.toBe<string>();
    expect(name.name[entity]).type.toBe<string>();

    // @ts-expect-error!
    name.x;
    // @ts-expect-error!
    movement.name;
  });

  test("store.state типизируется public state union без __INIT и с undefined", () => {
    const access = null as unknown as EntityAccess<AppMachines>;
    const entity = 0 as EntityIndex;

    const movement = access.get("movementActor");
    const name = access.get("nameActor");

    expect(movement.state(entity)).type.toBe<"moving" | "stopped" | undefined>();
    expect(name.state(entity)).type.toBe<"visible" | undefined>();

    const movementState = movement.state(entity);
    const nameState = name.state(entity);

    type MovementState = typeof movementState;
    type NameState = typeof nameState;
    type _DistinctMovementState = Assert<Equal<Extract<NonNullable<MovementState>, "visible">, never>>;
    type _DistinctNameState = Assert<Equal<Extract<NonNullable<NameState>, "moving" | "stopped">, never>>;
    type _NoInit = Assert<Equal<"__INIT" extends NonNullable<MovementState> ? true : false, false>>;
  });

  test("MachineManager добавляет .entities только при подключенном entitiesPlugin tuple", () => {
    const withPlugin = MachineManager(machines, { plugins });
    const withoutPlugin = MachineManager(machines);

    expect(withPlugin.entities).type.toBeAssignableTo<EntityAccess<AppMachines>>();

    // @ts-expect-error!
    withoutPlugin.entities;
  });
});

describe("@lite-fsm/entities — этап 4 lifecycle events types", () => {
  type AppEvent = FSMEvent<"TICK">;
  const entityPlugin = entitiesPlugin();
  const plugins = [entityPlugin] as const;
  const createAppMachine: TypedCreateMachineFn<AppEvent, {}, typeof plugins> = createMachine;

  test("LiteFsmEntityLifecycleEvents описывает internal lifecycle union", () => {
    type _Lifecycle = Assert<
      Equal<
        LiteFsmEntityLifecycleEvents,
        { readonly type: "ENTITY_SPAWNED" } | { readonly type: "ENTITY_DESPAWNED" }
      >
    >;
  });

  const lifecycleActor = createAppMachine({
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      x: f32(),
    },
    spawnSchema: {},
    config: {
      __INIT: { ENTITY_SPAWNED: "alive" },
      alive: { TICK: "alive" },
    },
  });

  const machines = { lifecycleActor };

  test("lifecycle events доступны в entity config и reducer surface", () => {
    createAppMachine({
      storage: "entity",
      initialState: "__INIT",
      initialContext: {
        x: f32(),
      },
      spawnSchema: {},
      config: {
        __INIT: { ENTITY_SPAWNED: "alive" },
        alive: { TICK: "alive" },
      },
      reducer(_state, action) {
        expect(action).type.toBe<ManagerAction<AppEvent | LiteFsmEntityLifecycleEvents>>();

        if (action.type === "ENTITY_SPAWNED") {
          expect(action).type.toBe<ManagerAction<{ readonly type: "ENTITY_SPAWNED" }>>();
        }
      },
    });

    type LifecycleConfig = typeof lifecycleActor.config;
    type _InitEvent = Assert<Equal<keyof LifecycleConfig["__INIT"], "ENTITY_SPAWNED">>;
  });

  test("lifecycle events не входят в MachineEvents и public manager.transition", () => {
    type PublicEvents = MachineEvents<typeof machines>;
    type _NoLifecycleInPublicEvents = Assert<Equal<Extract<PublicEvents, LiteFsmEntityLifecycleEvents>, never>>;

    const manager = MachineManager(machines, { plugins });

    manager.transition({ type: "TICK" });

    // @ts-expect-error!
    manager.transition({ type: "ENTITY_SPAWNED" });
    // @ts-expect-error!
    manager.transition({ type: "ENTITY_DESPAWNED" });
  });
});

describe("@lite-fsm/entities — этап 5 spawn API types", () => {
  type AppEvent = FSMEvent<"TICK">;
  type AppDeps = { readonly api: { readonly load: () => Promise<void> } };
  const spawnEvents = defineSpawnEvents({
    SPAWN_PROJECTILE: spawnEvent<{
      readonly id: string;
      readonly x: number;
      readonly label: string | null;
    }>(),
    SPAWN_EMPTY: spawnEvent<{ readonly id: string }>(),
  });
  type SpawnEvents = SpawnEventsFrom<typeof spawnEvents>;
  type AppEventsWithSpawn = AppEvent | SpawnEvents;
  const createAppMachine: TypedCreateMachineFn<AppEventsWithSpawn, AppDeps, EntitiesPlugin<AppDeps>> = createMachine;
  const movementInitialContext = {
    x: f32(),
    label: string(),
  } as const;
  const movementSpawnSchema = {
    x: f32(),
    label: optional(string()),
  } as const;

  const movementActor = createAppMachine({
    storage: "entity",
    initialState: "__INIT",
    initialContext: movementInitialContext,
    spawnSchema: movementSpawnSchema,
    config: {
      __INIT: { ENTITY_SPAWNED: "alive" },
      alive: { TICK: "alive", SPAWN_PROJECTILE: "alive" },
    },
  });

  const domainMachine = createMachine<AppEvent, {}, { readonly idle: { readonly TICK: "idle" } }, {}>({
    config: { idle: { TICK: "idle" } },
    initialState: "idle",
    initialContext: {},
  });

  const machines = { movementActor, domainMachine };

  test("SpawnEventsFrom выводит discriminated union", () => {
    type _SpawnEvents = Assert<
      Equal<
        SpawnEvents,
        | {
            readonly type: "SPAWN_PROJECTILE";
            readonly payload: { readonly id: string; readonly x: number; readonly label: string | null };
          }
        | { readonly type: "SPAWN_EMPTY"; readonly payload: { readonly id: string } }
      >
    >;
  });

  test("EntityReducerContext типизирует self columns, state helpers и payloadFor(entity)", () => {
    const meta = null as unknown as EntityReducerContext<
      typeof movementInitialContext,
      typeof movementSpawnSchema,
      typeof movementActor.config
    >;
    const entity = 0 as EntityIndex;
    const payload = meta.payloadFor(entity);
    const x = meta.self.x[entity];
    const label = meta.self.label[entity];
    const stateCode = meta.self.stateCode[entity];
    const prevStateCode = meta.self.prevStateCode[entity];
    const aliveCode = meta.self.states.alive;
    const presence = meta.self.presence[entity];
    const rowVersion = meta.self.rowVersion[entity];
    const hasEntity = meta.self.has(entity);
    const entityId = meta.self.entityId(entity);

    expect(meta.self.indices).type.toBe<readonly EntityIndex[]>();
    expect(meta.self.states.alive).type.toBe<number>();
    expect(meta.self.presence).type.toBe<Uint8Array>();
    expect(meta.self.stateCode).type.toBe<Int16Array>();
    expect(meta.self.prevStateCode).type.toBe<Int16Array>();
    expect(meta.self.rowVersion).type.toBe<Uint32Array>();
    expect(x).type.toBe<number>();
    expect(label).type.toBe<string>();
    expect(stateCode).type.toBe<number>();
    expect(prevStateCode).type.toBe<number>();
    expect(aliveCode).type.toBe<number>();
    expect(presence).type.toBe<number>();
    expect(rowVersion).type.toBe<number>();
    expect(hasEntity).type.toBe<boolean>();
    expect(entityId).type.toBe<string>();
    expect(payload.x).type.toBe<number>();
    expect(payload.label).type.toBe<string | null>();

    meta.self.x[entity] = payload.x;
    meta.self.label[entity] = payload.label ?? "";
    meta.self.stateCode[entity] = meta.self.prevStateCode[entity];
    meta.self.stateCode[entity] = meta.self.states.alive;

    // @ts-expect-error!
    meta.payloadFor("projectile/a");
    // @ts-expect-error!
    meta.self.states.missing;
  });

  test("entity reducer получает типизированный self и payloadFor из storage input", () => {
    createAppMachine({
      storage: "entity",
      initialState: "__INIT",
      initialContext: movementInitialContext,
      spawnSchema: movementSpawnSchema,
      config: {
        __INIT: { ENTITY_SPAWNED: "alive" },
        alive: { TICK: "alive" },
      },
      reducer(_state, _action, meta) {
        const entity = meta.self.indices[0];
        const payload = meta.payloadFor(entity);

        expect(meta.self.indices).type.toBe<readonly EntityIndex[]>();
        expect(meta.self.states.alive).type.toBe<number>();
        expect(meta.self.presence).type.toBe<Uint8Array>();
        expect(meta.self.rowVersion).type.toBe<Uint32Array>();
        expect(meta.self.x[entity]).type.toBe<number>();
        expect(meta.self.label[entity]).type.toBe<string>();
        expect(meta.self.stateCode[entity]).type.toBe<number>();
        expect(meta.self.prevStateCode[entity]).type.toBe<number>();
        expect(meta.self.has(entity)).type.toBe<boolean>();
        expect(meta.self.entityId(entity)).type.toBe<string>();
        expect(payload.x).type.toBe<number>();
        expect(payload.label).type.toBe<string | null>();

        meta.self.x[entity] = payload.x;
        meta.self.label[entity] = payload.label ?? "";
        meta.self.stateCode[entity] = meta.self.prevStateCode[entity];
        meta.self.stateCode[entity] = meta.self.states.alive;

        // @ts-expect-error!
        meta.payloadFor("projectile/a");
      },
    });
  });

  test("defineEntitySpawn выводит recipe payload и проверяет actor payload", () => {
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_PROJECTILE: (payload) => {
        expect(payload.id).type.toBe<string>();
        expect(payload.x).type.toBe<number>();
        expect(payload.label).type.toBe<string | null>();

        return {
          id: payload.id,
          groupTag: "projectile",
          actors: {
            movementActor: {
              x: payload.x,
              label: payload.label,
            },
          },
        };
      },
      SPAWN_EMPTY: () => [],
    });

    expect(spawn.spawnEvents).type.toBe<typeof spawnEvents>();

    defineEntitySpawn(machines, spawnEvents)(
      // @ts-expect-error!
      {
        SPAWN_PROJECTILE: (payload) => ({
          id: payload.id,
          groupTag: "projectile",
          actors: {
            movementActor: {
              x: payload.x,
              label: payload.label,
            },
          },
        }),
      },
    );

    defineEntitySpawn(machines, spawnEvents)({
      SPAWN_PROJECTILE: (payload) => ({
        id: payload.id,
        groupTag: "projectile",
        actors: {
          movementActor: {
            x: payload.x,
            label: payload.label,
          },
        },
      }),
      SPAWN_EMPTY: () => [],
      // @ts-expect-error!
      SPAWN_UNKNOWN: () => [],
    });

    defineEntitySpawn(machines, spawnEvents)({
      SPAWN_PROJECTILE: (payload) => ({
        id: payload.id,
        groupTag: "projectile",
        actors: {
          // @ts-expect-error!
          movementActor: { x: payload.x },
        },
      }),
      SPAWN_EMPTY: () => [],
    });

    defineEntitySpawn(machines, spawnEvents)({
      SPAWN_PROJECTILE: (payload) => ({
        id: payload.id,
        groupTag: "projectile",
        actors: {
          movementActor: {
            // @ts-expect-error!
            x: "bad",
            label: payload.label,
          },
        },
      }),
      SPAWN_EMPTY: () => [],
    });

    defineEntitySpawn(machines, spawnEvents)({
      SPAWN_PROJECTILE: (payload) => ({
        id: payload.id,
        groupTag: "projectile",
        actors: {
          // @ts-expect-error!
          unknownActor: {},
        },
      }),
      SPAWN_EMPTY: () => [],
    });
  });

  test("entitiesPlugin({ spawn }) расширяет manager.transition без отдельной передачи spawnEvents", () => {
    const spawn = defineEntitySpawn(machines, spawnEvents)({
      SPAWN_PROJECTILE: (payload) => ({
        id: payload.id,
        groupTag: "projectile",
        actors: {
          movementActor: {
            x: payload.x,
            label: payload.label,
          },
        },
      }),
      SPAWN_EMPTY: () => [],
    });
    const spawnPlugin = entitiesPlugin({ spawn });
    const createSpawnMachine: TypedCreateMachineFn<AppEventsWithSpawn, {}, typeof spawnPlugin> = createMachine;
    const manager = MachineManager(machines, { plugins: [spawnPlugin] as const });

    createSpawnMachine({
      storage: "entity",
      initialState: "__INIT",
      initialContext: {
        x: f32(),
      },
      spawnSchema: {
        x: f32(),
      },
      config: {
        __INIT: { ENTITY_SPAWNED: "alive" },
        alive: { TICK: "alive", SPAWN_PROJECTILE: "alive" },
      },
    });

    manager.transition({ type: "TICK" });
    manager.transition({ type: "SPAWN_PROJECTILE", payload: { id: "projectile/a", x: 1, label: null } });
    manager.transition({ type: "SPAWN_EMPTY", payload: { id: "noop" } });

    // @ts-expect-error!
    manager.transition({ type: "SPAWN_PROJECTILE", payload: { id: "projectile/a", x: "bad", label: null } });
    // @ts-expect-error!
    manager.transition({ type: "ENTITY_SPAWNED" });
    // @ts-expect-error!
    entitiesPlugin<AppDeps>({ spawn });
  });

  test("machine AppEvents не получает spawn events автоматически", () => {
    const plainPlugin = entitiesPlugin();
    const plainPlugins = [plainPlugin] as const;
    const createPlainMachine: TypedCreateMachineFn<AppEvent, {}, typeof plainPlugins> = createMachine;

    createPlainMachine({
      storage: "entity",
      initialState: "__INIT",
      initialContext: {
        x: f32(),
      },
      spawnSchema: {
        x: f32(),
      },
      config: {
        __INIT: { ENTITY_SPAWNED: "alive" },
        alive: {
          TICK: "alive",
          // @ts-expect-error!
          SPAWN_PROJECTILE: "alive",
        },
      },
    });

    const plainActor = createPlainMachine({
      storage: "entity",
      initialState: "__INIT",
      initialContext: {
        x: f32(),
      },
      spawnSchema: {
        x: f32(),
      },
      config: {
        __INIT: { ENTITY_SPAWNED: "alive" },
        alive: {
          TICK: "alive",
        },
      },
    });

    type PublicEvents = MachineEvents<{ readonly plainActor: typeof plainActor }>;
    type _NoAutoSpawnEvents = Assert<Equal<Extract<PublicEvents, SpawnEvents>, never>>;
  });
});

describe("@lite-fsm/entities — этап 6 route meta и reducer helpers types", () => {
  type AppEvent = FSMEvent<"TICK">;
  const entityPlugin = entitiesPlugin();
  const plugins = [entityPlugin] as const;
  const createAppMachine: TypedCreateMachineFn<AppEvent, {}, typeof plugins> = createMachine;
  const actor = createAppMachine({
    storage: "entity",
    initialState: "__INIT",
    initialContext: {
      x: f32(),
    },
    spawnSchema: {},
    config: {
      __INIT: { ENTITY_SPAWNED: "alive" },
      alive: { TICK: "alive" },
    },
  });
  const machines = { actor };

  test("meta.entityId доступен только при установленном entitiesPlugin", () => {
    const withPlugin = MachineManager(machines, { plugins });
    const withoutPlugin = MachineManager(machines);

    withPlugin.transition({ type: "TICK", meta: { entityId: "unit/a" } });
    withPlugin.transition({ type: "TICK", meta: { entityId: ["unit/a", "unit/b"] } });
    withPlugin.transition({ type: "TICK", meta: { actorId: "actor/0" } });
    withPlugin.transition({ type: "TICK", meta: { groupId: "group/0" } });
    withPlugin.transition({ type: "TICK", meta: { groupTag: "unit" } });

    // @ts-expect-error!
    withoutPlugin.transition({ type: "TICK", meta: { entityId: "unit/a" } });
    withPlugin.transition({
      type: "TICK",
      meta: {
        // @ts-expect-error!
        entityId: 1,
      },
    });
  });

  test("routeMetaKeys entityId требует совместимый plugin routeMeta resolver", () => {
    type RoutedStorageExtension = {
      readonly input: {
        readonly initialContext: {};
      };
      readonly publicState: {};
      readonly runtimeState: {};
      readonly routeMeta: {
        readonly entityId: string | readonly string[];
      };
    };
    const storage = defineStorageRuntime<RoutedStorageExtension>().create({
      kind: "typed-entity-route",
      routeMetaKeys: ["entityId"],
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return {};
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });

    definePlugin().create({
      name: "typed-entity-route-ok",
      routeMeta: {
        entityId(value: string | readonly string[]) {
          return value;
        },
      },
      storage: [storage],
    });

    // @ts-expect-error!
    definePlugin().create({
      name: "typed-entity-route-missing",
      storage: [storage],
    });

    definePlugin().create({
      name: "typed-entity-route-incompatible",
      routeMeta: {
        // @ts-expect-error!
        entityId(value: number) {
          return String(value);
        },
      },
      storage: [storage],
    });
  });
});
