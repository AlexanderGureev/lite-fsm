import { describe, expect, test } from "tstyche";

import { createMachine, MachineManager } from "@lite-fsm/core";
import { entitiesPlugin, f32, i16, i32, optional, string, u8 } from "@lite-fsm/entities";
import type { EntityAccess, EntityId, EntityIndex, EntityMachineExtension } from "@lite-fsm/entities";
import type {
  FSMEvent,
  LiteFsmPlugin,
  MachineResultMetadata,
  MachinesState,
  MachineStore,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type DescriptorValue<Descriptor> = Descriptor extends { readonly valueType?: infer Value } ? Value : never;
type DescriptorColumn<Descriptor> = Descriptor extends { readonly columnType?: infer Column } ? Column : never;
type DescriptorSpawnValue<Descriptor> = Descriptor extends { readonly spawnType?: infer Spawn } ? Spawn : never;

describe("@lite-fsm/entities — этап 1 public types", () => {
  test("entitiesPlugin возвращает LiteFsmPlugin", () => {
    const plugin = entitiesPlugin();
    const typedPlugin = entitiesPlugin<{ readonly api: { readonly load: () => Promise<void> } }>();

    expect(plugin).type.toBeAssignableTo<LiteFsmPlugin<"@lite-fsm/entities">>();
    expect(typedPlugin).type.toBe<typeof plugin>();
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

  test('wrapper с plugin source принимает storage: "entity"', () => {
    type AppEvent = FSMEvent<"SPAWN"> | FSMEvent<"TICK">;
    type AppDeps = { readonly api: { readonly load: () => Promise<void> } };
    const entityPlugin = entitiesPlugin<AppDeps>();
    const plugins = [entityPlugin] as const;
    const createAppMachine: TypedCreateMachineFn<AppEvent, AppDeps, typeof plugins> = createMachine;
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
        __INIT: { SPAWN: "ALIVE" },
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
    type AppEvent = FSMEvent<"SPAWN">;

    // @ts-expect-error!
    createMachine<AppEvent>({
      storage: "entity",
      initialState: "__INIT",
      initialContext: {},
      spawnSchema: {},
      config: { __INIT: { SPAWN: "ALIVE" }, ALIVE: {} },
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
      __INIT: { SPAWN: "moving" },
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
      __INIT: { SPAWN: "visible" },
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
