import type { MachineStore } from "@lite-fsm/core";

import type { EntityIndex } from "../plugin";
import type { EntityAccess } from "./access";
import type { EntityTemplateMetadata } from "./compile";
import type { EntityReactRuntime } from "./react";

export type EntityPublicStateSlice = {
  readonly storage: "entity";
  readonly version: number;
  readonly count: number;
  readonly capacity: number;
};

export type EntityColumn = Float32Array | Int16Array | Int32Array | Uint8Array | string[];

export type EntityStore = {
  count: number;
  capacity: number;
  ids: string[];
  indexById: Record<string, EntityIndex>;
  alive: Uint8Array;
  generation: Uint32Array;
  groupTagByIndex: string[];
  entitiesByGroupTag: Record<string, EntityIndex[]>;
  groupTagPosition: Int32Array;
  freeList: EntityIndex[];
  version: number;
};

export type EntityActorRowRef = {
  readonly store: ColumnarActorStore;
  readonly entity: EntityIndex;
  readonly groupTag: string;
  entityRowsPosition: number;
  groupRowsPosition: number;
};

export type ColumnarActorStore = {
  readonly templateKey: string;
  readonly metadata: EntityTemplateMetadata;
  capacity: number;
  count: number;
  version: number;
  presence: Uint8Array;
  stateCode: Int16Array;
  prevStateCode: Int16Array;
  rowVersion: Uint32Array;
  stateBuckets: EntityIndex[][];
  statePosition: Int32Array;
  acceptedScratch: EntityIndex[];
  pendingPrevStateCodeSync: EntityIndex[];
  pendingPrevStateCodeSyncMark: Uint32Array;
  pendingPrevStateCodeSyncToken: number;
  routingScratchVersion: number;
  acceptStateBucketsByEventCode: EntityIndex[][][];
  columns: Record<string, EntityColumn>;
  resources: Record<string, unknown>;
  resourceViews: Record<string, unknown>;
  reducerSelf: EntityReducerSelfCache;
  publicSlice: EntityPublicStateSlice;
};

export type EntityReducerSelfCache = Record<string, unknown> & {
  indices: readonly EntityIndex[];
  readonly states: EntityTemplateMetadata["stateCodeByName"];
  presence: Uint8Array;
  stateCode: Int16Array;
  prevStateCode: Int16Array;
  rowVersion: Uint32Array;
  has(entity: EntityIndex): boolean;
  entityId(entity: EntityIndex): string;
};

export type EntityRuntimeState = {
  readonly entityStore: EntityStore;
  readonly actorStores: Record<string, ColumnarActorStore>;
  readonly eventCodeByType: Readonly<Record<string, number>>;
  readonly eventTypesByCode: readonly string[];
  readonly templatesByEventCode: readonly (readonly ColumnarActorStore[])[];
  actorRowsByEntity: EntityActorRowRef[][];
  actorRowsByGroupTag: Record<string, EntityActorRowRef[]>;
  routingScratchVersion: number;
  readonly access: EntityAccess<MachineStore>;
  react?: EntityReactRuntime;
};
