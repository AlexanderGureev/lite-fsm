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

import type { AppDeps } from "./deps";
import type { AppEvents } from "./types";

export const createMachine: TypedCreateMachineFn<AppEvents, AppDeps, EntitiesPlugin<AppDeps>> = createLiteFsmMachine;
export const createConfig: TypedCreateConfigFn<AppEvents> = createLiteFsmConfig;
export const createReducer: TypedCreateReducerFn<AppEvents> = createLiteFsmReducer;
export const createEffect: TypedCreateEffectFn<AppEvents, AppDeps> = createLiteFsmEffect;
