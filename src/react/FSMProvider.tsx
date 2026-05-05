import React from "react";

import type { IMachineManager } from "../core/interfaces";
import type { AnyEvent, MachinesState, MachineStore } from "../core/types";

import { FSMContext } from "./FSMContext";
import { FSMServerSnapshotProvider } from "./hydrationOverlay";

export type FSMContextProviderProps<
  S extends MachineStore,
  P extends AnyEvent = AnyEvent,
> = React.PropsWithChildren<{
  machineManager: IMachineManager<S, P>;
  getServerSnapshot?: () => MachinesState<S>;
}>;

export const FSMContextProvider = <
  S extends MachineStore,
  P extends AnyEvent = AnyEvent,
>({
  children,
  getServerSnapshot,
  machineManager,
}: FSMContextProviderProps<S, P>) => {
  const value = React.useMemo(() => machineManager, [machineManager]);
  const initialSnapshot = React.useMemo(() => machineManager.getState(), [machineManager]);
  const serverSnapshot = React.useMemo(
    () => ({
      getState: getServerSnapshot ?? (() => initialSnapshot),
    }),
    [getServerSnapshot, initialSnapshot],
  );

  return (
    <FSMContext.Provider value={value}>
      <FSMServerSnapshotProvider value={serverSnapshot}>{children}</FSMServerSnapshotProvider>
    </FSMContext.Provider>
  );
};
