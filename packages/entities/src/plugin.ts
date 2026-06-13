import { definePlugin, defineStorageRuntime, LiteFsmError } from "@lite-fsm/core";
import type {
  AnyEvent,
  LiteFsmPlugin,
  LiteFsmStorageRuntimeDefinition,
  MachineStore,
  ManagerRuntimeContext,
  StorageCreatePublicInitialStateContext,
} from "@lite-fsm/core";

import type { EntityMachineExtension } from "./machine-extension";
import type { EntityAccess } from "./runtime/access";
import { assertEntityInitLifecycleConfig, assertPublicEntityLifecycleDispatch } from "./runtime/lifecycle";
import { reduceEntityBucket } from "./runtime/reduce";
import {
  asEntityRuntimeState,
  compileEntityTemplate,
  createEntityRuntimeState,
  createPublicInitialState as createEntityPublicInitialState,
  getEntityRuntimeState,
  restorePublicSlices,
  type EntityRuntimeState,
  type EntityTemplateMetadata,
} from "./runtime/state";
import { prepareEntityTransaction, stageSpawnAction } from "./runtime/transaction";
import { validateEntitySchema } from "./schema";
import type { EntityContextSchema, EntitySpawnSchema } from "./schema";
import { assertEntitySpawnDescriptor, type AnyEntitySpawnDescriptor, type EntitySpawnPluginEvents } from "./spawn";

declare const entityIndexBrand: unique symbol;

export type EntityId = string;
export type EntityIndex = number & { readonly [entityIndexBrand]: "EntityIndex" };

type EntityPluginOptions<Spawn extends AnyEntitySpawnDescriptor> = {
  readonly spawn: Spawn;
};
type EntityStorageRuntimeExtension = Omit<EntityMachineExtension, "storage"> & {
  readonly runtimeState: EntityRuntimeState;
  readonly templateData: EntityTemplateMetadata;
};
type EntityStorageDefinition<AppDeps = unknown> = LiteFsmStorageRuntimeDefinition<
  "entity",
  EntityMachineExtension<EntityContextSchema, EntitySpawnSchema, object, AppDeps>
>;
type EntityManagerDefinition = {
  readonly entities: <S extends MachineStore>(ctx: ManagerRuntimeContext<AnyEvent, S>) => EntityAccess<S>;
};
export type EntitiesPlugin<AppDeps = unknown, PluginEvents extends AnyEvent = never> = LiteFsmPlugin<
  "@lite-fsm/entities",
  PluginEvents,
  {
    readonly name: "@lite-fsm/entities";
    readonly storage: readonly [EntityStorageDefinition<AppDeps>];
    readonly manager: EntityManagerDefinition;
  }
>;

const ENTITY_PLUGIN_NAME = "@lite-fsm/entities";
const ENTITY_STORAGE_KIND = "entity";

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

const invalidEntityTemplate = (machineKey: string, reason: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CONFIG",
    `[lite-fsm/entities] machine '${machineKey}' has invalid storage: "entity" config: ${reason}.`,
  );

const validateEntityTemplate = (key: string, machine: Record<string, unknown>): void => {
  if (!hasOwn(machine, "initialState") || machine.initialState === undefined) {
    throw invalidEntityTemplate(key, 'missing required field "initialState"');
  }
  if (machine.initialState !== "__INIT") {
    throw invalidEntityTemplate(key, 'initialState must be "__INIT"');
  }
  if (!hasOwn(machine, "initialContext") || machine.initialContext === undefined) {
    throw invalidEntityTemplate(key, 'missing required field "initialContext"');
  }
  if (!hasOwn(machine, "spawnSchema") || machine.spawnSchema === undefined) {
    throw invalidEntityTemplate(key, 'missing required field "spawnSchema"');
  }
  if (hasOwn(machine, "groupTag") && machine.groupTag !== undefined) {
    throw invalidEntityTemplate(key, "groupTag is defined by EntitySpawnSpec, not by actor template");
  }

  validateEntitySchema(key, "initialContext", machine.initialContext);
  validateEntitySchema(key, "spawnSchema", machine.spawnSchema);
  assertEntityInitLifecycleConfig(key, machine.config);
};

const entityStorageRuntime: EntityStorageDefinition<unknown> = defineStorageRuntime<EntityStorageRuntimeExtension>().create({
  kind: ENTITY_STORAGE_KIND,
  reduceScope: "bucket",
  validateTemplate({ key, machine }) {
    validateEntityTemplate(key, machine as Record<string, unknown>);
  },
  compileTemplate({ key, machine }) {
    return {
      data: compileEntityTemplate(
        key,
        machine as {
          readonly config: object;
          readonly initialContext: EntityContextSchema;
          readonly spawnSchema: EntitySpawnSchema;
          readonly reducer?: unknown;
        },
      ),
    };
  },
  createRuntimeState({ templates, manager }) {
    return createEntityRuntimeState(templates, manager);
  },
  createPublicInitialState({ template, state }: StorageCreatePublicInitialStateContext<EntityStorageRuntimeExtension>) {
    return createEntityPublicInitialState(asEntityRuntimeState(state), template);
  },
  prepareAction({ action, dispatch, state }) {
    assertPublicEntityLifecycleDispatch(action.type);
    prepareEntityTransaction(dispatch, asEntityRuntimeState(state));
  },
  reduceBucket(ctx) {
    return reduceEntityBucket(asEntityRuntimeState(ctx.state), ctx);
  },
  commit({ state, dispatch }) {
    dispatch.nextState = restorePublicSlices(asEntityRuntimeState(state), dispatch.nextState);
  },
});

const createEntitiesPlugin = <PluginEvents extends AnyEvent>(
  spawn: AnyEntitySpawnDescriptor | undefined,
): EntitiesPlugin<unknown, PluginEvents> =>
  definePlugin<PluginEvents>().create({
    name: ENTITY_PLUGIN_NAME,
    storage: [entityStorageRuntime],
    hooks: {
      beforeReduce(ctx) {
        const { action } = ctx;
        assertPublicEntityLifecycleDispatch(action.type);
        if (spawn) stageSpawnAction(ctx, spawn);
      },
    },
    manager: {
      entities<S extends MachineStore>(ctx: ManagerRuntimeContext<AnyEvent, S>): EntityAccess<S> {
        return getEntityRuntimeState(ctx).access as EntityAccess<S>;
      },
    },
  });

const resolveEntityPluginSpawn = (options: unknown): AnyEntitySpawnDescriptor | undefined => {
  if (options === undefined) return undefined;
  if (options !== null && typeof options === "object" && "spawn" in options) {
    const spawn = (options as { readonly spawn?: unknown }).spawn;
    assertEntitySpawnDescriptor(spawn);
    return spawn;
  }

  throw new LiteFsmError(
    "LITE_FSM_INVALID_OPTIONS",
    "[lite-fsm/entities] entitiesPlugin options must be { spawn } with a defineEntitySpawn(...) descriptor.",
  );
};

export function entitiesPlugin(): EntitiesPlugin<unknown, never>;
export function entitiesPlugin <const Spawn extends AnyEntitySpawnDescriptor>(
  options: EntityPluginOptions<Spawn>,
): EntitiesPlugin<unknown, EntitySpawnPluginEvents<Spawn>>;
export function entitiesPlugin(options?: unknown): EntitiesPlugin<unknown, AnyEvent> {
  const spawn = resolveEntityPluginSpawn(options);
  return createEntitiesPlugin(spawn);
}
