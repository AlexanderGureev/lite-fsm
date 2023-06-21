import React from "react";
import { IMachineManager } from "~/core/interfaces";
import { FSMEvent, MachineConfig } from "~/core/types";

export type FSMContextType<
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  } = any,
  P extends FSMEvent<any> = any,
> = IMachineManager<S, P>;

export const FSMContext = React.createContext<FSMContextType>({
  transition: (): any => {
    return;
  },
  getState: () => ({}),
  onTransition: () => () => {},
  replaceReducer: () => {},
  setDependencies: () => {},
});
