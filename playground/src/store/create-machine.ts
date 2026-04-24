import type { TypedCreateConfigFn, TypedCreateEffectFn, TypedCreateMachineFn, TypedCreateReducerFn } from "lite-fsm";
import {
  createConfig as baseCreateConfig,
  createEffect as baseCreateEffect,
  createMachine as baseCreateMachine,
  createReducer as baseCreateReducer,
} from "lite-fsm";

import type { AppEvents } from "./types";
import type { AppState } from ".";

type AppDeps = {
  getState: () => AppState;
};

export const createMachine: TypedCreateMachineFn<AppEvents, AppDeps> = baseCreateMachine;
export const createReducer: TypedCreateReducerFn<AppEvents> = baseCreateReducer;
export const createConfig: TypedCreateConfigFn<AppEvents> = baseCreateConfig;
export const createEffect: TypedCreateEffectFn<AppEvents, AppDeps> = baseCreateEffect;
