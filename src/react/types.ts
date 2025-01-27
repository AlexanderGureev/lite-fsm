import { IMachineManager } from "~/core/interfaces";
import { FSMEvent, MachineConfig } from "~/core/types";

import { FSMContextType } from "./FSMContext";

export type TypedUseTransitionHook<P extends FSMEvent<any, any> = any> = () => FSMContextType<any, P>["transition"];

export type TypedUseSelectorHook<S> = {
  <R>(selector: (state: S) => R, equalityFn?: (oldValue: R, newValue: R) => boolean): R;
};

export type TypedUseMachineHook<
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
  P extends FSMEvent<any, any> = any,
> = () => IMachineManager<S, P>;
