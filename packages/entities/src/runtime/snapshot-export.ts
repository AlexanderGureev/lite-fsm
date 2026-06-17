import {
  getInitialColumnValue,
  type ColumnarActorStore,
  type EntityColumn,
  type EntityRuntimeState,
  type EntityStore,
} from "./state";
import { columnKindsFor } from "./snapshot-import";
import type { EntityActorSnapshot, EntitySnapshot, EntityStoreSnapshot } from "./snapshot-types";

type EntityDehydrateContext = {
  readonly options?: { readonly machines?: readonly string[] } | undefined;
};

const copyStringArray = (value: readonly string[], length: number): string[] =>
  Array.from({ length }, (_, index) => value[index] ?? "");

const serializeEntityStore = (store: EntityStore): EntityStoreSnapshot => ({
  count: store.count,
  capacity: store.capacity,
  ids: copyStringArray(store.ids, store.capacity),
  alive: Array.from(store.alive),
  generation: Array.from(store.generation),
  groupTagByIndex: copyStringArray(store.groupTagByIndex, store.capacity),
  freeList: store.freeList.slice(),
  version: store.version,
});

const serializeColumn = (
  column: EntityColumn,
  capacity: number,
  presence: Uint8Array,
  defaultValue: number | string,
): readonly unknown[] => {
  const serialized = Array.from({ length: capacity }, (_, entity) => {
    if (presence[entity] !== 1) return defaultValue;
    return column[entity] ?? defaultValue;
  });

  return serialized;
};

const serializeActorStore = (store: ColumnarActorStore): EntityActorSnapshot => {
  const columnKinds = columnKindsFor(store);
  return {
    schema: {
      states: store.metadata.publicStates.slice(),
      columns: columnKinds,
    },
    count: store.count,
    capacity: store.capacity,
    version: store.version,
    presence: Array.from(store.presence),
    stateCode: Array.from(store.stateCode),
    prevStateCode: Array.from(store.prevStateCode),
    rowVersion: Array.from(store.rowVersion),
    columns: Object.fromEntries(
      Object.entries(store.columns).map(([name, column]) => [
        name,
        serializeColumn(
          column,
          store.capacity,
          store.presence,
          getInitialColumnValue(store.metadata.initialContext[name]),
        ),
      ]),
    ),
  };
};

export const dehydrateEntityRuntime = (
  runtime: EntityRuntimeState,
  ctx: EntityDehydrateContext,
): { readonly machines: Record<string, unknown>; readonly snapshot: EntitySnapshot } => {
  const requestedMachines = ctx.options?.machines;
  const machineKeys = requestedMachines ?? Object.keys(runtime.actorStores);
  const machines = Object.create(null) as Record<string, unknown>;
  for (const key of machineKeys) {
    machines[key] = runtime.actorStores[key].publicSlice;
  }

  return {
    machines,
    snapshot: {
      formatVersion: 1,
      entityStore: serializeEntityStore(runtime.entityStore),
      actors: Object.fromEntries(
        Object.entries(runtime.actorStores).map(([key, store]) => [key, serializeActorStore(store)]),
      ),
    },
  };
};
