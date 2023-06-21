import { DefaultDeps, FSMEvent, MachineConfig, Subscriber } from "./types";

export const Machine = <
  S extends string,
  E extends string,
  C extends Record<string, any>,
  P extends FSMEvent<E, any> = any,
  D extends Record<string, any> = {},
>(
  cfg: MachineConfig<S, C, P, D>,
) => {
  let subs: Array<Subscriber<S, C>> = [];

  return {
    config: cfg.config,
    transition: (s: { state: S; context: C }, action: P) => {
      if (cfg.reducer) {
        return cfg.reducer(s, action, cfg.config);
      } else {
        const next = cfg.config[s.state]?.[action.type];

        if (next !== undefined) {
          return {
            state: next || s.state,
            context: { ...s.context, ...action.payload },
          };
        }
      }

      return s;
    },
    onTransition: (cb: Subscriber<S, C>) => {
      subs.push(cb);
      return () => {
        subs = subs.filter((c) => c !== cb);
      };
    },
    invokeEffect: async (state: S, deps: D & DefaultDeps<S, C, P>) => {
      if (!cfg.effects?.[state]) return;
      await cfg.effects[state]?.(deps);
    },
  };
};
