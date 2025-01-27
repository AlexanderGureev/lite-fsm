/* eslint-disable @typescript-eslint/ban-types -- ok*/
import { CFG, DefaultDeps, FSMEvent, MachineConfig, State, Subscriber, WILDCARD as WTYPE } from "./types";
import { WILDCARD } from "./utils";

export const CreateMachine = <
  C extends CFG<C, P, keyof C | WTYPE>,
  T extends Record<string, any>,
  E extends string,
  P extends FSMEvent<E, any> = any,
  D extends Record<string, any> = {},
>(
  cfg: MachineConfig<C, T, P, D>,
) => {
  let subs: Array<Subscriber<State<keyof C>, T>> = [];

  return {
    config: cfg.config,
    transition: (s: { state: State<keyof C>; context: T }, action: P) => {
      const _next = cfg.config[s.state]?.[action.type];
      const nextState = _next !== undefined ? _next : cfg.config[WILDCARD]?.[action.type];

      if (nextState === undefined) return s;

      if (cfg.reducer) {
        return cfg.reducer(s, action, { nextState: nextState || s.state, config: cfg.config });
      }

      const payload = "payload" in action ? action.payload : {};

      return {
        state: nextState || s.state,
        context: { ...s.context, ...payload },
      };
    },
    onTransition: (cb: Subscriber<State<keyof C>, T>) => {
      subs.push(cb);
      return () => {
        subs = subs.filter((c) => c !== cb);
      };
    },
    invokeEffect: async (prevState: State<keyof C>, currentState: State<keyof C>, deps: D & DefaultDeps<any, C, P>) => {
      if (!cfg.effects) return;

      if (prevState !== currentState && cfg.effects[currentState]) {
        await cfg.effects[currentState]?.(deps);
      } else if (cfg.effects[WILDCARD]) {
        await cfg.effects[WILDCARD]?.(deps);
      }
    },
  };
};
