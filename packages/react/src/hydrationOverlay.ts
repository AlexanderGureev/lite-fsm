import React from "react";

import type { MachinesState, MachineStore } from "@lite-fsm/core";

export type HydrationOverlay<S extends MachineStore> = {
  getState: () => MachinesState<S>;
  getStoragePreview: (storageKind: string) => StorageHydrationPreviewSlot;
};

type StorageHydrationPreviewSlot = {
  readonly hasPreview: boolean;
  readonly preview: unknown | undefined;
};

export type FSMStorageHydrationPreview = {
  readonly hasPreview: boolean;
  readonly preview: unknown | undefined;
  readonly hasServerPreview: boolean;
  readonly serverPreview: unknown | undefined;
};

type ErasedHydrationOverlay = {
  getState: () => unknown;
  getStoragePreview: (storageKind: string) => StorageHydrationPreviewSlot;
};

export const NO_STORAGE_HYDRATION_PREVIEW: StorageHydrationPreviewSlot = Object.freeze({
  hasPreview: false,
  preview: undefined,
});

const FSMHydrationOverlayContext = React.createContext<ErasedHydrationOverlay | null>(null);

export const FSMHydrationOverlayProvider = FSMHydrationOverlayContext.Provider;

export const useHydrationOverlay = <S extends MachineStore>() =>
  React.useContext(FSMHydrationOverlayContext) as HydrationOverlay<S> | null;

const FSMServerSnapshotContext = React.createContext<ErasedHydrationOverlay | null>(null);

export const FSMServerSnapshotProvider = FSMServerSnapshotContext.Provider;

export const useServerSnapshot = <S extends MachineStore>() =>
  React.useContext(FSMServerSnapshotContext) as HydrationOverlay<S> | null;

export const readSnapshotStoragePreview = (
  snapshot: { readonly storage?: Readonly<Record<string, unknown>> },
  parent: ((storageKind: string) => StorageHydrationPreviewSlot) | undefined,
  storageKind: string,
): StorageHydrationPreviewSlot => {
  const storage = snapshot.storage;
  if (storage && Object.prototype.hasOwnProperty.call(storage, storageKind)) {
    return { hasPreview: true, preview: storage[storageKind] };
  }

  if (parent) return parent(storageKind);
  return NO_STORAGE_HYDRATION_PREVIEW;
};

export function useStorageHydrationPreview(storageKind: string): FSMStorageHydrationPreview {
  const overlay = React.useContext(FSMHydrationOverlayContext);
  const serverSnapshot = React.useContext(FSMServerSnapshotContext);
  const preview = overlay?.getStoragePreview(storageKind) ?? NO_STORAGE_HYDRATION_PREVIEW;
  const serverPreview = serverSnapshot?.getStoragePreview(storageKind) ?? NO_STORAGE_HYDRATION_PREVIEW;

  return {
    hasPreview: preview.hasPreview,
    preview: preview.preview,
    hasServerPreview: serverPreview.hasPreview,
    serverPreview: serverPreview.preview,
  };
}
