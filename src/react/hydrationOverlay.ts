import React from "react";

import type { MachinesState, MachineStore } from "../core/types";

export type HydrationOverlay<S extends MachineStore> = {
  getState: () => MachinesState<S>;
};

type ErasedHydrationOverlay = { getState: () => unknown };

const FSMHydrationOverlayContext = React.createContext<ErasedHydrationOverlay | null>(null);

export const FSMHydrationOverlayProvider = FSMHydrationOverlayContext.Provider;

export const useHydrationOverlay = <S extends MachineStore>() =>
  React.useContext(FSMHydrationOverlayContext) as HydrationOverlay<S> | null;
