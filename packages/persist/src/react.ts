"use client";

import { useSyncExternalStore } from "use-sync-external-store/shim";

import type { PersistController, PersistStatus } from "./index";

export const usePersistStatus = (controller: PersistController): PersistStatus =>
  useSyncExternalStore(controller.subscribeStatus, controller.getStatus, controller.getStatus);

export const useIsPersistRestoring = (controller: PersistController): boolean =>
  usePersistStatus(controller).phase === "restoring";
