"use client";
import { useEffect, useRef } from "react";
import { FSMContextProvider } from "lite-fsm/react";

import { makeStore, type AppStore } from "./store";

export function Provider({ children }: React.PropsWithChildren) {
  const storeRef = useRef<AppStore | null>(null);
  if (storeRef.current === null) storeRef.current = makeStore();

  useEffect(() => {
    storeRef.current?.transition({ type: "DO_INIT" });
  }, []);

  return <FSMContextProvider machineManager={storeRef.current}>{children}</FSMContextProvider>;
}
