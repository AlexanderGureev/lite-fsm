"use client";

import React from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";

import type { PersistController, PersistStatus } from "./index";

type PersistStatusSource = {
  getStatus(): PersistStatus;
  subscribeStatus(listener: () => void): () => void;
};

const PERSIST_CONTEXT_KEY = Symbol.for("@lite-fsm/react.persistContext");
const PERSIST_PROVIDER_ERROR =
  "Hooks from @lite-fsm/persist/react require a PersistController argument or FSMContextProvider persist context.";

const persistContextStore = globalThis as typeof globalThis & {
  [key: symbol]: React.Context<PersistStatusSource | null> | undefined;
};

// Reads the same context object that @lite-fsm/react writes, without forcing
// @lite-fsm/persist to depend on @lite-fsm/react for non-React usage.
const PersistContext =
  persistContextStore[PERSIST_CONTEXT_KEY] ??
  (persistContextStore[PERSIST_CONTEXT_KEY] = React.createContext<PersistStatusSource | null>(null));

const usePersistStatusSource = (controller?: PersistController): PersistStatusSource => {
  const contextController = React.useContext(PersistContext);
  const source = controller ?? contextController;

  if (!source) {
    throw new Error(PERSIST_PROVIDER_ERROR);
  }

  return source;
};

export const usePersistStatus = (controller?: PersistController): PersistStatus => {
  const source = usePersistStatusSource(controller);
  return useSyncExternalStore(source.subscribeStatus, source.getStatus, source.getStatus);
};

export const useIsPersistRestoring = (controller?: PersistController): boolean =>
  usePersistStatus(controller).phase === "restoring";
