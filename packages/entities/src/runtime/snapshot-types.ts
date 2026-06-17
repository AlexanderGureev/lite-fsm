import type { EntityIndex } from "../plugin";
import type { EntityColumn } from "./state";

export type EntityColumnKind = "f32" | "i16" | "i32" | "u8" | "string";

export type EntityStoreSnapshot = {
  readonly count: number;
  readonly capacity: number;
  readonly ids: readonly string[];
  readonly alive: readonly number[];
  readonly generation?: readonly number[];
  readonly groupTagByIndex: readonly string[];
  readonly freeList?: readonly number[];
  readonly version: number;
};

export type EntityActorSnapshot = {
  readonly schema: {
    readonly states: readonly string[];
    readonly columns: Readonly<Record<string, EntityColumnKind>>;
  };
  readonly count: number;
  readonly capacity: number;
  readonly version: number;
  readonly presence: readonly number[];
  readonly stateCode: readonly number[];
  readonly prevStateCode: readonly number[];
  readonly rowVersion?: readonly number[];
  readonly columns: Readonly<Record<string, readonly unknown[]>>;
};

export type EntitySnapshot = {
  readonly formatVersion: 1;
  readonly entityStore: EntityStoreSnapshot;
  readonly actors: Readonly<Record<string, EntityActorSnapshot>>;
};

export type ImportedEntityStore = {
  readonly count: number;
  readonly capacity: number;
  readonly ids: string[];
  readonly alive: Uint8Array;
  readonly generation: Uint32Array;
  readonly groupTagByIndex: string[];
  readonly freeList: EntityIndex[];
  readonly version: number;
};

export type ImportedActorStore = {
  readonly capacity: number;
  readonly count: number;
  readonly version: number;
  readonly presence: Uint8Array;
  readonly stateCode: Int16Array;
  readonly prevStateCode: Int16Array;
  readonly rowVersion: Uint32Array;
  readonly columns: Record<string, EntityColumn>;
};

export type ImportedRuntime = {
  readonly entityStore: ImportedEntityStore;
  readonly actorStores: Record<string, ImportedActorStore>;
};
