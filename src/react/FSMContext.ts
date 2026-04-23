import React from "react";

import type { IMachineManager } from "../core/interfaces";
import type { FSMEvent, MachineConfig } from "../core/types";

export type FSMContextType<
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  } = any,
  P extends FSMEvent<any> = any,
> = IMachineManager<S, P>;

export const FSM_PROVIDER_ERROR = "Hooks from lite-fsm/react must be used within FSMContextProvider.";

export const FSMContext = React.createContext<FSMContextType | null>(null);
