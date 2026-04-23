import type { TypedCreateConfigFn, TypedCreateEffectFn, TypedCreateMachineFn, TypedCreateReducerFn } from "lite-fsm";
import {
  createConfig as baseCreateConfig,
  createEffect as baseCreateEffect,
  createMachine as baseCreateMachine,
  createReducer as baseCreateReducer,
} from "lite-fsm";

import type { AppEvents } from "./types";

export const createMachine: TypedCreateMachineFn<AppEvents> = baseCreateMachine;
export const createReducer: TypedCreateReducerFn<AppEvents> = baseCreateReducer;
export const createConfig: TypedCreateConfigFn<AppEvents> = baseCreateConfig;
export const createEffect: TypedCreateEffectFn<AppEvents> = baseCreateEffect;
