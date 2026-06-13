import { defineStorageRuntime, LiteFsmError } from "@lite-fsm/core";
import type { LiteFsmStorageRuntimeDefinition, StorageCreatePublicInitialStateContext } from "@lite-fsm/core";

import type { EntityMachineExtension } from "../machine-extension";
import { validateEntitySchema, type EntityContextSchema, type EntitySpawnSchema } from "../schema";
import { assertEntityInitLifecycleConfig, assertPublicEntityLifecycleDispatch } from "./lifecycle";
import { reduceEntityBucket } from "./reduce";
import type { EntityTemplateMetadata } from "./compile";
import {
  asEntityRuntimeState,
  compileEntityTemplate,
  createEntityRuntimeState,
  createPublicInitialState as createEntityPublicInitialState,
  restorePublicSlices,
  type EntityRuntimeState,
} from "./state";
import { prepareEntityTransaction } from "./transaction";

export type EntityStorageRouteMeta = {
  readonly entityId: string | readonly string[];
};

export type EntityStorageRuntimeExtension = Omit<EntityMachineExtension, "storage"> & {
  readonly routeMeta: EntityStorageRouteMeta;
  readonly runtimeState: EntityRuntimeState;
  readonly templateData: EntityTemplateMetadata;
};

export type EntityStorageDefinition<AppDeps = unknown> = LiteFsmStorageRuntimeDefinition<
  "entity",
  EntityMachineExtension<EntityContextSchema, EntitySpawnSchema, object, AppDeps>,
  EntityStorageRouteMeta
>;

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

export const entityStorageRuntime: EntityStorageDefinition<unknown> =
  defineStorageRuntime<EntityStorageRuntimeExtension>().create({
    kind: ENTITY_STORAGE_KIND,
    routeMetaKeys: ["entityId"],
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
