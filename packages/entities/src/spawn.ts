import { LiteFsmError } from "@lite-fsm/core";
import type { AnyEvent, MachineStore } from "@lite-fsm/core";

import { hasOwn, isPlainObject } from "./internal";
import type { EntitySpawnPayload, EntitySpawnSchema } from "./schema";
import { isEntityLifecycleEventType } from "./runtime/lifecycle";

const spawnEventMarker: unique symbol = Symbol.for("lite-fsm.entities.spawn-event") as never;
const entitySpawnMarker: unique symbol = Symbol.for("lite-fsm.entities.spawn-descriptor") as never;

export type SpawnEventDescriptor<Payload> = {
  readonly [spawnEventMarker]: true;
  readonly payloadType?: Payload;
};

type SpawnEventPayload<Descriptor> = Descriptor extends { readonly payloadType?: infer Payload } ? Payload : never;

export type SpawnEventsConfig = Readonly<Record<string, SpawnEventDescriptor<unknown>>>;

export type SpawnEventsFrom<SpawnEvents extends SpawnEventsConfig> = {
  readonly [Type in keyof SpawnEvents & string]: {
    readonly type: Type;
    readonly payload: SpawnEventPayload<SpawnEvents[Type]>;
  };
}[keyof SpawnEvents & string];

type EntityActorMachine = {
  readonly storage: "entity";
  readonly spawnSchema: EntitySpawnSchema;
};

type EntityActorKey<Machines extends MachineStore> = {
  readonly [Key in keyof Machines]: Machines[Key] extends EntityActorMachine ? Key : never;
}[keyof Machines] &
  string;

type EntityActorSpawnSchema<
  Machines extends MachineStore,
  Key extends EntityActorKey<Machines>,
> = Machines[Key] extends { readonly spawnSchema: infer SpawnSchema extends EntitySpawnSchema } ? SpawnSchema : never;

type EntitySpawnActors<Machines extends MachineStore> = Partial<{
  readonly [Key in EntityActorKey<Machines>]: EntitySpawnPayload<EntityActorSpawnSchema<Machines, Key>>;
}>;

export type EntitySpawnSpec<Machines extends MachineStore = MachineStore> = {
  readonly id: string;
  readonly groupTag: string;
  readonly actors: EntitySpawnActors<Machines>;
};

type EntitySpawnRecipeResult<Machines extends MachineStore> =
  | EntitySpawnSpec<Machines>
  | readonly EntitySpawnSpec<Machines>[];

export type EntitySpawnRecipes<
  Machines extends MachineStore,
  SpawnEvents extends SpawnEventsConfig,
> = {
  readonly [Type in keyof SpawnEvents & string]: (
    payload: SpawnEventPayload<SpawnEvents[Type]>,
  ) => EntitySpawnRecipeResult<Machines>;
};

export type EntitySpawnDescriptor<
  SpawnEvents extends SpawnEventsConfig = SpawnEventsConfig,
  Machines extends MachineStore = MachineStore,
> = {
  readonly [entitySpawnMarker]: true;
  readonly spawnEvents: SpawnEvents;
  readonly recipes: EntitySpawnRecipes<Machines, SpawnEvents>;
};

export type EntitySpawnEvents<Spawn> =
  Spawn extends EntitySpawnDescriptor<infer SpawnEvents, any> ? SpawnEvents : never;

export type EntitySpawnPluginEvents<Spawn> = SpawnEventsFrom<EntitySpawnEvents<Spawn>>;

export type AnyEntitySpawnDescriptor = EntitySpawnDescriptor<any, any>;

const spawnConfigError = (reason: string): LiteFsmError =>
  new LiteFsmError("LITE_FSM_INVALID_OPTIONS", `[lite-fsm/entities] invalid entity spawn config: ${reason}.`);

const isSpawnEventDescriptor = (value: unknown): value is SpawnEventDescriptor<unknown> =>
  isPlainObject(value) && Reflect.get(value, spawnEventMarker) === true;

const assertNoLifecycleKey = (source: string, key: string): void => {
  if (!isEntityLifecycleEventType(key)) return;

  throw spawnConfigError(`${source} cannot use internal lifecycle event '${key}'`);
};

function assertSpawnEvents(events: unknown): asserts events is SpawnEventsConfig {
  if (!isPlainObject(events)) {
    throw spawnConfigError("spawnEvents must be a plain object");
  }

  for (const [key, descriptor] of Object.entries(events)) {
    assertNoLifecycleKey("spawnEvents", key);
    if (!isSpawnEventDescriptor(descriptor)) {
      throw spawnConfigError(`spawnEvents.${key} must be created by spawnEvent()`);
    }
  }
}

function assertRecipeKeys(
  events: SpawnEventsConfig,
  recipes: unknown,
): asserts recipes is EntitySpawnRecipes<MachineStore, SpawnEventsConfig> {
  if (!isPlainObject(recipes)) {
    throw spawnConfigError("recipes must be a plain object");
  }

  const eventKeys = Object.keys(events);
  const eventKeySet = new Set(eventKeys);

  for (const key of Object.keys(recipes)) {
    assertNoLifecycleKey("recipes", key);
    if (!eventKeySet.has(key)) {
      throw spawnConfigError(`unknown recipe key '${key}'`);
    }
    if (typeof recipes[key] !== "function") {
      throw spawnConfigError(`recipe '${key}' must be a function`);
    }
  }

  for (const key of eventKeys) {
    if (!hasOwn(recipes, key)) {
      throw spawnConfigError(`missing recipe for spawn event '${key}'`);
    }
  }
}

export const spawnEvent = <Payload>(): SpawnEventDescriptor<Payload> =>
  Object.freeze({ [spawnEventMarker]: true }) as SpawnEventDescriptor<Payload>;

export const defineSpawnEvents = <const SpawnEvents extends SpawnEventsConfig>(events: SpawnEvents): SpawnEvents => {
  assertSpawnEvents(events);
  return Object.freeze({ ...events }) as SpawnEvents;
};

export const defineEntitySpawn =
  <const Machines extends MachineStore, const SpawnEvents extends SpawnEventsConfig>(
    _machines: Machines,
    spawnEvents: SpawnEvents,
  ) =>
  (recipes: EntitySpawnRecipes<Machines, SpawnEvents>): EntitySpawnDescriptor<SpawnEvents, Machines> => {
    assertSpawnEvents(spawnEvents);
    assertRecipeKeys(spawnEvents, recipes);

    return Object.freeze({
      [entitySpawnMarker]: true,
      spawnEvents,
      recipes,
    }) as EntitySpawnDescriptor<SpawnEvents, Machines>;
  };

export const isEntitySpawnDescriptor = (value: unknown): value is AnyEntitySpawnDescriptor =>
  isPlainObject(value) && Reflect.get(value, entitySpawnMarker) === true;

export function assertEntitySpawnDescriptor(value: unknown): asserts value is AnyEntitySpawnDescriptor {
  if (!isEntitySpawnDescriptor(value)) {
    throw spawnConfigError("entitiesPlugin({ spawn }) expects a value returned by defineEntitySpawn(...)");
  }

  assertSpawnEvents(value.spawnEvents);
  assertRecipeKeys(value.spawnEvents, value.recipes);
}

export const hasSpawnRecipe = (spawn: AnyEntitySpawnDescriptor, type: string): boolean =>
  hasOwn(spawn.recipes, type);

export const runSpawnRecipe = (
  spawn: AnyEntitySpawnDescriptor,
  action: AnyEvent,
): EntitySpawnRecipeResult<MachineStore> => {
  const recipe = spawn.recipes[action.type];
  return recipe((action as { readonly payload?: unknown }).payload as never);
};
