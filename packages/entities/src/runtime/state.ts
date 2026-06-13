import type { MachineStore, StorageManagerContext, StorageTemplate } from "@lite-fsm/core";

import { createEntityAccess, type EntityAccess } from "./access";
import type { EntityIndex } from "../plugin";
import type { EntityContextSchema, EntitySpawnSchema } from "../schema";

type EntityPublicStateSlice = {
  readonly storage: "entity";
  readonly version: number;
  readonly count: number;
  readonly capacity: number;
};

type EntityColumn = Float32Array | Int16Array | Int32Array | Uint8Array | string[];

type EntityContextDescriptor = {
  readonly kind: "f32" | "i16" | "i32" | "u8" | "string";
};

export type EntityTemplateMetadata = {
  readonly templateKey: string;
  readonly initialContext: EntityContextSchema;
  readonly spawnSchema: EntitySpawnSchema;
  readonly publicStates: readonly string[];
  readonly stateCodeByName: Readonly<Record<string, number>>;
};

export type EntityStore = {
  count: number;
  capacity: number;
  ids: string[];
  indexById: Record<string, EntityIndex>;
  alive: Uint8Array;
  generation: Uint32Array;
  groupTagByIndex: string[];
  freeList: EntityIndex[];
  version: number;
};

export type ColumnarActorStore = {
  readonly templateKey: string;
  readonly metadata: EntityTemplateMetadata;
  capacity: number;
  count: number;
  version: number;
  presence: Uint8Array;
  stateCode: Int16Array;
  rowVersion: Uint32Array;
  stateBuckets: Record<string, EntityIndex[]>;
  statePosition: Int32Array;
  acceptedScratch: EntityIndex[];
  enteredScratchByState: Record<string, EntityIndex[]>;
  columns: Record<string, EntityColumn>;
  publicSlice: EntityPublicStateSlice;
};

export type EntityRuntimeState = {
  readonly entityStore: EntityStore;
  readonly actorStores: Record<string, ColumnarActorStore>;
  readonly access: EntityAccess<MachineStore>;
};

const runtimeByManager = new WeakMap<object, EntityRuntimeState>();

const nonPublicStateNames = new Set(["__INIT", "__RESOLVED", "__REJECTED", "__CANCELLED", "*"]);

const emptyColumnFactories = {
  f32: () => new Float32Array(0),
  i16: () => new Int16Array(0),
  i32: () => new Int32Array(0),
  u8: () => new Uint8Array(0),
  string: () => [] as string[],
} as const satisfies Record<EntityContextDescriptor["kind"], () => EntityColumn>;

const createEmptyColumn = (descriptor: EntityContextDescriptor): EntityColumn =>
  emptyColumnFactories[descriptor.kind]();

const createScratchByState = (states: readonly string[]): Record<string, EntityIndex[]> =>
  Object.fromEntries(states.map((state) => [state, [] as EntityIndex[]]));

const createEntityStore = (): EntityStore => ({
  count: 0,
  capacity: 0,
  ids: [],
  indexById: Object.create(null) as Record<string, EntityIndex>,
  alive: new Uint8Array(0),
  generation: new Uint32Array(0),
  groupTagByIndex: [],
  freeList: [],
  version: 0,
});

const createPublicSlice = (store: Pick<ColumnarActorStore, "capacity" | "count" | "version">): EntityPublicStateSlice => ({
  storage: "entity",
  version: store.version,
  count: store.count,
  capacity: store.capacity,
});

const createColumnarActorStore = (metadata: EntityTemplateMetadata): ColumnarActorStore => {
  const columns = Object.fromEntries(
    Object.entries(metadata.initialContext).map(([name, descriptor]) => [
      name,
      createEmptyColumn(descriptor as EntityContextDescriptor),
    ]),
  ) as Record<string, EntityColumn>;
  const store: ColumnarActorStore = {
    templateKey: metadata.templateKey,
    metadata,
    capacity: 0,
    count: 0,
    version: 0,
    presence: new Uint8Array(0),
    stateCode: new Int16Array(0),
    rowVersion: new Uint32Array(0),
    stateBuckets: createScratchByState(metadata.publicStates),
    statePosition: new Int32Array(0),
    acceptedScratch: [],
    enteredScratchByState: createScratchByState(metadata.publicStates),
    columns,
    publicSlice: { storage: "entity", version: 0, count: 0, capacity: 0 },
  };

  store.publicSlice = createPublicSlice(store);
  return store;
};

export const compileEntityTemplate = (
  templateKey: string,
  machine: { readonly config: object; readonly initialContext: EntityContextSchema; readonly spawnSchema: EntitySpawnSchema },
): EntityTemplateMetadata => {
  const publicStates = Object.keys(machine.config).filter((state) => !nonPublicStateNames.has(state));
  const stateCodeByName = Object.fromEntries(publicStates.map((state, index) => [state, index]));

  return {
    templateKey,
    initialContext: machine.initialContext,
    spawnSchema: machine.spawnSchema,
    publicStates,
    stateCodeByName,
  };
};

export const createEntityRuntimeState = (
  templates: readonly StorageTemplate<EntityTemplateMetadata>[],
  manager: StorageManagerContext,
): EntityRuntimeState => {
  const runtime = {
    entityStore: createEntityStore(),
    actorStores: Object.create(null) as Record<string, ColumnarActorStore>,
    access: undefined as unknown as EntityAccess<MachineStore>,
  };

  for (const template of templates) {
    runtime.actorStores[template.key] = createColumnarActorStore(template.data as EntityTemplateMetadata);
  }
  runtime.access = createEntityAccess(runtime);
  runtimeByManager.set(manager, runtime);

  return runtime;
};

export const getEntityRuntimeState = (manager: object): EntityRuntimeState => {
  const runtime = runtimeByManager.get(manager);
  /* v8 ignore next 7 -- defensive invariant: manager extension is attached after createRuntimeState for installed plugin. */
  if (!runtime) {
    throw new Error("[lite-fsm/entities] entity runtime state is not initialized for this manager.");
  }

  return runtime;
};

export const asEntityRuntimeState = (state: unknown): EntityRuntimeState => state as EntityRuntimeState;

export const createPublicInitialState = (
  runtime: EntityRuntimeState,
  template: StorageTemplate<EntityTemplateMetadata>,
): EntityPublicStateSlice => {
  const store = runtime.actorStores[template.key];
  /* v8 ignore next 4 -- compile/runtime bucket invariant: public state is requested only for compiled entity templates. */
  if (!store) {
    throw new Error(`[lite-fsm/entities] missing actor store for entity template '${template.key}'.`);
  }

  store.publicSlice = createPublicSlice(store);
  return store.publicSlice;
};

export const restorePublicSlices = (
  runtime: EntityRuntimeState,
  nextState: Record<string, unknown>,
): Record<string, unknown> => {
  let restored = nextState;

  for (const store of Object.values(runtime.actorStores)) {
    if (restored[store.templateKey] === store.publicSlice) continue;
    if (restored === nextState) restored = { ...nextState };
    restored[store.templateKey] = store.publicSlice;
  }

  return restored;
};
