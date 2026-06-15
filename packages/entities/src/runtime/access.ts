import { LiteFsmError } from "@lite-fsm/core";
import type { ActorPublicState, MachineStore } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import type { EntitySchemaValue, EntityContextSchema } from "../schema";
import type { ColumnarActorStore, EntityRuntimeState } from "./state";
import type { CapturedEntityScopeEntry } from "./transaction";

export type ReadonlyEntityColumn<T> = {
  readonly [entity: EntityIndex]: T;
};

type EntityActorMachine = {
  readonly storage: "entity";
  readonly config: object;
  readonly initialContext: EntityContextSchema;
};

export type EntityActorKey<AppMachines extends MachineStore> = {
  readonly [Key in keyof AppMachines]: AppMachines[Key] extends EntityActorMachine ? Key : never;
}[keyof AppMachines] &
  string;

export type EntityContextFor<
  AppMachines extends MachineStore,
  Key extends EntityActorKey<AppMachines>,
> = AppMachines[Key] extends {
  readonly initialContext: infer Context extends EntityContextSchema;
}
  ? EntitySchemaValue<Context>
  : never;

export type EntityStateFor<
  AppMachines extends MachineStore,
  Key extends EntityActorKey<AppMachines>,
> = AppMachines[Key] extends { readonly config: infer Config extends object }
  ? ActorPublicState<Config>
  : never;

type EntityActorStoreViewFor<
  AppMachines extends MachineStore,
  Key extends EntityActorKey<AppMachines>,
> = {
  readonly count: number;
  readonly version: number;
  has(entity: EntityIndex): boolean;
  state(entity: EntityIndex): EntityStateFor<AppMachines, Key> | undefined;
} & {
  readonly [Field in keyof EntityContextFor<AppMachines, Key>]: ReadonlyEntityColumn<
    EntityContextFor<AppMachines, Key>[Field]
  >;
};

export type EntityAccess<AppMachines extends MachineStore> = {
  get<Key extends EntityActorKey<AppMachines>>(key: Key): EntityActorStoreViewFor<AppMachines, Key>;
  maybe<Key extends EntityActorKey<AppMachines>>(key: Key): EntityActorStoreViewFor<AppMachines, Key>;
};

type EntityStoreView = {
  readonly count: number;
  readonly version: number;
  has(entity: EntityIndex): boolean;
  state(entity: EntityIndex): string | undefined;
} & Record<string, unknown>;

export type EntityAccessScope = {
  readonly sourceActor: string;
  readonly eventType: string;
  readonly entries: readonly CapturedEntityScopeEntry[];
};

type ScopedEntitySelfOptions = {
  readonly scopeName: "effect";
  readonly indices: readonly EntityIndex[];
  readonly entries: readonly CapturedEntityScopeEntry[];
};

export type EntityReactionScope = {
  readonly indices: readonly EntityIndex[];
  readonly markers: Uint32Array;
  readonly generation: Uint32Array;
  readonly lifetime: { readonly token: number };
  readonly token: number;
};

const unknownEntityActor = (key: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_RUNTIME",
    `[lite-fsm/entities] unknown entity actor template '${key}'.`,
  );

const getKnownStore = (runtime: EntityRuntimeState, key: string): ColumnarActorStore => {
  const store = runtime.actorStores[key];
  if (store) return store;

  throw unknownEntityActor(key);
};

const isDev = (): boolean =>
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV !== "production";

const scopedAccessError = (
  scope: EntityAccessScope,
  requestedKey: string,
  entityId: string,
  reason: string,
): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_RUNTIME",
    `[lite-fsm/entities] scoped entities().get('${requestedKey}') failed for source actor '${scope.sourceActor}' while handling '${scope.eventType}' on entity '${entityId}': ${reason}.`,
  );

export const capturedEntityScopeEntryIsLive = (
  runtime: EntityRuntimeState,
  entry: CapturedEntityScopeEntry,
): boolean =>
  runtime.entityStore.alive[entry.entity] === 1 &&
  runtime.entityStore.generation[entry.entity] === entry.generation;

const validateRequiredScopedAccess = (
  runtime: EntityRuntimeState,
  scope: EntityAccessScope,
  requestedKey: string,
  store: ColumnarActorStore,
): void => {
  /* v8 ignore next -- production intentionally skips full required-access diagnostics. */
  if (!isDev()) return;

  for (const entry of scope.entries) {
    if (!capturedEntityScopeEntryIsLive(runtime, entry)) {
      throw scopedAccessError(scope, requestedKey, entry.id, "captured entity scope is stale");
    }
    if (store.presence[entry.entity] !== 1) {
      throw scopedAccessError(scope, requestedKey, entry.id, "requested actor row is missing");
    }
  }
};

const attachStoreColumns = (view: EntityStoreView, store: ColumnarActorStore): void => {
  for (const columnName of Object.keys(store.columns)) {
    Object.defineProperty(view, columnName, {
      enumerable: true,
      configurable: true,
      writable: false,
      value: store.columns[columnName],
    });
  }
};

const storeViewByStore = new WeakMap<ColumnarActorStore, EntityStoreView>();

export const rebindEntityStoreView = (store: ColumnarActorStore): void => {
  const view = storeViewByStore.get(store);
  if (!view) return;

  attachStoreColumns(view, store);
};

const createStoreView = (runtime: EntityRuntimeState, key: string): EntityStoreView => {
  const store = getKnownStore(runtime, key);
  const view: EntityStoreView = {
    get count() {
      return store.count;
    },
    get version() {
      return store.version;
    },
    has(entity) {
      return store.presence[entity] === 1;
    },
    state(entity) {
      /* v8 ignore next 4 -- live rows are introduced by spawn/lifecycle stages after stage 3. */
      if (store.presence[entity] === 1) {
        const code = store.stateCode[entity];
        return store.metadata.publicStates[code];
      }
      return undefined;
    },
  };

  attachStoreColumns(view, store);
  storeViewByStore.set(store, view);
  return view;
};

export const createEntityAccess = (runtime: EntityRuntimeState): EntityAccess<MachineStore> => {
  const views = new Map<string, EntityStoreView>();
  const getView = (key: string): EntityStoreView => {
    const cached = views.get(key);
    if (cached) return cached;

    const view = createStoreView(runtime, key);
    views.set(key, view);
    return view;
  };

  return {
    get(key) {
      return getView(key);
    },
    maybe(key) {
      return getView(key);
    },
  } as EntityAccess<MachineStore>;
};

const outsideScopeError = (scopeName: "effect" | "reaction", entity: EntityIndex): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_RUNTIME",
    `[lite-fsm/entities] entity index ${entity} is outside current entity ${scopeName} scope.`,
  );

const staleReactionScopeError = (entity: EntityIndex, reason: string): LiteFsmError =>
  new LiteFsmError(
    "LITE_FSM_INVALID_STORAGE_RUNTIME",
    `[lite-fsm/entities] entity index ${entity} is stale in current entity reaction scope: ${reason}.`,
  );

const attachActorColumns = (self: Record<string, unknown>, store: ColumnarActorStore): void => {
  for (const [name, column] of Object.entries(store.columns)) {
    self[name] = column;
  }
};

export const createScopedEntitySelf = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  options: ScopedEntitySelfOptions,
): Record<string, unknown> => {
  let entriesByEntity: Map<EntityIndex, CapturedEntityScopeEntry> | undefined;
  const getEntriesByEntity = (): Map<EntityIndex, CapturedEntityScopeEntry> => {
    if (entriesByEntity) return entriesByEntity;

    const next = new Map<EntityIndex, CapturedEntityScopeEntry>();
    for (const entry of options.entries) next.set(entry.entity, entry);
    entriesByEntity = next;
    return next;
  };
  const self: Record<string, unknown> = {
    indices: options.indices,
    states: store.metadata.stateCodeByName,
    presence: store.presence,
    stateCode: store.stateCode,
    prevStateCode: store.prevStateCode,
    rowVersion: store.rowVersion,
    has(entity: EntityIndex) {
      const entry = getEntriesByEntity().get(entity);
      if (!entry) return false;
      return capturedEntityScopeEntryIsLive(runtime, entry) && store.presence[entity] === 1;
    },
    entityId(entity: EntityIndex) {
      const entry = getEntriesByEntity().get(entity);
      if (entry) return entry.id;
      throw outsideScopeError(options.scopeName, entity);
    },
  };

  attachActorColumns(self, store);

  return self;
};

export const createReactionEntitySelf = (
  runtime: EntityRuntimeState,
  store: ColumnarActorStore,
  scope: EntityReactionScope,
): Record<string, unknown> => {
  const entityIsInScope = (entity: EntityIndex): boolean =>
    scope.lifetime.token === scope.token && scope.markers[entity] === scope.token;
  const entityHasCapturedGeneration = (entity: EntityIndex): boolean =>
    runtime.entityStore.generation[entity] === scope.generation[entity];
  const entityHasCurrentId = (entity: EntityIndex): boolean => {
    const id = runtime.entityStore.ids[entity];
    return id !== undefined && id.length > 0;
  };

  const self: Record<string, unknown> = {
    indices: scope.indices,
    states: store.metadata.stateCodeByName,
    presence: store.presence,
    stateCode: store.stateCode,
    prevStateCode: store.prevStateCode,
    rowVersion: store.rowVersion,
    has(entity: EntityIndex) {
      return (
        entityIsInScope(entity) &&
        entityHasCapturedGeneration(entity) &&
        runtime.entityStore.alive[entity] === 1 &&
        store.presence[entity] === 1 &&
        entityHasCurrentId(entity)
      );
    },
    entityId(entity: EntityIndex) {
      if (!entityIsInScope(entity)) throw outsideScopeError("reaction", entity);
      if (!entityHasCapturedGeneration(entity)) throw staleReactionScopeError(entity, "generation changed");
      if (runtime.entityStore.alive[entity] !== 1) throw staleReactionScopeError(entity, "entity is not live");
      if (store.presence[entity] !== 1) throw staleReactionScopeError(entity, "actor row is missing");

      const id = runtime.entityStore.ids[entity];
      if (id !== undefined && id.length > 0) return id;
      throw staleReactionScopeError(entity, "entity id is missing");
    },
  };

  attachActorColumns(self, store);

  return self;
};

export const createReactionEntityAccess = (runtime: EntityRuntimeState): EntityAccess<MachineStore> =>
  runtime.access as EntityAccess<MachineStore>;

export const createScopedEntityAccess = (
  runtime: EntityRuntimeState,
  scope: EntityAccessScope,
): EntityAccess<MachineStore> => {
  const root = runtime.access as unknown as {
    get(key: string): EntityStoreView;
    maybe(key: string): EntityStoreView;
  };

  return {
    get(key) {
      const store = getKnownStore(runtime, key);
      const view = root.get(key);
      validateRequiredScopedAccess(runtime, scope, key, store);
      return view;
    },
    maybe(key) {
      return root.maybe(key);
    },
  } as EntityAccess<MachineStore>;
};
