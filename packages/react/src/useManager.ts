import React from "react";

import type { AnyEvent, MachineStore } from "@lite-fsm/core";

import { FSMContext, FSM_PROVIDER_ERROR } from "./FSMContext";
import type { FSMContextType } from "./FSMContext";

export const useManager = <
  S extends MachineStore = MachineStore,
  P extends AnyEvent = AnyEvent,
>() => {
  const manager = React.useContext(FSMContext) as FSMContextType<S, P> | null;

  if (!manager) {
    throw new Error(FSM_PROVIDER_ERROR);
  }

  return manager;
};
