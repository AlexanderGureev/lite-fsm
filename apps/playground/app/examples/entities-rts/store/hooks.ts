import type { TypedUseManagerHook, TypedUseSelectorHook, TypedUseTransitionHook } from "@lite-fsm/react";
import {
  useManager as useLiteFsmManager,
  useSelector as useLiteFsmSelector,
  useTransition as useLiteFsmTransition,
} from "@lite-fsm/react";

import type { AppMachines } from ".";
import type { AppEvents } from "./types";

export const useManager: TypedUseManagerHook<AppMachines, AppEvents> = useLiteFsmManager;
export const useSelector: TypedUseSelectorHook<AppMachines> = useLiteFsmSelector;
export const useTransition: TypedUseTransitionHook<AppEvents> = useLiteFsmTransition;
