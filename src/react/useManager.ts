import React from "react";

import type { FSMEvent, MachineConfig } from "../core/types";

import { FSMContext, FSM_PROVIDER_ERROR } from "./FSMContext";
import type { FSMContextType } from "./FSMContext";

export const useManager = <
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  } = any,
  P extends FSMEvent<any, any> = any,
>() => {
  const manager = React.useContext(FSMContext) as FSMContextType<S, P> | null;

  if (!manager) {
    throw new Error(FSM_PROVIDER_ERROR);
  }

  return manager;
};
