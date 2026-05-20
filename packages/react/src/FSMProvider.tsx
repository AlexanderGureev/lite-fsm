import React from "react";

import type { AnyEvent, IMachineManager, MachinesState, MachineStore } from "@lite-fsm/core";

import { FSMContext } from "./FSMContext";
import { FSMServerSnapshotProvider } from "./hydrationOverlay";
import {
  arePersistLifecycleSequencesEqual,
  EMPTY_PERSIST_ENTRIES,
  FSMPersistStatusesContext,
  resolvePersistStatusSources,
} from "./persistContext";
import type { FSMPersistLifecycle } from "./persistContext";

export type { FSMPersistLifecycle } from "./persistContext";

export type FSMContextProviderProps<S extends MachineStore, P extends AnyEvent = AnyEvent> = React.PropsWithChildren<{
  machineManager: IMachineManager<S, P>;
  getServerSnapshot?: () => MachinesState<S>;
  persist?: readonly FSMPersistLifecycle[];
}>;

type PersistEntriesCache = {
  snapshot: readonly FSMPersistLifecycle[];
};

const createPersistEntriesCache = (): PersistEntriesCache => ({
  snapshot: EMPTY_PERSIST_ENTRIES,
});

const normalizePersistEntries = (persist: readonly FSMPersistLifecycle[] | undefined) =>
  persist === undefined || persist.length === 0 ? EMPTY_PERSIST_ENTRIES : persist;

const readStablePersistEntries = (
  cache: PersistEntriesCache,
  persist: readonly FSMPersistLifecycle[] | undefined,
) => {
  const nextEntries = normalizePersistEntries(persist);
  if (arePersistLifecycleSequencesEqual(cache.snapshot, nextEntries)) return cache.snapshot;

  cache.snapshot = nextEntries.length === 0 ? EMPTY_PERSIST_ENTRIES : [...nextEntries];
  return cache.snapshot;
};

const usePersistEntries = (persist: readonly FSMPersistLifecycle[] | undefined) => {
  const cache = React.useMemo(() => createPersistEntriesCache(), []);
  return readStablePersistEntries(cache, persist);
};

export const FSMContextProvider = <S extends MachineStore, P extends AnyEvent = AnyEvent>({
  children,
  getServerSnapshot,
  machineManager,
  persist,
}: FSMContextProviderProps<S, P>) => {
  const value = React.useMemo(() => machineManager, [machineManager]);
  const initialSnapshot = React.useMemo(() => machineManager.getState(), [machineManager]);
  const serverSnapshot = React.useMemo(
    () => ({
      getState: getServerSnapshot ?? (() => initialSnapshot),
    }),
    [getServerSnapshot, initialSnapshot],
  );
  const persistEntries = usePersistEntries(persist);
  const persistStatusSources = React.useMemo(() => resolvePersistStatusSources(persistEntries), [persistEntries]);

  React.useEffect(() => {
    if (persistEntries.length === 0) return;
    const stops = persistEntries.map((item) => item.start());
    return () => {
      for (const stop of stops) stop();
    };
  }, [persistEntries]);

  return (
    <FSMContext.Provider value={value}>
      <FSMPersistStatusesContext.Provider value={persistStatusSources}>
        <FSMServerSnapshotProvider value={serverSnapshot}>{children}</FSMServerSnapshotProvider>
      </FSMPersistStatusesContext.Provider>
    </FSMContext.Provider>
  );
};
