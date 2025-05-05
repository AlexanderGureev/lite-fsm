import type {
  EffectType,
  MachineEffect,
  TypedCreateConfigFn,
  TypedCreateEffectFn,
  TypedCreateMachineFn,
  TypedCreateReducerFn,
} from "./types";

export type * from "./interfaces";
export { CreateMachine as Machine, defineMachine } from "./Machine";
export { MachineManager } from "./MachineManager";
export type * from "./types";

export const createMachine: TypedCreateMachineFn = (cfg) => cfg;

export const createReducer: TypedCreateReducerFn = (reducer) => reducer;

export const createConfig: TypedCreateConfigFn = (cfg) => cfg;

const take = ({
  type,
  effect,
  cancelFn,
}: {
  type?: EffectType;
  effect: MachineEffect;
  cancelFn?: (deps: Parameters<typeof effect>[0]) => () => boolean;
}) => {
  let lastId = 0;

  return (opts: Parameters<typeof effect>[0]) => {
    const currentId = ++lastId;
    const cancel = cancelFn?.(opts);

    return effect({
      ...opts,
      transition: (action) => {
        if (type === "latest" && currentId !== lastId) return action;
        if (cancel?.()) return action;
        return opts.transition(action);
      },
    });
  };
};

export const createEffect: TypedCreateEffectFn = (opts) => {
  return take(opts);
};
