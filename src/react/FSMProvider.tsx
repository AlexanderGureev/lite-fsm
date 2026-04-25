import React from "react";

import type { IMachineManager } from "../core/interfaces";
import type { AnyEvent, MachineStore } from "../core/types";

import { FSMContext } from "./FSMContext";

export const FSMContextProvider = <
  S extends MachineStore,
  P extends AnyEvent = AnyEvent,
>({
  children,
  machineManager,
}: React.PropsWithChildren<{
  machineManager: IMachineManager<S, P>;
}>) => {
  const value = React.useMemo(() => machineManager, [machineManager]);
  return <FSMContext.Provider value={value}>{children}</FSMContext.Provider>;
};
