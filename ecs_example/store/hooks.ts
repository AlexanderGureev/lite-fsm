import type { TypedUseManagerHook, TypedUseSelectorHook, TypedUseTransitionHook } from "@lite-fsm/react";
import {
  useManager as useLiteFsmManager,
  useSelector as useLiteFsmSelector,
  useTransition as useLiteFsmTransition,
} from "@lite-fsm/react";
import type {
  TypedUseEntityCountHook,
  TypedUseEntityListHook,
  TypedUseEntitySnapshotHook,
} from "@lite-fsm/entities/react";
import {
  useEntityCount as useLiteFsmEntityCount,
  useEntityList as useLiteFsmEntityList,
  useEntitySnapshot as useLiteFsmEntitySnapshot,
} from "@lite-fsm/entities/react";

import type { AppMachines, AppState } from ".";
import type { AppEvents } from "./types";

export const useGameManager: TypedUseManagerHook<AppMachines, AppEvents> = useLiteFsmManager;
export const useGameSelector: TypedUseSelectorHook<AppMachines> = useLiteFsmSelector;
export const useGameTransition: TypedUseTransitionHook<AppEvents> = useLiteFsmTransition;

export const useGameEntitySnapshot: TypedUseEntitySnapshotHook<AppState> = useLiteFsmEntitySnapshot;
export const useGameEntityCount: TypedUseEntityCountHook<AppState> = useLiteFsmEntityCount;
export const useGameEntityList: TypedUseEntityListHook<AppState> = useLiteFsmEntityList;
