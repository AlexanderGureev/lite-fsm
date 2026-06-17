import type { EntityIndex } from "../plugin";
import { rebindEntityStoreView } from "./access";
import {
  clearPendingPrevStateCodeSync,
  rebuildEntityRuntimeIndexes,
  rebindActorReducerSelf,
  restorePublicSlices,
  schedulePresentPrevStateCodeSync,
  type ColumnarActorStore,
  type EntityRuntimeState,
  type EntityStore,
} from "./state";
import { importEntitySnapshot } from "./snapshot-import";
import type {
  EntitySnapshot,
  ImportedActorStore,
  ImportedEntityStore,
  ImportedRuntime,
} from "./snapshot-types";

export { dehydrateEntityRuntime } from "./snapshot-export";
export { importEntitySnapshotPreview } from "./snapshot-import";
export type {
  EntityActorSnapshot,
  EntitySnapshot,
  EntityStoreSnapshot,
  ImportedActorStore,
  ImportedEntityStore,
  ImportedRuntime,
} from "./snapshot-types";

type EntityHydrateContext = {
  readonly machines: Readonly<Record<string, unknown>>;
  readonly snapshot: EntitySnapshot | undefined;
  readonly baseState: Record<string, unknown>;
  readonly mode: "preview" | "commit" | "init";
};

const buildPublicSlices = (
  actorStores: Record<string, Pick<ImportedActorStore, "capacity" | "count" | "version">>,
  baseState: Record<string, unknown>,
): Record<string, unknown> => {
  let nextState = baseState;
  for (const [key, store] of Object.entries(actorStores)) {
    const slice = {
      storage: "entity",
      version: store.version,
      count: store.count,
      capacity: store.capacity,
    };
    if (nextState === baseState) nextState = { ...baseState };
    nextState[key] = slice;
  }
  return nextState;
};

const applyEntityStore = (target: EntityStore, source: ImportedEntityStore): void => {
  target.count = source.count;
  target.capacity = source.capacity;
  target.ids = source.ids;
  target.indexById = Object.create(null) as Record<string, EntityIndex>;
  target.alive = source.alive;
  target.generation = source.generation;
  target.groupTagByIndex = source.groupTagByIndex;
  target.entitiesByGroupTag = Object.create(null) as Record<string, EntityIndex[]>;
  target.groupTagPosition = new Int32Array(source.capacity);
  target.groupTagPosition.fill(-1);
  target.freeList = source.freeList;
  target.version = source.version;
};

const applyActorStore = (target: ColumnarActorStore, source: ImportedActorStore): void => {
  target.capacity = source.capacity;
  target.count = source.count;
  target.version = source.version;
  target.presence = source.presence;
  target.stateCode = source.stateCode;
  target.prevStateCode = source.prevStateCode;
  target.rowVersion = source.rowVersion;
  target.pendingPrevStateCodeSync = [];
  target.pendingPrevStateCodeSyncMark = new Uint32Array(source.capacity);
  target.pendingPrevStateCodeSyncToken = 1;
  clearPendingPrevStateCodeSync(target);
  schedulePresentPrevStateCodeSync(target);
  target.columns = source.columns;
  rebindActorReducerSelf(target);
  rebindEntityStoreView(target);
};

const applyImportedRuntime = (runtime: EntityRuntimeState, imported: ImportedRuntime): void => {
  applyEntityStore(runtime.entityStore, imported.entityStore);
  for (const [key, store] of Object.entries(imported.actorStores)) {
    applyActorStore(runtime.actorStores[key], store);
  }
  rebuildEntityRuntimeIndexes(runtime);
};

export const hydrateEntityRuntime = (
  runtime: EntityRuntimeState,
  ctx: EntityHydrateContext,
): { readonly nextState: Record<string, unknown>; readonly changed: boolean } => {
  if (ctx.snapshot === undefined) {
    const nextState = restorePublicSlices(runtime, ctx.baseState);
    return { nextState, changed: nextState !== ctx.baseState };
  }

  const imported = importEntitySnapshot(runtime, ctx.snapshot);
  const nextState =
    ctx.mode === "preview"
      ? buildPublicSlices(imported.actorStores, ctx.baseState)
      : (() => {
          applyImportedRuntime(runtime, imported);
          return restorePublicSlices(runtime, ctx.baseState);
        })();

  return { nextState, changed: ctx.mode !== "preview" || nextState !== ctx.baseState };
};
