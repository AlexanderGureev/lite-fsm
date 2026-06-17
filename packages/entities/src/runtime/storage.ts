import { defineStorageRuntime, LiteFsmError } from "@lite-fsm/core";
import type { LiteFsmStorageRuntimeDefinition, StorageCreatePublicInitialStateContext } from "@lite-fsm/core";

import { hasOwn } from "../internal";
import type { EntityMachineExtension } from "../machine-extension";
import { validateEntitySchema, type EntityContextSchema, type EntitySpawnSchema } from "../schema";
import { invokeEntityEffect, resolveEntityEffectInvocations, type EntityEffectInvocation } from "./effects";
import { assertEntityInitLifecycleConfig, assertPublicEntityLifecycleDispatch } from "./lifecycle";
import { reduceEntityBucket } from "./reduce";
import { createEntityReactRuntime } from "./react";
import { runEntityReactions } from "./reactions";
import { dehydrateEntityRuntime, hydrateEntityRuntime, type EntitySnapshot } from "./snapshot";
import type { EntityTemplateMetadata } from "./compile";
import { traceDispatchPhase } from "./transitionTrace";
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
  readonly snapshotData: EntitySnapshot;
  readonly invocation: EntityEffectInvocation;
};

export type EntityStorageDefinition<AppDeps = unknown> = LiteFsmStorageRuntimeDefinition<
  "entity",
  EntityMachineExtension<EntityContextSchema, EntitySpawnSchema, object, AppDeps>,
  EntityStorageRouteMeta
>;

const ENTITY_STORAGE_KIND = "entity";

const invalidEntityTemplate = (machineKey: string, reason: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CONFIG",
    `[lite-fsm/entities] machine '${machineKey}' has invalid storage: "entity" config: ${reason}.`,
  );

const invalidDespawnOnStorage = (machineKey: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CONFIG",
    `[lite-fsm/entities] machine '${machineKey}' uses despawnOn, but despawnOn is only supported with storage: "entity".`,
  );

const invalidReactionsStorage = (machineKey: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_CONFIG",
    `[lite-fsm/entities] machine '${machineKey}' uses reactions, but reactions are only supported with storage: "entity".`,
  );

const validateDespawnOnStorageUsage = (machines: Readonly<Record<string, unknown>>): void => {
  for (const [key, machine] of Object.entries(machines)) {
    /* v8 ignore next -- defensive: MachineManager config entries are machine objects after core validation. */
    if (machine === null || typeof machine !== "object") continue;

    const record = machine as Record<string, unknown>;
    if (!hasOwn(record, "despawnOn") || record.despawnOn === undefined) continue;
    if (record.storage === ENTITY_STORAGE_KIND) continue;

    throw invalidDespawnOnStorage(key);
  }
};

const validateReactionsStorageUsage = (machines: Readonly<Record<string, unknown>>): void => {
  for (const [key, machine] of Object.entries(machines)) {
    /* v8 ignore next -- defensive: MachineManager config entries are machine objects after core validation. */
    if (machine === null || typeof machine !== "object") continue;

    const record = machine as Record<string, unknown>;
    if (!hasOwn(record, "reactions") || record.reactions === undefined) continue;
    if (record.storage === ENTITY_STORAGE_KIND) continue;

    throw invalidReactionsStorage(key);
  }
};

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

const createRuntimeState = (
  templates: Parameters<typeof createEntityRuntimeState>[0],
  manager: Parameters<typeof createEntityRuntimeState>[1],
): EntityRuntimeState => {
  const runtime = createEntityRuntimeState(templates, manager);
  runtime.react = createEntityReactRuntime(runtime);
  return runtime;
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
            readonly despawnOn?: unknown;
            readonly effects?: unknown;
            readonly reactions?: unknown;
            readonly reducer?: unknown;
          },
        ),
      };
    },
    createRuntimeState({ templates, manager }) {
      const config = (manager as { readonly config?: unknown }).config;
      /* v8 ignore next -- internal manager context provides config; cast only hides it from public storage types. */
      if (config === null || typeof config !== "object") return createRuntimeState(templates, manager);

      validateDespawnOnStorageUsage(config as Readonly<Record<string, unknown>>);
      validateReactionsStorageUsage(config as Readonly<Record<string, unknown>>);
      return createRuntimeState(templates, manager);
    },
    createPublicInitialState({ template, state }: StorageCreatePublicInitialStateContext<EntityStorageRuntimeExtension>) {
      return createEntityPublicInitialState(asEntityRuntimeState(state), template);
    },
    prepareAction({ action, dispatch, state }) {
      traceDispatchPhase(dispatch, "entities.prepare.transaction", () => {
        assertPublicEntityLifecycleDispatch(action.type);
        prepareEntityTransaction(dispatch, asEntityRuntimeState(state));
      });
    },
    reduceBucket(ctx) {
      return reduceEntityBucket(asEntityRuntimeState(ctx.state), ctx);
    },
    commit({ state, dispatch }) {
      traceDispatchPhase(dispatch, "entities.commit.restorePublicSlices", () => {
        dispatch.nextState = restorePublicSlices(asEntityRuntimeState(state), dispatch.nextState);
      });
    },
    effects: {
      resolveInvocations(ctx) {
        return traceDispatchPhase(ctx.dispatch, "entities.effects.resolve", () =>
          resolveEntityEffectInvocations(asEntityRuntimeState(ctx.state), ctx),
        );
      },
      invoke(ctx) {
        traceDispatchPhase(ctx.dispatch, "entities.effects.invoke", () => {
          invokeEntityEffect(asEntityRuntimeState(ctx.state), ctx.invocation, ctx);
        });
      },
    },
    reactions: {
      run(ctx) {
        traceDispatchPhase(ctx.dispatch, "entities.reactions.total", () => {
          runEntityReactions(asEntityRuntimeState(ctx.state), ctx);
        });
      },
    },
    snapshot: {
      dehydrate(ctx) {
        return dehydrateEntityRuntime(asEntityRuntimeState(ctx.state), ctx);
      },
      hydrate(ctx) {
        return hydrateEntityRuntime(asEntityRuntimeState(ctx.state), ctx);
      },
    },
  });
