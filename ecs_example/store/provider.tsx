"use client";

import type { PropsWithChildren } from "react";
import { useState } from "react";
import { FSMContextProvider } from "@lite-fsm/react";

import { makeStore, type AppStore } from ".";
import type { RuntimeDeps } from "./deps";

type GameStoreProviderProps = PropsWithChildren<{
  deps: RuntimeDeps;
}>;

export function GameStoreProvider({ children, deps }: GameStoreProviderProps) {
  const [store] = useState<AppStore>(() => makeStore(deps));

  return (
    <FSMContextProvider machineManager={store.manager} persist={store.persist}>
      {children}
    </FSMContextProvider>
  );
}
