import React from "react";

import type { IMachineManager } from "../core/interfaces";
import type { AnyEvent, MachineStore } from "../core/types";

export type FSMContextType<
  S extends MachineStore = MachineStore,
  P extends AnyEvent = AnyEvent,
> = IMachineManager<S, P>;

export const FSM_PROVIDER_ERROR = "Hooks from lite-fsm/react must be used within FSMContextProvider.";

export const FSMContext = React.createContext<unknown>(null);
