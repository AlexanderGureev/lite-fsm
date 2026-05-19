import React from "react";

import type { AnyEvent, IMachineManager, MachinesState, MachineStore } from "@lite-fsm/core";

import { FSMContext } from "./FSMContext";
import { FSMServerSnapshotProvider } from "./hydrationOverlay";
import { FSMPersistContext, resolvePersistStatusSource } from "./persistContext";
import type { FSMPersistLifecycle } from "./persistContext";

export type { FSMPersistLifecycle } from "./persistContext";

export type FSMContextProviderProps<S extends MachineStore, P extends AnyEvent = AnyEvent> = React.PropsWithChildren<{
  machineManager: IMachineManager<S, P>;
  getServerSnapshot?: () => MachinesState<S>;
  persist?: FSMPersistLifecycle | ReadonlyArray<FSMPersistLifecycle>;
}>;

export const FSMContextProvider = <S extends MachineStore, P extends AnyEvent = AnyEvent>({
  children,
  getServerSnapshot,
  machineManager,
  persist,
}: FSMContextProviderProps<S, P>) => {
  const value = React.useMemo(() => machineManager, [machineManager]);
  const initialSnapshot = React.useMemo(() => machineManager.getState(), [machineManager]);
  const serverSnapshot = React.useMemo(
    () => ({
      getState: getServerSnapshot ?? (() => initialSnapshot),
    }),
    [getServerSnapshot, initialSnapshot],
  );
  const persistStatusSource = React.useMemo(() => resolvePersistStatusSource(persist), [persist]);

  React.useEffect(() => {
    if (!persist) return;
    const persistItems = Array.isArray(persist) ? persist : [persist];
    const stops = persistItems.map((item) => item.start());
    return () => {
      for (const stop of stops) stop();
    };
  }, [persist]);

  return (
    <FSMContext.Provider value={value}>
      <FSMPersistContext.Provider value={persistStatusSource}>
        <FSMServerSnapshotProvider value={serverSnapshot}>{children}</FSMServerSnapshotProvider>
      </FSMPersistContext.Provider>
    </FSMContext.Provider>
  );
};
