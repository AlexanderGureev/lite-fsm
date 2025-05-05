import useSyncExternalStoreExports from "use-sync-external-store/shim/with-selector";
import { CFG, FSMEvent, MachineConfig, StateType, WILDCARD } from "~/core/types";
import { createMachine } from "~/core/Machine";

const { useSyncExternalStoreWithSelector } = useSyncExternalStoreExports;

export const defineMachine = <P extends FSMEvent<any, any> = any, D extends Record<string, any> = {}>(
  opts: {
    onError?: (err: any) => void;
    dependencies?: D;
  } = {},
) => ({
  create: <C extends CFG<C, P, keyof C | WILDCARD>, T extends Record<string, any>>(cfg: MachineConfig<C, T, P, D>) => {
    const machine = createMachine(cfg, opts);

    const use = <R>(selector: (state: StateType<C, T>) => R, equalityFn?: (oldValue: R, newValue: R) => boolean) =>
      useSyncExternalStoreWithSelector(machine.onTransition, machine.getState, machine.getState, selector, equalityFn);

    Object.assign(use, machine);

    return use as typeof use & typeof machine;
  },
});
