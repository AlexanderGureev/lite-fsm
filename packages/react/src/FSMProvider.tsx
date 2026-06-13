import React from "react";

import type { AnyEvent, IMachineManager, MachinesState, MachineStore } from "@lite-fsm/core";

import { FSMContext } from "./FSMContext";
import { FSMServerSnapshotProvider, NO_STORAGE_HYDRATION_PREVIEW } from "./hydrationOverlay";
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

const normalizePersistEntries = (persist: readonly FSMPersistLifecycle[] | undefined) =>
  persist === undefined || persist.length === 0 ? EMPTY_PERSIST_ENTRIES : persist;

// Стабильная ссылка по contents-equality: тот же sequence — та же ref между рендерами.
// Derived state pattern: новый sequence триггерит немедленный re-render с обновлённым stable.
const usePersistEntries = (persist: readonly FSMPersistLifecycle[] | undefined) => {
  const [stable, setStable] = React.useState<readonly FSMPersistLifecycle[]>(EMPTY_PERSIST_ENTRIES);
  const next = normalizePersistEntries(persist);
  if (!arePersistLifecycleSequencesEqual(stable, next)) {
    setStable(next.length === 0 ? EMPTY_PERSIST_ENTRIES : [...next]);
  }
  return stable;
};

export const FSMContextProvider = <S extends MachineStore, P extends AnyEvent = AnyEvent>({
  children,
  getServerSnapshot,
  machineManager,
  persist,
}: FSMContextProviderProps<S, P>) => {
  const serverSnapshot = React.useMemo(() => {
    const getStoragePreview = () => NO_STORAGE_HYDRATION_PREVIEW;
    if (getServerSnapshot) return { getState: getServerSnapshot, getStoragePreview };
    const snapshot = machineManager.getState();
    return { getState: () => snapshot, getStoragePreview };
  }, [getServerSnapshot, machineManager]);
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
    <FSMContext.Provider value={machineManager}>
      <FSMPersistStatusesContext.Provider value={persistStatusSources}>
        <FSMServerSnapshotProvider value={serverSnapshot}>{children}</FSMServerSnapshotProvider>
      </FSMPersistStatusesContext.Provider>
    </FSMContext.Provider>
  );
};
