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
    `[lite-fsm/entities] scoped entities.get('${requestedKey}') failed for source actor '${scope.sourceActor}' while handling '${scope.eventType}' on entity '${entityId}': ${reason}.`,
  );

const validateRequiredScopedAccess = (
  runtime: EntityRuntimeState,
  scope: EntityAccessScope,
  requestedKey: string,
  store: ColumnarActorStore,
): void => {
  /* v8 ignore next -- production intentionally skips full required-access diagnostics. */
  if (!isDev()) return;

  for (const entry of scope.entries) {
    const stale =
      runtime.entityStore.alive[entry.entity] !== 1 ||
      runtime.entityStore.generation[entry.entity] !== entry.generation;
    if (stale) {
      throw scopedAccessError(scope, requestedKey, entry.id, "captured entity scope is stale");
    }
    if (store.presence[entry.entity] !== 1) {
      throw scopedAccessError(scope, requestedKey, entry.id, "requested actor row is missing");
    }
  }
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

  for (const columnName of Object.keys(store.columns)) {
    Object.defineProperty(view, columnName, {
      enumerable: true,
      configurable: false,
      get() {
        return store.columns[columnName];
      },
    });
  }

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
