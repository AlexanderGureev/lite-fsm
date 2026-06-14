"use client";

import React from "react";

import type { MachineStore } from "@lite-fsm/core";
import { useManager, useStorageHydrationPreview } from "@lite-fsm/react";

import type { EntityId } from "../plugin";
import type { EntityActorKey, EntityContextFor, EntityStateFor } from "../runtime/access";
import type { EntityListOptions, EntityRowSnapshot } from "../runtime/react";
import { getEntityRuntimeState } from "../runtime/state";

export type {
  EntityListOptions,
  EntityRowSnapshot,
  TypedUseEntityCountHook,
  TypedUseEntityListHook,
  TypedUseEntitySnapshotHook,
} from "../runtime/react";

type EntityReactManager = {
  readonly entities?: object;
  onTransition(cb: () => void): () => void;
};

const ENTITY_STORAGE_KIND = "entity";
const COMMITTED_ENTITY_READ_MODE = { mode: "commit" } as const;

const subscribeNoop = () => () => {};

const getEntityReactRuntime = (manager: EntityReactManager) => {
  const access = manager.entities;
  if (!access) {
    throw new Error("[lite-fsm/entities/react] hooks require a manager configured with entitiesPlugin().");
  }

  const runtime = getEntityRuntimeState(access);
  if (runtime.react) return runtime.react;

  throw new Error("[lite-fsm/entities/react] entity runtime does not expose React subscription/preview capability.");
};

const createSubscribe = (manager: EntityReactManager) => (listener: () => void) =>
  manager.onTransition(() => listener());

export function useEntitySnapshot<
  AppMachines extends MachineStore = MachineStore,
  Key extends EntityActorKey<AppMachines> = EntityActorKey<AppMachines>,
>(
  templateKey: Key,
  entityId: EntityId | null | undefined,
): EntityRowSnapshot<EntityContextFor<AppMachines, Key>, EntityStateFor<AppMachines, Key>> | undefined;
export function useEntitySnapshot(
  templateKey: string,
  entityId: EntityId | null | undefined,
): EntityRowSnapshot<Record<string, unknown>, string> | undefined;
export function useEntitySnapshot(
  templateKey: string,
  entityId: EntityId | null | undefined,
): EntityRowSnapshot<Record<string, unknown>, string> | undefined {
  const manager = useManager() as EntityReactManager;
  const runtime = getEntityReactRuntime(manager);
  const preview = useStorageHydrationPreview(ENTITY_STORAGE_KIND);
  const subscribe = React.useMemo(
    () => (entityId === null || entityId === undefined ? subscribeNoop : createSubscribe(manager)),
    [entityId, manager],
  );
  const getSnapshot = React.useCallback(
    () =>
      runtime.readRow(
        templateKey,
        entityId,
        preview.hasPreview ? { mode: "preview", snapshot: preview.preview } : COMMITTED_ENTITY_READ_MODE,
      ),
    [entityId, preview.hasPreview, preview.preview, runtime, templateKey],
  );
  const getServerSnapshot = React.useCallback(
    () =>
      runtime.readRow(
        templateKey,
        entityId,
        preview.hasServerPreview
          ? { mode: "preview", snapshot: preview.serverPreview }
          : preview.hasPreview
            ? { mode: "preview", snapshot: preview.preview }
            : COMMITTED_ENTITY_READ_MODE,
      ),
    [
      entityId,
      preview.hasPreview,
      preview.hasServerPreview,
      preview.preview,
      preview.serverPreview,
      runtime,
      templateKey,
    ],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) as
    | EntityRowSnapshot<Record<string, unknown>, string>
    | undefined;
}

export function useEntityCount<
  AppMachines extends MachineStore = MachineStore,
  Key extends EntityActorKey<AppMachines> = EntityActorKey<AppMachines>,
>(templateKey: Key, options?: EntityListOptions): number;
export function useEntityCount(templateKey: string, options?: EntityListOptions): number;
export function useEntityCount(templateKey: string, options?: EntityListOptions): number {
  const manager = useManager() as EntityReactManager;
  const runtime = getEntityReactRuntime(manager);
  const preview = useStorageHydrationPreview(ENTITY_STORAGE_KIND);
  const subscribe = React.useMemo(() => createSubscribe(manager), [manager]);
  const getSnapshot = React.useCallback(
    () =>
      runtime.readCount(
        templateKey,
        options,
        preview.hasPreview ? { mode: "preview", snapshot: preview.preview } : COMMITTED_ENTITY_READ_MODE,
      ),
    [options, preview.hasPreview, preview.preview, runtime, templateKey],
  );
  const getServerSnapshot = React.useCallback(
    () =>
      runtime.readCount(
        templateKey,
        options,
        preview.hasServerPreview
          ? { mode: "preview", snapshot: preview.serverPreview }
          : preview.hasPreview
            ? { mode: "preview", snapshot: preview.preview }
            : COMMITTED_ENTITY_READ_MODE,
      ),
    [options, preview.hasPreview, preview.hasServerPreview, preview.preview, preview.serverPreview, runtime, templateKey],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useEntityList<
  AppMachines extends MachineStore = MachineStore,
  Key extends EntityActorKey<AppMachines> = EntityActorKey<AppMachines>,
>(templateKey: Key, options?: EntityListOptions): readonly EntityId[];
export function useEntityList(templateKey: string, options?: EntityListOptions): readonly EntityId[];
export function useEntityList(templateKey: string, options?: EntityListOptions): readonly EntityId[] {
  const manager = useManager() as EntityReactManager;
  const runtime = getEntityReactRuntime(manager);
  const preview = useStorageHydrationPreview(ENTITY_STORAGE_KIND);
  const subscribe = React.useMemo(() => createSubscribe(manager), [manager]);
  const getSnapshot = React.useCallback(
    () =>
      runtime.readList(
        templateKey,
        options,
        preview.hasPreview ? { mode: "preview", snapshot: preview.preview } : COMMITTED_ENTITY_READ_MODE,
      ),
    [options, preview.hasPreview, preview.preview, runtime, templateKey],
  );
  const getServerSnapshot = React.useCallback(
    () =>
      runtime.readList(
        templateKey,
        options,
        preview.hasServerPreview
          ? { mode: "preview", snapshot: preview.serverPreview }
          : preview.hasPreview
            ? { mode: "preview", snapshot: preview.preview }
            : COMMITTED_ENTITY_READ_MODE,
      ),
    [options, preview.hasPreview, preview.hasServerPreview, preview.preview, preview.serverPreview, runtime, templateKey],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
