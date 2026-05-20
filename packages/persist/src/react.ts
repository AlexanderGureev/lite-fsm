"use client";

import React from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";

import type { PersistStatus } from "./index";

type PersistStatusSource = {
  getStatus(): PersistStatus;
  subscribeStatus(listener: () => void): () => void;
};

type PersistStatusEntry = PersistStatusSource | null;
type PersistStatusesSnapshot = readonly (PersistStatus | null)[];

const PERSIST_STATUSES_CONTEXT_KEY = Symbol.for("@lite-fsm/react.persistStatusesContext");
const PERSIST_PROVIDER_ERROR = "Hooks from @lite-fsm/persist/react require FSMContextProvider from @lite-fsm/react.";
const EMPTY_PERSIST_STATUSES: PersistStatusesSnapshot = [];

const persistContextStore = globalThis as typeof globalThis & {
  [key: symbol]: React.Context<readonly PersistStatusEntry[] | null> | undefined;
};

// Reads the same context object that @lite-fsm/react writes, without forcing
// @lite-fsm/persist to depend on @lite-fsm/react for non-React usage.
const PersistStatusesContext =
  persistContextStore[PERSIST_STATUSES_CONTEXT_KEY] ??
  (persistContextStore[PERSIST_STATUSES_CONTEXT_KEY] =
    React.createContext<readonly PersistStatusEntry[] | null>(null));

const readPersistStatuses = (entries: readonly PersistStatusEntry[]): PersistStatusesSnapshot => {
  if (entries.length === 0) return EMPTY_PERSIST_STATUSES;

  const statuses: Array<PersistStatus | null> = [];
  for (const entry of entries) {
    statuses.push(entry === null ? null : entry.getStatus());
  }
  return statuses;
};

const arePersistStatusesEqual = (prev: PersistStatusesSnapshot, next: PersistStatusesSnapshot): boolean => {
  if (prev.length !== next.length) return false;

  for (let index = 0; index < prev.length; index += 1) {
    if (!Object.is(prev[index], next[index])) return false;
  }

  return true;
};

const createPersistStatusesStore = (entries: readonly PersistStatusEntry[]) => {
  let snapshot = readPersistStatuses(entries);

  const refreshSnapshot = () => {
    const nextSnapshot = readPersistStatuses(entries);
    if (arePersistStatusesEqual(snapshot, nextSnapshot)) return false;
    snapshot = nextSnapshot;
    return true;
  };

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      const stops: Array<() => void> = [];

      for (const entry of entries) {
        if (entry === null) continue;
        stops.push(
          entry.subscribeStatus(() => {
            if (refreshSnapshot()) listener();
          }),
        );
      }

      return () => {
        for (const stop of stops) stop();
      };
    },
  };
};

export const usePersistStatuses = (): PersistStatusesSnapshot => {
  const entries = React.useContext(PersistStatusesContext);

  if (entries === null) {
    throw new Error(PERSIST_PROVIDER_ERROR);
  }

  const store = React.useMemo(() => createPersistStatusesStore(entries), [entries]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
};

export const useIsPersistRestoring = (): boolean => {
  const statuses = usePersistStatuses();
  return statuses.some((status) => status?.phase === "restoring");
};
