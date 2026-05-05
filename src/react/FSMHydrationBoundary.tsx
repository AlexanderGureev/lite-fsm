"use client";

import React from "react";

import type { HydrateStrategy, MachineManagerSnapshot, MachinesState, MachineStore } from "../core/types";

import {
  FSMHydrationOverlayProvider,
  FSMServerSnapshotProvider,
  useHydrationOverlay,
  useServerSnapshot,
} from "./hydrationOverlay";
import { useManager } from "./useManager";
import { useIsomorphicLayoutEffect } from "./utils";

export type FSMHydrationBoundaryProps<S extends MachineStore> = React.PropsWithChildren<{
  snapshot: MachineManagerSnapshot<S>;
  strategy?: HydrateStrategy;
}>;

export const FSMHydrationBoundary = <S extends MachineStore>({
  snapshot,
  strategy,
  children,
}: FSMHydrationBoundaryProps<S>) => {
  const manager = useManager<S>();
  const parentOverlay = useHydrationOverlay<S>();
  const parentServerSnapshot = useServerSnapshot<S>();
  const hydrateStrategy = strategy ?? "merge";
  const committedRef = React.useRef<{
    baseState: MachinesState<S>;
    snapshot: MachineManagerSnapshot<S>;
    strategy: HydrateStrategy;
  } | null>(null);
  const [, forceRender] = React.useReducer((version: number) => version + 1, 0);

  const baseState = parentOverlay?.getState() ?? manager.getState();
  const previewState = React.useMemo(
    () => manager.getHydratedState(snapshot, { baseState, strategy: hydrateStrategy }),
    [baseState, hydrateStrategy, manager, snapshot],
  );
  const hasOverlay = previewState !== baseState;
  const serverBaseState = parentServerSnapshot?.getState() ?? baseState;
  const serverPreviewState = React.useMemo(
    () => manager.getHydratedState(snapshot, { baseState: serverBaseState, strategy: hydrateStrategy }),
    [hydrateStrategy, manager, serverBaseState, snapshot],
  );

  useIsomorphicLayoutEffect(() => {
    if (!hasOverlay) return;
    const committed = committedRef.current;
    /* v8 ignore next 3 -- защита от StrictMode replay с тем же render snapshot. */
    if (committed?.baseState === baseState && committed.snapshot === snapshot && committed.strategy === hydrateStrategy) {
      return;
    }

    manager.hydrate(snapshot, { strategy: hydrateStrategy });
    committedRef.current = { baseState, snapshot, strategy: hydrateStrategy };
    forceRender();
  }, [baseState, hasOverlay, hydrateStrategy, manager, snapshot]);

  const overlay = React.useMemo(() => ({ getState: () => previewState }), [previewState]);
  const serverSnapshotOverlay = React.useMemo(
    () => ({ getState: () => serverPreviewState }),
    [serverPreviewState],
  );

  const content = hasOverlay ? (
    <FSMHydrationOverlayProvider value={overlay}>{children}</FSMHydrationOverlayProvider>
  ) : (
    <>{children}</>
  );

  return <FSMServerSnapshotProvider value={serverSnapshotOverlay}>{content}</FSMServerSnapshotProvider>;
};
