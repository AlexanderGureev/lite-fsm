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
import { entitiesPlugin } from "@lite-fsm/entities";

import type { AppEvents } from "./types";
import type { MachineDeps } from "./deps";

const entityPlugin = entitiesPlugin();
export const entityPlugins = [entityPlugin] as const;

export const createMachine: TypedCreateMachineFn<AppEvents, MachineDeps, typeof entityPlugins> = createLiteFsmMachine;
export const createConfig: TypedCreateConfigFn<AppEvents> = createLiteFsmConfig;
export const createReducer: TypedCreateReducerFn<AppEvents> = createLiteFsmReducer;
export const createEffect: TypedCreateEffectFn<AppEvents, MachineDeps> = createLiteFsmEffect;
