import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, defineStorageRuntime } from "@lite-fsm/core";
import type {
  AnyRecord,
  EffectDeps,
  FSMEvent,
  MachineResultMetadata,
  MachinesState,
  PluginManagerEvents,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { Assert, Equal, NotAny } from "./_helpers";

type AppEvent = FSMEvent<"TICK"> | FSMEvent<"RESET">;
type EntityPluginEvent = FSMEvent<"ENTITY_PLUGIN_SYNC", { readonly source: string }>;
type EntityInternalEvent = FSMEvent<"ENTITY_SPAWNED", { readonly id: string }>;

type EntityTemplateInput = {
  readonly storage: "entity";
  readonly initialState: "__INIT";
  readonly initialContext: AnyRecord;
  readonly spawnSchema: AnyRecord;
};

type EntityStorageExtension = {
  readonly input: EntityTemplateInput;
  readonly internalEvents: EntityInternalEvent;
  readonly resultMetadata: <Input extends EntityTemplateInput>(input: Input) => {
    readonly entityContextSchema: Input["initialContext"];
    readonly entitySpawnSchema: Input["spawnSchema"];
  };
  readonly reducerContext: <Input extends EntityTemplateInput>(input: Input) => {
    readonly payloadFor: (entityId: string) => Input["spawnSchema"];
  };
  readonly publicState: <Input extends EntityTemplateInput>(input: Input) => {
    readonly ready: boolean;
    readonly contextSchema: Input["initialContext"];
  };
};

const entityStorage = defineStorageRuntime<EntityStorageExtension>().create({
  kind: "entity",
  validateTemplate(ctx) {
    expect(ctx.storageKind).type.toBe<"entity">();
    expect(ctx.machine.storage).type.toBe<"entity">();
    expect(ctx.machine.initialContext).type.toBe<AnyRecord>();
    expect(ctx.machine.spawnSchema).type.toBe<AnyRecord>();
  },
  compileTemplate() {},
  createRuntimeState() {
    return {};
  },
  createPublicInitialState() {
    return { ready: false, contextSchema: {} };
  },
  acceptsEvent() {
    return false;
  },
  reduce() {},
  commit() {},
});

const entityPlugin = definePlugin<EntityPluginEvent>().create({
  name: "fake-entity",
  storage: [entityStorage],
});

const plugins = [entityPlugin] as const;

type MachineEvents = AppEvent | PluginManagerEvents<typeof plugins>;
type MachineDeps = EffectDeps<{ readonly log: { readonly push: (entry: string) => void } }, typeof plugins>;

const createAppMachine: TypedCreateMachineFn<MachineEvents, MachineDeps, typeof plugins> = createMachine;

const projectileContextSchema = {
  projectile: { hp: 1, speed: 10 },
} as const;
const projectileSpawnSchema = {
  projectileSpawn: { x: 0, y: 0 },
} as const;
const enemyContextSchema = {
  enemy: { hp: 5, damage: 2 },
} as const;
const enemySpawnSchema = {
  enemySpawn: { lane: 1 },
} as const;

describe("TypedCreateMachineFn entity-facing proof", () => {
  test("plugin tuple дает разные phantom metadata для entity templates", () => {
    const projectile = createAppMachine({
      storage: "entity",
      initialState: "__INIT",
      initialContext: projectileContextSchema,
      spawnSchema: projectileSpawnSchema,
      config: {
        __INIT: { ENTITY_SPAWNED: "alive" },
        alive: { TICK: "alive", RESET: "__RESOLVED" },
      },
      reducer(_state, _action, meta) {
        expect(meta.payloadFor("projectile-1")).type.toBe<typeof projectileSpawnSchema>();
        type _Payload = Assert<Equal<ReturnType<typeof meta.payloadFor>, typeof projectileSpawnSchema>>;
      },
    });

    const enemy = createAppMachine({
      storage: "entity",
      initialState: "__INIT",
      initialContext: enemyContextSchema,
      spawnSchema: enemySpawnSchema,
      config: {
        __INIT: { ENTITY_SPAWNED: "alive" },
        alive: { TICK: "alive", RESET: "__RESOLVED" },
      },
    });

    expect<MachineResultMetadata<typeof projectile>["entityContextSchema"]>().type.toBe<
      typeof projectileContextSchema
    >();
    expect<MachineResultMetadata<typeof projectile>["entitySpawnSchema"]>().type.toBe<typeof projectileSpawnSchema>();
    expect<MachineResultMetadata<typeof enemy>["entityContextSchema"]>().type.toBe<typeof enemyContextSchema>();
    expect<MachineResultMetadata<typeof enemy>["entitySpawnSchema"]>().type.toBe<typeof enemySpawnSchema>();

    type ProjectileMetadata = MachineResultMetadata<typeof projectile>;
    type EnemyMetadata = MachineResultMetadata<typeof enemy>;
    type _MetadataIsNotAny = Assert<NotAny<ProjectileMetadata>>;
    type _MetadataIsNotBroadRecord = Assert<Record<string, unknown> extends ProjectileMetadata ? false : true>;
    type _MetadataDiffers = Assert<Equal<ProjectileMetadata, EnemyMetadata> extends true ? false : true>;
    type _PublicState = Assert<
      Equal<
        MachinesState<{ readonly projectile: typeof projectile }>["projectile"],
        { readonly ready: boolean; readonly contextSchema: typeof projectileContextSchema }
      >
    >;
  });

  test("plugin-aware wrapper сохраняет обычные domain machines и actor templates", () => {
    const domain = createAppMachine({
      config: {
        idle: { TICK: "idle", ENTITY_PLUGIN_SYNC: "idle" },
      },
      initialState: "idle",
      initialContext: { count: 0 },
      effects: {
        idle: ({ log, transition }) => {
          log.push("domain");
          transition({ type: "ENTITY_PLUGIN_SYNC", payload: { source: "domain" } });
        },
      },
    });

    const actor = createAppMachine({
      storage: "instance",
      config: {
        __INIT: { TICK: "running" },
        running: { RESET: "__RESOLVED" },
      },
      initialState: "__INIT",
      initialContext: { id: "actor" },
    });

    expect(domain.storage).type.toBe<"instance" | undefined>();
    expect(actor.storage).type.toBe<"instance" | undefined>();
  });
});
