import useSyncExternalStoreExports from "use-sync-external-store/shim/with-selector";
import {
  defineMachine as defineCoreMachine,
  type AnyEvent,
  type AnyRecord,
  type MachineConfig,
  type StateType,
} from "@lite-fsm/core";

const { useSyncExternalStoreWithSelector } = useSyncExternalStoreExports;

export const defineMachine = <P extends AnyEvent = AnyEvent, D extends AnyRecord = {}>(
  opts: {
    onError?: (err: unknown) => void;
    dependencies?: D;
  } = {},
) => ({
  create: <C extends object, T extends AnyRecord>(cfg: MachineConfig<C, T, P, D>) => {
    const machine = defineCoreMachine<P, D>(opts).create(cfg);

    const use = <R>(selector: (state: StateType<C, T>) => R, equalityFn?: (oldValue: R, newValue: R) => boolean) =>
      useSyncExternalStoreWithSelector(machine.onTransition, machine.getState, machine.getState, selector, equalityFn);

    Object.assign(use, machine);

    return use as typeof use & typeof machine;
  },
});
