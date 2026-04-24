import type {
  CFG,
  EffectType,
  FSMEvent,
  MachineConfig,
  MachineEffect,
  TypedCreateConfigFn,
  TypedCreateReducerFn,
  WILDCARD,
} from "./types";

export type * from "./interfaces";
export { CreateMachine as Machine, defineMachine } from "./Machine";
export { MachineManager } from "./MachineManager";
export type * from "./types";

export const createMachine = <
  P extends FSMEvent<any, any> = any,
  D extends Record<string, any> = {},
  C extends CFG<C, P, keyof C | WILDCARD> = any,
  T extends Record<string, any> = any,
>(
  cfg: MachineConfig<C, T, P, D>,
) => cfg;

export const createReducer: TypedCreateReducerFn = (reducer) => reducer;

export const createConfig: TypedCreateConfigFn = (cfg) => cfg;

const take = <
  P extends FSMEvent<any, any> = any,
  D extends Record<string, any> = {},
  C extends CFG<C, P> = any,
  N extends keyof C | WILDCARD = any,
>({
  type,
  effect,
  cancelFn,
}: {
  type?: EffectType;
  effect: MachineEffect<N, C, P, D>;
  cancelFn?: (deps: Parameters<MachineEffect<N, C, P, D>>[0]) => () => boolean;
}) => {
  let lastId = 0;

  return (opts: Parameters<MachineEffect<N, C, P, D>>[0]) => {
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

export const createEffect = <
  P extends FSMEvent<any, any> = any,
  D extends Record<string, any> = {},
  C extends CFG<C, P> = any,
  N extends keyof C | WILDCARD = any,
>(opts: {
  effect: MachineEffect<N, C, P, D>;
  type?: EffectType;
  cancelFn?: (deps: Parameters<MachineEffect<N, C, P, D>>[0]) => () => boolean;
}) => {
  return take(opts);
};
