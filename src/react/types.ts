import type { IMachineManager } from "../core/interfaces";
import type { AnyEvent, MachineStore, MachinesState } from "../core/types";

import type { FSMContextType } from "./FSMContext";

export type TypedUseTransitionHook<P extends AnyEvent = AnyEvent> = () => FSMContextType<MachineStore, P>["transition"];

export type TypedUseSelectorHook<S extends MachineStore> = {
  <R>(selector: (state: MachinesState<S>) => R, equalityFn?: (oldValue: R, newValue: R) => boolean): R;
};

export type TypedUseManagerHook<
  S extends MachineStore,
  P extends AnyEvent = AnyEvent,
> = () => IMachineManager<S, P>;

export type TypedUseMachineHook<
  S extends MachineStore,
  P extends AnyEvent = AnyEvent,
> = TypedUseManagerHook<S, P>;
