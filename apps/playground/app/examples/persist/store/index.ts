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

const createPeer = (): ChatPeer => {
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

const createLocalStorageAdapter = (storage: Storage): PersistStorage<FSMConfigType> => {
  const jsonStorage = createJsonStorage<FSMConfigType>({
    key: PERSIST_STORAGE_KEY,
    storage,
  });

  return {
    ...jsonStorage,
    subscribe: (cb) => {
      const handleStorage = (event: StorageEvent) => {
        if (event.storageArea !== storage) return;
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
  peer: ChatPeer;
};

export const makePersistChatRuntime = (storage: Storage): PersistChatRuntime => {
  const manager = makeStore();
  const peer = createPeer();

  manager.transition({
    type: "SESSION_STARTED",
    payload: {
      peer,
      openedAt: Date.now(),
    },
  });

  const persist = persistManager(manager, {
    storage: createLocalStorageAdapter(storage),
    storageVersion: PERSIST_STORAGE_VERSION,
    machines: ["chatThread"],
    throttleMs: PERSIST_THROTTLE_MS,
    shouldSave: ({ action }) => action.type === "MESSAGE_SENT" || action.type === "HISTORY_CLEARED",
    onError: console.error,
  });

  return {
    manager,
    persist,
    peer,
  };
};

export { useManager, useSelector, useTransition } from "./hooks";
export type { AppEvents, ChatMessage, ChatPeer, ChatThreadContext } from "./types";
