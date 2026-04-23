import type { TypedUseMachineHook, TypedUseSelectorHook, TypedUseTransitionHook } from "lite-fsm/react";
import {
  useManager as baseUseManager,
  useSelector as baseUseSelector,
  useTransition as baseUseTransition,
} from "lite-fsm/react";

import type { AppState, FSMConfigType } from ".";
import type { AppEvents } from "./types";

export const useTransition: TypedUseTransitionHook<AppEvents> = baseUseTransition;
export const useSelector: TypedUseSelectorHook<AppState> = baseUseSelector;
export const useManager: TypedUseMachineHook<FSMConfigType, AppEvents> = baseUseManager;
