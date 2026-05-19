"use client";

import React from "react";

import type {
  AnyEvent,
  HydrateStrategy,
  MachineEvents,
  MachineManagerSnapshot,
  MachinesState,
  MachineStore,
  ManagerAction,
} from "@lite-fsm/core";

import {
  FSMHydrationOverlayProvider,
  FSMServerSnapshotProvider,
  useHydrationOverlay,
  useServerSnapshot,
} from "./hydrationOverlay";
import { useManager } from "./useManager";
import { useIsomorphicLayoutEffect } from "./utils";

type TransitionAfterHydrate<P extends AnyEvent> = ManagerAction<P> | ReadonlyArray<ManagerAction<P>>;

type CompletedDispatch<P extends AnyEvent> = {
  snapshot: unknown;
  strategy: HydrateStrategy;
  actions: ReadonlyArray<ManagerAction<P>>;
};

type CommittedHydration<S extends MachineStore> = {
  baseState: MachinesState<S>;
  committedState: MachinesState<S>;
  snapshot: MachineManagerSnapshot<S>;
  strategy: HydrateStrategy;
};

const matchesCompletedDispatch = <P extends AnyEvent>(
  completed: CompletedDispatch<P> | null,
  snapshot: unknown,
  strategy: HydrateStrategy,
  actions: ReadonlyArray<ManagerAction<P>> | null,
) =>
  actions !== null &&
  completed !== null &&
  completed.snapshot === snapshot &&
  completed.strategy === strategy &&
  completed.actions === actions;

export type FSMHydrationBoundaryProps<
  S extends MachineStore,
  P extends AnyEvent = MachineEvents<S>,
> = React.PropsWithChildren<{
  snapshot: MachineManagerSnapshot<S>;
  strategy?: HydrateStrategy;
  transitionAfterHydrate?: TransitionAfterHydrate<P>;
}>;

export const FSMHydrationBoundary = <S extends MachineStore, P extends AnyEvent = MachineEvents<S>>({
  snapshot,
  strategy,
  transitionAfterHydrate,
  children,
}: FSMHydrationBoundaryProps<S, P>) => {
  const manager = useManager<S, P>();
  const parentOverlay = useHydrationOverlay<S>();
  const parentServerSnapshot = useServerSnapshot<S>();
  const hydrateStrategy = strategy ?? "merge";
  const committedRef = React.useRef<CommittedHydration<S> | null>(null);

  // State управляет render overlay; refs гасят StrictMode replay до commit state.
  const [committedHydration, setCommittedHydration] = React.useState<CommittedHydration<S> | null>(null);
  const completedDispatchRef = React.useRef<CompletedDispatch<P> | null>(null);
  const [completedDispatch, setCompletedDispatch] = React.useState<CompletedDispatch<P> | null>(null);

  const transitionActions = React.useMemo<ReadonlyArray<ManagerAction<P>> | null>(() => {
    if (!transitionAfterHydrate) return null;
    const actions = Array.isArray(transitionAfterHydrate) ? transitionAfterHydrate : [transitionAfterHydrate];
    return actions.length > 0 ? actions : null;
  }, [transitionAfterHydrate]);

  const baseState = parentOverlay?.getState() ?? manager.getState();
  const previewState = React.useMemo(
    () => manager.getHydratedState(snapshot, { baseState, strategy: hydrateStrategy }),
    [baseState, hydrateStrategy, manager, snapshot],
  );

  const dispatchCompleted = matchesCompletedDispatch(completedDispatch, snapshot, hydrateStrategy, transitionActions);
  const hydrationCommitted =
    committedHydration !== null &&
    committedHydration.committedState === baseState &&
    committedHydration.snapshot === snapshot &&
    committedHydration.strategy === hydrateStrategy;
  const hasOverlay = previewState !== baseState && !dispatchCompleted && !hydrationCommitted;

  const serverBaseState = parentServerSnapshot?.getState() ?? baseState;
  const serverPreviewState = React.useMemo(
    () => manager.getHydratedState(snapshot, { baseState: serverBaseState, strategy: hydrateStrategy }),
    [hydrateStrategy, manager, serverBaseState, snapshot],
  );

  useIsomorphicLayoutEffect(() => {
    const alreadyDispatched = matchesCompletedDispatch(
      completedDispatchRef.current,
      snapshot,
      hydrateStrategy,
      transitionActions,
    );
    const shouldDispatch = transitionActions !== null && !alreadyDispatched;
    const shouldHydrate = hasOverlay && !alreadyDispatched;

    if (!shouldHydrate && !shouldDispatch) return;

    const committed = committedRef.current;
    /* v8 ignore next 3 -- защита от StrictMode replay с тем же render snapshot. */
    if (
      shouldHydrate &&
      !(committed?.baseState === baseState && committed.snapshot === snapshot && committed.strategy === hydrateStrategy)
    ) {
      manager.hydrate(snapshot, { strategy: hydrateStrategy });
      const nextCommitted: CommittedHydration<S> = {
        baseState,
        committedState: manager.getState(),
        snapshot,
        strategy: hydrateStrategy,
      };
      committedRef.current = nextCommitted;
      setCommittedHydration(nextCommitted);
    }

    if (shouldDispatch && transitionActions !== null) {
      for (const action of transitionActions) manager.transition(action);
      const completed: CompletedDispatch<P> = { snapshot, strategy: hydrateStrategy, actions: transitionActions };
      completedDispatchRef.current = completed;
      setCompletedDispatch(completed);
    }
  }, [baseState, hasOverlay, hydrateStrategy, manager, snapshot, transitionActions]);

  const overlay = React.useMemo(() => ({ getState: () => previewState }), [previewState]);
  const serverSnapshotOverlay = React.useMemo(() => ({ getState: () => serverPreviewState }), [serverPreviewState]);

  const inner = hasOverlay ? (
    <FSMHydrationOverlayProvider value={overlay}>{children}</FSMHydrationOverlayProvider>
  ) : (
    children
  );

  return <FSMServerSnapshotProvider value={serverSnapshotOverlay}>{inner}</FSMServerSnapshotProvider>;
};
