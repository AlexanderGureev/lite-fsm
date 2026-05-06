import React from "react";

import type { AnyEvent, IMachineManager, MachineStore } from "@lite-fsm/core";

export type FSMContextType<
  S extends MachineStore = MachineStore,
  P extends AnyEvent = AnyEvent,
> = IMachineManager<S, P>;

export const FSM_PROVIDER_ERROR = "Hooks from @lite-fsm/react must be used within FSMContextProvider.";

export const FSMContext = React.createContext<unknown>(null);
