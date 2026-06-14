import { definePlugin, LiteFsmError } from "@lite-fsm/core";
import type {
  AnyEvent,
  LiteFsmPlugin,
  MachineStore,
  ManagerExtensionFactory,
  ManagerExtensionType,
  ManagerExtensionTypeLambda,
  ManagerRuntimeContext,
} from "@lite-fsm/core";

import type { EntityAccess } from "./runtime/access";
import { assertPublicEntityLifecycleDispatch } from "./runtime/lifecycle";
import {
  entityStorageRuntime,
  type EntityStorageDefinition,
  type EntityStorageRouteMeta,
} from "./runtime/storage";
import { getEntityRuntimeState } from "./runtime/state";
import { stageSpawnAction } from "./runtime/transaction";
import { assertEntitySpawnDescriptor, type AnyEntitySpawnDescriptor, type EntitySpawnPluginEvents } from "./spawn";

declare const entityIndexBrand: unique symbol;

export type EntityId = string;
export type EntityIndex = number & { readonly [entityIndexBrand]: "EntityIndex" };

type EntityPluginOptions<Spawn extends AnyEntitySpawnDescriptor> = {
  readonly spawn: Spawn;
};

interface EntityAccessManagerExtension extends ManagerExtensionTypeLambda {
  readonly type: this extends {
    readonly context: ManagerRuntimeContext<infer _Events, infer AppMachines extends MachineStore>;
  }
    ? () => EntityAccess<AppMachines>
    : never;
}

type EntityManagerDefinition = {
  readonly entities: ManagerExtensionFactory & ManagerExtensionType<EntityAccessManagerExtension>;
};
type EntityRouteMetaResolvers = {
  readonly entityId: (value: EntityStorageRouteMeta["entityId"]) => EntityStorageRouteMeta["entityId"];
};
export type EntitiesPlugin<AppDeps = unknown, PluginEvents extends AnyEvent = never> = LiteFsmPlugin<
  "@lite-fsm/entities",
  PluginEvents,
  {
    readonly name: "@lite-fsm/entities";
    readonly storage: readonly [EntityStorageDefinition<AppDeps>];
    readonly routeMeta?: EntityRouteMetaResolvers;
    readonly manager: EntityManagerDefinition;
  }
>;

const ENTITY_PLUGIN_NAME = "@lite-fsm/entities";

const resolveEntityRouteMeta = (value: EntityStorageRouteMeta["entityId"]): EntityStorageRouteMeta["entityId"] => {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;

  throw new LiteFsmError(
    "LITE_FSM_INVALID_ROUTE_RESOLVER_RESULT",
    "[lite-fsm/entities] routeMeta.entityId must be a string or an array of strings.",
  );
};

const createEntitiesPlugin = <PluginEvents extends AnyEvent>(
  spawn: AnyEntitySpawnDescriptor | undefined,
): EntitiesPlugin<unknown, PluginEvents> =>
  definePlugin<PluginEvents>().create({
    name: ENTITY_PLUGIN_NAME,
    storage: [entityStorageRuntime],
    routeMeta: {
      entityId: resolveEntityRouteMeta,
    },
    hooks: {
      beforeReduce(ctx) {
        const { action } = ctx;
        assertPublicEntityLifecycleDispatch(action.type);
        if (spawn) stageSpawnAction(ctx, spawn);
      },
    },
    manager: {
      entities<S extends MachineStore>(ctx: ManagerRuntimeContext<AnyEvent, S>): () => EntityAccess<S> {
        const access = getEntityRuntimeState(ctx).access as EntityAccess<S>;
        return () => access;
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
