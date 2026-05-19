import React from "react";

export type FSMPersistStatusSource = {
  getStatus(): unknown;
  subscribeStatus(listener: () => void): () => void;
};

export type FSMPersistLifecycle = {
  start(): () => void;
};

const PERSIST_CONTEXT_KEY = Symbol.for("@lite-fsm/react.persistContext");
const IDLE_PERSIST_STATUS = { phase: "idle" } as const;
const SERVER_IDLE_STATUS_SOURCE: FSMPersistStatusSource = {
  getStatus: () => IDLE_PERSIST_STATUS,
  subscribeStatus: () => () => {},
};

const persistContextStore = globalThis as typeof globalThis & {
  [key: symbol]: React.Context<FSMPersistStatusSource | null> | undefined;
};

// Shared through a global symbol so @lite-fsm/persist/react can consume the
// provider context without making @lite-fsm/react import @lite-fsm/persist.
export const FSMPersistContext =
  persistContextStore[PERSIST_CONTEXT_KEY] ??
  (persistContextStore[PERSIST_CONTEXT_KEY] = React.createContext<FSMPersistStatusSource | null>(null));

const isPersistStatusSource = (value: FSMPersistLifecycle): value is FSMPersistLifecycle & FSMPersistStatusSource => {
  const candidate = value as Partial<FSMPersistStatusSource>;
  return (
    value !== null &&
    typeof value === "object" &&
    typeof candidate.getStatus === "function" &&
    typeof candidate.subscribeStatus === "function"
  );
};

export const resolvePersistStatusSource = (
  persist: FSMPersistLifecycle | ReadonlyArray<FSMPersistLifecycle> | undefined,
  options?: { serverFallback?: boolean },
) => {
  if (persist === undefined) return options?.serverFallback === true ? SERVER_IDLE_STATUS_SOURCE : null;

  const persistItems = Array.isArray(persist) ? persist : [persist];
  let statusSource: FSMPersistStatusSource | null = null;

  for (const item of persistItems) {
    if (!isPersistStatusSource(item)) continue;
    if (statusSource) return null;
    statusSource = item;
  }

  return statusSource;
};
