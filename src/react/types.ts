import type { IMachineManager } from "../core/interfaces";
import type { AnyEvent, MachineStore } from "../core/types";

import type { FSMContextType } from "./FSMContext";

export type TypedUseTransitionHook<P extends AnyEvent = AnyEvent> = () => FSMContextType<MachineStore, P>["transition"];

export type TypedUseSelectorHook<S> = {
  <R>(selector: (state: S) => R, equalityFn?: (oldValue: R, newValue: R) => boolean): R;
};

export type TypedUseMachineHook<
  S extends MachineStore,
  P extends AnyEvent = AnyEvent,
> = () => IMachineManager<S, P>;
