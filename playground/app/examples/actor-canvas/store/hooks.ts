import type { TypedUseSelectorHook, TypedUseTransitionHook } from "lite-fsm/react";
import { useSelector as baseUseSelector, useTransition as baseUseTransition } from "lite-fsm/react";

import type { FSMConfigType } from ".";
import type { AppEvents } from "./types";

export const useTransition: TypedUseTransitionHook<AppEvents> = baseUseTransition;
export const useSelector: TypedUseSelectorHook<FSMConfigType> = baseUseSelector;
