// @ts-nocheck

import type {
  TypedCreateConfigFn,
  TypedCreateEffectFn,
  TypedCreateMachineFn,
  TypedCreateReducerFn,
} from "lite-fsm";
import {
  createConfig as _createConfig,
  createEffect as _createEffect,
  createMachine as _createMachine,
  createReducer as _createReducer,
} from "lite-fsm";

import type { AppEvents, Dependencies } from "./types";

export const createMachine: TypedCreateMachineFn<AppEvents, Dependencies> = _createMachine;
export const createReducer: TypedCreateReducerFn<AppEvents> = _createReducer;
export const createConfig: TypedCreateConfigFn<AppEvents> = _createConfig;
export const createEffect: TypedCreateEffectFn<AppEvents, Dependencies> = _createEffect;
export type TypedEffect = ReturnType<TypedCreateEffectFn<AppEvents, Dependencies>>;
