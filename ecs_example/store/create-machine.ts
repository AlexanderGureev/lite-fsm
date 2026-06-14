import type {
  TypedCreateConfigFn,
  TypedCreateEffectFn,
  TypedCreateMachineFn,
  TypedCreateReducerFn,
} from "@lite-fsm/core";
import {
  createConfig as createLiteFsmConfig,
  createEffect as createLiteFsmEffect,
  createMachine as createLiteFsmMachine,
  createReducer as createLiteFsmReducer,
} from "@lite-fsm/core";
import type { EntitiesPlugin } from "@lite-fsm/entities";

import type { AppEvents } from "./types";
import type { MachineDeps } from "./deps";

export const createMachine: TypedCreateMachineFn<AppEvents, MachineDeps, EntitiesPlugin<MachineDeps>> = createLiteFsmMachine;
export const createConfig: TypedCreateConfigFn<AppEvents> = createLiteFsmConfig;
export const createReducer: TypedCreateReducerFn<AppEvents> = createLiteFsmReducer;
export const createEffect: TypedCreateEffectFn<AppEvents, MachineDeps> = createLiteFsmEffect;
