import React from "react";

export type FSMPersistStatusSource = {
  getStatus(): unknown;
  subscribeStatus(listener: () => void): () => void;
};

export type FSMPersistLifecycle = {
  start(): () => void;
};

export type FSMPersistStatusEntry = FSMPersistStatusSource | null;

const persistContextStore = globalThis as typeof globalThis & {
  [key: symbol]: React.Context<readonly FSMPersistStatusEntry[] | null> | undefined;
};

const PERSIST_STATUSES_CONTEXT_KEY = Symbol.for("@lite-fsm/react.persistStatusesContext");
export const EMPTY_PERSIST_ENTRIES: readonly FSMPersistLifecycle[] = [];
const EMPTY_PERSIST_STATUS_ENTRIES: readonly FSMPersistStatusEntry[] = [];

// Shared through a global symbol so @lite-fsm/persist/react can consume the
// provider context without making @lite-fsm/react import @lite-fsm/persist.
export const FSMPersistStatusesContext =
  persistContextStore[PERSIST_STATUSES_CONTEXT_KEY] ??
  (persistContextStore[PERSIST_STATUSES_CONTEXT_KEY] =
    React.createContext<readonly FSMPersistStatusEntry[] | null>(null));

const isPersistStatusSource = (value: FSMPersistLifecycle): value is FSMPersistLifecycle & FSMPersistStatusSource => {
  const candidate = value as Partial<FSMPersistStatusSource>;
  return (
    value !== null &&
    typeof value === "object" &&
    typeof candidate.getStatus === "function" &&
    typeof candidate.subscribeStatus === "function"
  );
};

export const arePersistLifecycleSequencesEqual = (
  prev: readonly FSMPersistLifecycle[],
  next: readonly FSMPersistLifecycle[],
): boolean => {
  if (prev.length !== next.length) return false;

  for (let index = 0; index < prev.length; index += 1) {
    if (prev[index] !== next[index]) return false;
  }

  return true;
};

export const resolvePersistStatusSources = (
  persist: readonly FSMPersistLifecycle[] | undefined,
): readonly FSMPersistStatusEntry[] => {
  if (persist === undefined || persist.length === 0) return EMPTY_PERSIST_STATUS_ENTRIES;
  return persist.map((item) => (isPersistStatusSource(item) ? item : null));
};
