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
import { validateEntitySchema } from "./schema";
import type { EntityContextSchema, EntitySpawnSchema } from "./schema";

declare const entityIndexBrand: unique symbol;

export type EntityId = string;
export type EntityIndex = number & { readonly [entityIndexBrand]: "EntityIndex" };

type EntityPluginOptions<AppDeps> = [AppDeps] extends [unknown] ? undefined : never;
type EntityStorageRuntimeExtension = Omit<EntityMachineExtension, "storage" | "publicState"> & {
  readonly publicState: ReturnType<typeof createEntityPublicInitialState>;
  readonly runtimeState: EntityRuntimeState;
  readonly templateData: EntityTemplateMetadata;
};
type EntityStorageDefinition = LiteFsmStorageRuntimeDefinition<"entity", EntityMachineExtension>;
type EntityManagerDefinition = {
  readonly entities: <S extends MachineStore>(ctx: ManagerRuntimeContext<AnyEvent, S>) => EntityAccess<S>;
};
type EntitiesPlugin = LiteFsmPlugin<
  "@lite-fsm/entities",
  never,
  {
    readonly name: "@lite-fsm/entities";
    readonly storage: readonly [EntityStorageDefinition];
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
    throw invalidEntityTemplate(key, 'groupTag is defined by EntitySpawnSpec, not by actor template');
  }

  validateEntitySchema(key, "initialContext", machine.initialContext);
  validateEntitySchema(key, "spawnSchema", machine.spawnSchema);
};

const entityStorageRuntime = defineStorageRuntime<EntityStorageRuntimeExtension>().create({
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
  reduceBucket() {
    return { type: "skip" };
  },
  commit({ state, dispatch }) {
    dispatch.nextState = restorePublicSlices(asEntityRuntimeState(state), dispatch.nextState);
  },
});

const createEntitiesPlugin = (): EntitiesPlugin =>
  definePlugin().create({
    name: ENTITY_PLUGIN_NAME,
    storage: [entityStorageRuntime],
    manager: {
      entities<S extends MachineStore>(ctx: ManagerRuntimeContext<AnyEvent, S>): EntityAccess<S> {
        return getEntityRuntimeState(ctx).access as EntityAccess<S>;
      },
    },
  }) as unknown as EntitiesPlugin;

const assertEntityPluginOptions = (options: unknown): void => {
  if (options === undefined) return;

  throw new LiteFsmError(
    "LITE_FSM_INVALID_OPTIONS",
    "[lite-fsm] entitiesPlugin options are not supported in this alpha stage.",
  );
};

export function entitiesPlugin<AppDeps = unknown>(
  options?: EntityPluginOptions<AppDeps>,
): EntitiesPlugin {
  assertEntityPluginOptions(options);
  return createEntitiesPlugin();
}
