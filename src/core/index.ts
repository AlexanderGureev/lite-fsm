import type { TypedCreateConfigFn, TypedCreateEffectFn, TypedCreateMachineFn, TypedCreateReducerFn } from "./types";

export { Machine } from "./Machine";
export { MachineManager } from "./MachineManager";
export type * from "./types";

export const createMachine: TypedCreateMachineFn = (cfg) => cfg;

export const createReducer: TypedCreateReducerFn = (reducer) => reducer;

export const createConfig: TypedCreateConfigFn = (cfg) => cfg;

export const createEffect: TypedCreateEffectFn = (fn) => fn;
