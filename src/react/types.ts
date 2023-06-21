import { FSMEvent } from "~/core/types";
import { FSMContextType } from "./FSMContext";

export type TypedUseTransitionHook<P extends FSMEvent<any, any> = any> = () => FSMContextType<any, P>["transition"];

export type TypedUseSelectorHook<S> = {
  <R>(selector: (state: S) => R, equalityFn?: (oldValue: R, newValue: R) => boolean): R;
};
