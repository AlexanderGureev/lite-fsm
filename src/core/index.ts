import type {
  AnyEvent,
  AnyRecord,
  CFG,
  EffectType,
  MachineConfig,
  MachineEffect,
  MachineReducer,
  StateName,
  WILDCARD,
} from "./types";

export type * from "./interfaces";
export { CreateMachine as Machine, defineMachine } from "./Machine";
export { MachineManager } from "./MachineManager";
export type * from "./types";

export const createMachine = <
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
  C extends object = Record<string, never>,
  T extends AnyRecord = {},
>(
  cfg: MachineConfig<C, T, P, D> & { config: C & CFG<C, P, StateName<C> | WILDCARD> },
): MachineConfig<C, T, P, D> => cfg;

export const createReducer = <C extends object, T extends AnyRecord, P extends AnyEvent = AnyEvent>(
  reducer: MachineReducer<C, P, T>,
) => reducer;

export const createConfig = <C extends object, P extends AnyEvent = AnyEvent>(
  cfg: C & CFG<C, P, StateName<C> | WILDCARD>,
): C => cfg;

const take = <
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
  C extends object = Record<string, never>,
  N extends StateName<C> | WILDCARD = StateName<C> | WILDCARD,
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
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
  C extends object = Record<string, never>,
  N extends StateName<C> | WILDCARD = StateName<C> | WILDCARD,
>(opts: {
  effect: MachineEffect<N, C, P, D>;
  type?: EffectType;
  cancelFn?: (deps: Parameters<MachineEffect<N, C, P, D>>[0]) => () => boolean;
}) => {
  return take(opts);
};
