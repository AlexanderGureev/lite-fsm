"use client";

import { useRef } from "react";
import { FSMContextProvider } from "@lite-fsm/react";

import { makeStore, type AppStore } from "../store";

export function Provider({ children }: React.PropsWithChildren) {
  const storeRef = useRef<AppStore | null>(null);
  if (storeRef.current === null) storeRef.current = makeStore();

  return <FSMContextProvider machineManager={storeRef.current}>{children}</FSMContextProvider>;
}
