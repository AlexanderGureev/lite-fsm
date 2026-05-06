import type { TypedUseManagerHook, TypedUseSelectorHook, TypedUseTransitionHook } from "lite-fsm/react";
import {
  useManager as baseUseManager,
  useSelector as baseUseSelector,
  useTransition as baseUseTransition,
} from "lite-fsm/react";

import type { FSMConfigType } from ".";
import type { AppEvents } from "./types";

export const useTransition: TypedUseTransitionHook<AppEvents> = baseUseTransition;
export const useSelector: TypedUseSelectorHook<FSMConfigType> = baseUseSelector;
export const useManager: TypedUseManagerHook<FSMConfigType, AppEvents> = baseUseManager;
