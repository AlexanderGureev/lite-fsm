import React from "react";
import { FSMContext } from "./FSMContext";
import { IMachineManager } from "~/core/interfaces";
import { FSMEvent, MachineConfig } from "~/core/types";

export const FSMContextProvider = <
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
  P extends FSMEvent<any, any> = any,
>({
  children,
  machineManager,
}: React.PropsWithChildren<{
  machineManager: IMachineManager<S, P>;
}>) => {
  const value = React.useMemo(() => machineManager, [machineManager]);
  return <FSMContext.Provider value={value}>{children}</FSMContext.Provider>;
};
