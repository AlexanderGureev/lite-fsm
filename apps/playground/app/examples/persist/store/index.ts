import { MachineManager } from "@lite-fsm/core";
import type { MachinesState } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";
import { createJsonStorage, persistManager } from "@lite-fsm/persist";
import type { PersistController, PersistStorage } from "@lite-fsm/persist";

import { chatComposer } from "./machines/chatComposer";
import { chatSession } from "./machines/chatSession";
import { chatThread } from "./machines/chatThread";
import type { AppEvents, ChatPeer } from "./types";

export const PERSIST_STORAGE_KEY = "lite-fsm:playground:persist-chat:v1";
export const PERSIST_STORAGE_VERSION = 1;
export const PERSIST_THROTTLE_MS = 250;

const machines = { chatThread, chatComposer, chatSession };

export type FSMConfigType = typeof machines;
export type AppState = MachinesState<FSMConfigType>;

const peerNames = ["Alice", "Bob", "Carol", "Dina", "Evan", "Mira"] as const;
const peerColors = ["#0061d3", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#334155"] as const;

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createPeer = (): ChatPeer => {
  const id = createId();
  const index = Math.floor(Math.random() * peerNames.length);
  const name = peerNames[index];

  return {
    id,
    name,
    shortName: name.slice(0, 1),
    color: peerColors[index],
  };
};

const createLocalStorageAdapter = (): PersistStorage<FSMConfigType> => {
  const jsonStorage = createJsonStorage<FSMConfigType>({
    key: PERSIST_STORAGE_KEY,
    storage: () => window.localStorage,
  });

  return {
    ...jsonStorage,
    subscribe: (cb) => {
      const handleStorage = (event: StorageEvent) => {
        if (event.storageArea !== window.localStorage) return;
        if (event.key !== PERSIST_STORAGE_KEY && event.key !== null) return;
        cb();
      };

      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    },
  };
};

export const makeStore = () =>
  MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware],
    schemaVersion: 1,
  });

export type AppStore = ReturnType<typeof makeStore>;

export type PersistChatRuntime = {
  manager: AppStore;
  persist: PersistController;
};

export const makePersistChatRuntime = (): PersistChatRuntime => {
  const manager = makeStore();

  const persist = persistManager(manager, {
    storage: createLocalStorageAdapter(),
    storageVersion: PERSIST_STORAGE_VERSION,
    machines: ["chatThread"],
    throttleMs: PERSIST_THROTTLE_MS,
    shouldSave: ({ action }) => action.type === "MESSAGE_SENT" || action.type === "HISTORY_CLEARED",
    onError: console.error,
  });

  return {
    manager,
    persist,
  };
};

export { useManager, useSelector, useTransition } from "./hooks";
export type { AppEvents, ChatMessage, ChatPeer, ChatThreadContext } from "./types";
