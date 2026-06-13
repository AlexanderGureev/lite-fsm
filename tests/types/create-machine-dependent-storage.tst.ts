import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, defineStorageRuntime } from "@lite-fsm/core";
import type {
  AnyRecord,
  FSMEvent,
  MachineResultMetadata,
  MachinesState,
  StorageRuntimeExtension,
  TypedCreateMachineFn,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type AppEvent = FSMEvent<"LOAD"> | FSMEvent<"RESET">;
type DependentInternalEvent = FSMEvent<"DEPENDENT_INTERNAL">;

type DependentTemplateInput = {
  readonly storage: "dependent";
  readonly initialState: "__INIT";
  readonly initialContext: AnyRecord;
  readonly spawnSchema: AnyRecord;
  readonly marker: AnyRecord;
};

type DependentStorageExtension = {
  readonly input: DependentTemplateInput;
  readonly internalEvents: DependentInternalEvent;
  readonly resultMetadata: <Input extends DependentTemplateInput>(input: Input) => {
    readonly contextSchema: Input["initialContext"];
    readonly spawnSchema: Input["spawnSchema"];
    readonly marker: Input["marker"];
  };
  readonly reducerContext: <Input extends DependentTemplateInput>(input: Input) => {
    readonly payloadFor: () => Input["spawnSchema"];
  };
  readonly effectDeps: <Input extends DependentTemplateInput>(input: Input) => {
    readonly effectContext: Input["initialContext"];
  };
  readonly reactionDeps: <Input extends DependentTemplateInput>(input: Input) => {
    readonly reactionSpawn: Input["spawnSchema"];
  };
  readonly publicState: <Input extends DependentTemplateInput>(input: Input) => {
    readonly ready: boolean;
    readonly contextSchema: Input["initialContext"];
  };
};

type FixedStorageExtension = {
  readonly input: {
    readonly ttl: number;
    readonly initialContext: { readonly token: string };
  };
  readonly resultMetadata: {
    readonly fixed: true;
  };
  readonly effectDeps: {
    readonly fixedApi: { readonly read: () => string };
  };
  readonly publicState: {
    readonly fixedReady: boolean;
  };
};

type BadInternalEventsExtension = {
  readonly input: {};
  readonly internalEvents: <Input extends object>(input: Input) => FSMEvent<"BAD_INTERNAL">;
};

type _DependentExtensionContract = Assert<DependentStorageExtension extends StorageRuntimeExtension ? true : false>;
type _FixedExtensionContract = Assert<FixedStorageExtension extends StorageRuntimeExtension ? true : false>;

const dependentStorage = defineStorageRuntime<DependentStorageExtension>().create({
  kind: "dependent",
  validateTemplate(ctx) {
    expect(ctx.machine.storage).type.toBe<"dependent">();
    expect(ctx.machine.initialContext).type.toBe<AnyRecord>();
    expect(ctx.machine.spawnSchema).type.toBe<AnyRecord>();
  },
  compileTemplate() {},
  createRuntimeState() {
    return {};
  },
  createPublicInitialState() {
    return { ready: true, contextSchema: {} };
  },
  acceptsEvent() {
    return false;
  },
  reduce() {},
  commit() {},
});

const fixedStorage = defineStorageRuntime<FixedStorageExtension>().create({
  kind: "fixed",
  validateTemplate(ctx) {
    expect(ctx.machine.ttl).type.toBe<number>();
    expect(ctx.machine.initialContext.token).type.toBe<string>();
  },
  compileTemplate() {},
  createRuntimeState() {
    return {};
  },
  createPublicInitialState() {
    return { fixedReady: true };
  },
  acceptsEvent() {
    return false;
  },
  reduce() {},
  commit() {},
});

const plugin = definePlugin().create({
  name: "dependent-storage",
  storage: [dependentStorage, fixedStorage],
});

const createAppMachine: TypedCreateMachineFn<AppEvent, {}, typeof plugin> = createMachine;

const projectileContext = { projectile: { hp: 1 } } as const;
const projectileSpawn = { projectileSpawn: { speed: 10 } } as const;
const projectileMarker = { kind: "projectile" } as const;
const enemyContext = { enemy: { hp: 5 } } as const;
const enemySpawn = { enemySpawn: { damage: 2 } } as const;
const enemyMarker = { kind: "enemy" } as const;

describe("TypedCreateMachineFn cfg-dependent storage fields", () => {
  test("выводит concrete resultMetadata, reducerContext, deps и publicState из storage input", () => {
    const projectile = createAppMachine({
      storage: "dependent",
      initialState: "__INIT",
      initialContext: projectileContext,
      spawnSchema: projectileSpawn,
      marker: projectileMarker,
      config: {
        __INIT: { LOAD: "alive" },
        alive: { RESET: "__RESOLVED", DEPENDENT_INTERNAL: "alive" },
      },
      reducer(_state, _action, meta) {
        expect(meta.payloadFor()).type.toBe<typeof projectileSpawn>();
        type _Payload = Assert<Equal<ReturnType<typeof meta.payloadFor>, typeof projectileSpawn>>;
      },
      effects: {
        alive: ({ effectContext, reactionSpawn }) => {
          expect(effectContext).type.toBe<typeof projectileContext>();
          expect(reactionSpawn).type.toBe<typeof projectileSpawn>();
          type _EffectContext = Assert<Equal<typeof effectContext, typeof projectileContext>>;
          type _ReactionSpawn = Assert<Equal<typeof reactionSpawn, typeof projectileSpawn>>;
        },
      },
    });

    const enemy = createAppMachine({
      storage: "dependent",
      initialState: "__INIT",
      initialContext: enemyContext,
      spawnSchema: enemySpawn,
      marker: enemyMarker,
      config: {
        __INIT: { LOAD: "alive" },
        alive: { RESET: "__RESOLVED", DEPENDENT_INTERNAL: "alive" },
      },
    });

    expect<MachineResultMetadata<typeof projectile>["contextSchema"]>().type.toBe<typeof projectileContext>();
    expect<MachineResultMetadata<typeof projectile>["spawnSchema"]>().type.toBe<typeof projectileSpawn>();
    expect<MachineResultMetadata<typeof projectile>["marker"]>().type.toBe<typeof projectileMarker>();
    expect<MachineResultMetadata<typeof enemy>["contextSchema"]>().type.toBe<typeof enemyContext>();
    expect<MachineResultMetadata<typeof enemy>["spawnSchema"]>().type.toBe<typeof enemySpawn>();
    expect<MachineResultMetadata<typeof enemy>["marker"]>().type.toBe<typeof enemyMarker>();

    type _ProjectileMarker = Assert<Equal<MachineResultMetadata<typeof projectile>["marker"], typeof projectileMarker>>;
    type _EnemyMarker = Assert<Equal<MachineResultMetadata<typeof enemy>["marker"], typeof enemyMarker>>;
    type _MetadataDiffers = Assert<
      Equal<MachineResultMetadata<typeof projectile>["marker"], MachineResultMetadata<typeof enemy>["marker"]> extends true
        ? false
        : true
    >;
    expect<MachinesState<{ readonly projectile: typeof projectile }>["projectile"]["ready"]>().type.toBe<boolean>();
    expect<MachinesState<{ readonly projectile: typeof projectile }>["projectile"]["contextSchema"]>().type.toBe<
      typeof projectileContext
    >();
  });

  test("fixed storage extension в том же plugin source остается supported", () => {
    const fixed = createAppMachine({
      storage: "fixed",
      ttl: 60,
      config: { idle: { LOAD: "idle" } },
      initialState: "idle",
      initialContext: { token: "" },
      effects: {
        idle: ({ fixedApi }) => {
          expect(fixedApi.read()).type.toBe<string>();
        },
      },
    });

    type _FixedMetadata = Assert<Equal<MachineResultMetadata<typeof fixed>, { readonly fixed: true }>>;
    type _FixedState = Assert<
      Equal<MachinesState<{ readonly fixed: typeof fixed }>["fixed"], { readonly fixedReady: boolean }>
    >;
  });

  test("dependent form для internalEvents отклоняется storage author contract", () => {
    // @ts-expect-error!
    defineStorageRuntime<BadInternalEventsExtension>().create({
      kind: "bad-internal-events",
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
  });
});
