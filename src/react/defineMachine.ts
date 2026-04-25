import useSyncExternalStoreExports from "use-sync-external-store/shim/with-selector";
import type { AnyEvent, AnyRecord, MachineConfig, StateType } from "../core/types";
import { createMachine } from "../core/Machine";

const { useSyncExternalStoreWithSelector } = useSyncExternalStoreExports;

export const defineMachine = <P extends AnyEvent = AnyEvent, D extends AnyRecord = {}>(
  opts: {
    onError?: (err: unknown) => void;
    dependencies?: D;
  } = {},
) => ({
  create: <C extends object, T extends AnyRecord>(cfg: MachineConfig<C, T, P, D>) => {
    const machine = createMachine(cfg, opts);

    const use = <R>(selector: (state: StateType<C, T>) => R, equalityFn?: (oldValue: R, newValue: R) => boolean) =>
      useSyncExternalStoreWithSelector(machine.onTransition, machine.getState, machine.getState, selector, equalityFn);

    Object.assign(use, machine);

    return use as typeof use & typeof machine;
  },
});
